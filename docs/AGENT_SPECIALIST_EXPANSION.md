# Specialist expansion verification

Companion to `docs/AGENT_CAPABILITY_REMEDIATION.md` and `docs/AGENT_PILOT_VERIFICATION.md`.
Does **not** edit `docs/AGENT_CAPABILITY_STRATEGY.md`.

Branch: `cursor/specialist-agents-expansion-b903` (PR #247). Base: main after PR #246 (`fba54e18`).

Statuses: `not started` | `blocked` | `deterministic only` | `demonstrated` | `passed`.

`passed` requires LIVE MODEL / DEPLOYED ROUTE with `agentKernel: true`, genuine store evidence, useful answer, provenance, and no critical unsupported inference. Deterministic suites alone are at most `deterministic only`.

Production `LIFE_HUB_AGENT_KERNEL` remains **off**.

## Chronology

### 2026-09-07 — Rebase on main after #246

- Confirmed PR #246 merge commit `fba54e18` on main.
- Clare / Chadwick live pilots remain `passed` on the prior deploy-preview-246 record.
- Specialist expansion was `not started`; Hammond rebuild remained `blocked`.
- Branched `cursor/specialist-agents-expansion-b903` from current main.

### Ann — failure → correction → regression

| Step | Detail |
| --- | --- |
| Failure | Diagnosis looked for non-schema `learning_intentions` / `objectives`; scheduled rows were not joined to draft lesson content; NL teaching questions did not token-match titles. |
| Root cause | Teaching Hub stores draft lessons and `scheduled_lesson` rows separately; LessonSchema uses `blocks` + `outcome_ids`. |
| Correction | `hydrateTeachingSchedule`, real-schema diagnosis, token search, stated time budgets, richer provenance + interpretation. |
| Deterministic regression | `tests/unit/ann-kernel.test.js` + updated preservation fixture. |
| Live rerun | pending deploy-preview-247 |
| Status | `deterministic only` |

### Clementine — correction → regression

| Step | Detail |
| --- | --- |
| Failure | Synthesis treated all hits as flat related notes; no graph vs inference split; conflicts invisible. |
| Root cause | `getKnowledgeSynthesis` returned ranked hits without conflict/theme/link classification. |
| Correction | Themes derived; `graph_links` vs `inferred_relations`; conflicts fail-visible; multi-note id provenance. |
| Deterministic regression | `tests/unit/clementine-kernel.test.js` |
| Live rerun | pending |
| Status | `deterministic only` |

### Sara — correction → regression

| Step | Detail |
| --- | --- |
| Failure | No temporal classifier; historical visits could be narrated as current. |
| Root cause | Pack retrieved medical hits without recency labels or current-turn symptom provenance. |
| Correction | `analyse_medical_evidence` + `statedHealthConstraints`; historical/current/missing_date; dated comparison claims. |
| Deterministic regression | `tests/unit/sara-kernel.test.js` |
| Live rerun | pending (local life-hub-data has body/weight, no medical visit files) |
| Status | `deterministic only` |

## Specialist inventory (current main + this branch)

| Slug | Display | Domain | Kernel workflow | Tools / retrieval | Write actions | Stores | Tests | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ann | Ann O'Tation | teaching | `lesson_diagnosis` | search/context/diagnosis + hydrate | Teaching AI / Confirm for mutations (no new write path) | Teaching blobs | `ann-kernel` | med | deterministic only |
| clementine | Prof. Clementine Haig | knowledge | `knowledge_research` | search + synthesis (+ teaching bridge) | Knowledge note writes stay Confirm/existing | knowledge-hub-data | `clementine-kernel` | med | deterministic only |
| sara | Dr Sara Tonin | health | `health_timeline` | body/weight/medical search + analyse | medical `log_entry` Confirm (unchanged) | life-hub-data body | `sara-kernel` | high | deterministic only |
| brisket | Brisket Lasso | nutrition | `nutrition_adherence` | snapshot/adherence/remaining/search | meal log Confirm (existing) | nutrition | Phase 3 specialists | med | deterministic only (Phase 3) |
| hyaluronica | Hyaluronica St. Claire | skincare | `routine_response` | adherence/response/search | existing | skincare | Phase 3 | low | deterministic only (Phase 3) |
| penelope | Penelope Rose Quillian | diary | `diary_recurrence` | search/range/themes/compare | existing | mind/diary | Phase 3 | med | deterministic only (Phase 3) |
| vera | Dr Vera Lenz | mind | `mind_reflection` | search/compare sessions | existing | mind | Phase 3 | med | deterministic only (Phase 3) |
| clare | Clare DeMind | tasks | `daily_focus` | focus/open loops/plan_work | Confirm | Tasks blobs | pilots | med | **passed** (#246) |
| chadwick | Chadwick Flexington | fitness | `training_review` | fitness + analyse | Confirm where applicable | fitness | pilots | high | **passed** (#246) |
| hammond | General Hammond | cross-hub | `cross_hub_supervision` | inspect signals / handoffs (canned) | Confirm | cross-hub | handoff unit | high | **blocked** — not rebuilt |

## Hammond architecture note (pre-implementation)

Hammond is **not** another specialist. Do not rebuild until Ann / Clementine / Sara have live deployed-route evidence.

| Owns | Delegates | Reads directly | Must never infer |
| --- | --- | --- | --- |
| Weekly review framing, open loops across hubs, attention allocation, conflict surfacing | Teaching→Ann, Knowledge→Clementine, Health→Sara, Fitness→Chadwick, Tasks→Clare | Hub signal summaries (`inspect_hub_signals`), already-verified specialist returns | Stronger medical claims than Sara; invented lesson content; invented note pages; flattened uncertainty |

Provenance survival: retain originating specialist claim provenance (store + id/path + sourceType). Confirm for any cross-hub write stays on `os_propose_action` / existing gateways — Hammond must not bypass Confirm.

Status: architecture recorded; implementation **not started**.

## Generic kernel changes this tranche

- Teaching hydrate + stated teaching constraints (`domain-retrieval.mjs`)
- Teaching diagnosis against real schema (`domain-analysis.mjs`)
- Knowledge synthesis conflicts / graph vs inference / themes
- `rankKnowledgePages` preserves score
- Medical `analyse_medical_evidence` + search truncation meta
- Kernel interpretation lines for Ann / Clementine / Sara
- Evidence claim compose for teaching / knowledge / medical temporal fields

## Clare / Chadwick regressions

Targeted suites re-run after Sara commit (preservation fixture updated for Ann schema). Must stay green before live specialist stress.

### Live results (2026-09-07)

#### LIVE MODEL / DEPLOYED ROUTE

- URL probed: `https://deploy-preview-247--life-hub2.netlify.app`
- `GET /` → 200
- `POST /api/chat` without session → `401 unauthenticated`
- **Blocked** in this environment: no Life Hub passphrase / session secret injected (only `ANTHROPIC_API_KEY`).
- Therefore Ann / Clementine / Sara cannot be marked `passed` this tranche.

#### LIVE MODEL / LOCAL HANDLER

Script: `scripts/live-specialist-verify.mjs` with `agentKernel: true`.

| Turn | Status | Notes |
| --- | --- | --- |
| Ann today/next/gaps | not exercised | Teaching blobs unbound locally |
| Clementine notes/themes | not exercised | Knowledge GitHub unbound locally |
| Sara weight | exercised | `health_timeline`, 0 silent null provenance; cited composition readings |
| Sara medical history | not exercised | no medical visit files in local life-hub-data |
| Sara current-turn symptom | exercised | `health_timeline`; Medical Overview empty; symptom treated as current-turn |
| Brisket eating | exercised | `nutrition_adherence` |
| Chadwick regression | exercised | `training_review` still fires under specialist branch |

Traces: `/tmp/life-hub-specialist-traces/` (copied under `/opt/cursor/artifacts/`).

## Clare / Chadwick regressions

Targeted suites green after Ann preservation fixture update for real Teaching schema fields.

## Production kernel

Still **off**. `docs/AGENT_CAPABILITY_STRATEGY.md` **unchanged**. Hammond **not** rebuilt (architecture note only).
