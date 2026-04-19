"""
LexiScan — backend/app.py
Flask REST API for lexical analysis & AI explanations via OpenRouter (GPT-3.5).
"""

import re
import requests
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# ─── OpenRouter configuration ───────────────────────────────────────────────
API_KEY = os.getenv("API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-3.5-turbo"

def explain_token(token: str, token_type: str) -> str:
    """
    Secure Hybrid Explanation System:
    1. Check for API_KEY presence.
    2. Try OpenRouter (GPT-3.5) with a strict 2s timeout.
    3. Fallback to predefined local explanations if anything fails.
    """
    
    # 🥇 Fallback Data (Pro Level)
    fallbacks = {
        "KEYWORD":    f"Meaning: Reserved word\nExplanation: {token} has a predefined meaning in the language.\nExample: int x = 10;",
        "IDENTIFIER": f"Meaning: User-defined name\nExplanation: {token} is a name you gave to a variable or function.\nExample: int {token} = 5;",
        "NUMBER":     f"Meaning: Numeric value\nExplanation: {token} represents a fixed value used in math or storage.\nExample: price = {token};",
        "OPERATOR":   f"Meaning: Math/Logic symbol\nExplanation: {token} performs an action on variables/values.\nExample: a {token} b",
        "SYMBOL":     f"Meaning: Punctuation\nExplanation: {token} structures the code syntax (begins/ends blocks).\nExample: if (a) {{ ... {token}",
        "INVALID":    f"Meaning: Error\nExplanation: {token} is not recognized and will cause a syntax error.\nExample: Remove or fix {token}",
    }

    if not API_KEY or API_KEY == "YOUR_API_KEY_HERE":
        return fallbacks.get(token_type, "Basic building block of code.")

    prompt = f"""
Explain the programming token '{token}' of type '{token_type}'.

Rules:
- Keep it very simple (beginner level)
- Max 3 lines
- Include one example
- No extra theory
"""

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    try:
        # Tight 2-second timeout for snappy UI
        response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=2)
        response.raise_for_status()
        
        data = response.json()
        if "choices" in data and len(data["choices"]) > 0:
            return data["choices"][0]["message"]["content"].strip()
        
        raise Exception("Invalid API response format")

    except Exception as exc:
        print(f"DEBUG: AI Explain failed ({type(exc).__name__}). Using local fallback.")
        return fallbacks.get(token_type, "Standard programming construct.")


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
