# ECC final consolidation — implementation

**Date:** 2026-09-05  
**Scope:** Absorb surviving ECC-audit mechanisms into Life Hub at the smallest correct seams.  
**Constraint honored:** No ECC install, no AgentShield/GateGuard/memory OS/hook mesh, no commit/push/PR.

Research provenance (unchanged): `ECC_ROUND_1_SKILLS_AUDIT.md` … `ECC_ROUND_4_SECURITY_VERIFICATION_AUDIT.md`.

---

## What was merged (11 → 7)

| # | Consolidated mechanism | Absorbs original KEEP items |
|---|------------------------|-----------------------------|
| A | First-pass completion contract | 1 click-path `{sets,resets}`+undo · 3 dual/multi-path parity · 4 evidence honesty · 5 Must/Must-not/Verify (+Goodhart) · 6 proof/anti-noise gate · 7 silent-failure catalogue |
| B | ACI Delivery + Behaviour proof | 10 Delivery proof · 11 Behaviour fixtures · (parts of 3 path isolation) |
| C | Admission / pseudo-fact posture | 2 pseudo-fact protection · 9 thin memory/context admission |
| D | Fail-visible truncation & load failure | 8 fail-visible truncation · (runtime half of 7) |
| E | Shared integrity helpers (test + runtime) | Supports B–D without a framework |
| F | ON_DEMAND (unchanged) | Santa · human gate · canary · sanitizer · auth checklist — **not** always-on |
| G | Explicit non-goals | All rejected ECC architecture from Rounds 3–4 |

**Final always-on count: 5** (A–E). F stays on-demand. G is documentation of rejection.

---

## What was implemented

### A — First-pass completion contract
- **Destination:** `.cursor/rules/first-pass-correctness.mdc`
- **Change:** Added silent-failure catalogue; Must/Must-not/Verify + Goodhart; evidence honesty (`NOT_RUN` / `INCONCLUSIVE` ≠ PASS); multi-path parity; click-path `{sets,resets}` + undo; proof/anti-noise gate; pointer to ACI Delivery/Behaviour for agent work.
- **Failure class prevented:** “Looks finished / one path green / skipped check counted as pass / speculative review noise.”

### B — ACI Delivery + Behaviour
- **Destination:** `.cursor/rules/agent-context-integrity.mdc` + `tests/unit/context-delivery.test.js`
- **Change:** Rules require Delivery to the **final request/system assembly** (not blob presence alone); Behaviour = must/must-not influence, not keyword recital; path isolation (Chadwick ≠ Clare). Tests assert pain XA + status slices survive `buildSystemPrompt` for **chadwick** and **sara**; Clare receives shared slices but not Chadwick→Sara XA; empty CN does not prove Delivery; behaviour helper encodes must/must-not + negative control.
- **Failure class prevented:** “Pain flag in storage but agent behaves as if unread” at the **Delivery** seam; keyword-theatre Behaviour claims.

### C — Admission / pseudo-facts
- **Destination:** `.cursor/rules/agent-context-integrity.mdc` (Memory Admission Posture)
- **Change:** Explicit precedence: user correction > system state > agent/model inference; do not promote inference to user truth without confirmation. No new memory OS.
- **Failure class prevented:** Silent promotion of model speculation into authoritative user facts.

### D — Fail-visible truncation & load failure
- **Destination:**  
  - `apps/life/js/core/central-node-write.js` — `trimCrossAgentSection` emits `<!-- life-hub:cross-agent-truncated kept=N omitted=M -->`  
  - `netlify/functions/chat.mjs` — tree-load `catch` sets `centralNodeLog` to `CENTRAL_NODE_UNAVAILABLE_MARKER` instead of `''`  
  - ACI rule text for fail-visible requirements
- **Failure class prevented:** Truncation or CN outage masquerading as “complete empty memory.”

### E — Shared helpers
- **Destination:** `apps/life/js/core/context-integrity.js`
- **Exports:** `CENTRAL_NODE_UNAVAILABLE_MARKER`, `crossAgentTruncationComment`, `evaluateConstraintBehaviour`, `assertContextDelivered`
- **Failure class prevented:** Ad-hoc duplicated markers/assertions drifting apart.

---

## What was deliberately not implemented

| Candidate | Why |
|-----------|-----|
| ECC wholesale / plugins / swarm / Agentic OS / CLV2 / `ck` / knowledge graphs | Round 3–4 REJECT; no live contradictory evidence |
| AgentShield / GateGuard / Delivery-Gate frameworks / hook mesh | Round 4 REJECT; enforce contracts in Life Hub tests/rules/runtime instead |
| Santa / human approval / canary / sanitizer / auth checklist as always-on | Remain **ON_DEMAND** |
| LLM Behaviour eval in CI | Non-deterministic + paid; deterministic must/must-not helper + Delivery tests instead |
| Universal click-path test framework | Principle in first-pass only; existing UI tests already cover many stateful paths |
| New ADR/ticket bureaucracy / second SDLC | Explicitly rejected |
| Chadwick-only pain hacks / mandatory “pain” wording | Forbidden; generalised constraint Delivery + behaviour helper |

**Mechanism alterations during implementation:** None of the 11 KEEP items were discarded; 1+3+4+5+6+7 merged into **A**; 2+9 into **C**; 8+(runtime 7) into **D**; 10+11+(path isolation) into **B**; helpers **E**.

---

## Agent-context improvements

| Concern | Status |
|---------|--------|
| **Delivery proof** | Deterministic: blob → extractors → `buildSystemPrompt(agent)` → needle in final system string for chadwick + sara |
| **Behaviour verification** | Deterministic must/must-not helper + negative control (no live model in CI) |
| **Pseudo-fact / admission** | Rule-level posture; no write-path redesign (existing XA writers already label sources) |
| **Truncation visibility** | HTML comment marker on Cross-Agent trim |
| **CN load failure visibility** | Distinct marker vs empty string in chat outer catch |
| **Multi-path** | Clare tested as shared-spine parity (status present, Chadwick→Sara XA absent); Clementine/desk remain documented divergent (no false Clare↔Chadwick equivalence) |

**Chadwick / Sara Delivery:** Covered by unit tests at the Anthropic system-prompt boundary (no paid API call).

---

## First-pass correctness improvements

Observable outcome, existing pattern, real-path fidelity ladder, and failed-first-verification → diagnose loop were already present. This pass **hardened verification honesty and silent-fail discipline** so completion culture cannot treat skipped/inconclusive work or soft-fail greps as success theatre.

---

## Tests added/changed

| File | Role |
|------|------|
| `tests/unit/context-delivery.test.js` | **New** — Delivery (chadwick/sara), Clare parity, empty-CN non-proof, unavailable marker, trim marker, behaviour must/must-not + negative control |
| `tests/unit/central-node-write.test.js` | **Existing** — still passes; now also asserts truncation marker content via live trim behaviour |

---

## Runtime changes

1. `trimCrossAgentSection` — fail-visible truncation comment; strips prior markers before re-trim.  
2. `chat.mjs` outer Central Node load `catch` — `CENTRAL_NODE_UNAVAILABLE_MARKER` instead of silent `''`.

No personality prompt text rewritten. No provider change. No Central Node protocol redesign.

---

## Rule/process changes

- `.cursor/rules/first-pass-correctness.mdc` — verification honesty / silent-fail / multi-path / click-path / proof gate / Goodhart  
- `.cursor/rules/agent-context-integrity.mdc` — fail-visible load/truncation, admission posture, Delivery mandatory, Behaviour ≠ keyword, proof gate cross-link  

Matt/Superpowers left alone (already stronger on diagnose-before-patch and verification honesty).

---

## Verification performed

```text
node --test tests/unit/context-delivery.test.js
→ 8/8 pass

npm test (with this branch)
→ 2078 tests; 2070 pass; 8 fail

The 8 failures also fail on clean origin/main (chat-function / Confirm-card / body-state fixtures unrelated to this change). This branch adds 8 new passing Delivery/Behaviour tests on top of that baseline.
```

---

## Remaining limitations

1. **Behaviour fixtures do not call a live LLM** — they encode operational must/must-not influence for recommendations; Interpretation quality of the model still depends on persona instructions + provider.  
2. **CN unavailable marker** only covers the outer tree-load `catch` in `chat.mjs`, not every soft-fail elsewhere in the monorepo.  
3. **Knowledge Clementine** and **Clare desk** remain divergent spines; this work does not claim Chadwick Delivery proves those paths.  
4. **Admission** is rule + existing write labeling, not a new write-filter engine.  
5. Local checkout was missing some `.cursor/rules` files until restored from `origin/main` and then edited — ensure those rule files are present when syncing.

---

## Follow-up (only if needed later)

- Optional: one Playwright smoke that a chat turn with mocked Anthropic receives a system string containing a known XA needle (only if CI already has a cheap mock pattern).  
- Optional: extend fail-visible markers to other high-value soft-fail sites **as they are touched**, not a repo-wide catch rewrite.

No further ECC rounds recommended.
