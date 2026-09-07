# Agent capability remediation ledger

Corrective work after PR #242 / `6121d94`. This file does not alter `docs/AGENT_CAPABILITY_STRATEGY.md`.

Statuses: `not started` | `scaffolded` | `partial` | `blocked` | `demonstrated` | `passed`.

`passed` requires a real user-facing route, a live model turn, store evidence, a trajectory trace, a useful answer, and a regression. Pack or unit proof alone is `demonstrated` at most.

`LIFE_HUB_AGENT_KERNEL` stays **off by default**. This branch does not enable it.

Hammond was **not** rebuilt. Specialist expansion was **not** started.

## Implementation map (inspected on main `6121d94`)

### Reused

- `netlify/functions/_shared/evidence-packs.mjs` — `assembleEvidencePack`, `formatEvidencePackForPrompt`
- `netlify/functions/_shared/agent-kernel.mjs` — plan / retrieve / assess / compose
- `netlify/functions/_shared/agent-surface.mjs` — surface entry
- `netlify/functions/_shared/agent-memory.mjs` — layered memory file
- `netlify/functions/_shared/clare-work.mjs` — planner and board
- `netlify/functions/_shared/fitness-tools.mjs` — Chadwick calculators
- `netlify/functions/_shared/capabilities/propose-action.mjs` — pending OS actions
- `netlify/functions/chat-confirm.mjs` — existing Confirm route
- `netlify/functions/chat.mjs` — Life production chat

### Modified

- `agent-surface.mjs` — pack + kernel augment; pack is forced when the kernel owns the turn
- `evidence-packs.mjs` — claim provenance; pack `force` flag
- `knowledge-data.mjs` — token ranking so a natural-language question can hit a note
- `agent-kernel.mjs` — bounded retrieve loop, `resolveConflict`, checkpoints, richer traces, Chadwick analysis tool
- `clare-work.mjs` — lesson-aware planner, energy, semantic duplicates, stale projects, overdue-in-day, capacity
- `fitness-tools.mjs` — `analyseTrainingEvidence`
- `chat.mjs` / `chat-confirm.mjs` — checkpoint turns; bind pending actions to turn id; resume on Confirm

### Persistence

Existing GitHub JSON queues (`data/os/pending-actions.json`). New durable turn store: `data/os/agent-turns.json` with an injectable memory adapter for restart tests. No Mastra / LangGraph / Letta / Mem0.

### Where rich evidence was lost

`runSurfaceAgentTurn` used `kernelApplied.promptBlock || pack.promptBlock`. Kernel compose used `composeEvidenceClaims` (`result_count`, `first_result_title`, …). `chat.mjs` sent that as `evidencePackBlock`. Sara’s pack was also inactive when `classifyIntent` returned `none` even though the kernel owned the turn.

### Retrieve loop

`plan → retrieve → assess`; if gaps map to unused or wider slices, retrieve again in the same state, bounded. Conflicts go through `resolveConflict` (recency or explicit unresolved). Composition only after sufficient, exhausted, or unresolved.

### Provenance flow

Tool result `store` / id / path → claim.provenance → prompt + trace. Missing ids stay empty, not invented.

### Misleading existing tests (scaffolding, not behaviour)

- `tests/unit/agent-kernel.test.js` — paraphrases, in-memory `failAt`, prompt Delivery
- `tests/unit/agent-specialists.test.js` — one workflow + Delivery strings
- `tests/unit/agent-handoff.test.js` — sync canned handoffs
- `tests/unit/agent-surface.test.js` — pack tool-list equality
- `tests/unit/clare-adversarial.test.js` (pre-fix) — asserted 08:00 / 45 min / unreserved lessons as contracts

Those cannot flip a requirement to `passed`.

## Ledger

| Requirement | Status | Production path | Tests | Live trace | Remaining gap |
| --- | --- | --- | --- | --- | --- |
| Rich evidence preserved when kernel owns turn | `demonstrated` | `runSurfaceAgentTurn` → `chat.mjs` `evidencePackBlock` | `tests/unit/agent-evidence-preservation.test.js` | none — no API key | Live model turn |
| Bounded assess→retrieve loop | `demonstrated` | flagged kernel only | `tests/unit/agent-evidence-loop.test.js` | none | Default-off; live turn |
| Conflict resolution (not a count) | `demonstrated` | flagged kernel `resolveConflict` | loop tests | none | Live turn |
| Typed claim provenance | `demonstrated` | claim objects + prompt | preservation + loop tests | none | Live citation in a model answer |
| Durable AgentTurnState | `demonstrated` | `agent-turn-store.mjs` (`data/os/agent-turns.json`); chat checkpoints when a kernel id exists | loop persist/restart tests | none | No proof the GitHub write lands in a real chat request |
| Confirm ↔ persisted turn | `demonstrated` | `agent-confirm.mjs`; `turnId` on pending actions; `chat-confirm.mjs` resume hook | `tests/unit/agent-confirm.test.js` | none | No browser Confirm on production; handler hook is untested against a real queue+turn file |
| Complete traces | `partial` | `kernelTraceEvent` expanded | loop tests inspect trajectory | none | Latency/cost need a live model; final answer grading **blocked** |
| Clare operational planner | `demonstrated` | `planWork` / `inspectBoard` used by Clare tools and kernel | `clare-adversarial.test.js` + `clare-planner.test.js` | none | Live conversational gate **blocked** |
| Chadwick evidence reasoning | `demonstrated` | `analyseTrainingEvidence` on flagged kernel training review | `tests/unit/chadwick-reasoning.test.js` | none | Live gate **blocked** |
| Pilot behavioural gate (Clare, Chadwick) | `blocked` | `/api/chat` | n/a | n/a | `ANTHROPIC_API_KEY` unset |
| Specialist expansion | `not started` | — | — | — | Gated on pilots `passed` |
| Hammond supervisor rebuild | `blocked` | old canned handoff remains prototype | — | — | Specialist reliability not `passed` |
| Surface unification / kernel default | `not started` | kernel still flagged off | — | — | Gated on pilots + comparison |
| Kernel default on | `not started` | `LIFE_HUB_AGENT_KERNEL` remains off | — | — | Must not enable until evidence + pilots pass |

Hammond is **blocked**, not rebuilt.

## Tests run this branch

Targeted Node suites (all passing):

- `tests/unit/agent-evidence-preservation.test.js`
- `tests/unit/agent-evidence-loop.test.js`
- `tests/unit/agent-confirm.test.js`
- `tests/unit/clare-adversarial.test.js`
- `tests/unit/clare-planner.test.js`
- `tests/unit/chadwick-reasoning.test.js`
- `tests/unit/agent-kernel.test.js`
- `tests/unit/agent-surface.test.js`
- `tests/unit/agent-evidence-packs.test.js`
- `tests/unit/knowledge-search.test.js`
- `tests/unit/clare-work.test.js`
- `tests/unit/agent-retrieval-behaviour.test.js`
- `tests/unit/agent-specialists.test.js`
- `tests/unit/agent-handoff.test.js`
- `tests/unit/agent-orchestration-acceptance.test.js`
- `tests/integration/chat-confirm-function.test.js`

Full `npm test` was not used as the sole proof. Pre-existing env/fixture failures on the full suite are out of scope.

Live conversational traces: **none**. `ANTHROPIC_API_KEY` is unset.
