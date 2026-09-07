# Agent capability remediation ledger

Corrective work after PR #242 / `6121d94`. This file does not alter `docs/AGENT_CAPABILITY_STRATEGY.md`.

Statuses: `not started` | `scaffolded` | `partial` | `blocked` | `demonstrated` | `passed`.

`passed` requires a real user-facing route, a live model turn, store evidence, a trajectory trace, a useful answer, and a regression. Pack or unit proof alone is `demonstrated` at most.

`LIFE_HUB_AGENT_KERNEL` stays **off by default**. This branch does not enable it.

Hammond was **not** rebuilt. Specialist expansion was **not** started.

Live Clare / Chadwick conversational results live in `docs/AGENT_PILOT_VERIFICATION.md`. That file keeps `DETERMINISTIC TEST` totals separate from `LIVE MODEL TURN` totals.

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
- `agent-kernel.mjs` — bounded retrieve loop, `resolveConflict`, checkpoints, richer traces, Chadwick analysis tool; resume reattaches stores from the caller
- `clare-work.mjs` — lesson-aware planner; `plan_work` schema and `executeClareWork` pass energy / capacity / workday
- `fitness-tools.mjs` — `analyseTrainingEvidence` + `executeFitnessReadTool` (chat executor parity)
- `agent-turn-store.mjs` — compact checkpoints omit `stores`
- `chat.mjs` / `chat-confirm.mjs` — checkpoint turns; required checkpoint before a turn-bound pending action; Confirm reloads the turn

### Persistence

Existing GitHub JSON queues (`data/os/pending-actions.json`). Durable turn store: `data/os/agent-turns.json`. Checkpoints keep plan, evidence, claims, actions, trace, and `sourceRefs` (counts only). They do **not** copy loaded Tasks / Teaching / Knowledge / fitness / health stores. Resume reloads stores through the existing adapters when another retrieve is needed. No Mastra / LangGraph / Letta / Mem0.

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
| Rich evidence preserved when kernel owns turn | `demonstrated` | `runSurfaceAgentTurn` → `chat.mjs` `evidencePackBlock` | `tests/unit/agent-evidence-preservation.test.js` | deployed `kernel_trace` claims | Live claims now carry typed provenance |
| Bounded assess→retrieve loop | `demonstrated` | flagged kernel only | `tests/unit/agent-evidence-loop.test.js` | live 1-round + inspectable sufficiency | Second retrieve remains proven only in deterministic widen/missing cases |
| Conflict resolution (not a count) | `demonstrated` | flagged kernel `resolveConflict` | loop tests | Chadwick E | No genuine record disagreement in the live store window |
| Typed claim provenance | `passed` | claim objects + prompt + `kernel_trace` | `tests/unit/agent-claim-provenance.test.js` | Clare A/B + Chadwick stress/core | 136/136 material claims usable; 0 silent null |
| Durable AgentTurnState | `demonstrated` | compact `data/os/agent-turns.json`; chat checkpoints when a kernel id exists | loop persist/restart + compact-store tests | live `turnId` on every kernel chat + Confirm resume | Compact store not inspected on GitHub after the live turns |
| Confirm ↔ persisted turn | `passed` | required checkpoint before `turnId`; `chat-confirm.mjs` reloads queue + turn | `tests/unit/agent-confirm.test.js` + `tests/integration/chat-confirm-turn-roundtrip.test.js` | kernel Confirm `turnResumed` + write + continuation | Duplicate Confirm `invalid_action`; no second write |
| Post-confirm conversational continuation | `passed` | confirm reloads the turn, records the write, invokes one model continuation, persists `continuation` | confirm unit + roundtrip tests | two live kernel Confirm acknowledgements | Duplicate Confirm does not re-invoke |
| Complete traces | `demonstrated` | `kernelTraceEvent` + `retrieveLog` + `sufficiencyDecision` | loop + provenance tests | `kernel3*.json` | SSE still omits model `tool_call` frames; kernel retrieval is server-side |
| Clare live behavioural planner | `passed` | `/api/chat` deployed + `agentKernel: true` | deterministic suites + deployed A–E + Confirm | `kernel2-clare-*.json` + `kernel3-clare-*` | Teaching-today N/A (no lessons 2026-09-07) |
| Clare full capability | `passed` | same path | same + provenance tests | `kernel3b-clare-a.json`, `kernel3-clare-b.json` | Material claims now typed; limitations remain honest |
| Chadwick evidence reasoning | `passed` | `/api/chat` deployed + `agentKernel: true` | cause + planner + provenance tests | `kernel3c-chadwick-s1`…`s5` + core reruns | First-tranche D hallucination remains on the record; 5/5 later stress turns invented no cause |
| Pilot behavioural/capability gate (Clare, Chadwick) | `passed` | deployed `/api/chat` on `deploy-preview-246--life-hub2` | `live-pilot-runtime-env` + `chat-job` | kernel A/B + correction stress | Production kernel still off |
| Specialist expansion | `not started` | — | — | — | Gated on pilots `passed` |
| Hammond supervisor rebuild | `blocked` | old canned handoff remains prototype | — | — | Specialist reliability not `passed` |
| Surface unification / kernel default | `not started` | kernel still flagged off | — | — | Gated on pilots + comparison |
| Kernel default on | `not started` | `LIFE_HUB_AGENT_KERNEL` remains off | — | — | Must not enable until evidence + pilots pass |

Hammond is **blocked**, not rebuilt. Specialist expansion was **not** started. `LIFE_HUB_AGENT_KERNEL` stays **off** on Production.

Confirm after the kernel rerun: live `POST /api/chat` with `agentKernel: true` proposed `act_4c21adab64eb`, Confirm returned 200 with `turnResumed: true`, created `task_mtr965ls_ynh2y1`, invoked a model continuation, and the duplicate Confirm returned `invalid_action` without a second write. That sequence stays `passed`. After the cause/provenance correction, Clare full capability and Chadwick are `passed`. The first kernel Chadwick D hallucination remains in the verification history. The combined pilot gate is `passed`. Production kernel stays off.

Live conversational traces: **model invoked** on Deploy Preview heads `5cb4151` (first kernel A/B) and `6d70375` (cause/provenance correction) via real `POST /api/chat` jobs with `kernel_trace`. Baseline without the flag remains recorded on `0a9f450`. See `docs/AGENT_PILOT_VERIFICATION.md`. Not a local-handler substitute.

## Tests run this branch

Targeted Node suites (all passing on the latest revision):

- `tests/unit/agent-evidence-preservation.test.js`
- `tests/unit/agent-evidence-loop.test.js`
- `tests/unit/agent-claim-provenance.test.js`
- `tests/unit/agent-confirm.test.js`
- `tests/unit/clare-adversarial.test.js`
- `tests/unit/clare-planner.test.js`
- `tests/unit/clare-work.test.js`
- `tests/unit/chadwick-reasoning.test.js`
- `tests/unit/agent-kernel.test.js`
- `tests/unit/agent-surface.test.js`
- `tests/unit/agent-evidence-packs.test.js`
- `tests/unit/capabilities.test.js`
- `tests/integration/chat-confirm-function.test.js`
- `tests/integration/chat-confirm-turn-roundtrip.test.js`
- `tests/integration/chat-function.test.js`
- `tests/integration/chat-pilot-tools.test.js`
- `tests/integration/live-pilot-runtime-env.test.js`

Full `npm test` was not used as the sole proof. Pre-existing env/fixture failures on the full suite are out of scope.

Those suites are **DETERMINISTIC TEST** only.

Earlier on this PR, missing preview GitHub env produced `turn_incomplete` then `misconfigured`. That is fixed. The job runner still publishes JSON error codes. `createChatStartHandler` now persists `agentKernel` on the job body so reconstructed `/api/chat-run` turns can emit `kernel_trace`.

The harness still forwards one allowlisted runtime `env` to both `probeStores()` and `createChatHandler`. Secret values are not written into pilot traces.
