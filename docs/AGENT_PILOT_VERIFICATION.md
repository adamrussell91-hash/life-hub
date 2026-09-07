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
| Fitness / GitHub repo | no | `GET /api/repo/manifest?from=2026-09-01&to=2026-09-07` and `GET /api/fitness/templates` → `503 misconfigured` |

The deploy-preview context is missing GitHub repository configuration (`GITHUB_REPOSITORY` / `GITHUB_BRANCH` / `GITHUB_TOKEN` / `GITHUB_TOKEN_EXPIRES`). `createChatHandler` requires that client before it opens the model stream, so Clare and Chadwick cannot be graded on this preview until those keys exist in **Deploy Preview** (not Production).

## DETERMINISTIC TEST

See the current remediation ledger for the suites run on this branch.

These prove architecture, planner inputs, Confirm idempotency, and post-confirm continuation state. They do **not** prove Clare or Chadwick behave well in conversation.

## LIVE MODEL / LOCAL HANDLER

Workspace `ANTHROPIC_API_KEY` was unset and `.env.local` was absent. Local-handler live model remains **blocked**. This is not the user-facing route gate.

## LIVE MODEL / DEPLOYED ROUTE

Fresh preview after preview-only `LIFE_HUB_AGENT_KERNEL=1`:

- PR **#246**, head `4f3028458118bb592b644b66114b039489a5a412`, deploy `6a9e8b8cef764f00081fc88b`, URL `https://deploy-preview-246--life-hub2.netlify.app`, Netlify SUCCESS 2026-09-07T10:02:12Z
- `POST /api/auth` succeeded. `GET /api/session` → authenticated
- `POST /api/chat` reached the deployed function (`202` job). Transport was the real job + `/api/chat/events` poll, not a local `createChatHandler()` call
- Job finished with a single `error` and **no** `agent`, tools, usage, or final answer. The model was **not** invoked
- Cause: deploy-preview GitHub bindings are missing, so the handler returns `503 misconfigured` JSON
- On `4f30284` the job runner hid that as `turn_incomplete`. After `6d8f2b7` / deploy `6a9e8d049b9c6f0008b298d7` (SUCCESS 2026-09-07T10:08:36Z), the same probe reports `misconfigured` / `This service is not configured.`
- Kernel enablement on the chat turn could **not** be verified because the stream never started. Production kernel was not changed
- No Clare or Chadwick scenario was graded. None are `passed`

| Scenario | Status | Trace |
| --- | --- | --- |
| Probe (harmless Clare pin) | blocked — first job `turn_incomplete`; rerun on `6d8f2b7` job error `misconfigured`, 1604ms, no model | captured locally; no private records |
| Clare A–F | blocked (handler never reached the model) | none |
| Chadwick A–F | blocked (GitHub/fitness unbound on preview) | none |
| Confirm live continuation | blocked | none |

Adam action required: copy the existing Production GitHub repo settings into the **Deploy Preview** context on `life-hub2` (`GITHUB_REPOSITORY`, `GITHUB_BRANCH`, `GITHUB_TOKEN`, `GITHUB_TOKEN_EXPIRES`). Do not enable `LIFE_HUB_AGENT_KERNEL` on Production.

Confirm continuation live sequence was **not** run. Deterministic proof covers:

```text
proposal → checkpoint → queue → confirm → execute once → persist → continuation invoked once
```

and the negatives: failed write, duplicate Confirm, reject.

## Ledger statuses after this tranche

- Clare operational planner: `demonstrated` (deterministic) / live gate `blocked`
- Chadwick evidence reasoning: `demonstrated` (deterministic) / live gate `blocked`
- Pilot behavioural gate: `blocked`
- Confirm conversational continuation: `demonstrated` (not `passed`)
