"""
LexiScan — backend/lr0_parser.py
LR(0) parsing logic: augmented grammar, closure, GOTO,
canonical collection, and ACTION/GOTO table construction.
"""

from collections import OrderedDict


class LR0Parser:
    """
    Builds the LR(0) canonical collection and parsing table
    for a context-free grammar.

    Grammar input format (one production per line):
        E -> E + T | T
        T -> T * F | F
        F -> ( E ) | id
    """

    def __init__(self, grammar_text: str):
        self.raw_text = grammar_text.strip()
        self.productions = []         # list of (lhs, [rhs_symbols])
        self.nonterminals = []        # ordered, unique
        self.terminals = []           # ordered, unique (includes '$')
        self.start_symbol = None
        self.augmented_start = None

        self._parse_grammar()
        self._augment()

        # Built lazily
        self._states = None           # list of frozensets of items
        self._state_index = None      # frozenset -> int
        self._transitions = None      # {(state_id, symbol): state_id}

    # ──────────────────────────────────────────────────────────────
    # 1.  Grammar parsing
    # ──────────────────────────────────────────────────────────────
    def _parse_grammar(self):
        nts_seen = OrderedDict()
        ts_seen  = OrderedDict()

        for line in self.raw_text.splitlines():
            line = line.strip()
            if not line or "->" not in line:
                raise ValueError(f"Invalid production: '{line}'")

            lhs, rhs_all = line.split("->", 1)
            lhs = lhs.strip()
            if not lhs:
                raise ValueError("Left-hand side cannot be empty.")

            nts_seen[lhs] = True
            for alt in rhs_all.split("|"):
                symbols = alt.split()
                if not symbols:
                    raise ValueError(f"Empty RHS in production for '{lhs}'")
                self.productions.append((lhs, symbols))

        if not self.productions:
            raise ValueError("No productions found.")

        # Collect ordered nonterminals / terminals
        for lhs, rhs in self.productions:
            nts_seen[lhs] = True

        all_symbols = set()
        for _, rhs in self.productions:
            for s in rhs:
                all_symbols.add(s)

        # Anything that appears only on the RHS and is not a LHS → terminal
        for sym in all_symbols:
            if sym not in nts_seen:
                ts_seen[sym] = True

        self.nonterminals = list(nts_seen.keys())
        self.terminals     = list(ts_seen.keys()) + ["$"]
        self.start_symbol  = self.nonterminals[0]

    # ──────────────────────────────────────────────────────────────
    # 2.  Augmented grammar  S' → S
    # ──────────────────────────────────────────────────────────────
    def _augment(self):
        self.augmented_start = self.start_symbol + "'"
        # Prepend so index 0 is always the augmented production
        self.productions = [(self.augmented_start, [self.start_symbol])] \
                           + self.productions
        self.nonterminals = [self.augmented_start] + self.nonterminals

    # ──────────────────────────────────────────────────────────────
    # 3.  Items  (lhs, tuple_rhs, dot_position)
    #     Represented as 3-tuples so they are hashable.
    # ──────────────────────────────────────────────────────────────
    def _item(self, lhs, rhs, dot):
        return (lhs, tuple(rhs), dot)

    def _item_str(self, item):
        lhs, rhs, dot = item
        rhs_with_dot = list(rhs[:dot]) + ["•"] + list(rhs[dot:])
        return f"{lhs} → {' '.join(rhs_with_dot)}"

    def _dot_symbol(self, item):
        """Return the symbol right after the dot, or None if at end."""
        lhs, rhs, dot = item
        return rhs[dot] if dot < len(rhs) else None

    # ──────────────────────────────────────────────────────────────
    # 4.  Closure
    # ──────────────────────────────────────────────────────────────
    def closure(self, items: set) -> frozenset:
        closure_set = set(items)
        changed = True
        while changed:
            changed = False
            new_items = set()
            for item in closure_set:
                sym = self._dot_symbol(item)
                if sym and sym in self.nonterminals:
                    for lhs, rhs in self.productions:
                        if lhs == sym:
                            ni = self._item(lhs, rhs, 0)
                            if ni not in closure_set:
                                new_items.add(ni)
                                changed = True
            closure_set |= new_items
        return frozenset(closure_set)

    # ──────────────────────────────────────────────────────────────
    # 5.  GOTO
    # ──────────────────────────────────────────────────────────────
    def goto(self, state: frozenset, symbol: str) -> frozenset:
        moved = set()
        for item in state:
            lhs, rhs, dot = item
            if dot < len(rhs) and rhs[dot] == symbol:
                moved.add(self._item(lhs, rhs, dot + 1))
        return self.closure(moved) if moved else frozenset()

    # ──────────────────────────────────────────────────────────────
    # 6.  Canonical collection of LR(0) items
    # ──────────────────────────────────────────────────────────────
    def _build_canonical_collection(self):
        if self._states is not None:
            return

        lhs0, rhs0 = self.productions[0]
        start_item = self._item(lhs0, rhs0, 0)
        I0 = self.closure({start_item})

        self._states      = [I0]
        self._state_index = {I0: 0}
        self._transitions = {}

        all_symbols = self.nonterminals + self.terminals
        worklist    = [I0]

        while worklist:
            state = worklist.pop(0)
            sid   = self._state_index[state]

            for sym in all_symbols:
                nxt = self.goto(state, sym)
                if not nxt:
                    continue
                if nxt not in self._state_index:
                    nxt_id = len(self._states)
                    self._states.append(nxt)
                    self._state_index[nxt] = nxt_id
                    worklist.append(nxt)
                self._transitions[(sid, sym)] = self._state_index[nxt]

    # ──────────────────────────────────────────────────────────────
    # 7.  Parsing table  (ACTION + GOTO)
    # ──────────────────────────────────────────────────────────────
    def _build_parsing_table(self):
        self._build_canonical_collection()

        action = {}   # (state, terminal)   → "sN" | "rN" | "acc"
        goto   = {}   # (state, nonterminal) → state_id
        conflicts = []

        aug_lhs, aug_rhs = self.productions[0]

        for sid, state in enumerate(self._states):
            for item in state:
                lhs, rhs, dot = item
                sym = self._dot_symbol(item)

                if sym is not None:
                    # Shift / goto
                    key = (sid, sym)
                    if key in self._transitions:
                        nxt = self._transitions[key]
                        if sym in self.terminals:
                            act = f"s{nxt}"
                            if (sid, sym) in action and action[(sid, sym)] != act:
                                conflicts.append(
                                    f"Shift-Reduce conflict at state {sid} on '{sym}'")
                            action[(sid, sym)] = act
                        else:
                            goto[(sid, sym)] = nxt
                else:
                    # Dot at end
                    if lhs == aug_lhs:
                        action[(sid, "$")] = "acc"
                    else:
                        # Reduce: find production index
                        prod_idx = next(
                            (i for i, (l, r) in enumerate(self.productions)
                             if l == lhs and tuple(r) == rhs),
                            None
                        )
                        if prod_idx is None:
                            continue
                        for term in self.terminals:
                            act = f"r{prod_idx}"
                            if (sid, term) in action and action[(sid, term)] != act:
                                conflicts.append(
                                    f"Reduce-Reduce conflict at state {sid} on '{term}'")
                            action[(sid, term)] = act

        return action, goto, conflicts

    # ──────────────────────────────────────────────────────────────
    # 8.  Public API
    # ──────────────────────────────────────────────────────────────
    def get_augmented_grammar(self) -> list:
        """Return list of augmented production strings."""
        result = []
        for i, (lhs, rhs) in enumerate(self.productions):
            result.append(f"({i}) {lhs} → {' '.join(rhs)}")
        return result

    def get_canonical_collection(self) -> list:
        """Return list of dicts describing each state."""
        self._build_canonical_collection()
        states_out = []
        for sid, state in enumerate(self._states):
            items_str = sorted(self._item_str(item) for item in state)
            states_out.append({"id": sid, "items": items_str})
        return states_out

    def get_transitions(self) -> list:
        """Return list of transition dicts {from, symbol, to}."""
        self._build_canonical_collection()
        return [
            {"from": sid, "symbol": sym, "to": to_id}
            for (sid, sym), to_id in sorted(self._transitions.items())
        ]

    def get_parsing_table(self) -> dict:
        """Return {action: {...}, goto: {...}, conflicts: [...]}."""
        action, goto, conflicts = self._build_parsing_table()

        # Serialise keys to strings for JSON
        action_out = {f"({s},{t})": v for (s, t), v in action.items()}
        goto_out   = {f"({s},{n})": v for (s, n), v in goto.items()}

        # Also build pretty grid metadata
        num_states = len(self._states)
        terms = [t for t in self.terminals]
        nonts = [n for n in self.nonterminals if n != self.augmented_start]

        # Build row-column table for ACTION
        action_grid = []
        for sid in range(num_states):
            row = {"state": sid}
            for t in terms:
                row[t] = action.get((sid, t), "")
            action_grid.append(row)

        # Build row-column table for GOTO
        goto_grid = []
        for sid in range(num_states):
            row = {"state": sid}
            for n in nonts:
                row[n] = str(goto.get((sid, n), ""))
            goto_grid.append(row)

        return {
            "action": action_out,
            "goto":   goto_out,
            "action_grid":  action_grid,
            "goto_grid":    goto_grid,
            "terminals":    terms,
            "nonterminals": nonts,
            "conflicts":    conflicts
        }

    def run(self) -> dict:
        """Full analysis — returns everything the frontend needs."""
        return {
            "augmented":     self.get_augmented_grammar(),
            "items":         self.get_canonical_collection(),
            "transitions":   self.get_transitions(),
            "parsing_table": self.get_parsing_table(),
        }
