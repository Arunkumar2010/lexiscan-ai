"""
LexiScan — backend/app.py
Flask REST API for lexical analysis, AI explanations via OpenRouter (GPT-3.5),
and LR(0) parser visualisation.
"""

import re
import requests
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from lr0_parser import LR0Parser

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# ─── Offline Mode: AI Explanation logic removed from backend ────────────────
# LexiScan is now a fully offline system. AI logic has been moved to the frontend.



# ─── Token specification ───────────────────────────────────────────────────────
TOKEN_SPEC = [
    ("COMMENT",    r"//[^\n]*|/\*[\s\S]*?\*/"),           
    ("STRING",     r'"(?:\\.|[^"\\])*"'),                  
    ("KEYWORD",    r"\b(?:int|float|if|else|return)\b"),   
    ("NUMBER",     r"\b\d+(?:\.\d+)?\b"),                  
    ("IDENTIFIER", r"\b[a-zA-Z_][a-zA-Z0-9_]*\b"),        
    ("OPERATOR",   r"==|<=|>=|!=|&&|\|\||[+\-*/=<>!&|]"),   
    ("SYMBOL",     r"[;(){}]"),                            
    ("WHITESPACE", r"\s+"),                                
    ("INVALID",    r"."),                                  
]

_MASTER_RE = re.compile(
    "|".join(f"(?P<{name}>{pattern})" for name, pattern in TOKEN_SPEC),
    re.MULTILINE,
)

def tokenize(source: str) -> list:
    tokens = []
    line = 1
    for mo in _MASTER_RE.finditer(source):
        kind  = mo.lastgroup
        value = mo.group()
        newlines = value.count("\n")
        token_line = line
        line += newlines
        if kind == "WHITESPACE": continue
        tokens.append({"type": kind, "value": value, "line": token_line})
    return tokens

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True)
    if not data or "code" not in data:
        return jsonify({"error": 'Request body must be JSON with a "code" field.'}), 400
    try:
        tokens = tokenize(data["code"])
        return jsonify(tokens)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

# Route /explain removed for offline mode


# ─── LR(0) Parser ─────────────────────────────────────────────────────────────

@app.route("/lr0", methods=["POST"])
def lr0():
    data = request.get_json(silent=True)
    if not data or "grammar" not in data:
        return jsonify({"error": 'Request body must be JSON with a "grammar" field.'}), 400

    grammar_text = data.get("grammar", "").strip()
    if not grammar_text:
        return jsonify({"error": "Grammar cannot be empty."}), 400

    try:
        parser = LR0Parser(grammar_text)
        result = parser.run()
        return jsonify(result)
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 422
    except Exception as exc:
        return jsonify({"error": f"Internal error: {exc}"}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "LexiScan"})

if __name__ == "__main__":
    print("\n  LexiScan backend is running -> http://127.0.0.1:5000\n")
    app.run(debug=True, port=5000)
