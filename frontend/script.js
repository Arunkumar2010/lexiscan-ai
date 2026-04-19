/* ════════════════════════════════════════════════════════════
   LexiScan  ·  script.js
   Sends code to Flask backend, renders result table,
   highlights INVALID tokens, shows summary + copy/download.
   ════════════════════════════════════════════════════════════ */

"use strict";

const API_URL = "http://127.0.0.1:5000/analyze";

/* ── DOM refs ─────────────────────────────────────────────── */
const codeInput     = document.getElementById("code-input");
const lineNums      = document.getElementById("line-nums");
const analyzeBtn    = document.getElementById("analyze-btn");
const btnLabel      = document.getElementById("btn-label");
const btnSpinner    = document.getElementById("btn-spinner");
const clearBtn      = document.getElementById("clear-btn");
const resultsBody   = document.getElementById("results-body");
const resultActions = document.getElementById("result-actions");
const statusBadge   = document.getElementById("status-badge");
const idleBadge     = document.getElementById("idle-badge");
const warnBar       = document.getElementById("warn-bar");
const summaryEl     = document.getElementById("summary");
const copyBtn       = document.getElementById("copy-btn");
const downloadBtn   = document.getElementById("download-btn");

let lastTokens = [];   // cached for copy / download

/* ── Starter code ─────────────────────────────────────────── */
codeInput.value =
`int main() {
    float x = 5.5;
    if (x > 0) {
        return 1;
    }
    return 0;
}`;
renderLineNums();

/* ── Event wiring ─────────────────────────────────────────── */
codeInput.addEventListener("input",  () => { renderLineNums(); setBadge("ready"); });
codeInput.addEventListener("scroll", () => { lineNums.scrollTop = codeInput.scrollTop; });

analyzeBtn.addEventListener("click",  analyze);
clearBtn.addEventListener("click",   clearAll);
copyBtn.addEventListener("click",    copyTokens);
downloadBtn.addEventListener("click", downloadTokens);

/* ═══════════════════════════════════════════════════════════
   CORE: send code → Flask, render response
   ═══════════════════════════════════════════════════════════ */
async function analyze() {
  const code = codeInput.value.trim();
  if (!code) {
    showEmpty("⌨️", "", "Enter some code in the editor before analyzing.");
    return;
  }

  setLoading(true);
  warnBar.hidden  = true;
  summaryEl.hidden = true;

  try {
    const res = await fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ code }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const tokens = await res.json();
    lastTokens = tokens;

    renderTable(tokens);
    renderSummary(tokens);
    setBadge("done");

  } catch (err) {
    console.error(err);
    lastTokens = [];
    setBadge("error");
    showEmpty(
      "⚠️", "is-err",
      "Cannot reach backend (port 5000).<br>Run: <code style='font-family:monospace'>cd backend && python app.py</code>"
    );
  } finally {
    setLoading(false);
  }
}

/* ── Render token table ──────────────────────────────────── */
function renderTable(tokens) {
  if (!tokens.length) {
    showEmpty("🔍", "", "No tokens identified.");
    return;
  }

  const hasInvalid = tokens.some(t => t.type === "INVALID");
  warnBar.hidden = !hasInvalid;

  const tbl = document.createElement("table");
  tbl.className = "tok-table";
  tbl.innerHTML = `
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th>Token</th>
        <th>Type</th>
        <th class="col-line">Line</th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = tbl.querySelector("tbody");
  tokens.forEach((tok, i) => {
    const cc  = cssClass(tok.type);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="col-num">${i + 1}</td>
      <td class="col-val ${cc}">${esc(tok.value)}</td>
      <td class="col-type"><span class="${cc}">${tok.type}</span></td>
      <td class="col-line">${tok.line ?? "—"}</td>`;

    wireRowClick(row, tok.value, tok.type);   // ← AI click handler
    tbody.appendChild(row);
  });

  resultsBody.innerHTML = "";
  resultsBody.appendChild(tbl);

  resultActions.hidden = false;
  idleBadge.hidden      = true;
}

/* ── Render summary chips ─────────────────────────────────── */
function renderSummary(tokens) {
  const counts = {};
  tokens.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });

  const COLOR = {
    KEYWORD:    "#60a5fa",
    IDENTIFIER: "#f8fafc",
    NUMBER:     "#fb923c",
    OPERATOR:   "#f87171",
    SYMBOL:     "#94a3b8",
    STRING:     "#facc15",
    COMMENT:    "#64748b",
    INVALID:    "#ef4444",
  };

  summaryEl.innerHTML = Object.entries(counts)
    .map(([type, n]) =>
      `<div class="chip">
         <span class="chip-dot" style="background:${COLOR[type] || "#6b7280"}"></span>
         ${type}<span class="chip-count">${n}</span>
       </div>`)
    .join("");
  summaryEl.hidden = false;
}

/* ── Clear ────────────────────────────────────────────────── */
function clearAll() {
  codeInput.value = "";
  lastTokens = [];
  renderLineNums();
  setBadge("ready");
  warnBar.hidden   = true;
  summaryEl.hidden = true;
  resultActions.hidden  = true;
  idleBadge.hidden      = false;
  resultsBody.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <p>Paste code above and click <strong>Analyze Code</strong> to begin.</p>
    </div>`;
}

/* ── Copy / Download ──────────────────────────────────────── */
function copyTokens() {
  if (!lastTokens.length) return;
  navigator.clipboard.writeText(JSON.stringify(lastTokens, null, 2))
    .then(() => flash(copyBtn, "✅ Copied!"))
    .catch(() => flash(copyBtn, "❌ Failed"));
}

function downloadTokens() {
  if (!lastTokens.length) return;
  const blob = new Blob([JSON.stringify(lastTokens, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: "tokens.json" });
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Helpers ──────────────────────────────────────────────── */
function setLoading(on) {
  analyzeBtn.disabled = on;
  btnLabel.hidden     = on;
  btnSpinner.hidden   = !on;
  if (on) setBadge("busy");
}

function setBadge(state) {
  const map = {
    ready: { text: "Ready",          cls: "badge-ok"   },
    busy:  { text: "Analyzing…",     cls: "badge-busy" },
    done:  { text: "Complete ✓",     cls: "badge-ok"   },
    error: { text: "Backend Offline", cls: "badge-err"  },
  };
  const { text, cls } = map[state] || map.ready;
  [statusBadge, idleBadge].forEach(el => {
    el.textContent = text;
    el.className   = `badge ${cls}`;
  });
}

function showEmpty(icon, extraCls, html) {
  resultsBody.innerHTML =
    `<div class="empty-state ${extraCls}">
       <div class="empty-icon">${icon}</div>
       <p>${html}</p>
     </div>`;
}

function flash(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = orig), 1800);
}

function renderLineNums() {
  const lines = codeInput.value.split("\n");
  lineNums.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join("");
}

function cssClass(type) {
  return ({
    KEYWORD:    "t-keyword",
    IDENTIFIER: "t-identifier",
    NUMBER:     "t-number",
    OPERATOR:   "t-operator",
    SYMBOL:     "t-symbol",
    STRING:     "t-string",
    COMMENT:    "t-comment",
    INVALID:    "t-invalid",
  })[type] ?? "t-identifier";
}

function esc(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

/* ════════════════════════════════════════════════════════════
   MADDY AI ASSISTANT — Full Interactive System
   ════════════════════════════════════════════════════════════ */

const EXPLAIN_URL    = "http://127.0.0.1:5000/explain";
const API_TIMEOUT_MS = 2000;

// 🔥 SET TO true FOR CLOUD AI, false FOR INSTANT LOCAL DATA
const USE_API = false; 

/* ── Extended local knowledge base ─────────────────────────── */
const tokenKnowledge = {
  KEYWORD: {
    meaning:     "A reserved word in programming.",
    explanation: "Keywords have special meaning and cannot be used as variable names. The compiler treats them with fixed, predefined behaviour.",
    example:     "int x = 10;",
    simple:      "A keyword is like a special command word the computer already knows. You can't use it as a name for your own things.",
    why:         "Used to define the structure and logic of the program — like data types (int, float), conditions (if, else), and loops (for, while)."
  },
  IDENTIFIER: {
    meaning:     "Name given to a variable, function, or array.",
    explanation: "Identifiers are user-defined names used to label variables, functions, arrays, etc. They must start with a letter or underscore.",
    example:     "int main()  |  int x;  |  float total;",
    simple:      "An identifier is just the name you give to something in your code — like naming a box so you can find it later.",
    why:         "Used to store and reference values. Without identifiers, you couldn't refer back to any data in your program."
  },
  NUMBER: {
    meaning:     "Represents a numeric value.",
    explanation: "Numbers are used for calculations and data storage. They can be integers (no decimal) or floating-point (with decimal).",
    example:     "10,  5.5,  100,  3.14",
    simple:      "A number token is just any number in your code, like 10 or 3.14. The computer uses it for math.",
    why:         "Used in mathematical operations, loop counters, conditions, and storing data."
  },
  OPERATOR: {
    meaning:     "A symbol that performs an operation.",
    explanation: "Operators are used to perform arithmetic, logical, or assignment operations between values or variables.",
    example:     "+,  -,  *,  /,  =,  ==,  !=",
    simple:      "An operator is like a math symbol (+, -, =) that tells the computer what action to perform.",
    why:         "Used to manipulate data, compare values, and control logic flow in a program."
  },
  SYMBOL: {
    meaning:     "A special character used in syntax.",
    explanation: "Symbols define the structure of code — blocks, statements, and groupings. The compiler uses them to understand program boundaries.",
    example:     "{  }  (  )  ;  ,",
    simple:      "Symbols are punctuation for code. Just like a period ends a sentence, a semicolon (;) ends a statement in C.",
    why:         "Used to organize and structure the program so the compiler can parse it correctly."
  },
  STRING: {
    meaning:     "A sequence of characters (text).",
    explanation: "A string literal is text enclosed in double quotes. It represents a fixed piece of text stored in the program.",
    example:     '"Hello, World!"  |  "LexiScan"',
    simple:      "A string is just text written inside quotes, like a message or a word the program uses.",
    why:         "Used to display messages, store text data, and communicate with the user."
  },
  COMMENT: {
    meaning:     "A developer note — completely ignored by the compiler.",
    explanation: "Comments are used to explain or annotate code. They are stripped out before compilation and have no effect on program execution.",
    example:     "// This is a comment  |  /* Block comment */",
    simple:      "A comment is a note you leave for yourself or others reading the code. The computer ignores it completely.",
    why:         "Used to document code, explain logic, and make programs easier to understand and maintain."
  },
  INVALID: {
    meaning:     "An invalid or unrecognised token.",
    explanation: "This character or sequence is not part of the language's syntax. It will cause a compilation or parsing error.",
    example:     "@,  #,  $,  ^",
    simple:      "This is a character the language doesn't understand. It's like a typo in code — you need to remove or fix it.",
    why:         "Should be corrected or removed. Invalid tokens prevent your code from compiling successfully."
  }
};

/* ── Fallback Q&A for chat input when API is offline ─────────── */
function handleUserQuestion(question) {
  question = question.toLowerCase();
  if (question.includes("loop"))      return "A loop repeats a block of code. Example: for(int i=0; i<10; i++) { }";
  if (question.includes("function"))  return "A function is a reusable block of code that performs a specific task. Example: int add(int a, int b) { return a + b; }";
  if (question.includes("variable"))  return "A variable is a named container for storing data. Example: int x = 5;";
  if (question.includes("array"))     return "An array stores multiple values of the same type. Example: int arr[5] = {1,2,3,4,5};";
  if (question.includes("pointer"))   return "A pointer stores the memory address of another variable. Example: int *p = &x;";
  if (question.includes("class"))     return "A class is a blueprint for creating objects in OOP. Example: class Car { int speed; };";
  if (question.includes("syntax"))    return "Syntax refers to the set of rules that define a correctly structured program. Errors occur when rules are broken.";
  if (question.includes("error"))     return "Errors are problems in code. Syntax errors mean the code is written incorrectly. Runtime errors occur during execution.";
  if (question.includes("what"))      return "This is a programming concept used to structure your code. Try clicking a specific token for detailed info!";
  if (question.includes("why"))       return "Programming constructs exist to make code readable, efficient, and reusable. Ask about a specific token for more!";
  if (question.includes("example"))   return "Example: int main() { int x = 10; return 0; } — a simple C program.";
  return "💡 Maddy is still learning! Try asking about a specific token, or click one in the table above.";
}

/* ── Global state: which token is currently open ─────────────── */
let currentToken = "";
let currentType  = "";

/* ── Panel DOM refs ─────────────────────────────────────────── */
const aiBackdrop    = document.getElementById("ai-backdrop");
const aiModal       = document.getElementById("ai-modal");
const aiTokenVal    = document.getElementById("ai-token-val");
const aiTokenType   = document.getElementById("ai-token-type");
const aiLoading     = document.getElementById("ai-loading");
const aiContent     = document.getElementById("ai-content");
const aiSuggestions = document.getElementById("ai-suggestions");
const aiCloseBtn    = document.getElementById("ai-close-btn");
const aiChatInput   = document.getElementById("ai-chat-input");
const aiSendBtn     = document.getElementById("ai-send-btn");

/* ── Close handlers ─────────────────────────────────────────── */
aiBackdrop.addEventListener("click",  closeAiPanel);
aiCloseBtn.addEventListener("click",  closeAiPanel);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && aiModal.classList.contains("is-active")) closeAiPanel();
});

/* ── Chat input — send real questions to Maddy ──────────────── */
if (aiChatInput) {
  aiChatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); aiSendBtn.click(); }
  });
}
if (aiSendBtn) {
  aiSendBtn.addEventListener("click", async () => {
    const question = aiChatInput.value.trim();
    if (!question) return;
    aiChatInput.value = "";

    if (!USE_API) {
      aiContent.innerHTML = "";
      aiContent.hidden = false;
      addStatusBadge("⚡ Instant answer (offline)", "ai-status-offline");
      appendPlainAnswer(handleUserQuestion(question));
      if (currentToken) renderSuggestions(currentToken, currentType);
      return;
    }

    /* Show loading */
    aiContent.innerHTML = "";
    aiSuggestions.innerHTML = "";
    aiSuggestions.hidden = true;
    setLoadingMsg("🧠 Maddy is thinking...");
    aiLoading.hidden = false;
    aiContent.hidden = true;

    try {
      /* Send question as a custom prompt to the backend */
      const res = await Promise.race([
        fetch(EXPLAIN_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token: question, type: "QUESTION", prompt: question }),
        }),
        makeTimeout(API_TIMEOUT_MS)
      ]);

      aiLoading.hidden = false;
      let answer = "";

      if (res && res.ok) {
        const data = await res.json();
        answer = data.explanation || "";
      }

      aiLoading.hidden = true;
      aiContent.hidden = false;

      if (!answer) {
        /* Use local fallback Q&A */
        answer = handleUserQuestion(question);
        addStatusBadge("⚡ Instant answer (offline)", "ai-status-offline");
        appendPlainAnswer(answer);
      } else {
        await renderStructuredContent(answer);
      }

      /* Restore suggestions for the current token */
      if (currentToken) renderSuggestions(currentToken, currentType);

    } catch (_) {
      aiLoading.hidden = true;
      aiContent.hidden = false;
      const answer = handleUserQuestion(question);
      addStatusBadge("⚡ Instant answer (offline)", "ai-status-offline");
      appendPlainAnswer(answer);
      if (currentToken) renderSuggestions(currentToken, currentType);
    }
  });
}

/* ════════════════════════════════════════════════════════════
   OPEN PANEL — initial token explanation
   ════════════════════════════════════════════════════════════ */
async function openAiPanel(token, type) {
  console.log(`%c[Maddy] ${token} (${type})`, "color:#a855f7;font-weight:bold;");

  /* Track global state */
  currentToken = token;
  currentType  = type;

  /* Reset UI */
  aiTokenVal.textContent  = token;
  aiTokenType.textContent = type;
  aiContent.innerHTML     = "";
  aiSuggestions.innerHTML = "";
  aiContent.hidden        = true;
  aiSuggestions.hidden    = true;

  aiBackdrop.classList.add("is-active");
  aiModal.classList.add("is-active");

  if (!USE_API) {
    aiLoading.hidden = true;
    aiContent.hidden = false;
    renderFallback(token, type);
    return;
  }

  setLoadingMsg("🧠 Maddy is analyzing this token...");
  aiLoading.hidden = false;

  let explanation  = null;
  let usedFallback = false;

  try {
    explanation = await Promise.race([
      getExplanation(token, type),
      makeTimeout(API_TIMEOUT_MS)
    ]);
  } catch (err) {
    usedFallback = true;
    console.warn("[Maddy] Fallback →", err.message);
  }

  aiLoading.hidden = true;
  aiContent.hidden = false;

  if (usedFallback || !explanation) {
    renderFallback(token, type);
  } else {
    await renderStructuredContent(explanation);
    renderSuggestions(token, type);
  }
}

/* ── askMaddy: called by action buttons ─────────────────────── */
async function askMaddy(token, type, mode) {
  if (!USE_API) {
    aiContent.innerHTML = "";
    aiContent.hidden = false;
    aiLoading.hidden = true;
    renderFallbackMode(token, type, mode);
    renderSuggestions(token, type);
    return;
  }

  const prompts = {
    simple:  `Explain the token '${token}' (${type}) in very simple terms for an absolute beginner.`,
    example: `Give a clear, practical code example using the token '${token}' (${type}) in C/C++.`,
    why:     `Explain why '${token}' (${type}) is used in programming and why it is important.`
  };
  const prompt = prompts[mode] || prompts.simple;

  /* Show loading, keep suggestions visible */
  aiContent.innerHTML = "";
  aiContent.hidden    = false;
  setLoadingMsg("🧠 Maddy is thinking...");
  aiLoading.hidden = false;

  let explanation  = null;
  let usedFallback = false;

  try {
    explanation = await Promise.race([
      fetch(EXPLAIN_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, type, prompt }),
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        return d.explanation || "";
      }),
      makeTimeout(API_TIMEOUT_MS)
    ]);
  } catch (err) {
    usedFallback = true;
    console.warn("[Maddy] Button fallback →", err.message);
  }

  aiLoading.hidden = true;

  if (usedFallback || !explanation) {
    renderFallbackMode(token, type, mode);
  } else {
    await renderStructuredContent(explanation);
  }

  renderSuggestions(token, type);
}

/* ── Render fallback by mode ─────────────────────────────────── */
function renderFallbackMode(token, type, mode) {
  const data = tokenKnowledge[type] || {};
  let text = "";
  if      (mode === "simple")  text = data.simple  || data.explanation || "No info available.";
  else if (mode === "example") text = data.example  || "No example available.";
  else if (mode === "why")     text = data.why      || data.explanation || "No info available.";

  addStatusBadge("⚡ Instant answer (offline)", "ai-status-offline");

  const ICONS = { simple: "📘", example: "🧪", why: "💡" };
  const TITLES = { simple: "Simple Explanation", example: "Code Example", why: "Why It's Used" };
  const el  = document.createElement("div");
  el.className = "ai-section";
  const lbl = document.createElement("span");
  lbl.className   = "ai-section-label";
  lbl.textContent = `${ICONS[mode] || "💬"} ${TITLES[mode] || "Info"}`;
  const cnt = document.createElement("span");
  cnt.className   = mode === "example" ? "ai-section-content ai-example-box" : "ai-section-content";
  cnt.textContent = text;
  el.appendChild(lbl);
  el.appendChild(cnt);
  aiContent.appendChild(el);
}

/* ── Render fallback immediately, upgrade in background ──────── */
function renderFallback(token, type) {
  const data = tokenKnowledge[type] || {
    meaning:     "A building block of source code.",
    explanation: "This token is part of the program structure.",
    example:     token,
    simple:      "This is a piece of code with a specific role.",
    why:         "Used to structure the program."
  };

  addStatusBadge("⚡ Instant explanation", "ai-status-offline");
  renderSectionsInstant(data);
  renderSuggestions(token, type);

  if (USE_API) {
    /* Background attempt — upgrade to AI if it arrives */
    getExplanation(token, type)
      .then(async aiText => {
        if (!aiText || !aiModal.classList.contains("is-active")) return;
        if (currentToken !== token) return; // user opened different token
        aiContent.innerHTML     = "";
        aiSuggestions.innerHTML = "";
        aiSuggestions.hidden    = true;
        addStatusBadge("✨ AI explanation loaded", "ai-status-online");
        await renderStructuredContent(aiText);
        renderSuggestions(token, type);
      })
      .catch(() => {});
  }
}

/* ── Instant (no animation) section renderer ─────────────────── */
function renderSectionsInstant(data) {
  const ICONS = { Meaning: "📘", Explanation: "💡", Example: "🧪" };
  const map   = { Meaning: data.meaning, Explanation: data.explanation, Example: data.example };

  for (const [key, val] of Object.entries(map)) {
    if (!val) continue;
    const el  = document.createElement("div");
    el.className = "ai-section";
    const lbl = document.createElement("span");
    lbl.className   = "ai-section-label";
    lbl.textContent = `${ICONS[key] || ""} ${key}`;
    const cnt = document.createElement("span");
    cnt.className   = key === "Example" ? "ai-section-content ai-example-box" : "ai-section-content";
    cnt.textContent = val;
    el.appendChild(lbl);
    el.appendChild(cnt);
    aiContent.appendChild(el);
  }
}

/* ── Animated (typewriter) section renderer ──────────────────── */
async function renderStructuredContent(rawText) {
  const lines    = rawText.split("\n");
  const sections = { Meaning: "", Explanation: "", Example: "", Why: "" };
  let lastKey    = null;

  lines.forEach(line => {
    if      (/^meaning:/i.test(line))     { sections.Meaning     = line.replace(/^meaning:/i,     "").trim(); lastKey = "Meaning";     }
    else if (/^explanation:/i.test(line)) { sections.Explanation = line.replace(/^explanation:/i, "").trim(); lastKey = "Explanation"; }
    else if (/^example:/i.test(line))     { sections.Example     = line.replace(/^example:/i,     "").trim(); lastKey = "Example";     }
    else if (/^why:/i.test(line))         { sections.Why         = line.replace(/^why:/i,         "").trim(); lastKey = "Why";         }
    else if (lastKey && lastKey !== "Example" && line.trim()) sections[lastKey] += " " + line.trim();
  });

  const ICONS  = { Meaning: "📘", Explanation: "💡", Example: "🧪", Why: "❓" };
  const render = Object.entries(sections).filter(([, v]) => v);

  /* If nothing parsed (unstructured AI reply), show as plain text */
  if (!render.length) {
    appendPlainAnswer(rawText.trim());
    return;
  }

  for (const [key, val] of render) {
    const el  = document.createElement("div");
    el.className = "ai-section";
    const lbl = document.createElement("span");
    lbl.className   = "ai-section-label";
    lbl.textContent = `${ICONS[key] || "💬"} ${key}`;
    const target = document.createElement("span");
    target.className = "ai-section-content typing-cursor";
    el.appendChild(lbl);
    el.appendChild(target);
    aiContent.appendChild(el);

    await typeWriter(val, target, key === "Example" ? 14 : 22);
    target.classList.remove("typing-cursor");
    if (key === "Example") target.classList.add("ai-example-box");
  }
}

/* ── Plain-text answer (for chat / unstructured replies) ─────── */
function appendPlainAnswer(text) {
  const el  = document.createElement("div");
  el.className = "ai-section";
  const lbl = document.createElement("span");
  lbl.className   = "ai-section-label";
  lbl.textContent = "💬 Maddy says";
  const cnt = document.createElement("span");
  cnt.className   = "ai-section-content";
  cnt.textContent = text;
  el.appendChild(lbl);
  el.appendChild(cnt);
  aiContent.appendChild(el);
}

/* ── Typewriter helper ───────────────────────────────────────── */
function typeWriter(text, element, speed) {
  return new Promise(resolve => {
    let i = 0;
    (function type() {
      if (i < text.length) { element.textContent += text.charAt(i++); setTimeout(type, speed); }
      else resolve();
    })();
  });
}

/* ── Timeout promise ─────────────────────────────────────────── */
function makeTimeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
}

/* ── Status badge ────────────────────────────────────────────── */
function addStatusBadge(text, cls) {
  const badge = document.createElement("div");
  badge.className   = `ai-status-badge ${cls}`;
  badge.textContent = text;
  aiContent.appendChild(badge);
}

/* ── Loading message ─────────────────────────────────────────── */
function setLoadingMsg(msg) {
  const p = aiLoading.querySelector("p");
  if (p) p.textContent = msg;
}

/* ── Action buttons (Explain simpler / Show example / Why) ───── */
function renderSuggestions(token, type) {
  const pills = [
    { label: "📘 Explain simpler",   mode: "simple"  },
    { label: "🧪 Show example",      mode: "example" },
    { label: "💡 Why is this used?", mode: "why"     }
  ];
  aiSuggestions.innerHTML = "";
  pills.forEach(s => {
    const btn = document.createElement("button");
    btn.className   = "suggestion-btn";
    btn.textContent = s.label;
    btn.addEventListener("click", () => {
      /* Visually mark active */
      aiSuggestions.querySelectorAll(".suggestion-btn")
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      askMaddy(token, type, s.mode);
    });
    aiSuggestions.appendChild(btn);
  });
  aiSuggestions.hidden = false;
}

/* ── Close panel ─────────────────────────────────────────────── */
function closeAiPanel() {
  aiModal.classList.remove("is-active");
  aiBackdrop.classList.remove("is-active");
  currentToken = "";
  currentType  = "";
}

/* ── POST to /explain ────────────────────────────────────────── */
async function getExplanation(token, type) {
  const res = await fetch(EXPLAIN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token, type }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.explanation || "";
}

/* ── Wire row clicks ─────────────────────────────────────────── */
function wireRowClick(row, token, type) {
  row.classList.add("clickable");
  row.title = `Click to ask Maddy about "${token}"`;
  row.addEventListener("click", () => openAiPanel(token, type));
}
