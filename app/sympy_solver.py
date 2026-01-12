# sympy_solver.py  (runs inside onepen_sympy env)
from sympy.parsing.latex import parse_latex
from sympy import simplify
import sys, json

latex = sys.stdin.read().strip()
clean = latex.rstrip('=').strip()

try:
    expr = parse_latex(clean)
    result = expr.doit() if hasattr(expr, "doit") else simplify(expr)
    print(json.dumps({"result": str(result)}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
