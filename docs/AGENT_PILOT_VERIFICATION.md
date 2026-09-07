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
