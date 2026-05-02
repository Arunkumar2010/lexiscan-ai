# LexiScan – Online Lexical Analyzer with AI Assistant "Maddy" ⚡

LexiScan is a modern, web-based lexical analyzer designed for developers and students to instantly tokenize source code and learn about programming constructs through an interactive AI assistant named **Maddy**.

Whether you're debugging syntax or learning a new language, LexiScan provides deep insights into every token in your code with a premium, user-friendly experience.

---

## 🚀 Features

- **Instant Tokenization**: Identifies Keywords, Identifiers, Numbers, Operators, Symbols, and Strings.
- **AI Assistant "Maddy"**: A glassmorphic popup modal that explains tokens in detail.
- **Interactive Suggetions**: 
  - 📘 **Explain simpler**: Get a beginner-friendly version.
  - 🧪 **Show example**: See a real code snippet using the token.
  - 💡 **Why is this used**: Understand the engineering purpose.
- **Offline Fallback System**: LexiScan works even without an internet connection! It uses a built-in knowledge base for instant responses.
- **Modern UI**: Full dark-mode theme with glassmorphism, smooth animations, and a ChatGPT-style typing effect.

---



## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System), JavaScript (ES6+)
- **Backend**: Python 3.10+, Flask
- **AI Engine**: OpenRouter API (GPT-3.5 Turbo)
- **Deployment**: Local / Self-hosted

---

## ⚙️ How to Run Locally

### 1. Prerequisites
- Python installed on your system.
- Node.js (optional, for `http-server`).

### 2. Backend Setup
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the Flask server:
   ```bash
   python app.py
   ```
   The backend will start at `http://127.0.0.1:5000`.

### 3. Frontend Setup
1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Serve the files using any local server (e.g., Live Server in VS Code or `http-server`):
   ```bash
   npx http-server . -p 8081
   ```
3. Open `http://127.0.0.1:8081` in your browser.

---

## 📁 Folder Structure

```text
lexiscan/
├── backend/
│   ├── app.py           # Flask server & AI logic
│   └── requirements.txt # Python dependencies
├── frontend/
│   ├── index.html       # Main UI structure
│   ├── style.css        # Premium dark theme
│   └── script.js        # Core logic & AI interaction
├── screenshots/         # UI & Feature previews
└── README.md            # Documentation
```

---

## 🔮 Future Improvements

- [ ] Support for more programming languages (Java, Python, JS).
- [ ] Context-aware chat (remembering previous questions).
- [ ] Direct code execution environment.
- [ ] Export analysis results to PDF/Markdown.

---

## 👨‍💻 Author

**Arun Kumar**  
*Passionate about building modern tools for developers.*

---
💡 *Tip: You can toggle the AI mode by setting `const USE_API = true;` in `script.js` to enable cloud-based intelligence!*


<div align="center">
Made with ❤️ by Arunkumar S 
</div>
