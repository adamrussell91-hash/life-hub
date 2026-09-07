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

## Store availability (this environment)

Inspected from the execution environment used for this PR:

| Store | Available for live proof | Notes |
| --- | --- | --- |
| Fitness workouts | yes (file store) | `/agent/repos/life-hub-data/data/fitness` |
| Training comparisons / load | yes if workouts load | Derived from those files |
| Pain evidence | yes (1 recent file) | Live scenario still blocked without a model key |
| Body evidence | files exist | Used only when the Chadwick path loads them |
| Tasks | no | Netlify Tasks blobs unbound (`NETLIFY_BLOBS_TOKEN` unset) |
| Projects | no | Same Tasks blob store |
| Teaching lessons/calendar | no | Teaching blobs unbound |

Unavailable stores are `not exercised`. Fixtures are not substituted for the real-store live gate.

## DETERMINISTIC TEST

See the current remediation ledger for the suites run on this branch.

These prove architecture, planner inputs, Confirm idempotency, and post-confirm continuation state. They do **not** prove Clare or Chadwick behave well in conversation.

## LIVE MODEL TURN

Mode for this environment: **LIVE MODEL / LOCAL HANDLER**. Deployed-route gate: **blocked**.

`ANTHROPIC_API_KEY` was unset in the environment and `.env.local` was absent.

| Scenario | Status | Trace |
| --- | --- | --- |
| Clare A daily planning | blocked | none |
| Clare B constrained capacity | blocked | none |
| Clare C energy-aware | blocked | none |
| Clare D calendar collision | not exercised (no Teaching store) + blocked | none |
| Clare E missing duration | blocked | none |
| Clare F write + Confirm continuation | blocked | none — deterministic continuation only |
| Chadwick A recent training | blocked | none |
| Chadwick B progression | blocked | none |
| Chadwick C pain-aware | blocked (pain file exists; no model key) | none |
| Chadwick D substitution | blocked | none |
| Chadwick E conflicting evidence | not exercised as live + blocked | none |
| Chadwick F missing evidence | blocked | none |

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
