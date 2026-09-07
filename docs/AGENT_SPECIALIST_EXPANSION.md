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

### Ann — failure → correction → regression (tranche 1)

| Step | Detail |
| --- | --- |
| Failure | Diagnosis looked for non-schema `learning_intentions` / `objectives`; scheduled rows were not joined to draft lesson content; NL teaching questions did not token-match titles. |
| Root cause | Teaching Hub stores draft lessons and `scheduled_lesson` rows separately; LessonSchema uses `blocks` + `outcome_ids`. |
| Correction | `hydrateTeachingSchedule`, real-schema diagnosis, token search, stated time budgets, richer provenance + interpretation. |
| Deterministic regression | `tests/unit/ann-kernel.test.js` + updated preservation fixture. |
| Live rerun | pending deploy-preview-247 |
| Status | `deterministic only` |

### Clementine — correction → regression (tranche 1)

| Step | Detail |
| --- | --- |
| Failure | Synthesis treated all hits as flat related notes; no graph vs inference split; conflicts invisible. |
| Root cause | `getKnowledgeSynthesis` returned ranked hits without conflict/theme/link classification. |
| Correction | Themes derived; `graph_links` vs `inferred_relations`; conflicts fail-visible; multi-note id provenance. |
| Deterministic regression | `tests/unit/clementine-kernel.test.js` |
| Live rerun | pending |
| Status | `deterministic only` |

### Sara — correction → regression (tranche 1)

| Step | Detail |
| --- | --- |
| Failure | No temporal classifier; historical visits could be narrated as current. |
| Root cause | Pack retrieved medical hits without recency labels or current-turn symptom provenance. |
| Correction | `analyse_medical_evidence` + `statedHealthConstraints`; historical/recent/missing_date; dated comparison claims. |
| Deterministic regression | `tests/unit/sara-kernel.test.js` |
| Live rerun | pending (local life-hub-data has body/weight, no medical visit files) |
| Status | `deterministic only` |

### Independent review defects (continuation) — failure → root cause → correction → regression → status

These defects existed in the first tranche and were corrected before expanding Brisket / Hyaluronica / Penelope / Vera. History is preserved; they are not rewritten away.

#### Ann — `outcome_ids` aliased as learning intentions

| Step | Detail |
| --- | --- |
| Failure | `getTeachingDiagnosis` set `learning_intentions = outcome_ids`, so codes like `EN5-1A` were exposed as learning intentions. |
| Root cause | Legacy alias treated syllabus outcome identifiers as intention text. |
| Correction | Removed the alias. `learning_intentions` only from genuine stored intention fields/blocks. Gap text: no stored learning intention retrieved. Interpretation forbids describing outcome codes as intentions. `outcome_ids` remain their own record fact. |
| Regression | `ann-kernel.test.js` — outcome_ids without intention field; genuine intention block; “What learning intentions are already attached?” |
| Status | `deterministic only` |

#### Sara — recent visits labelled `current_*`

| Step | Detail |
| --- | --- |
| Failure | 14-day window used `current_window` / `current_visit_*`, promoting recent dated visits toward present status. |
| Root cause | Recency classifier reused “current” language for any visit inside the window. |
| Correction | Renamed to `recent_window_days` / `recent_window` / `recent_visit_*`. Interpretation: recent = recent historical evidence only. Current state needs `user_stated_current_turn` or explicit active stored evidence (none invented). |
| Regression | `sara-kernel.test.js` Cases A–F (5-day pain, 7-day meds, 10-day labs, current-turn flare, months-old, undated). |
| Status | `deterministic only` |

#### Clementine — substring polarity conflicts

| Step | Detail |
| --- | --- |
| Failure | `detectNoteConflicts` used raw `includes()`, so `disagree` matched `agree` and `ineffective` matched `effective`. |
| Root cause | Substring polarity without word boundaries; suite only used supports/rejects. |
| Correction | Word/token-aware polarity; require shared subject; kind `conflict_signal` (conservative). |
| Regression | agree/disagree, effective/ineffective, works/fails, supports/rejects; negative mixed effective/ineffective vs unrelated note. |
| Status | `deterministic only` |

### Independent review defects (continuation 2) — failure → root cause → correction → regression → status

#### Penelope — fallback entries inflated recurrence strength

| Step | Detail |
| --- | --- |
| Failure | When diary search returned no hits, fallback recent entries were counted in `hitRows.length`, so five unrelated entries became `multi_entry_recurrence`. |
| Root cause | `recurrence_strength` was derived from combined match+fallback row count. |
| Correction | Split `matched_entries` vs `fallback_context_entries`. Strength uses `supported_match_count` only. Zero matches with fallback → `insufficient_match`. Interpretation: fallback is context only. |
| Regression | `penelope-kernel.test.js` Cases A–E. |
| Status | `deterministic only` |

#### Brisket — miss day taken from last logged day

| Step | Detail |
| --- | --- |
| Failure | `missDay` used the last `days_with_meals_this_week` date whenever weekly protein hits were under 7, so a later hit day could be labelled the miss day. |
| Root cause | Weekly aggregate substituted for per-day hit/miss classification. |
| Correction | Classify each week day via existing nutrition model targets (`hit` / `miss` / `insufficient_logging`). Only confirmed misses qualify. Most recent confirmed miss wins. Partial today is not an automatic miss. No miss → empty contributors. |
| Regression | `brisket-kernel.test.js` Cases A–F; second-retrieve test now requires `retrieveLog.length >= 2` and `anotherRound === false`. |
| Status | `deterministic only` |

#### Vera — compare summarisation dropped source id/path

| Step | Detail |
| --- | --- |
| Failure | `compareMindSessions` stripped sessions to date/title/themes/notes, dropping `id`/`path`, so `recent_session_date` provenance fell back to `unavailable_source`. |
| Root cause | Summarisation discarded event/record identity before claim composition. |
| Correction | Preserve `id` and `path` (event.path fallback) through summarise → analyse → claims. |
| Regression | `vera-kernel.test.js` Cases A–E. |
| Status | `deterministic only` |

### Brisket / Hyaluronica / Penelope / Vera — continuation expansion

| Specialist | Correction | Regression | Status |
| --- | --- | --- | --- |
| Brisket | `analyse_nutrition_evidence`; logging_status; no-log ≠ zero; today vs yesterday; targets/remaining/adherence/period compare provenance; interpretation boundaries | `tests/unit/brisket-kernel.test.js` | `deterministic only` |
| Hyaluronica | `analyse_skincare_evidence`; routine vs response events; historical vs current-turn irritation; temporal association ≠ causation | `tests/unit/hyaluronica-kernel.test.js` | `deterministic only` |
| Penelope | `analyse_diary_evidence`; focused diary query; recurrence_strength; current-turn vs historical mood; conflicting moods | `tests/unit/penelope-kernel.test.js` | `deterministic only` |
| Vera | `analyse_mind_evidence`; recurring/changed themes; sparse + conflict_signal; no diagnosis | `tests/unit/vera-kernel.test.js` | `deterministic only` |

Hammond remains **blocked** (architecture note only). Not rebuilt.

## Specialist inventory (current main + this branch)

| Slug | Display | Domain | Kernel workflow | Tools / retrieval | Write actions | Stores | Tests | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ann | Ann O'Tation | teaching | `lesson_diagnosis` | search/context/diagnosis + hydrate | Teaching AI / Confirm for mutations (no new write path) | Teaching blobs | `ann-kernel` | med | deterministic only |
| clementine | Prof. Clementine Haig | knowledge | `knowledge_research` | search + synthesis (+ teaching bridge) | Knowledge note writes stay Confirm/existing | knowledge-hub-data | `clementine-kernel` | med | deterministic only |
| sara | Dr Sara Tonin | health | `health_timeline` | body/weight/medical search + analyse | medical `log_entry` Confirm (unchanged) | life-hub-data body | `sara-kernel` | high | deterministic only |
| brisket | Brisket Lasso | nutrition | `nutrition_adherence` | snapshot/adherence/remaining/compare/analyse/search | meal log Confirm (existing) | nutrition | `brisket-kernel` | med | deterministic only |
| hyaluronica | Hyaluronica St. Claire | skincare | `routine_response` | adherence/response/analyse/search | existing | skincare | `hyaluronica-kernel` | low | deterministic only |
| penelope | Penelope Rose Quillian | diary | `diary_recurrence` | search/range/themes/compare/analyse | existing | mind/diary | `penelope-kernel` | med | deterministic only |
| vera | Dr Vera Lenz | mind | `mind_reflection` | search/compare/analyse sessions | existing | mind | `vera-kernel` | med | deterministic only |
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
- Teaching diagnosis against real schema; outcome_ids ≠ learning_intentions (`domain-analysis.mjs`)
- Knowledge synthesis conflicts / graph vs inference / themes; word-aware `conflict_signal`
- `rankKnowledgePages` preserves score
- Medical `analyse_medical_evidence` with recent_* (not current_*) visit language
- Nutrition / skincare / diary / mind analyse helpers + claim compose + interpretation lines
- Focused diary query (feel/felt/feeling expansion)
- Evidence claim compose for teaching / knowledge / medical / nutrition / skincare / diary / mind fields

## Clare / Chadwick regressions

Targeted suites re-run after defect fixes and specialist expansion. Must stay green before live specialist stress.

### Live results (2026-09-07)

#### LIVE MODEL / DEPLOYED ROUTE

- URL probed: `https://deploy-preview-247--life-hub2.netlify.app`
- `GET /` → 200
- `POST /api/chat` without session → `401 unauthenticated`
- **Blocked** in this environment: no Life Hub passphrase / session secret injected (only `ANTHROPIC_API_KEY`).
- Therefore specialists cannot be marked `passed` this tranche. Deterministic development continued.

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

Traces: `/tmp/life-hub-specialist-traces/` (copied under `/opt/cursor/artifacts/` when present).

## Production kernel

Still **off**. `docs/AGENT_CAPABILITY_STRATEGY.md` **unchanged**. Hammond **not** rebuilt (architecture note only). PR #247 remains draft / unmerged.

### Deterministic correction pass (continuation 2)

Local Cursor unit execution after Penelope / Brisket / Vera fixes: **245 pass / 0 fail** across Ann–Vera + Clare/Chadwick + evidence/provenance/kernel + Confirm/chat-job/compact-turn + fitness/workout confirm suites. Deployed specialist live gate still blocked without authenticated session.

### Independent review defects (continuation 3) — failure → root cause → correction → regression → status

#### Defect 1 — searchMindRecords advertised AND but accepted partial token matches

| Step | Detail |
| --- | --- |
| Failure | Schema said query words are ANDed, but implementation kept any record with `score > 0`, so one token (e.g. `feeling`) could count as a supported hit for a multi-token query (`feeling tired`). Penelope could then promote three partial hits into `multi_entry_recurrence`. |
| Root cause | OR / partial filtering (`score > 0`) instead of full focused-token coverage. |
| Correction | Focus natural-language queries to meaningful tokens (strip filler; collapse feel-stem variants), then require all focused tokens for `results` (`match_kind: full`). Expose bounded `partial_results` as context only. Penelope `supported_match_count` / recurrence strength use full matches only; partials and fallback remain context. Vera natural session queries still retrieve after focusing (e.g. work stress). |
| Regression | `mind-session-read.test.js` Cases A–E + AND partials; `penelope-kernel.test.js` Cases F–G; `vera-kernel.test.js` natural work-stress search. |
| Status | `deterministic only` |

#### Defect 2 — nutrition adherence denominator + historical “confirmed miss”

| Step | Detail |
| --- | --- |
| Failure | `getNutritionAdherence` divided protein hits by all window days (unlogged days as failures), contradicting “unlogged ≠ zero”. Historical days with any logged meals below target were labelled `confirmed_miss` without a completeness signal. |
| Root cause | Window-day denominator plus lack of historical day-completeness semantics. |
| Correction | Separate `observed_protein_hit_rate_pct` (hits / logged days; null when none logged) from `logging_coverage_pct`. Redefine `protein_hit_rate_pct` as the observed logged-day rate. Rename miss fields to `observed_below_target_days` / `below_target_day` / `top_meals_on_below_target_day` — observed logged protein below target, not a proven complete-day miss. Period compare surfaces coverage limitations. Interpretation: “Among logged days…” when coverage is incomplete. |
| Regression | `brisket-kernel.test.js` Adherence Cases A–E; historical breakfast below-target status; updated Cases A–F field names. |
| Status | `deterministic only` |

Hammond remains **blocked**. Production kernel remains **off**. `docs/AGENT_CAPABILITY_STRATEGY.md` **unchanged**.

### Deterministic correction pass (continuation 3)

Local Cursor unit execution after search AND + nutrition adherence/observed-below-target fixes: **342 pass / 0 fail** across Ann–Vera + mind-session-read + Clare/Chadwick + evidence/provenance/kernel + Confirm/chat-job/compact-turn + fitness/workout confirm + context-delivery suites. Deployed specialist live gate still blocked without authenticated session.
