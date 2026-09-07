# Clare and Chadwick live pilot verification

Companion to `docs/AGENT_CAPABILITY_REMEDIATION.md`. Does not edit `docs/AGENT_CAPABILITY_STRATEGY.md`.

Two categories are never mixed:

```text
DETERMINISTIC TEST
LIVE MODEL TURN
```

A mocked Anthropic client is a DETERMINISTIC TEST. It cannot move a pilot to `passed`.

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
node --test tests/unit/agent-confirm.test.js tests/unit/clare-planner.test.js tests/unit/agent-kernel.test.js tests/integration/chat-confirm-turn-roundtrip.test.js tests/integration/chat-pilot-tools.test.js
```

Live model turns (requires `ANTHROPIC_API_KEY` in the environment or gitignored `.env.local`):

```bash
node scripts/live-pilot-verify.mjs
```

The harness calls `createChatHandler` / `createChatConfirmHandler` with `agentKernel: true`. It does not enable `LIFE_HUB_AGENT_KERNEL` globally.

Traces write to `$PILOT_TRACE_DIR` or `/tmp/life-hub-pilot-traces`. They keep bounded tool args and source references, not full private records.

## Store availability (this environment)

Inspected from the execution environment used for this PR:

| Store | Available for live proof | Notes |
| --- | --- | --- |
| Fitness workouts | yes (file store) | `/agent/repos/life-hub-data/data/fitness` |
| Training comparisons / load | yes if workouts load | Derived from those files |
| Pain evidence | no | Recent fitness files have empty `pain_flags` |
| Body evidence | files exist | Used only when the Chadwick path loads them |
| Tasks | no | Netlify Tasks blobs unbound (`NETLIFY_BLOBS_TOKEN` unset) |
| Projects | no | Same Tasks blob store |
| Teaching lessons/calendar | no | Teaching blobs unbound |

Unavailable stores are `not exercised`. Fixtures are not substituted for the real-store live gate.

## DETERMINISTIC TEST

See the current remediation ledger for the suites run on this branch.

These prove architecture, planner inputs, Confirm idempotency, and post-confirm continuation state. They do **not** prove Clare or Chadwick behave well in conversation.

## LIVE MODEL TURN

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
| Chadwick C pain-aware | not exercised (no real pain record) + blocked | none |
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
