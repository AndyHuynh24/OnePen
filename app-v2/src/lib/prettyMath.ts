// ─────────────────────────────────────────────────────────────────────────────
// prettyMath — turn the OCR's LaTeX into friendly, TI-calculator-style math.
//   prettyMath(latex)      → plain text   (edit-pad seed; `^` kept so it's typeable)
//   prettyMathHtml(latex)  → HTML string  (verify popup; real <sup> superscripts,
//                                          handles stacked powers like 5^2^2)
//   superscriptDigits(text)→ unicode ² ³ … for canvas answer text
// Purely cosmetic — the backend still solves the raw LaTeX.
// ─────────────────────────────────────────────────────────────────────────────

// LaTeX command → symbol. Order doesn't matter (all literal replaces).
const SYMBOLS: Array<[RegExp, string]> = [
  // delimiters FIRST so \left/\right are gone before \le/\ge could match them
  [/\\left|\\right/g, ''],
  [/\\nabla/g, '∇'],
  [/\\infty/g, '∞'],
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  // \b word boundary so \le doesn't match the "le" inside \left, etc.
  [/\\leq\b|\\le\b/g, '≤'],
  [/\\geq\b|\\ge\b/g, '≥'],
  [/\\neq\b|\\ne\b/g, '≠'],
  [/\\approx\b/g, '≈'],
  [/\\pi\b/g, 'π'],
  [/\\theta\b/g, 'θ'],
  [/\\alpha\b/g, 'α'],
  [/\\beta\b/g, 'β'],
  [/\\gamma\b/g, 'γ'],
  [/\\lambda\b/g, 'λ'],
  [/\\mu\b/g, 'μ'],
  [/\\sum\b/g, '∑'],
  [/\\prod\b/g, '∏'],
  [/\\int\b/g, '∫'],
  [/\\partial\b/g, '∂'],
  [/\\sqrt\s*\{([^{}]*)\}/g, '√($1)'],
  [/\\,|\\!|\\;|\\:/g, ''],
  [/\\ /g, ' '],
];

/** Shared cleanup: unwrap font commands, expand fractions, apply symbols, and
 *  collapse the digit-spacing the OCR adds. Leaves `^{…}` / `^x` intact. */
function clean(latex: string): string {
  let s = latex;

  // unwrap font commands (\mathrm{=}, \textsc{x}, …)
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/\\(?:math[a-z]+|text[a-z]*|operatorname)\s*\{([^{}]*)\}/g, '$1');
    if (next === s) break;
    s = next;
  }
  // \frac{a}{b} → (a)/(b), nested
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/\\(?:d?frac|cfrac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
    if (next === s) break;
    s = next;
  }
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);

  // ascii "*" → middle-dot (calculator multiply); keep "**" handling for powers
  // out of this (powers are processed before clean's callers touch "**").
  s = s.replace(/\*/g, '·');

  // collapse OCR digit gaps: "2 0" → "20", "1 . 5" → "1.5"
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/(\d)\s+(\d)/g, '$1$2').replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
    if (next === s) break;
    s = next;
  }

  // implicit multiplication spacing: "5 x" → "5x", "2 (" → "2(", "x y" → "xy"
  s = s.replace(/(\d)\s+([a-zA-Zπ(])/g, '$1$2'); // number then var/paren
  s = s.replace(/([a-zA-Z])\s+([a-zA-Z(])/g, '$1$2'); // var then var/paren

  return s;
}

/** Drop redundant parens around a lone number/variable: (20)/(10) → 20/10. */
function tidyParens(s: string): string {
  return s
    .replace(/\((\s*[-+]?\d+(?:\.\d+)?\s*)\)/g, '$1')
    .replace(/\(\s*([a-zA-Z]\w*)\s*\)/g, '$1');
}

// ── plain text (edit-pad seed) ───────────────────────────────────────────────
export function prettyMath(latex: string | undefined | null): string {
  if (!latex) return '';
  let s = clean(latex);
  s = s.replace(/\^\s*\{([^{}]*)\}/g, '^$1'); // x^{2} → x^2 (typeable)
  s = tidyParens(s).replace(/[{}]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

// ── HTML with real <sup> (verify popup) ──────────────────────────────────────
function esc(ch: string): string {
  return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
}

/** Read one exponent operand at index i (after a '^'); returns [html, nextIndex].
 *  Right-associative so 5^2^2 nests as 5^(2^2). */
function readExponent(s: string, i: number): [string, number] {
  let operand: string;
  let j: number;
  if (s[i] === '{') {
    let depth = 0;
    j = i;
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    operand = s.slice(i + 1, j - 1);
  } else {
    j = i;
    while (j < s.length && /[0-9a-zA-Z.]/.test(s[j])) j++;
    operand = s.slice(i, j);
  }
  let html = supParse(operand); // the operand may itself contain ^
  if (s[j] === '^') {
    const [more, k] = readExponent(s, j + 1);
    html += `<sup>${more}</sup>`;
    j = k;
  }
  return [html, j];
}

function supParse(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '^') {
      const [exp, ni] = readExponent(s, i + 1);
      out += `<sup>${exp}</sup>`;
      i = ni;
    } else {
      out += esc(s[i]);
      i++;
    }
  }
  return out;
}

export function prettyMathHtml(latex: string | undefined | null): string {
  if (!latex) return '';
  let s = clean(latex);
  s = supParse(s); // ^ → nested <sup> (escapes other chars)
  // tidy parens / stray braces operate on text but our string now has <sup> tags;
  // braces are gone after supParse except inside operands we already consumed.
  s = s.replace(/[{}]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

// ── unicode superscript for plain canvas text ────────────────────────────────
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', n: 'ⁿ', x: 'ˣ',
};

/** Pretty-print a SOLVER RESULT for the canvas answer (plain text, no HTML):
 *   • digit exponents → unicode superscripts  (x**3 → x³, 2**10 → 2¹⁰)
 *   • "*" → "·" (calculator multiply)          (10*x → 10·x)
 *   • implicit-multiply spacing removed         (10 * x → 10·x, 3*x*y → 3·x·y)
 *  Leaves complex exponents (variables/parens) as `^…`. */
export function superscriptDigits(text: string | undefined | null): string {
  if (!text) return '';
  let s = text
    // exponents FIRST (before we rewrite '*'): ** → ^, then digit exps → unicode
    .replace(/\*\*/g, '^')
    .replace(/\^\{?([0-9+\-]+)\}?/g, (_m, exp: string) =>
      [...exp].map((c) => SUP[c] ?? c).join(''),
    );
  // remaining single "*" → middle dot
  s = s.replace(/\s*\*\s*/g, '·');
  return s;
}
