/* ════════════════════════════════════════════════════════════
   LexiScan  ·  script.js (Fully Offline AI System)
   ════════════════════════════════════════════════════════════ */
"use strict";

/* ── CONFIGURATION ── */
const KEYWORDS  = ["int", "float", "if", "else", "for", "while", "return"];
const OPERATORS = ["=", "+", "-", "*", "/", "<", ">", "++", "--", "==", "!="];
const SYMBOLS   = ["{", "}", "(", ")", ";", ","];

// ── 🧠 OFFLINE KNOWLEDGE BASE ──
const tokenKnowledge = {
    KEYWORD: {
        meaning: "Reserved word in programming",
        explanation: "Keywords have special meaning and cannot be used as variable names.",
        example: "int a = 10;",
        why: "Used to define program structure"
    },
    IDENTIFIER: {
        meaning: "Name of variable or function",
        explanation: "Identifiers are names given by the programmer to variables, functions, etc.",
        example: "int main()",
        why: "Used to store and access data"
    },
    NUMBER: {
        meaning: "Numeric value",
        explanation: "Represents numbers used in calculations or data storage.",
        example: "10, 5.5",
        why: "Used in computations"
    },
    OPERATOR: {
        meaning: "Performs operations",
        explanation: "Operators are symbols that perform calculations or comparisons.",
        example: "a + b",
        why: "Used to manipulate values"
    },
    SYMBOL: {
        meaning: "Special syntax character",
        explanation: "Symbols (delimiters) are used to organize and structure code blocks.",
        example: "{ } ( ) ;",
        why: "Used to define scope and sequence"
    },
    INVALID: {
        meaning: "Lexical Error",
        explanation: "This character is not recognized as a valid token in the syntax.",
        example: "@, #",
        why: "Not part of the language specification"
    }
};

let lastTokens = [];

/* ── PART 1: LEXICAL ANALYZER ── */
function analyzeCode() {
    const codeInput = document.getElementById("codeInput");
    const code = codeInput.value.trim();

    if (!code) {
        showEmpty("⚠️", "is-err", "Please enter some code before analyzing.");
        return;
    }

    const tokens = [];
    let currentLine = 1;
    const pattern = /([a-zA-Z_]\w*|\d+(?:\.\d+)?|==|!=|<=|>=|\+\+|--|[+\-*/=<>!&|;(){},]|\s+)/g;
    let match;

    while ((match = pattern.exec(code)) !== null) {
        const value = match[0];
        if (/\s+/.test(value)) {
            currentLine += (value.match(/\n/g) || []).length;
            continue;
        }
        let type = "IDENTIFIER";
        if (KEYWORDS.includes(value)) type = "KEYWORD";
        else if (OPERATORS.includes(value)) type = "OPERATOR";
        else if (SYMBOLS.includes(value)) type = "SYMBOL";
        else if (/^\d+(?:\.\d+)?$/.test(value)) type = "NUMBER";
        tokens.push({ type, value, line: currentLine });
    }

    lastTokens = tokens;
    renderTable(tokens);
    renderSummary(tokens);
    setBadge("done");
}

/* ── PART 2: DYNAMIC LR(0) PARSER ── */
class LR0Parser {
    constructor(grammarStr) {
        this.rawGrammar = grammarStr;
        this.productions = []; 
        this.nonTerminals = new Set();
        this.terminals = new Set();
        this.states = []; 
        this.transitions = []; 
        this.startSymbol = "";
        
        this.parseGrammar();
        this.augment();
        this.buildCanonicalCollection();
    }

    parseGrammar() {
        const lines = this.rawGrammar.split("\n").map(l => l.trim()).filter(l => l);
        let idCounter = 1;

        lines.forEach(line => {
            const parts = line.split(/->|→/).map(p => p.trim());
            if (parts.length < 2) return;
            const lhs = parts[0];
            if (!this.startSymbol) this.startSymbol = lhs;
            this.nonTerminals.add(lhs);

            const rhses = parts[1].split("|").map(r => r.trim());
            rhses.forEach(rhsStr => {
                const rhs = rhsStr.split(/\s+/).filter(s => s);
                this.productions.push({ lhs, rhs, id: idCounter++ });
            });
        });

        this.productions.forEach(p => {
            p.rhs.forEach(symbol => {
                if (!this.nonTerminals.has(symbol)) this.terminals.add(symbol);
            });
        });
        this.terminals.add("$");
    }

    augment() {
        const oldStart = this.startSymbol;
        this.startSymbol = oldStart + "'";
        this.productions.unshift({ lhs: this.startSymbol, rhs: [oldStart], id: 0 });
        this.nonTerminals.add(this.startSymbol);
    }

    itemToString(item) {
        const p = this.productions[item.prodId];
        const rhs = [...p.rhs];
        rhs.splice(item.dot, 0, "•");
        return `${p.lhs} → ${rhs.join(" ")}`;
    }

    closure(items) {
        const closureSet = [...items];
        let changed = true;
        while (changed) {
            changed = false;
            const currentLen = closureSet.length;
            for (let i = 0; i < currentLen; i++) {
                const item = closureSet[i];
                const prod = this.productions[item.prodId];
                if (item.dot < prod.rhs.length) {
                    const symbol = prod.rhs[item.dot];
                    if (this.nonTerminals.has(symbol)) {
                        this.productions.forEach((p, idx) => {
                            if (p.lhs === symbol) {
                                if (!closureSet.some(it => it.prodId === idx && it.dot === 0)) {
                                    closureSet.push({ prodId: idx, dot: 0 });
                                    changed = true;
                                }
                            }
                        });
                    }
                }
            }
        }
        return closureSet.sort((a, b) => a.prodId - b.prodId || a.dot - b.dot);
    }

    goto(items, symbol) {
        const nextItems = [];
        items.forEach(item => {
            const prod = this.productions[item.prodId];
            if (item.dot < prod.rhs.length && prod.rhs[item.dot] === symbol) {
                nextItems.push({ prodId: item.prodId, dot: item.dot + 1 });
            }
        });
        return this.closure(nextItems);
    }

    buildCanonicalCollection() {
        const initialItem = { prodId: 0, dot: 0 };
        const i0 = this.closure([initialItem]);
        this.states.push(i0);

        let i = 0;
        while (i < this.states.length) {
            const currentState = this.states[i];
            const allSymbols = [...this.nonTerminals, ...this.terminals];
            allSymbols.forEach(symbol => {
                if (symbol === "$") return;
                const nextState = this.goto(currentState, symbol);
                if (nextState.length > 0) {
                    const existingIdx = this.states.findIndex(s => 
                        JSON.stringify(s) === JSON.stringify(nextState)
                    );
                    if (existingIdx === -1) {
                        this.states.push(nextState);
                        this.transitions.push({ from: i, symbol, to: this.states.length - 1 });
                    } else {
                        this.transitions.push({ from: i, symbol, to: existingIdx });
                    }
                }
            });
            i++;
        }
    }

    getParsingTable() {
        const actionGrid = [];
        const gotoGrid = [];
        const terms = [...this.terminals];
        const nonTerms = [...this.nonTerminals].filter(nt => nt !== this.startSymbol);
        const conflicts = [];

        this.states.forEach((state, i) => {
            const actionRow = { id: i };
            const gotoRow = { id: i };
            this.transitions.forEach(t => {
                if (t.from === i) {
                    if (this.terminals.has(t.symbol)) actionRow[t.symbol] = `s${t.to}`;
                    else gotoRow[t.symbol] = t.to;
                }
            });
            state.forEach(item => {
                const prod = this.productions[item.prodId];
                if (item.dot === prod.rhs.length) {
                    if (prod.lhs === this.startSymbol) actionRow["$"] = "acc";
                    else {
                        terms.forEach(term => {
                            if (actionRow[term] && !actionRow[term].startsWith("r")) {
                                conflicts.push(`Shift/Reduce conflict in State I${i} on symbol '${term}'`);
                            }
                            actionRow[term] = `r${item.prodId}`;
                        });
                    }
                }
            });
            actionGrid.push(actionRow);
            gotoGrid.push(gotoRow);
        });
        return { action_grid: actionGrid, goto_grid: gotoGrid, terminals: terms, nonterminals: nonTerms, conflicts };
    }
}

function generateLR0() {
    const grammarInput = document.getElementById("grammarInput").value.trim();
    if (!grammarInput) {
        alert("⚠️ Please enter a grammar.");
        return;
    }
    try {
        const parser = new LR0Parser(grammarInput);
        const table = parser.getParsingTable();
        const data = {
            augmented: parser.productions.map(p => `${p.lhs} → ${p.rhs.join(" ")}`),
            items: parser.states.map((s, idx) => ({ id: idx, items: s.map(item => parser.itemToString(item)) })),
            transitions: parser.transitions,
            parsing_table: table
        };
        renderLR0Results(data);
        setLR0Status("done");
    } catch (err) {
        console.error(err);
        alert("Error parsing grammar.");
    }
}

/* ── PART 3: MADDY AI (FULLY OFFLINE) ── */

function openMaddy(token, type) {
    const modal = document.getElementById("ai-modal");
    const backdrop = document.getElementById("ai-backdrop");
    const tokenVal = document.getElementById("ai-token-val");
    const tokenType = document.getElementById("ai-token-type");
    const aiContent = document.getElementById("ai-content");
    const aiLoading = document.getElementById("ai-loading");
    const aiSuggestions = document.getElementById("ai-suggestions");

    if (!modal || !backdrop) return;

    tokenVal.textContent = token;
    tokenType.textContent = type;
    
    // UI Setup: Fast & Reliable
    aiLoading.hidden = false;
    aiLoading.innerHTML = `<p style="color:#a855f7;font-weight:600;margin-bottom:1rem;">⚡ Instant explanation</p>`;
    
    modal.classList.add("active");
    backdrop.classList.add("active");

    const info = tokenKnowledge[type] || tokenKnowledge.IDENTIFIER;

    // Default view: Explanation
    aiContent.innerHTML = `<div class="ai-msg"><strong>Overview:</strong><br>${info.explanation}</div>`;
    
    // Suggestion Buttons
    aiSuggestions.innerHTML = `
        <button class="sugg-btn" onclick="showOfflineMode('meaning', '${type}')">📘 Explain simpler</button>
        <button class="sugg-btn" onclick="showOfflineMode('example', '${type}')">🧪 Show example</button>
        <button class="sugg-btn" onclick="showOfflineMode('why', '${type}')">💡 Why is this used?</button>
    `;
}

window.showOfflineMode = function(mode, type) {
    const aiContent = document.getElementById("ai-content");
    const info = tokenKnowledge[type] || tokenKnowledge.IDENTIFIER;

    let content = "";
    if (mode === 'meaning') content = `<strong>Meaning:</strong><br>${info.meaning}`;
    else if (mode === 'example') content = `<strong>Example:</strong><br><code>${info.example}</code>`;
    else if (mode === 'why') content = `<strong>Purpose:</strong><br>${info.why}`;

    aiContent.innerHTML = `<div class="ai-msg">${content}</div>`;
};

function closeMaddy() {
    const modal = document.getElementById("ai-modal");
    const backdrop = document.getElementById("ai-backdrop");
    if (modal) modal.classList.remove("active");
    if (backdrop) backdrop.classList.remove("active");
}

/* ── UI HELPERS ── */

function showEmpty(icon, cls, msg) {
    const resultsBody = document.getElementById("results-body");
    resultsBody.innerHTML = `
        <div class="empty-state ${cls}">
            <div class="empty-icon">${icon}</div>
            <p>${msg}</p>
        </div>`;
}

function renderTable(tokens) {
    const resultsBody = document.getElementById("results-body");
    const resultActions = document.getElementById("result-actions");
    const idleBadge = document.getElementById("idle-badge");

    if (!tokens.length) return;

    let html = `<table class="tok-table">
        <thead><tr><th>#</th><th>Token</th><th>Type</th><th>Line</th></tr></thead>
        <tbody>`;
    tokens.forEach((t, i) => {
        const cc = ({
            KEYWORD: "t-keyword", IDENTIFIER: "t-identifier", NUMBER: "t-number",
            OPERATOR: "t-operator", SYMBOL: "t-symbol"
        })[t.type] || "";
        html += `<tr>
            <td>${i+1}</td>
            <td class="${cc}" style="cursor:pointer;font-weight:600;text-decoration:underline dashed;" 
                onclick="openMaddy('${t.value}', '${t.type}')" title="Click to ask Maddy">${t.value}</td>
            <td>${t.type}</td>
            <td>${t.line}</td>
        </tr>`;
    });
    html += `</tbody></table>`;

    resultsBody.innerHTML = html;
    resultActions.hidden = false;
    idleBadge.hidden = true;
}

function renderSummary(tokens) {
    const summaryEl = document.getElementById("summary");
    const counts = {};
    tokens.forEach(t => counts[t.type] = (counts[t.type] || 0) + 1);
    summaryEl.innerHTML = Object.entries(counts).map(([t, n]) => `
        <div class="chip">${t}<span class="chip-count">${n}</span></div>
    `).join("");
    summaryEl.hidden = false;
}

function switchTab(tab) {
    const lexEl  = document.getElementById("lexicalSection");
    const lr0El  = document.getElementById("lr0Section");
    const btnLex = document.getElementById("btn-tab-lexical");
    const btnLr0 = document.getElementById("btn-tab-lr0");

    const activeStyle   = "flex:1;padding:1rem 1.5rem;border:none;border-radius:10px;font-family:inherit;font-size:1rem;font-weight:600;cursor:pointer;background:linear-gradient(135deg,rgba(168,85,247,.22),rgba(124,58,237,.16));color:#fff;box-shadow:0 0 0 1px rgba(168,85,247,.38) inset;transition:all .25s ease;";
    const inactiveStyle = "flex:1;padding:1rem 1.5rem;border:none;border-radius:10px;font-family:inherit;font-size:1rem;font-weight:600;cursor:pointer;background:transparent;color:#8892a4;transition:all .25s ease;";

    if (tab === "lexical") {
        lexEl.style.display = "block";
        lr0El.style.display = "none";
        btnLex.style.cssText = activeStyle;
        btnLr0.style.cssText = inactiveStyle;
    } else {
        lexEl.style.display = "none";
        lr0El.style.display = "block";
        btnLex.style.cssText = inactiveStyle;
        btnLr0.style.cssText = activeStyle;
    }
}

function setBadge(state) {
    const statusBadge = document.getElementById("status-badge");
    const map = {
        ready: { text: "Ready", cls: "badge-ok" },
        done:  { text: "Complete ✓", cls: "badge-ok" },
        error: { text: "Error", cls: "badge-err" },
    };
    const { text, cls } = map[state] || map.ready;
    if (statusBadge) {
        statusBadge.textContent = text;
        statusBadge.className = `badge ${cls}`;
    }
}

function setLR0Status(state) {
    const card = document.getElementById("lr0-status-card");
    const results = document.getElementById("lr0-results");
    if (state === "done") {
        card.style.display = "none";
        results.style.display = "block";
    }
}

function renderLR0Results(data) {
    renderLR0Augmented(data.augmented);
    renderLR0States(data.items);
    renderLR0Transitions(data.transitions);
    renderLR0Table(data.parsing_table);
    document.getElementById("lr0-results").style.display = "block";
}

function renderLR0Augmented(list) {
    const el = document.getElementById("lr0-aug-content");
    el.innerHTML = list.map((prod, i) => `<div class="lr0-aug-item"><span class="lr0-aug-idx">(${i})</span><span>${prod}</span></div>`).join("");
}

function renderLR0States(states) {
    const grid = document.getElementById("lr0-states-content");
    grid.innerHTML = states.map(state => `
        <div class="lr0-state-card">
            <div class="lr0-state-head">State I${state.id}</div>
            <div class="lr0-state-items">
                ${state.items.map(item => `<div class="lr0-state-item">${item}</div>`).join("")}
            </div>
        </div>`).join("");
}

function renderLR0Transitions(transitions) {
    const wrap = document.getElementById("lr0-trans-content");
    wrap.innerHTML = transitions.map(t => `<div class="lr0-trans-row">I${t.from} ── <span class="trans-sym">${t.symbol}</span> ──▶ I${t.to}</div>`).join("");
}

function renderLR0Table(pt) {
    const wrap = document.getElementById("lr0-table-content");
    const conflictBar = document.getElementById("lr0-conflicts-bar");
    
    if (pt.conflicts.length > 0) {
        conflictBar.style.display = "block";
        conflictBar.innerHTML = pt.conflicts.map(c => `<div>⚠️ ${c}</div>`).join("");
    } else conflictBar.style.display = "none";

    let html = `<table class="lr0-parse-table"><thead><tr><th rowspan="2">State</th><th colspan="${pt.terminals.length}">ACTION</th><th colspan="${pt.nonterminals.length}">GOTO</th></tr><tr>`;
    pt.terminals.forEach(t => html += `<th>${t}</th>`);
    pt.nonterminals.forEach(n => html += `<th>${n}</th>`);
    html += `</tr></thead><tbody>`;
    pt.action_grid.forEach((row, i) => {
        html += `<tr><td class="st-num">${i}</td>`;
        pt.terminals.forEach(t => {
            const val = row[t] || "-";
            const cl = val.startsWith("s") ? "sh" : val.startsWith("r") ? "re" : val === "acc" ? "ac" : "";
            html += `<td class="${cl}">${val}</td>`;
        });
        const gRow = pt.goto_grid[i] || {};
        pt.nonterminals.forEach(n => html += `<td>${gRow[n] || "-"}</td>`);
        html += `</tr>`;
    });
    html += `</tbody></table>`;
    wrap.innerHTML = html;
}

function renderLineNums() {
    const val = document.getElementById("codeInput").value;
    const lines = val.split("\n");
    document.getElementById("line-nums").innerHTML = lines.map((_, i) => `<div>${i+1}</div>`).join("");
}

function toggleAccordion(btn, bodyId) {
    const body = document.getElementById(bodyId);
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    body.style.display = expanded ? "none" : "block";
}

function clearAll() {
    document.getElementById("codeInput").value = "";
    renderLineNums();
}

function clearLR0() {
    document.getElementById("grammarInput").value = "";
}

document.addEventListener("DOMContentLoaded", () => {
    const codeInput = document.getElementById("codeInput");
    if (codeInput) {
        codeInput.value = `int x = 10;\nif (x > 5) {\n    return x + 1;\n}`;
        renderLineNums();
        codeInput.addEventListener("input", renderLineNums);
    }

    // Modal Events
    const closeBtn = document.getElementById("ai-close-btn");
    const backdrop = document.getElementById("ai-backdrop");
    if (closeBtn) closeBtn.onclick = closeMaddy;
    if (backdrop) backdrop.onclick = closeMaddy;

    // Offline Chat Handler
    const chatBtn = document.getElementById("ai-send-btn");
    const chatInput = document.getElementById("ai-chat-input");
    if (chatBtn && chatInput) {
        chatBtn.onclick = () => {
            const query = chatInput.value.toLowerCase();
            const aiContent = document.getElementById("ai-content");
            if (query.includes("int") || query.includes("float")) showOfflineMode('meaning', 'KEYWORD');
            else if (query.includes("name") || query.includes("variable")) showOfflineMode('meaning', 'IDENTIFIER');
            else if (query.includes("symbol")) showOfflineMode('meaning', 'SYMBOL');
            else aiContent.innerHTML = `<div class="ai-msg">I am currently in <strong>Offline Mode</strong>. Try clicking the tokens or the suggestions below!</div>`;
            chatInput.value = "";
        };
    }
});
