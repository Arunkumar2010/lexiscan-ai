"""
LexiScan — backend/app.py
Flask REST API for lexical analysis & AI explanations via OpenRouter (GPT-3.5).
"""

import re
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── OpenRouter configuration ───────────────────────────────────────────────
OPENROUTER_API_KEY = "YOUR_API_KEY_HERE"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-3.5-turbo"

def explain_token(token: str, token_type: str) -> str:
    """
    Hybrid Explanation System:
    1. Try OpenRouter (GPT-3.5) first.
    2. Fallback to predefined explanations if API fails.
    """
    prompt = f"Explain the programming token '{token}' of type '{token_type}' in simple lines. Format your response exactly like this:\nMeaning: <short meaning>\nExplanation: <detailed explanation>\nExample: <code example>\nKeep it beginner-friendly."

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    try:
        response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if "choices" in data and len(data["choices"]) > 0:
            return data["choices"][0]["message"]["content"].strip()
        
        raise Exception("Invalid API response format")

    except Exception as exc:
        print(f"DEBUG: OpenRouter failed ({exc}). Using fallback strategy.")
        
        # 🥇 Fallback Strategy (Pro Level)
        fallbacks = {
            "KEYWORD":    f"'{token}' is a reserved keyword in the programming language. These words have predefined meanings and cannot be used as variable names.",
            "IDENTIFIER": f"'{token}' is an identifier. It is a user-defined name used to identify a variable, function, or class in your code.",
            "NUMBER":     f"'{token}' is a numeric constant. It represents a fixed mathematical value used for calculations or data storage.",
            "OPERATOR":   f"'{token}' is an operator. It is a special character used to perform operations like addition, subtraction, or assignment on variables.",
            "SYMBOL":     f"'{token}' is a syntax symbol (punctuation). It helps the compiler understand the structure and boundaries of your code.",
            "STRING":     f"'{token}' is a string literal. It represents a sequence of characters, usually text, enclosed in quotes.",
            "COMMENT":    "This is a comment. It is used to describe what the code does and is ignored by the compiler during execution.",
            "INVALID":    f"'{token}' is an invalid or unknown character. It does not follow the lexical rules of this language and should be removed or corrected."
        }
        
        return fallbacks.get(token_type, "This is a basic building block of programming code.")


# ─── Token specification ───────────────────────────────────────────────────────
TOKEN_SPEC = [
    ("COMMENT",    r"//[^\n]*|/\*[\s\S]*?\*/"),           
    ("STRING",     r'"(?:\\.|[^"\\])*"'),                  
    ("KEYWORD",    r"\b(?:int|float|if|else|return)\b"),   
    ("NUMBER",     r"\b\d+(?:\.\d+)?\b"),                  
    ("IDENTIFIER", r"\b[a-zA-Z_][a-zA-Z0-9_]*\b"),        
    ("OPERATOR",   r"[+\-*/=]"),                           
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

@app.route("/explain", methods=["POST"])
def explain():
    data = request.get_json(silent=True)
    if not data or "token" not in data or "type" not in data:
        return jsonify({"error": 'Body must contain "token" and "type" fields.'}), 400

    explanation = explain_token(data["token"], data["type"])
    return jsonify({"explanation": explanation})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "LexiScan"})

if __name__ == "__main__":
    print("\n  LexiScan backend is running -> http://127.0.0.1:5000\n")
    app.run(debug=True, port=5000)
