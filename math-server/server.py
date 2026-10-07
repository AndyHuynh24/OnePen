#############################################################
# OnePen math solver — Pix2Text (handwriting → LaTeX) + latex2sympy2/SymPy.
# Standalone service (Hugging Face Spaces / Akash / local). CORS-enabled so the
# hosted PWA (a different origin) can call it.
#
# Endpoints:
#   GET  /health   → {"status": "ok"}                       (uptime probe)
#   POST /predict  multipart `image` → {"latex": str, "result": str}  (OCR + solve)
#   POST /solve    JSON {"latex": str} → {"latex": str, "result": str} (solve typed
#                  LaTeX — used by the app's "fix equation" pad)
#############################################################
import io
import math
import os
import re

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from pix2text import Pix2Text
from latex2sympy2 import latex2sympy
from sympy import simplify, sympify, nsimplify, N, Eq, Integral, latex as to_latex
from sympy.core.relational import Relational

app = Flask(__name__)

# Allow any origin by default; lock down with ALLOWED_ORIGINS="https://your.app"
_origins = os.environ.get("ALLOWED_ORIGINS", "*")
CORS(app, resources={r"/*": {"origins": _origins}})

# Load the OCR model once at startup (slow — keep the process warm).
model = Pix2Text.from_config()


# Combinations / permutations → forms latex2sympy2 evaluates. latex2sympy treats a
# bare "C(n,r)" / "P(n,r)" / "nCr" as an unknown function (no answer), so rewrite:
#   choose      C(n,r) / nCr / ^nC_r / _nC_r   → \binom{n}{r}      (= n! / r!(n-r)!)
#   permutation P(n,r) / nPr / ^nP_r           → \frac{n!}{(n-r)!} (= n! / (n-r)!)
# Case-insensitive (C or c, P or p) and space-tolerant ("5 C 4", "5 C4", "5c4").
def _rewrite_combinatorics(s: str) -> str:
    # functional forms first — parens + comma make these unambiguous
    s = re.sub(r"\b[Cc]\s*\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*\)", r"\\binom{\1}{\2}", s)
    s = re.sub(r"\b[Pp]\s*\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*\)", r"\\frac{(\1)!}{((\1)-(\2))!}", s)
    # inline / sub-superscript forms: 5C4, 5 C 4, 5c4, ^{n}C_{r}, _{n}c_{r}, nPr …
    # The lookbehind keeps the match OUT of LaTeX commands/words (so the "c" in
    # \frac / \cdot / \cos and mid-variable letters are never mistaken for "choose").
    n = r"\{?([0-9a-zA-Z]+)\}?"
    pre = r"(?<![A-Za-z0-9\\])[\^_]?"
    s = re.sub(pre + n + r"\s*[Cc]\s*[_\^]?" + n, r"\\binom{\1}{\2}", s)
    s = re.sub(pre + n + r"\s*[Pp]\s*[_\^]?" + n, r"\\frac{(\1)!}{((\1)-(\2))!}", s)
    return s


# Cosmetic LaTeX that latex2sympy2 doesn't need (Pix2Text font wrappers + spacers).
def _pre_clean(latex_input: str) -> str:
    s = latex_input.strip()

    # unwrap font commands Pix2Text adds: \mathrm{x} \text{x} \textsc{x} \operatorname{x}
    for _ in range(6):
        before = s
        s = re.sub(r"\\(?:math[a-z]+|text[a-z]*|operatorname)\s*\{([^{}]*)\}", r"\1", s)
        if s == before:
            break

    # spacing macros + unicode normalization (latex2sympy wants ascii operators)
    replacements = {
        "\\,": "", "\\!": "", "\\;": "", "\\:": "", "\\quad": " ", "\\qquad": " ",
        "−": "-", "–": "-", "—": "-", "‐": "-", "‑": "-",
        "×": r"\times", "·": r"\cdot", "÷": r"\div", "∗": "*",
    }
    for a, b in replacements.items():
        s = s.replace(a, b)
    # "\ " (backslash-space) → space, AFTER \quad etc. so we don't eat them
    s = s.replace("\\ ", " ")

    # ── CRITICAL: Pix2Text often splits multi-digit numbers with spaces
    # ("2 0" instead of "20", "1 . 5" instead of "1.5"). Without this, "2 0" is
    # read as 2*0 = 0 and "20/10" becomes 0/0 = nan. Collapse repeatedly so
    # "2 0 0" → "200" and "1 0 . 2 5" → "10.25".
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"(\d)\s+(\d)", r"\1\2", s)        # digit gap-digit  -> join
        s = re.sub(r"(\d)\s*\.\s*(\d)", r"\1.\2", s)  # "1 . 5"          -> "1.5"
        s = re.sub(r"(\d)\s+\.", r"\1.", s)           # "1 ."            -> "1."
        s = re.sub(r"\.\s+(\d)", r".\1", s)           # ". 5"            -> ".5"

    # combinations / permutations (run after digit-spacing so args like "1 0" join)
    s = _rewrite_combinatorics(s)

    # a trailing "=" means "what's the answer?" — drop it so it's an expression,
    # not an equation with an empty RHS.
    s = s.strip()
    while s.endswith("=") and s.count("=") == 1:
        s = s[:-1].strip()
    return s


def _input_has_decimal(latex_input: str) -> bool:
    """True if the user wrote a decimal point between digits (so we should show a
    decimal answer instead of an exact fraction)."""
    return bool(re.search(r"\d\s*\.\s*\d", latex_input))


def _fmt_number(value, prefer_decimal: bool) -> str:
    """Render a numeric sympy value tidily; show a decimal if the user wrote one."""
    num = N(value, 12)
    f = float(num)
    if math.isnan(f) or math.isinf(f):
        return "Undefined"  # e.g. 0/0
    if f == int(f) and abs(f) < 1e15:
        return str(int(f))  # whole number → "12" not "12.0"
    if prefer_decimal:
        return str(round(f, 8))
    # otherwise prefer an exact rational if it's clean (e.g. 5/6), else a decimal
    try:
        simplified = nsimplify(value, rational=True)
        if simplified.is_rational and abs(simplified.q) <= 10000:
            return str(simplified)
    except Exception:
        pass
    return str(round(f, 8))


def _format(value, prefer_decimal: bool = False) -> str:
    """Render a sympy object as a clean, human string."""
    # a solved equation comes back as a list of solutions / Eq objects
    if isinstance(value, (list, tuple)):
        if not value:
            return "No solution"
        parts = [_format(v, prefer_decimal) for v in value]
        return ", ".join(parts)

    # a solved equation: render Eq(x, 4) as "x = 4"
    if isinstance(value, (Relational, Eq)):
        try:
            rhs = _format(value.rhs, prefer_decimal) if value.rhs.is_number else value.rhs
            return f"{value.lhs} = {rhs}"
        except Exception:
            return str(value)

    # evaluate integrals/derivatives/sums that came back unevaluated
    try:
        if hasattr(value, "doit"):
            value = value.doit()
    except Exception:
        pass

    # pure number → tidy numeric render
    try:
        if value.is_number:
            return _fmt_number(value, prefer_decimal)
    except Exception:
        pass

    return str(value)


def smart_solver(latex_input: str):
    """Parse handwritten-math LaTeX with latex2sympy2 (fractions, roots, integrals,
    derivatives, sums, trig, equations) and return a clean answer. Falls back to
    plain sympify, then arithmetic eval."""
    if not latex_input or not isinstance(latex_input, str):
        return "Invalid input"

    prefer_decimal = _input_has_decimal(latex_input)
    s = _pre_clean(latex_input)
    if not s:
        return "No equation"

    # 1) primary: latex2sympy2 (full LaTeX grammar). It auto-SOLVES equations.
    try:
        expr = latex2sympy(s)
        # an expression (not an equation) → simplify/evaluate it
        if not isinstance(expr, (list, tuple)) and not isinstance(expr, Relational):
            try:
                expr = simplify(expr.doit() if hasattr(expr, "doit") else expr)
            except Exception:
                pass
        out = _format(expr, prefer_decimal)
        if out and "fail" not in out.lower():
            return out
    except Exception:
        pass

    # 2) fallback: treat as a plain sympy expression / equation string
    try:
        ascii_s = (
            s.replace("\\times", "*").replace("\\cdot", "*").replace("\\div", "/")
            .replace("^", "**").replace("{", "(").replace("}", ")")
        )
        ascii_s = re.sub(r"(\d)([a-zA-Z(])", r"\1*\2", ascii_s)  # implicit multiply
        if "=" in ascii_s:
            from sympy import solve
            left, right = ascii_s.split("=", 1)
            sol = solve(Eq(sympify(left), sympify(right)))
            return _format(sol, prefer_decimal)
        return _format(sympify(ascii_s), prefer_decimal)
    except Exception:
        pass

    # 3) last resort: pure arithmetic
    arith = re.sub(r"[^0-9+\-*/().]", "", s.replace("\\times", "*").replace("\\div", "/"))
    if arith and re.fullmatch(r"[0-9+\-*/().]+", arith):
        try:
            return str(eval(arith))  # noqa: S307 — constrained to arithmetic chars
        except Exception:
            pass

    return "Could not solve"


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/predict", methods=["POST"])
def predict():
    file = request.files.get("image")
    if not file:
        return jsonify({"error": "No image uploaded"}), 400
    try:
        image = Image.open(io.BytesIO(file.read()))
        latex_expr = model.recognize_formula(image)
        # always run the solver so plain arithmetic resolves too (not just `=` eqs)
        result = smart_solver(latex_expr)
        return jsonify({"latex": latex_expr, "result": result})
    except Exception as e:
        return jsonify({"error": f"Server error: {e}"}), 500


@app.route("/solve", methods=["POST"])
def solve_route():
    """Solve a LaTeX/text equation directly (no OCR) — used when the user fixes a
    misread equation in the math input pad."""
    data = request.get_json(silent=True) or {}
    latex_expr = (data.get("latex") or "").strip()
    if not latex_expr:
        return jsonify({"error": "No equation provided"}), 400
    try:
        return jsonify({"latex": latex_expr, "result": smart_solver(latex_expr)})
    except Exception as e:
        return jsonify({"error": f"Server error: {e}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
