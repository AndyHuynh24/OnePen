#############################################################
from flask import Flask, request, jsonify, send_from_directory
from pix2text import Pix2Text
from PIL import Image
import io
from sympy.parsing.latex import parse_latex
from sympy import simplify
import os
import json


app = Flask(__name__, static_folder='static', static_url_path='')
model = Pix2Text.from_config()

@app.route('/')
def index():
    return send_from_directory('static', 'realtest.html')

import subprocess, json
from sympy.parsing.latex import parse_latex
from sympy import symbols, simplify, sympify, Eq, solve, integrate
import re

def smart_solver(latex_input: str):
    """Final robust LaTeX solver handling integrals, equations, and implicit multiplication."""
    if not latex_input or not isinstance(latex_input, str):
        return "Invalid input"

    print(f"🧮 Raw input: {latex_input}")

    # --- Clean and normalize LaTeX ---
    clean = (
        latex_input.strip()
        .replace("\\\\", "\\")      # fix double backslashes
        .replace("\\,", "")
        .replace("\\ ", "")
        .replace("\\!", "")
        .replace("−", "-")
        .replace("×", "*")
        .replace("\\times", "*")
        .replace("\\cdot", "*")
        .replace("\\div", "/")
        .replace("\\left", "")
        .replace("\\right", "")
        .replace(" ", "")
        .replace("\n", "")
        .rstrip("=")
    )

    print(f"🧹 Cleaned: {clean}")

    # --- Fix implicit multiplication like 10x -> 10*x ---
    clean = re.sub(r'(\d)([a-zA-Z])', r'\1*\2', clean)

    # --- Fix exponentiation ---
    clean = clean.replace("^", "**")
    clean = re.sub(r'\*\*\{([^}]*)\}', r'**(\1)', clean)

    print(f"🔧 Normalized: {clean}")

    # --- Handle plain arithmetic directly ---
    if re.fullmatch(r"[0-9+\-*/().]+", clean):
        try:
            val = eval(clean)
            return str(val)
        except Exception as e:
            print("Eval failed:", e)

    # --- Handle integrals explicitly ---
    if "\\int" in latex_input:
        try:
            bounds = re.findall(r"int_{(.*?)}\^{(.*?)}", clean)
            expr_body = re.sub(r"\\int_{.*?}\^{.*?}", "", clean)
            expr_body = expr_body.replace("dx", "").replace("d*x", "").replace("d*x", "").strip("()")

            print(f"📘 Integral body: {expr_body}")
            if bounds:
                a, b = bounds[0]
                a, b = sympify(a), sympify(b)
                var = symbols("x")
                expr = sympify(expr_body)
                result = integrate(expr, (var, a, b))
            else:
                var = symbols("x")
                expr = sympify(expr_body)
                result = integrate(expr, var)
            print(f"✅ Integral result: {result}")
            return str(result)
        except Exception as e:
            print(f"⚠️ Integral compute failed: {e}")
            return f"SymPy integral failed: {e}"

    # --- Handle equations and other math ---
    try:
        if "=" in clean:
            left, right = clean.split("=")
            left_expr = sympify(left)
            right_expr = sympify(right)
            eq = Eq(left_expr, right_expr)
            sol = solve(eq)
            return str(sol if sol else "No solution")

        expr = sympify(clean)
        result = expr.doit() if hasattr(expr, "doit") else simplify(expr)
        print(f"💡 Computed result: {result}")
        return str(result)

    except Exception as e:
        print(f"⚠️ Parsing error: {e}")
        try:
            expr = parse_latex(clean)
            result = expr.doit() if hasattr(expr, "doit") else simplify(expr)
            return str(result)
        except Exception as e2:
            return f"SymPy parsing failed: {e2}"




@app.route('/predict', methods=['POST'])
def predict():
    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'No image uploaded'}), 400
    try:
        image = Image.open(io.BytesIO(file.read()))
        latex_expr = model.recognize_formula(image)
        print(f"Recognized LaTeX from Pix2Text: {latex_expr}")
        if '=' in latex_expr:
            sympy_result = smart_solver(latex_expr)
        else: 
            sympy_result = "no equation"
        return jsonify({'latex': latex_expr, 'result': sympy_result})
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500


# ✅ New Route to Save JSON Data to Server
@app.route('/save_json', methods=['POST'])
def save_json():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    try:
        # Define your output folder (ensure it exists)
        output_folder = 'static/saved_notes'
        os.makedirs(output_folder, exist_ok=True)

        # Generate a filename, e.g., 'data.json' or based on request
        filename = data.get('filename', 'data') + '.json'

        # Write JSON data to file
        filepath = os.path.join(output_folder, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"JSON saved to {filepath}")
        return jsonify({'message': f'File saved to {filepath}'})
    except Exception as e:
        return jsonify({'error': f"Failed to save JSON: {e}"}), 500


if __name__ == '__main__':
    print("🚀 Running Pix2Text + SymPy demo at http://127.0.0.1:8000")
    app.run(host='127.0.0.1', port=8000, debug=True)