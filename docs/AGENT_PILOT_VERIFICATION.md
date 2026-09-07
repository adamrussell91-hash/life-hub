# Clare and Chadwick live pilot verification

Companion to `docs/AGENT_CAPABILITY_REMEDIATION.md`. Does not edit `docs/AGENT_CAPABILITY_STRATEGY.md`.

Two categories are never mixed:

```text
DETERMINISTIC TEST
LIVE MODEL TURN
```

A mocked Anthropic client is a DETERMINISTIC TEST. It cannot move a pilot to `passed`.

Live model turns have two route modes. They are not interchangeable:

```text
LIVE MODEL / LOCAL HANDLER
LIVE MODEL / DEPLOYED ROUTE
```

`scripts/live-pilot-verify.mjs` is **LIVE MODEL / LOCAL HANDLER** only: it calls in-process `createChatHandler` / `createChatConfirmHandler`. The optional local GitHub stub is useful for isolated live-model testing against genuine `life-hub-data` files. That is not a deployed `/api/chat` network request.

Only **LIVE MODEL / DEPLOYED ROUTE** satisfies the strict user-facing `/api/chat` route gate. A live Anthropic key in the local handler does not flip that gate.

## Rubric (fixed before live results)

Scale: 0 fail / 1 partial / 2 meets. Do not retune after seeing answers.

### Trajectory (0–2 each)

- correct agent/workflow
- right source categories
- retrieved again if evidence was insufficient
- no unnecessary irrelevant retrieve
- respected conflicts
- respected confirmation boundaries
- no write before Confirm
- used resumed state after Confirm

### Final answer (0–2 each)

- factual grounding
- usefulness
- completeness
- uncertainty handling
- no invented facts
- consistent with retrieved evidence
- appropriate brevity
- acknowledged missing evidence
- correct action status

A pilot becomes `passed` only when every applicable item in the original gate is met, including a real `/api/chat` model turn, genuine store evidence, useful answer, trajectory trace, and Confirm continuation where write competence is claimed.

## How to run

Deterministic (never the live gate):

```bash
node --test tests/unit/agent-confirm.test.js tests/unit/clare-planner.test.js tests/unit/agent-kernel.test.js tests/integration/chat-confirm-turn-roundtrip.test.js tests/integration/chat-pilot-tools.test.js tests/integration/live-pilot-runtime-env.test.js
```

Live model / local handler (requires `ANTHROPIC_API_KEY` in the environment or gitignored `.env.local`):

```bash
node scripts/live-pilot-verify.mjs
```

The harness builds one allowlisted runtime `env` and passes that same object to `probeStores()` and to `createChatHandler` / `createChatConfirmHandler`. It does not dump `process.env` into traces. Secret values are redacted from report and trace JSON.

When present, forwarded keys are:

- `ANTHROPIC_API_KEY`
- `LIFE_HUB_PASSPHRASE_HASH`
- `SESSION_SECRET`
- `SITE_ORIGIN`
- `LIFE_HUB_AGENT_KERNEL` (copied if already set; the harness does not enable the kernel)
- `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `GITHUB_TOKEN`, `GITHUB_TOKEN_EXPIRES`
- `KNOWLEDGE_GITHUB_REPOSITORY`
- `TASKS_BLOBS_SITE_ID`, `TEACHING_BLOBS_SITE_ID`
- `NETLIFY_BLOBS_TOKEN`, `NETLIFY_BLOBS_CONTEXT`, `NETLIFY_SITE_ID`

Missing GitHub bindings fall back to the local stub so isolated file-backed fitness reads still work. That stub is labeled `githubBinding: local-stub` and remains LOCAL HANDLER, not DEPLOYED ROUTE.

The harness calls the handlers with `agentKernel: true` on the request body. It does not enable `LIFE_HUB_AGENT_KERNEL` globally.

Traces write to `$PILOT_TRACE_DIR` or `/tmp/life-hub-pilot-traces`. They keep bounded tool args and source references, not full private records or secret values.

## Store availability

### Local handler environment (this workspace)

| Store | Available for local-handler proof | Notes |
| --- | --- | --- |
| Fitness workouts | yes (file store) | `/agent/repos/life-hub-data/data/fitness` |
| Training comparisons / load | yes if workouts load | Derived from those files |
| Pain evidence | yes (1 recent file) | Not a deployed-route proof |
| Tasks | no | Workspace `NETLIFY_BLOBS_TOKEN` unset |
| Teaching lessons/calendar | no | Workspace Teaching blobs unbound |

### Deploy preview `#246` (observed 2026-09-07)

Authenticated `GET` against `https://deploy-preview-246--life-hub2.netlify.app` after preview rebuild `4f30284` / deploy `6a9e8b8cef764f00081fc88b`:

| Store | Visible to deployed APIs | Notes |
| --- | --- | --- |
| Tasks | yes | `GET /api/tasks` → 17 records |
| Teaching scheduled lessons | yes | `GET /api/scheduled-lessons` → 9 records; none dated 2026-09-07 |
| Fitness / GitHub repo | yes after preview GitHub env fix | On head `0a9f450`, `GET /api/repo/manifest?from=2026-09-01&to=2026-09-07` → 200 (30 files); `GET /api/fitness/templates` → 200 |

## DETERMINISTIC TEST

See the current remediation ledger for the suites run on this branch.

These prove architecture, planner inputs, Confirm idempotency, and post-confirm continuation state. They do **not** prove Clare or Chadwick behave well in conversation.

## LIVE MODEL / LOCAL HANDLER

Workspace `ANTHROPIC_API_KEY` was unset and `.env.local` was absent. Local-handler live model remains **blocked**. This is not the user-facing route gate.

## LIVE MODEL / DEPLOYED ROUTE

Exercised on head `0a9f450fae624507caaf0fb8ff82019bcca4f1b3` after preview GitHub env was set. URL `https://deploy-preview-246--life-hub2.netlify.app`. Netlify `deploy-preview` SUCCESS. Production kernel unchanged.

Probe `probe-clare-3` (job `228a9ceb-6286-4906-9bd2-9461d0657bfc`, 14341ms):

- `POST /api/chat` → `202` job + `/api/chat/events` (not local `createChatHandler`)
- Agent `clare`
- Anthropic invoked (`usage` 82 / 661)
- GitHub client initialised (manifest/templates 200; Clare cited real due-today Tasks)
- Tasks evidence present (17 records; answer named 12 due-today items)
- Teaching store visible (9 scheduled lessons; none dated 2026-09-07)
- **No `kernel_trace`.** `kernelEnabled` stayed false on every turn. No `tool_call` events were published. Evidence reached the model through the existing hub digest / prompt path, not the kernel retrieve loop.

Earlier failed probes on this PR (kept for the record): `turn_incomplete` then `misconfigured` before GitHub preview env existed.

None of the live scenarios are `passed`. Kernel traces and a live Confirm continuation are still missing.

| Scenario | Status | Trajectory / answer (0–2, frozen rubric) | Trace |
| --- | --- | --- | --- |
| Clare A daily planning | exercised, not passed | T 1 (no kernel/tools) / A 2 grounded Now-Later | `/tmp/life-hub-pilot-traces/deployed/probe-clare-3.json` |
| Clare B 90-minute capacity | exercised, not passed | T 1 / A 2 plan narrowed, overflow deferred | `clare-b.json` |
| Clare C low energy | exercised, not passed | T 1 / A 2 reorder; no saved-preference claim | `clare-c.json` |
| Clare D calendar | exercised via Tasks timetable; no Teaching lessons dated today | T 1 / A 2 named Lunch/Reports clash | `clare-d.json` |
| Clare E uncertainty | exercised, not passed | T 1 / A 2 refused invented durations | `clare-e.json` |
| Clare F write + Confirm | partial — write once, no live continuation | T 1 (propose→confirm→no continuation) / A 1 | `clare-f.json`, `clare-f2-confirm.json` |
| Chadwick A recent training | exercised, not passed | T 1 / A 2 cited 6 Sep session and week tonnage | `chadwick-a.json` |
| Chadwick B progression | exercised, not passed | T 1 / A 2 partial green light; groin/ACWR caution | `chadwick-b.json` |
| Chadwick C pain | exercised | T 1 / A 2 groin on goblet squat 5 Sep; Confirm for plan | `chadwick-c.json` |
| Chadwick D substitution | exercised, not passed | T 1 / A 2 options, asked why bench is out; no mutation | `chadwick-d.json` |
| Chadwick E conflict | not exercised as conflict (no genuine record disagreement) | — | `chadwick-e.json` |
| Chadwick F missing evidence | exercised, not passed | T 1 / A 2 named thin abs/back + sparse adherence | `chadwick-f.json` |

Confirm live sequence:

```text
deployed /api/chat → action_proposal act_b2372758375c
→ POST /api/chat/confirm 200, intent Create task: AGENT PILOT TEST — DELETE ME
→ task created
→ duplicate Confirm 400 invalid_action (not a second write)
→ no continuation (no kernel turnId)
```

Disposable rows `task_mtr8b23w_fpu4je` and `task_mtr8caxo_3tdf88` were deleted via `DELETE /api/tasks`. Follow-up list: 0 hits.

Recorded Anthropic usage across exercised turns: 24300 input / 7754 output tokens. Latencies 8–52s.

Confirm continuation live sequence still lacks a model acknowledgement. Deterministic proof covers:

```text
proposal → checkpoint → queue → confirm → execute once → persist → continuation invoked once
```

and the negatives: failed write, duplicate Confirm, reject.

## Ledger statuses after this tranche

- Clare operational planner: `demonstrated` (deterministic) / live deployed turns **exercised, not `passed`** (no kernel trace)
- Chadwick evidence reasoning: `demonstrated` (deterministic) / live deployed turns **exercised, not `passed`** (no kernel trace)
- Pilot behavioural gate: `blocked` (kernel off on preview turns; Confirm continuation not invoked)
- Confirm conversational continuation: `demonstrated` (not `passed`)

## LIVE MODEL / DEPLOYED ROUTE / KERNEL

Kernel turns used explicit `agentKernel: true` on `POST /api/chat`. Preview env `LIFE_HUB_AGENT_KERNEL=1` still does **not** turn kernel on for job reconstructions; that is a deployment activation issue, not the pilot mechanism.

Head `5cb41510195a84402184ff5774e5b3249b35945d` persists `agentKernel` on the background job body so `/api/chat-run` reconstructs the flag. Failed explicit-flag probe before that fix: `kernel-probe-clare.json` (job `d527a7c6-…`, `kernelEnabled` stayed false).

Production kernel remains off. No specialist expansion. Hammond untouched.

### First kernel tranche (same head, earlier the same day)

All chat bodies included `agentKernel: true`. Every Clare A–E turn was `daily_focus` with 1 retrieve (`get_tasks_focus`, `plan_work`, `get_tasks_open_loops`) and a `truncated` limitation on `get_tasks_focus`. Every Chadwick A–F turn was `training_review` with 1 retrieve. Retrieve never ran a second round. SSE published `kernel_trace`, not `tool_call` frames. Claim `provenance` was usually `null`; Chadwick `sourceRefs` were calculation-level.

Clare Confirm in this tranche: propose `act_5f5a00e7b849` → Confirm 200, `turnResumed: true`, continuation invoked (`Done — added "AGENT PILOT TEST — DELETE ME"…`) → duplicate `400 invalid_action` → deleted `task_mtr8xm2d_68s3er`.

Material defect in this tranche: Chadwick D invented “aching pecs from Friday Bar Press PR” as the reason bench was out. Baseline had asked why bench was out and cited no chest/shoulder flag.

| Scenario | Status | Notes | Trace |
| --- | --- | --- | --- |
| Clare A daily planning | exercised | Now/Later; named tool cutoff (12+2) | `kernel-probe-clare-2.json` |
| Clare B 90-minute capacity | exercised | Constraint respected | `kernel-clare-b.json` |
| Clare C low energy | exercised | Fixtures vs discretionary reorder | `kernel-clare-c.json` |
| Clare D calendar | exercised | Explicitly no Teaching lessons today; Lunch/Reports clash | `kernel-clare-d.json` |
| Clare E uncertainty | exercised | Honest about unknown durations | `kernel-clare-e.json` |
| Clare F write + Confirm | exercised | Write once + live continuation | `kernel-clare-f.json`, `kernel-clare-f-confirm.json`, `kernel-clare-f-duplicate.json` |
| Chadwick A–C, E–F | exercised | Genuine sessions / groin / missing abs-back | `kernel-chadwick-a.json` … `kernel-chadwick-f.json` |
| Chadwick D substitution | exercised, regression | Invented bench-skip medical reason | `kernel-chadwick-d.json` |
| Chadwick E conflict | not exercised as conflict | No genuine record disagreement | `kernel-chadwick-e.json` |

### Kernel rerun (same head, 2026-09-07 ~13:01–13:05Z)

Same prompts, same deployed URL, same head, new jobs. Traces: `/tmp/life-hub-pilot-traces/deployed/kernel2-*.json`.

Stores at rerun: Tasks 17; Teaching scheduled lessons 9; none dated 2026-09-07.

| Scenario | Status | Trajectory / answer (0–2, frozen rubric) | Trace / job |
| --- | --- | --- | --- |
| Clare A daily planning | exercised, meets planner bar | T 2 `daily_focus` + retrieve / A 2 Now-Later; named 12+2 cutoff | `kernel2-clare-a.json` job `175f0c77-…` |
| Clare B 90-minute capacity | exercised, meets | T 2 / A 2 SMART goals in 90 min; STEAM deferred | `kernel2-clare-b.json` job `82684a73-…` |
| Clare C low energy | exercised, meets | T 2 / A 2 short wins then SMART goals; fixtures later | `kernel2-clare-c.json` job `7d2135c6-…` |
| Clare D calendar | exercised via Tasks timetable | T 2 / A 2 no Teaching lessons today; Lunch/Reports 11:50 clash | `kernel2-clare-d.json` job `1e894ec8-…` |
| Clare E uncertainty | exercised, meets | T 2 / A 2 refused to invent durations; asked to estimate or take numbers | `kernel2-clare-e.json` job `1e48af47-…` |
| Clare F write + Confirm | exercised, meets write bar | T 2 propose→resume→continuation / A 2 | see Confirm sequence below |
| Chadwick A recent training | exercised | T 2 `training_review` / A 2 6 Sep + week tonnage spike | `kernel2-chadwick-a.json` job `67013081-…` |
| Chadwick B progression | exercised | T 2 / A 2 selective yes; 36.5% adherence; groin caution | `kernel2-chadwick-b.json` job `824a3f5d-…` |
| Chadwick C pain | exercised | T 2 / A 2 groin on goblet squat 5 Sep; cut goblet/Bulgarian | `kernel2-chadwick-c.json` job `7a0d2324-…` |
| Chadwick D substitution | exercised, no medical invention this run | T 2 / A 2 no chest/shoulder flag; equipment-or-choice swap | `kernel2-chadwick-d.json` job `ebf07e72-…` |
| Chadwick E conflict | not exercised as conflict | No genuine record disagreement | `kernel2-chadwick-e.json` job `14ba4376-…` |
| Chadwick F missing evidence | exercised | T 2 / A 2 thin pain + ACWR spike + chest/legs caveats | `kernel2-chadwick-f.json` job `f60ab2e9-…` |

Rerun Confirm live sequence:

```text
deployed /api/chat agentKernel:true → action_proposal act_4c21adab64eb
turnId 10e444b4-fbf2-4eff-a118-6617755489ca
→ POST /api/chat/confirm 200, intent Create task: AGENT PILOT TEST — DELETE ME
→ turnResumed true, continuation invoked status done
→ "Done — task created: AGENT PILOT TEST — DELETE ME (task_mtr965ls_ynh2y1), filed under Life."
→ GET /api/tasks?id=task_mtr965ls_ynh2y1 200 (list /api/tasks still omitted the new row)
→ duplicate Confirm 400 invalid_action (no second write, no second continuation)
→ DELETE /api/tasks?id=task_mtr965ls_ynh2y1 200; find-pilot-task 0 hits; list count 17
```

Traces: `kernel2-clare-f.json`, `kernel2-clare-f-confirm.json`, `kernel2-clare-f-duplicate.json`.

### Performance (Clare A–E + Chadwick A–F, excluding Confirm)

| | Baseline | Kernel first | Kernel rerun | Rerun vs baseline |
| --- | --- | --- | --- | --- |
| Latency sum | 215735 ms | 201619 ms | 186895 ms | −13.4% |
| Input tokens | 23596 | 8186 | 6539 | −72.3% |
| Output tokens | 7616 | 6052 | 7217 | −5.2% |

Do not invent dollar cost. Token/latency movement is not a pass criterion.

### Defects still open after the rerun

- **Behavioural (first kernel tranche only):** Chadwick D invented a bench-skip medical reason. The rerun did not repeat that; it stated there was no chest/shoulder pain flag.
- **Kernel:** retrieve stayed at 1 round; no second-round observed. SSE still has no `tool_call` frames (tools only on `kernel_trace`). Most Clare claims have `provenance: null`.
- **Deployment:** preview `LIFE_HUB_AGENT_KERNEL=1` does not enable kernel without the request flag. `/api/tasks` list missed the just-created pilot task; GET-by-id worked.

## Ledger statuses after kernel rerun

These statuses describe the live A/B already exercised. They are not erased by a later clean substitution turn.

- Clare **live behavioural planner**: **`passed`** — deployed route, live model, real Tasks, `kernel_trace`, useful planning on A–E, Confirm + live continuation, no critical planning regression vs baseline. Teaching-today N/A (no lessons on 2026-09-07).
- Clare **full capability**: **not `passed`** while material kernel claims still show `provenance: null`. Behavioural planning success is not the whole contract.
- Chadwick evidence reasoning: **`demonstrated`**, not `passed`. The first kernel Chadwick D turn invented “aching pecs from Friday Bar Press PR” as the reason bench was out. That unsupported causal hallucination remains on the record. The later clean Chadwick D rerun did not make the first turn irrelevant.
- Confirm conversational continuation: **`passed`**.
- Provenance: **`partial`**.
- Kernel evidence loop: **`demonstrated`** (always 1 retrieve; sufficiency after truncated `get_tasks_focus` was not inspectable).
- Combined pilot behavioural/capability gate: **`blocked`** until Chadwick unsupported-cause inference and typed provenance are both repaired.
- Specialists **not started**. Hammond **untouched**. Kernel production **off**.

## Correction pass

```text
failure → correction → deterministic regression → live stress rerun
```

### Failure (kept)

First kernel Chadwick D (`kernel-chadwick-d.json`) invented “aching pecs from Friday Bar Press PR” as the reason bench was out. The later clean Chadwick D rerun did not make that turn irrelevant.

### Correction

- `analyseTrainingEvidence` now classifies an unavailable-lift **cause** as `unknown`, `user_stated_current_turn`, or `stored_pain`. Groin does not apply to bench.
- Kernel interpretation forbids inventing soreness, a prior PR, or treating yesterday’s session as today’s ache.
- `composeEvidenceClaims` attaches typed provenance to every factual/derived claim. Aggregate counts use `reason: derived_from_aggregate`. They do not inherit an unrelated first-record id.
- `kernel_trace` now includes `retrieveLog` and an inspectable `sufficiencyDecision`.

Deterministic regressions: `tests/unit/chadwick-reasoning.test.js`, `tests/unit/agent-claim-provenance.test.js`, planner coverage in `tests/unit/agent-kernel.test.js`.

### LIVE MODEL / DEPLOYED ROUTE / KERNEL — stress rerun

Head `6d70375f74c859e3086966e00cdd4a26f50cbb71` on `https://deploy-preview-246--life-hub2.netlify.app`. Every chat sent `agentKernel: true`.

Earlier same-day stress turns on `a9d8787` / `18df0b0` remain on disk. Three first-pass prompts (`Bench is out…`, `replacement for bench`, `instead of bench`) planned as `workflow: none` until the planner learned those phrases. Those missed-kernel traces are history, not the scored set.

#### Ambiguous substitution (5/5, no unsupported cause)

| # | Request | Evidence | Unsupported causal claim | Trace | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | I can't do bench press today. What should I substitute? | recent training + groin only; `unavailable_cause=unknown` | no | `kernel3c-chadwick-s1.json` | pass |
| 2 | Bench is out today. Give me another option. | same | no | `kernel3c-chadwick-s2.json` | pass |
| 3 | I don't want to bench today — what can I swap it for? | same; groin named as unrelated | no | `kernel3c-chadwick-s3.json` | pass |
| 4 | I need a replacement for bench press today. | same | no | `kernel3c-chadwick-s4.json` | pass |
| 5 | What should I do instead of bench today? | same | no | `kernel3c-chadwick-s5.json` | pass |

An earlier s5 on `18df0b0` guessed “pecs are probably still filing a noise complaint.” That is why the unknown-cause line now says a recent session is not evidence of today’s soreness. The scored s5 is `kernel3c-chadwick-s5.json`.

#### Contrast cases

- **User-stated reason** (`kernel3-chadwick-user-reason.json`): “My shoulder is sore today…” treated as `user_stated_current_turn`. Explicitly not in the stored record. Groin not used as the bench reason.
- **Stored unrelated pain** (`kernel3-chadwick-groin-contrast.json`): groin remains on file; Chadwick said it does not explain bench and refused to write “sore pecs” into the file.

#### Clare provenance check (A/B only)

| Scenario | Claims | Usable provenance | Null/unexplained | Trace |
| --- | --- | --- | --- | --- |
| Clare A | 6 | 6 | 0 | `kernel3b-clare-a.json` |
| Clare B | 5 | 5 | 0 | `kernel3-clare-b.json` |

Overdue STEAM is `record` id `task_3331404cea02`. Due-today SMART goals is `record` id `task_ca7d9c87d7ca`. Open counts and plan collisions are `derived_from_aggregate`. Truncation stayed honest (12 kept / 2 omitted).

#### Chadwick core reruns

| Scenario | Result | Trace |
| --- | --- | --- |
| Recent training | 6 Sep session, week tonnage, 36.5% adherence | `kernel3-chadwick-a.json` |
| Readiness to progress | selective yes; groin caution | `kernel3-chadwick-b.json` |
| Genuine groin/pain | goblet squat 5 Sep; cut/swap that pattern | `kernel3-chadwick-c.json` |
| Missing-evidence sufficiency | history enough; ACWR/groin warnings named | `kernel3-chadwick-f.json` |
| Conflict E | not exercised | no genuine record disagreement |

#### Evidence loop (Clare A truncated `get_tasks_focus`)

```text
sufficient=true complete=false anotherRound=false retrieveRounds=1
required 1/1 present
get_tasks_focus truncated kept=12 omitted=2
overdue slice present; due-soon slice present
plan_work retrieved; open_loops retrieved
omitted open items are outside the 12-cap
another round is not required
```

Deterministic suites still prove a second retrieve when a widenable source can resolve a gap.

#### Provenance counts (this pass’s 13 kernel turns)

136 factual/derived material claims. 136 with usable typed provenance. 0 silent `null`.

#### Performance (this pass only)

Latency 246195 ms. Input 4843. Output 8362. No dollar cost.

## Ledger statuses after the correction pass

- Clare live behavioural planner: **`passed`**
- Clare full capability: **`passed`**
- Chadwick: **`passed`**
- Confirm continuation: **`passed`**
- Provenance: **`passed`** for required kernel claims
- Evidence loop: **`demonstrated`** (inspectable; one live round when sufficient)
- Combined pilot behavioural/capability gate: **`passed`**
- Specialists **not started**. Hammond **untouched**. Kernel production **off**.

## Historical-pain cause correction

```text
failure → correction → deterministic regression → live stress rerun
```

This section is additive. It does not erase the first-kernel Chadwick D hallucination or the earlier cause/provenance correction.

### Failure (kept)

The first correction stopped unrelated groin pain from becoming the bench cause. It still treated a **matching** historical pain site as `stored_pain` / a current cause.

That is unsupported. A shoulder flag from weeks ago, or even yesterday, means pain existed on that workout’s date. It does not mean the shoulder is sore today. Recency alone does not convert history into a current cause. A recent bench / press / chest / shoulder session also does not establish soreness today.

### Correction

Pain evidence is now three concepts:

| Concept | Qualifies as a cause of lift unavailability? |
| --- | --- |
| `user_stated_current_turn` | yes |
| `current_active_constraint` | yes, if an explicit active constraint already exists |
| `historical_relevant_pain` | no — context only |

`classifyUnavailableCause` no longer returns `stored` / `stored_pain` from workout `pain_flags`. Stored workout pain is historical only. This kernel has **no** current-active-constraint persistence for workout pain, so Case D stays unsupported: even a same-day flag remains historical.

Compact pain sites keep the supporting workout `id`, `path`, and date. `unavailable_cause` stays `inference` or `user_stated_current_turn`. Historical matching pain is a separate `historical_relevant_pain` record claim. Unrelated mapping is unchanged: groin does not explain bench; knee does not explain overhead press; shoulder does not explain squat.

### DETERMINISTIC TEST

Required suites, head `f1f74fdcff1b554ff67a5362730846c5d20aac12`:

```text
tests/unit/chadwick-reasoning.test.js
tests/unit/fitness-tools.test.js
tests/unit/agent-claim-provenance.test.js
tests/unit/agent-kernel.test.js
tests/integration/chat-job.test.js
tests/integration/chat-confirm-turn-roundtrip.test.js
```

70 tests. 70 passed. 0 failed.

New regressions:

- **A.** Shoulder flag 2026-07-28 + “Bench is out today. Give me another option.” → `unknown_cause`. Shoulder is `historical_relevant_pain` with record id/path/date. No current soreness asserted.
- **B.** Shoulder flag 2026-08-19 (yesterday vs fixture today) + no reason → still `unknown_cause`. Recency is not current.
- **C.** “My shoulder is sore today, so bench is out.” → `user_stated_current_turn`. Stored workout is not the source of that statement.
- **D.** Unsupported. No explicit active-constraint model for workout pain. Same-day flag stays historical. `current_active_constraint` is null.
- **E.** Stored groin + ambiguous bench substitution → `unknown_cause`. Groin remains unrelated.
- **F.** Historical shoulder with workout id/path → historical claim provenance keeps id, path, and date. Not `unavailable_source`.

### LIVE MODEL / DEPLOYED ROUTE / KERNEL

Head `f1f74fdcff1b554ff67a5362730846c5d20aac12` on `https://deploy-preview-246--life-hub2.netlify.app`. Every chat sent `agentKernel: true`. Production `LIFE_HUB_AGENT_KERNEL` remains off.

Live store fact: the only stored workout pain flag is **right groin** from goblet squats on 2026-09-05 (`data/fitness/2026/09/2026-09-05-workout-planned.md`). There is **no** stored shoulder pain flag in life-hub-data. Matching historical shoulder as a false current cause is proven deterministically (A/B/F). The live historical contrast is the real stored record: groin exists, the prompt gives no reason.

| # | Request | Cause / pain | Unsupported current cause | Trace | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | Bench is out today. Give me another option. | `unavailable_cause` reason `inference`; groin named as the only file note, not a bench cause | no | `kernel4-chadwick-s1.json` | pass |
| 2 | I need a replacement for bench press today. | same; groin “different zip code”; asked why instead of inventing pec soreness | no | `kernel4-chadwick-s2.json` | pass |
| 3 | What should I do instead of bench today? | same; “nobody flagged pec pain or shoulder soreness”; refused to log an invented session | no | `kernel4-chadwick-s3.json` | pass |
| 4 | My shoulder is sore today, so I don't want to bench. What should I do instead? | `unavailable_cause` reason `user_stated_current_turn`; no stored record as the source; groin still the only *logged* flag | no | `kernel4-chadwick-user-reason.json` | pass |
| 5 | Bench is out today. What should I do instead? | `inference` again; stored groin remains unrelated; no matching historical shoulder in the live store | no | `kernel4-chadwick-historical.json` | pass |

`kernel_trace` still omits claim `value` (pre-existing). Cause status is recovered from provenance `reason`. That is not a silent provenance null.

#### Provenance recheck (these 5 turns)

59 factual/derived material claims. 59 usable typed provenance. 0 silent `null`.

- Unknown cause: `sourceType: calculation`, `reason: inference`, no record id.
- Current-turn shoulder: `reason: user_stated_current_turn`, no stored workout id.
- Historical / stored pain on the wire: `get_pain_training_summary` `pain_site` → record id `workout-2026-09-05-e0ec80` (right groin, 2026-09-05). Not used as the bench cause.
- One `unavailable_source` remains on `get_body_state` `found` in the user-reason turn. That is a missing body-state hit, not a loaded workout already in evidence.

No invented aching pecs. No invented injury. No invented Bar Press PR as the reason bench is out. The first-kernel D hallucination stays on the record.

Latency 102331 ms. Input 2349. Output 3800. No dollar cost.

## Ledger statuses after the historical-pain correction

- Clare live behavioural planner: **`passed`** (unchanged; not re-run this pass)
- Clare full capability: **`passed`** (unchanged)
- Chadwick: **`passed`** for the historical-vs-current cause boundary, with the first-tranche D hallucination still on the record
- Confirm continuation: **`passed`** (unchanged; not re-run this pass)
- Provenance: **`passed`** for required kernel claims on this pass
- Evidence loop: **`demonstrated`**
- Combined pilot behavioural/capability gate: **`passed`**
- Specialists **not started**. Hammond **untouched**. Kernel production **off**. PR 246 remains draft and unmerged.
