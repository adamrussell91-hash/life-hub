# ECC Round 3 — Agent runtime / context / memory / behavioural integrity

**Upstream:** `https://github.com/affaan-m/ecc` @ `e04ea0b9cc8248686edf5ac751cadff550e162b8` (VERSION `2.2.1`)  
**Target:** Life Hub umbrella = **all hubs and all agents** (Life, Knowledge, Tasks, Teaching + shared packages / Netlify chat spine / Cursor ACI rules)  
**Mode:** READ-ONLY quarry. No ECC install. No app/rule/skill/config changes. Report only.  
**Date:** 2026-09-05  
**Prior rounds:** `ECC_ROUND_1_SKILLS_AUDIT.md`, `ECC_ROUND_2_AGENTS_AUDIT.md`  
**Baseline law:** `.cursor/rules/agent-context-integrity.mdc` (Availability / Delivery / Interpretation / Behaviour)

---

## 1. Executive summary

Life Hub already has a stronger **product** agent-context law (ACI) than anything ECC ships as a runtime. Round 3’s job was to ask whether ECC’s memory vaults, compaction hooks, learning loops, eval harnesses, or “agent OS” ideas close the gap that produced the canonical failure — *a pain flag existed, but Chadwick behaved as if he had not read it* — and whether any of that transfers across the **whole umbrella**, not one Life specialist.

**Verdict:** Almost nothing is an `ARCHITECTURAL_CHANGE_CANDIDATE`. Do **not** import ECC memory, Context Keeper, continuous-learning-v2, Agentic OS, knowledge-ops graphs, or PreCompact LLM summaries. Reaffirm Round 1 ACI mines (pseudo-facts; user corrections > agent assertions; dual-path parity). Steal only three thin Round 3 mechanisms: (1) **loop-design-check** Goodhart antibodies, (2) **unified-memory admission posture** (create-only / always-unreviewed / recalled-as-untrusted / no auto transcript import — not the vault OS), (3) **fail-visible truncation markers** (SessionStart style) as anti-pattern contrast to fail-open silent drops.

**Umbrella finding:** Personality chat for Life/Tasks/Teaching converges on one spine (`chat.mjs` → thin Central Node slice → `persona.mjs` → Anthropic with frozen `system`). Knowledge Clementine’s primary path and Clare’s Tasks desk are **divergent**. Pain flags are a Chadwick-domain write path; a Clare or Knowledge pass does **not** prove Chadwick Delivery/Behaviour. The live Delivery gap (blob → Anthropic `system`) and Behaviour gap remain **unproven by tests** for the pain-flag class — that is Life Hub’s real Round 3 work, not an ECC import.

| Bucket | Count (serious surfaces) |
|--------|--------------------------|
| ARCHITECTURAL_CHANGE_CANDIDATE | **0** |
| STRENGTHEN_ACI | 3 (reaffirm R1; fold Goodhart into Behaviour writing) |
| MINE_MECHANISM | 3 thin |
| BEHAVIOURAL_TEST_CANDIDATE | 2 thin |
| OBSERVABILITY_CANDIDATE | 2 thin |
| ON_DEMAND | 4 |
| DEFER_R4 | 5 |
| REJECT | majority (CLV2, agentic-os, ck, knowledge-ops, PreCompact summaries, context-budget-as-integrity, iterative-retrieval-as-integrity, TBA, prompt-optimizer, …) |

---

## 2. Scope reminder — Life Hub is ALL hubs and agents

| Hub | Product agents / surfaces | Context pipeline |
|-----|---------------------------|------------------|
| **Life** | brisket, chadwick, hyaluronica, penelope, sara, vera, hammond (+ router) | Shared `chat.mjs` + domain blobs + thin CN (Hammond: full CN + hub cross-context) |
| **Tasks** | clare (personality) + Clare desk `/api/clare` | Personality: shared chat spine. Desk: deterministic, **no** Anthropic / **no** persona / **no** CN |
| **Teaching** | ann | Shared chat spine (+ `propose_central_node_patch`); Knowledge hat can hit Knowledge path separately |
| **Knowledge** | clementine (primary) | **`netlify/functions/knowledge-clementine-chat.mjs`** → `assembleClementinePrompt` — **no** `central-node.md` |
| **Cursor / coding agents** | Matt / Ponytail / ACI / first-pass rules | Separate from product Anthropic spine; ACI still applies when editing agent pipelines |

Roster source: `netlify/functions/_shared/agent-directory.mjs` (10 personality slugs + router).

**ACI rule applies to every named personality path.** A green Clare desk test, Knowledge Clementine turn, or injected `persona.test.js` string does not satisfy Chadwick pain Delivery.

---

## 3. Life Hub architecture map (shared vs divergent)

### 3.1 Shared Life-chat spine (most personalities)

```
POST /api/chat (netlify/functions/chat.mjs)
  → routeAgent(sticky/name)   // _shared/agent-directory.mjs
  → GitHub tree: central-node.md + domain blobs
  → extractTodaysStatus + extractCrossAgentCoordination + extractRecentAgentActions
       // apps/life/js/core/constraints.js
       (+ This Week for brisket; full CN for hammond)
  → load*Protocol / loadIntuitionFor / capacities / tools
  → buildSystemPrompt(slug, centralNodeLog, …)   // _shared/persona.mjs
  → streamWithAgentLogForce → _shared/anthropic-client.mjs streamMessage
       // system FIXED for the turn; messages grow across tool rounds
```

### 3.2 Per-agent divergent loads (same entry, different blobs/blocks)

| Concern | Agents |
|---------|--------|
| Workout templates / last workouts / body state | chadwick (+ body: brisket, sara) |
| Food library / nutrition challenges | brisket |
| Skincare library | hyaluronica |
| Mind digests / Vera intake | vera, penelope |
| Sara medical tools | sara |
| Full CN + governance + pending patches + **hubContext** (Tasks/Teaching open items) | hammond only |
| Mutable CN mid-turn + `propose_central_node_patch` | hammond, clare, ann |
| Agent-specific `*Blocks` | all via `_shared/persona.mjs` |

### 3.3 Truly divergent product paths

1. **Clare Tasks desk** — `netlify/functions/clare.mjs`: dump/propose/accept. Not LLM. Not CN. Not ACI-chat Delivery.
2. **Knowledge Clementine** — `knowledge-clementine-chat.mjs` + `_shared/knowledge-prompts.mjs` `assembleClementinePrompt`. Archive/research payload. **Never** Life CN pain.
3. **Fitness confirm / persist** — non-LLM write of workouts + CN Flags/`Chadwick→Sara` lines after completed confirm (`persist-log.mjs` → `central-node-write.js`).

### 3.4 Continuity

Tool continuation **preserves** the turn-start `system` string (`anthropic-client.mjs`). Mid-turn CN mutations (challenge sync, patches) do **not** refresh the prompt. Same-turn pain confirm after chat assembly cannot appear until a **new** turn.

---

## 4. Chadwick pain-flag path (canonical ACI failure class)

| Stage | Mechanism | Status |
|-------|-----------|--------|
| Source | Chat `pain_flags` or Fitness logger draft | Implemented |
| Storage (record) | Workout YAML `pain_flags` after Confirm | Implemented + tested |
| Storage (CN) | Flags + `Chadwick→Sara:` XA on **completed** sessions | Implemented + write-tested |
| Retrieval | Thin CN slice (Status + XA + Recent) | Implemented |
| Selection/filter | Thin slice; XA trim max ~12 on write | Eviction risk |
| Assembly | `centralNodeLog` markdown paragraph + Chadwick blocks + protocol Safety | Implemented if protocol loads |
| Serialization | Single `system` string | Implemented |
| Delivery proof | Real blob → Anthropic `system` contains pain line | **Missing test** |
| Interpretation | Protocol + persona “MUST use Status/Cross-Agent” | Present when protocol load succeeds |
| Behaviour | Programming/safety respects constraint without robotic mention | **Missing test** |

Pain reaches the model as **markdown CN text**, not a structured `painFlag` field.

### 4.1 Clare vs Chadwick (pain-relevant)

| | Chadwick | Clare personality | Clare desk |
|--|----------|-------------------|------------|
| Entry | `chat.mjs` | `chat.mjs` | `/api/clare` |
| CN thin read | yes | yes | no |
| Pain write | `pain_flags` → Flags/XA | no | no |
| CN patch | no | `Clare→…` only | n/a |
| Protocol Safety | chadwick-protocol | none | n/a |
| Proves Chadwick pain ACI? | required path | **no** | **no** |

They share the Life-chat **read/assembly spine**. They do **not** share the pain write→interpretation path.

### 4.2 Other agents vs pain mailbox

- **Sara** is the intended XA recipient; she reads the same thin CN mailbox — Delivery/Behaviour for Sara from `Chadwick→Sara` lines is also **unproven**.
- **Hammond** sees full CN + hubContext; richer Availability does not automatically mean Behaviour.
- **Ann / Brisket / …** can see XA lines in thin slice; none author Chadwick pain flags.
- **Knowledge Clementine** is offline this mailbox entirely.

---

## 5. Silent / fail-open seams (umbrella)

| Seam | Where | Contract broken |
|------|-------|-----------------|
| Outer tree-load `catch` clears CN/digest/body | `netlify/functions/chat.mjs` | Delivery (entire turn fluent with empty memory) |
| Protocol loaders `catch → ''` | `_shared/load-*-protocol.mjs` | Interpretation |
| Persist CN sync soft-fail | `_shared/persist-log.mjs` | Availability (record saved, pain never on CN) |
| Planned workouts skip pain XA | `apps/life/js/core/central-node-write.js` | Availability |
| Empty `site` skipped | same | Availability (silent) |
| XA trim (`MAX_CROSS_AGENT_LINES = 12`) | same | Invalidation / eviction |
| Heading mismatch in extractors | `apps/life/js/core/constraints.js` | Selection → Delivery |
| System frozen at turn start | `chat.mjs` + `_shared/anthropic-client.mjs` | Continuity / freshness |
| Agent→agent XA as untyped memory | CN | Provenance / Admission |
| Knowledge archive soft-fail with note | `_shared/knowledge-chat-turn.mjs` | Better: fail-visible note (contrast) |

---

## 6. Existing tests vs ACI contracts (pain class)

| Contract | Evidence | Gap |
|----------|----------|-----|
| Availability | `central-node-write` tests; schema; confirm soft-fail warnings | Soft-fail still leaves happy record |
| Delivery | `persona.test.js` with **injected** `centralNodeLog` | No live blob→`system` proof |
| Interpretation | Protocol/persona asserts when loaded | Silent protocol miss untested as failure |
| Behaviour | — | Missing semantic constraint check |
| Negative control | Hammond hubContext Clare-exclusion | Missing pain on/off Behaviour pair |
| Personality-path isolation | Hub context Clare negative | Missing “Clare pass ≠ Chadwick pain” regression note in suite |

---

## 7. Ten contracts (expanded Round 3 lens)

ACI’s four remain primary. Round 3 adds explicit siblings:

| Contract | Life Hub pain-class status |
|----------|----------------------------|
| Availability | Mostly OK after completed confirm; soft-fail & planned gaps |
| Selection | Thin slice + heading extract + XA cap — can drop live pain |
| Delivery | Pipeline exists; **e2e unproven** |
| Provenance | Markdown XA; no tier (user fact vs agent assertion) |
| Precedence | Shared floor + personality blocks; digests vs CN not provenance-ranked |
| Interpretation | Protocol-dependent; fail-open empty protocol |
| Behaviour | Unproven |
| Continuity | System preserved (good for stability; bad for mid-turn freshness) |
| Admission | Workout confirm + CN write; agent XA lines admitted without user correction tier |
| Invalidation | Trim/evict without explicit “pain cleared” semantics |

---

## 8. ECC inventory (pinned SHA) — runtime surfaces

### Skills (Round 3 focus + companions)

| Surface | Path | Bucket |
|---------|------|--------|
| agent-architecture-audit | `skills/agent-architecture-audit/SKILL.md` | STRENGTHEN_ACI (reaffirm R1) |
| unified-memory + vault | `skills/unified-memory/` + `scripts/lib/memory-vault*.js` | MINE_MECHANISM (admission posture only) / REJECT vault OS |
| strategic-compact + hooks | `skills/strategic-compact/` + `scripts/hooks/suggest-compact.js` `pre-compact.js` | REJECT PreCompact summaries; ON_DEMAND write-before-compact tip |
| context-budget | `skills/context-budget/SKILL.md` | REJECT |
| token-budget-advisor | `skills/token-budget-advisor/SKILL.md` | REJECT |
| continuous-learning-v2 | `skills/continuous-learning-v2/` | REJECT |
| continuous-learning (v1) | `skills/continuous-learning/` | REJECT |
| iterative-retrieval | `skills/iterative-retrieval/SKILL.md` | REJECT (as integrity) |
| eval-harness | `skills/eval-harness/SKILL.md` | DEFER_R4 / thin BEHAVIOURAL_TEST_CANDIDATE |
| agent-harness-construction | `skills/agent-harness-construction/SKILL.md` | ON_DEMAND |
| agentic-os | `skills/agentic-os/SKILL.md` | REJECT |
| cost-aware-llm-pipeline | `skills/cost-aware-llm-pipeline/SKILL.md` | DEFER_R4 |
| ai-regression-testing | `skills/ai-regression-testing/SKILL.md` | STRENGTHEN_ACI (reaffirm R1) |
| loop-design-check | `skills/loop-design-check/SKILL.md` | MINE_MECHANISM + STRENGTHEN_ACI Behaviour writing |
| ck | `skills/ck/` | REJECT |
| knowledge-ops | `skills/knowledge-ops/SKILL.md` | REJECT |
| growth-log | `skills/growth-log/SKILL.md` | ON_DEMAND (method); REJECT mtime gates |
| agent-introspection-debugging | `skills/agent-introspection-debugging/SKILL.md` | REJECT (overlap diagnosing-bugs) |
| prompt-optimizer | `skills/prompt-optimizer/SKILL.md` | REJECT |
| autonomous-loops / continuous-agent-loop | skills | DEFER_R4 / REJECT as product OS |
| agent-eval / agent-self-evaluation / healthcare-eval-harness / gan-style-harness | skills | DEFER_R4 / ON_DEMAND |

### Agents (R2 DEFER_R3 revisited)

| Agent | Path | Bucket |
|-------|------|--------|
| harness-optimizer | `agents/harness-optimizer.md` | DEFER_R4 / REJECT as installed agent |
| loop-operator | `agents/loop-operator.md` | DEFER_R4 |
| conversation-analyzer | `agents/conversation-analyzer.md` | REJECT auto rule-mining; ON_DEMAND human review tip |
| agent-evaluator | `agents/agent-evaluator.md` | ON_DEMAND rubric language only |

### Hooks / scripts

| Surface | Bucket |
|---------|--------|
| `scripts/hooks/pre-compact.js` LLM summary → SessionStart | REJECT (pseudo-facts) |
| `scripts/hooks/suggest-compact.js` fail-open silent disable | Anti-pattern note |
| `scripts/hooks/session-start.js` truncation marker | OBSERVABILITY_CANDIDATE (thin) |
| `scripts/hooks/ecc-context-monitor.js` identical tool-loop detect | OBSERVABILITY_CANDIDATE (hook-bound) |
| CLV2 observe-runner / instincts | REJECT |
| memory vault doctor | OBSERVABILITY later if LH builds doctor |

---

## 9. Mechanism deep-dives (only what survives scepticism)

### 9.1 loop-design-check — Goodhart antibodies — **MINE**

**Steal:** machine-decidable done **+** must-NOT boundaries; independent judge (builder must not edit acceptance); reconcile to external fact; human last switch; refuse “all tests pass” alone.

**Life Hub use:** Strengthen how Behavioural ACI tests are written (constraint respected / must-not proceed as if clear) — **not** a new agent, not an EDD framework.

**Scores (A–F):** 3/2/4/3/4/5

### 9.2 unified-memory admission posture — **MINE (thin)**

**Steal:** create-only writes; always `trust: unreviewed`; recall labelled untrusted / non-executable; no auto transcript import.

**Reject:** vault OS, MCP memory product, hollow supersession API (status never mutated by writers), second memory topology beside `life-hub-data`.

**Scores:** 2/1/3/2/4/4

### 9.3 Fail-visible truncation marker — **OBSERVABILITY / thin mine**

**Steal:** when context is truncated or dropped, leave an explicit marker in the assembled context or operator-visible channel — contrast ECC `suggest-compact` silent disable.

**Life Hub use:** Prefer fail-visible over outer `catch` that zeros CN and continues fluently.

### 9.4 Reaffirm only (not new mines)

- Distillation / **pseudo-facts** (agent-architecture-audit) — PreCompact, ck save, Agentic OS reflections are instances → REJECT those, don’t re-mine.
- **User corrections > agent assertions** — CLV2 *undermines* this by raising confidence on non-correction → REJECT CLV2.
- Dual-path / personality-path parity (ai-regression-testing) — already R1.

---

## 10. Dangerous REJECT list (do not import)

1. **continuous-learning-v2** — silence raises confidence; auto-promote instincts → skills/agents.
2. **Agentic OS** — parallel kernel/memory/cron vs umbrella + `life-hub-data`.
3. **PreCompact LLM summaries** re-entering SessionStart — industrialised pseudo-facts.
4. **ck / knowledge-ops MCP graphs** as durable truth without Delivery/Behaviour proofs.
5. **context-budget / token-budget-advisor** as substitutes for final-request Delivery proof.
6. **iterative-retrieval** soft “enough context” theatre as integrity.
7. **Fail-open integrity hooks** that silently drop signals.
8. **mtime-only learning gates** (growth-log + delivery-gate pattern).
9. Multi-agent pipelines treating **another agent’s assertion as evidence** (R2 danger; XA contamination).

**ARCHITECTURAL_CHANGE_CANDIDATE count: 0.**

---

## 11. Provenance / admission / selection / precedence / delivery / continuation / summarisation / learning / Goodhart / observability

| Theme | ECC offers | Life Hub should |
|-------|------------|-----------------|
| Provenance | Vault trust field (always unreviewed at write) | Label CN digests / XA / user facts distinctly; digests cannot override fresher user corrections |
| Admission | Create-only; no transcript auto-import | Never auto-admit agent monologue; prefer user confirm for durable constraints (pain already confirm-gated — keep) |
| Selection | Heuristic RAG / iterative retrieval | Keep thin CN; add Delivery tests; consider structured pain field later only if markdown fails Behaviour |
| Precedence | Weak / docs | Explicit: user correction > live Flags/XA > digests > agent XA speculation |
| Delivery | Rarely proven to final request | **Prove** blob→`system` for Chadwick (+ Sara) |
| Continuation | SessionStart inject / compact | Preserve system OK; document freshness; new turn for CN refresh |
| Summarisation | PreCompact / ck | REJECT as durable truth without human review |
| Learning | CLV2 instincts | REJECT auto; human growth-log ON_DEMAND only |
| Goodhart | loop-design-check | Mine into Behaviour fixtures |
| Observability | truncation marker; loop monitor | Prefer inspectable assembly/delivery seams over new dashboard OS |

---

## 12. Invariants Life Hub should keep (not ECC imports)

1. Trace every agent-context feature to the **final model request** on the **named personality path**.
2. Four ACI contracts stay separate; expand with Selection / Provenance / Precedence / Continuity / Admission / Invalidation when debugging.
3. Clare desk ≠ Clare chat ≠ Chadwick pain ≠ Knowledge Clementine.
4. Soft-fail that saves a record but drops CN is an Availability bug, not “mostly worked.”
5. Summaries and digests are **derived context**, never pseudo-facts that override user corrections.
6. Agent→agent lines are untrusted relative to user-confirmed flags until proven otherwise.
7. Fail-visible beats fail-open for integrity signals.
8. Behavioural checks use must / must-not + independent assertion of constraint respect — not “mentions pain flag.”
9. Do not install a second memory OS.
10. First-pass correctness and ACI remain siblings; neither replaces the other.

---

## 13. Recommended ACI / first-pass improvements (do not implement in this round)

Provisional, pending Adam approval after Round 4:

1. **Delivery regression:** fixture CN blob with `Chadwick→Sara` pain line → run chat assembly for slug `chadwick` → assert substring in final `system` (no Anthropic call required).
2. **Behaviour fixture (Goodhart-aware):** given active pain constraint in system, response must-not prescribe as if clear; must-not require exact catchphrase; negative control without flag.
3. **Sara Delivery sibling** for the same XA line.
4. **Soft-fail visibility:** CN sync failure must not look like full success to operators/tests.
5. **Admission language** in ACI: user corrections > agent assertions; digests = derived (R1 mine).
6. **Fail-visible** preference when CN/protocol load fails (marker or hard fail on integrity-critical paths — product choice).
7. Fold **must-NOT + independent judge** vocabulary into Behaviour section of ACI (R3 mine).
8. Document XA trim as Invalidation risk; consider pain Flags as longer-lived than XA chatter.

---

## 14. Round 1 / Round 2 reassessment

| Candidate | Round | After R3 |
|-----------|-------|----------|
| click-path `{sets,resets}` + undo | R1 | **KEEP / UNAFFECTED** |
| agent-architecture pseudo-facts + user>agent | R1 | **KEEP**; R3 supplies concrete REJECT instances + thin admission posture |
| ai-regression dual-path parity | R1 | **KEEP**; personality-path is product form |
| browser-qa no baseline ⇒ INCONCLUSIVE | R1 | **UNAFFECTED** |
| intent Must/Must-not/Verify | R1 | **STRENGTHEN** Behaviour writing with Goodhart must-NOT |
| silent-failure swallow greps | R2 | **STRENGTHEN** — maps directly onto chat catch / soft-fail CN (still first-pass, not ECC) |
| code-reviewer proof gate | R2 | **UNAFFECTED** (coding agents) |
| product-capability constraints | R2 | **MERGE** into intent (already R2) |
| santa both-must-pass | R2 | **ON_DEMAND** unchanged |
| orch size-tier + human gates | R2 | **DEFER_R4** / UNAFFECTED for product ACI |
| loop-design-check Goodhart | R2 defer→R3 | **MINE_MECHANISM** (upgrade from defer) |
| unified-memory vault | R1 defer→R3 | **DOWNGRADE** whole vault to REJECT; **MINE** admission posture only |
| continuous-learning-v2 | R1 defer→R3 | **REJECT** |
| strategic-compact / PreCompact | R1 defer→R3 | **REJECT** summaries; tip ON_DEMAND |
| ck / knowledge-ops / agentic-os | R1 defer→R3 | **REJECT** |
| eval-harness / harness-optimizer | R1/R2 defer→R3 | **DEFER_R4** |
| conversation-analyzer / agent-evaluator | R2 defer→R3 | **REJECT** as agents; thin ON_DEMAND |
| No ACTUAL_AGENT from R2 | R2 | **UNAFFECTED** — still 0 product personas to import |

**No R1/R2 mine is SUPERSEDED by a stronger ECC runtime.** R3 **strengthens** Behaviour/Goodhart language and **rejects** learning/memory OS threats.

---

## 15. Cross-round candidate ledger (updated)

| Mechanism | Origin | Status after R3 | Target |
|-----------|--------|-----------------|--------|
| Store sets/resets + sequential undo | R1 click-path | KEEP | first-pass / diagnosing-bugs UI |
| Distillation pseudo-facts; user>agent | R1 agent-architecture | KEEP + R3 REJECT instances | ACI |
| Dual-path contract parity | R1 ai-regression | KEEP | first-pass |
| No baseline ⇒ INCONCLUSIVE | R1 browser-qa | KEEP | first-pass |
| Must / Must-not / Verify | R1 intent | STRENGTHEN w/ Goodhart | first-pass + ACI Behaviour |
| Silent-failure greps | R2 | STRENGTHEN vs LH soft-fail | first-pass |
| Code-review proof gate | R2 | KEEP provisional | Matt overlay |
| Goodhart done+boundary+judge+reconcile | R2/R3 loop-design | **MINE** | ACI Behaviour |
| Vault admission posture only | R3 unified-memory | **MINE thin** | ACI Admission |
| Fail-visible truncation marker | R3 session-start | **OBSERVABILITY thin** | ACI no silent loss |
| ECC memory vault / CLV2 / Agentic OS / ck / knowledge-ops / PreCompact summaries | R1–R3 | **REJECT** | — |
| Full eval-harness product | R3 | DEFER_R4 | — |
| Cost-aware model routing | R3 | DEFER_R4 | ops |

---

## 16. Round 4 handoff

Round 4 should cover security / verification / infrastructure **without** reopening rejected memory OS imports:

- Security-reviewer / OWASP checklists as **on-demand** (R2 defer)
- Contract tests / Pages vs Functions dual-path (R1 mine execution)
- Whether any hooks/scanners belong in Life Hub CI (default: no ECC hooks)
- Schema/migration two-phase notes (django-reviewer thin mine) if fixture work lands
- Explicit decision: implement R1–R3 provisional mines as minimal rule edits — or not

**Not Round 4:** installing ECC, CLV2, memory MCP, Agentic OS, or ck.

---

## 17. Proposed extraction plan (DO NOT EXECUTE)

After Round 4 approval only:

1. Still do **not** install ECC.
2. Minimal ACI edit (~15–25 lines): pseudo-facts; user>agent; digests derived; Goodhart must-NOT / independent check for Behaviour; fail-visible preference; personality-path isolation reminder (Clare ≠ Chadwick ≠ Knowledge).
3. Minimal first-pass edit: silent-failure greps; dual-path; intent constraints (R1/R2).
4. Add **one** Delivery unit test (CN fixture → Chadwick `system`) and **one** Behaviour fixture — Life Hub code, not ECC.
5. Re-read Ponytail; delete restatements.

---

## 18. Method notes

- ECC pin verified at `/tmp/ecc-audit/ecc`: `git rev-parse HEAD` = `e04ea0b9cc8248686edf5ac751cadff550e162b8` (VERSION `2.2.1`).
- Life Hub evidence from `/workspace` read-only, including:
  - `netlify/functions/chat.mjs`, `clare.mjs`, `knowledge-clementine-chat.mjs`
  - `_shared/persona.mjs`, `agent-directory.mjs`, `anthropic-client.mjs`, `persist-log.mjs`, `knowledge-prompts.mjs`, `hub-agent-context.mjs`, `knowledge-chat-turn.mjs`
  - `apps/life/js/core/central-node-write.js`, `constraints.js`
  - ACI on `origin/main`: `.cursor/rules/agent-context-integrity.mdc` (local copy used for baseline)
  - Existing unit/integration tests cited in working notes (Availability write-tested; Delivery/Behaviour gaps)
- Working notes (not deliverables): `/tmp/ecc-audit/r3-lifehub-pipeline.md`, `/tmp/ecc-audit/r3-ecc-runtime.md`.
- Preference order held: REJECT aggressively; mine thin mechanisms; **0** architectural imports.
- Umbrella scope enforced: Teaching / Knowledge / Tasks / Life + all ten directory agents + router + divergent Knowledge Clementine / Clare desk paths.

---

## 19. Audit hygiene

- No branch / commit / push / PR / merge
- No ECC install into Life Hub
- No modifications to application source, rules, skills, configs, or tests
- Only new untracked audit markdown: this file (+ R1/R2 reports already present)

Report path: `ECC_ROUND_3_AGENT_RUNTIME_AUDIT.md`
