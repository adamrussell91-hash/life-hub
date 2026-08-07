# Hammond Phased CN Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Hammond Central Node audits as multi-turn phased sessions (triage → intake → stale/drift → open loops → lock) so each `/api/chat` call stays short and intake answers shape later phases.

**Architecture:** Pure helpers own trigger detection, phase contracts, and advancement. Client holds `auditSession` and sends it on each Hammond turn; `chat.mjs` validates and injects a hard phase block into `buildSystemPrompt`. Protocol markdown documents the soft sequence. v1 writes CN lines in chat only (no Confirm CN patch).

**Tech Stack:** Netlify Functions, vanilla JS chat UI, `node:test`, existing SSE chat loop.

**Spec:** `docs/superpowers/specs/2026-08-07-hammond-phased-cn-audit-design.md`

**Deploy:** Local commits only until Adam asks to push.

---

## File map

| File | Responsibility |
|------|----------------|
| `netlify/functions/_shared/hammond-audit.mjs` | Trigger phrases, phase ids, validate session, phase contract text, next-phase helper |
| `js/app/hammond-audit.js` | Browser-safe re-export or thin mirror of trigger + advance rules used by chat controller (keep logic DRY: prefer importing shared module if bundling allows; otherwise duplicate the tiny pure helpers in `js/app/` matching shared tests) |
| `config/hammond-protocol.md` | Soft “Central Node audit (phased)” section |
| `netlify/functions/_shared/persona.mjs` | Accept optional `hammondAuditContract` string into Hammond blocks |
| `netlify/functions/chat.mjs` | Parse `auditSession`; when Hammond + valid session, build contract into system prompt; optional SSE `{ type: 'audit_phase', phase, nextPhase }` |
| `js/app/chat-api.js` | Pass `auditSession` in POST body |
| `js/app/chat-controller.js` | Start/advance/clear session; send session on chat; handle cancel / agent switch |
| `tests/unit/hammond-audit.test.js` | Pure helper coverage |
| `tests/unit/persona.test.js` | Contract appears for Hammond only |
| `tests/unit/chat-api.test.js` | Body includes auditSession when provided |
| `tests/unit/chat-controller.test.js` | Session start/advance/clear behaviours |
| `tests/integration/chat-function.test.js` | Handler injects contract when session valid |
| `tests/unit/load-hammond-protocol.test.js` | Protocol mentions phased audit |
| `service-worker.js` | Bump shell cache if client JS changes |

**Phase ids (canonical):** `triage` | `intake` | `stale_drift` | `open_loops` | `lock`

**Session shape (canonical):**
```js
{ kind: 'cn_audit', phase: 'triage', intakeCount: 0 }
```
(`agent: 'hammond'` may be stored client-side only; wire payload uses `kind` + `phase` + `intakeCount`.)

---

### Task 1: Pure Hammond audit helpers + failing tests

**Files:**
- Create: `netlify/functions/_shared/hammond-audit.mjs`
- Create: `tests/unit/hammond-audit.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/hammond-audit.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_PHASES,
  isHammondAuditTrigger,
  normalizeAuditSession,
  buildHammondAuditContract,
  nextAuditPhase
} from '../../netlify/functions/_shared/hammond-audit.mjs';

test('detects CN audit / weekly / monthly / goal audit phrases', () => {
  assert.equal(isHammondAuditTrigger('Hammond, run a Central Node audit'), true);
  assert.equal(isHammondAuditTrigger('weekly review please'), true);
  assert.equal(isHammondAuditTrigger('monthly audit'), true);
  assert.equal(isHammondAuditTrigger('time for a goal audit'), true);
  assert.equal(isHammondAuditTrigger('cn audit'), true);
  assert.equal(isHammondAuditTrigger('log lunch'), false);
  assert.equal(isHammondAuditTrigger('Hammond, what is the protein target?'), false);
});

test('normalizeAuditSession accepts only known cn_audit phases', () => {
  assert.deepEqual(
    normalizeAuditSession({ kind: 'cn_audit', phase: 'intake', intakeCount: 2 }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 2 }
  );
  assert.equal(normalizeAuditSession(null), null);
  assert.equal(normalizeAuditSession({ kind: 'cn_audit', phase: 'nope' }), null);
  assert.equal(normalizeAuditSession({ kind: 'other', phase: 'triage' }), null);
  assert.deepEqual(
    normalizeAuditSession({ kind: 'cn_audit', phase: 'triage', intakeCount: -1 }),
    { kind: 'cn_audit', phase: 'triage', intakeCount: 0 }
  );
  assert.deepEqual(
    normalizeAuditSession({ kind: 'cn_audit', phase: 'intake', intakeCount: 99 }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 3 }
  );
});

test('buildHammondAuditContract names the active phase and forbids later dumps on triage', () => {
  const text = buildHammondAuditContract({ kind: 'cn_audit', phase: 'triage', intakeCount: 0 });
  assert.match(text, /triage/i);
  assert.match(text, /one intake question/i);
  assert.match(text, /do not/i);
  assert.doesNotMatch(text, /this turn.*open_loops/i);
});

test('nextAuditPhase advances and clears after lock', () => {
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'triage', intakeCount: 0 }, { askedIntakeQuestion: true }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 1 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'intake', intakeCount: 1 }, { askedIntakeQuestion: true }),
    { kind: 'cn_audit', phase: 'intake', intakeCount: 2 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'intake', intakeCount: 3 }, { askedIntakeQuestion: false, intakeComplete: true }),
    { kind: 'cn_audit', phase: 'stale_drift', intakeCount: 3 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'intake', intakeCount: 2 }, { skipRemainingIntake: true }),
    { kind: 'cn_audit', phase: 'stale_drift', intakeCount: 2 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'stale_drift', intakeCount: 2 }, {}),
    { kind: 'cn_audit', phase: 'open_loops', intakeCount: 2 }
  );
  assert.deepEqual(
    nextAuditPhase({ kind: 'cn_audit', phase: 'open_loops', intakeCount: 2 }, {}),
    { kind: 'cn_audit', phase: 'lock', intakeCount: 2 }
  );
  assert.equal(nextAuditPhase({ kind: 'cn_audit', phase: 'lock', intakeCount: 2 }, {}), null);
});

test('AUDIT_PHASES lists all five phases in order', () => {
  assert.deepEqual(AUDIT_PHASES, ['triage', 'intake', 'stale_drift', 'open_loops', 'lock']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/hammond-audit.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `hammond-audit.mjs`**

Create `netlify/functions/_shared/hammond-audit.mjs`:

```js
export const AUDIT_PHASES = ['triage', 'intake', 'stale_drift', 'open_loops', 'lock'];

const TRIGGER_PATTERNS = [
  /central\s*node\s*audit/i,
  /\bcn\s*audit\b/i,
  /weekly\s*(review|audit)/i,
  /monthly\s*audit/i,
  /goal\s*audit/i
];

const PHASE_CONTRACTS = {
  triage: `You are mid a Central Node audit. THIS TURN ONLY: glance Central Node, run compact Session Triage (seven bullets, short), then ask exactly ONE intake question (concerns, how Adam feels, or goals/thinking). Do not cover stale inventory, drift essay, open loops, or lock in this reply.`,
  intake: `You are mid a Central Node audit. THIS TURN ONLY: acknowledge Adam's answer and either ask the next intake question (concerns / feeling / goals) or state that intake is complete and stop. Cap three intake questions total. Do not dump stale/drift/open-loops/lock yet.`,
  stale_drift: `You are mid a Central Node audit. THIS TURN ONLY: say what is stale and what is drifting, shaped by Central Node and intake answers in history. Keep it compact. Do not run open loops or lock yet.`,
  open_loops: `You are mid a Central Node audit. THIS TURN ONLY: name open loops that matter this week/month, shaped by intake. Keep it compact. Do not lock yet.`,
  lock: `You are mid a Central Node audit. THIS TURN ONLY: give one non-negotiable objective for the rest of today/week and emit compact Central Node write-back lines (Flags / Cross-Agent / Recent Actions wording) in chat. Do not invent a database write. This ends the audit.`
};

export function isHammondAuditTrigger(message) {
  if (typeof message !== 'string' || message.trim() === '') return false;
  return TRIGGER_PATTERNS.some(re => re.test(message));
}

export function normalizeAuditSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.kind !== 'cn_audit') return null;
  if (!AUDIT_PHASES.includes(value.phase)) return null;
  const raw = Number(value.intakeCount);
  const intakeCount = Number.isFinite(raw) ? Math.min(3, Math.max(0, Math.trunc(raw))) : 0;
  return { kind: 'cn_audit', phase: value.phase, intakeCount };
}

export function buildHammondAuditContract(session) {
  const normalized = normalizeAuditSession(session);
  if (!normalized) return '';
  return PHASE_CONTRACTS[normalized.phase];
}

/**
 * @param {object} session normalized session
 * @param {{ askedIntakeQuestion?: boolean, intakeComplete?: boolean, skipRemainingIntake?: boolean }} flags
 */
export function nextAuditPhase(session, flags = {}) {
  const current = normalizeAuditSession(session);
  if (!current) return null;

  if (current.phase === 'triage') {
    const intakeCount = flags.askedIntakeQuestion ? Math.min(3, current.intakeCount + 1) : current.intakeCount;
    if (flags.skipRemainingIntake) {
      return { kind: 'cn_audit', phase: 'stale_drift', intakeCount };
    }
    return { kind: 'cn_audit', phase: 'intake', intakeCount: Math.max(intakeCount, 1) };
  }

  if (current.phase === 'intake') {
    let intakeCount = current.intakeCount;
    if (flags.askedIntakeQuestion) intakeCount = Math.min(3, intakeCount + 1);
    if (flags.skipRemainingIntake || flags.intakeComplete || intakeCount >= 3) {
      return { kind: 'cn_audit', phase: 'stale_drift', intakeCount };
    }
    return { kind: 'cn_audit', phase: 'intake', intakeCount };
  }

  if (current.phase === 'stale_drift') {
    return { kind: 'cn_audit', phase: 'open_loops', intakeCount: current.intakeCount };
  }
  if (current.phase === 'open_loops') {
    return { kind: 'cn_audit', phase: 'lock', intakeCount: current.intakeCount };
  }
  if (current.phase === 'lock') return null;
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/hammond-audit.test.js`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/hammond-audit.mjs tests/unit/hammond-audit.test.js
git commit -m "feat: add Hammond CN audit phase helpers"
```

---

### Task 2: Protocol soft layer

**Files:**
- Modify: `config/hammond-protocol.md`
- Modify: `tests/unit/load-hammond-protocol.test.js`

- [ ] **Step 1: Extend the protocol load test**

In `tests/unit/load-hammond-protocol.test.js`, add:

```js
test('protocol documents phased Central Node audit', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Central Node audit \(phased\)/i);
  assert.match(text, /intake/i);
  assert.match(text, /triage/i);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --test tests/unit/load-hammond-protocol.test.js`  
Expected: FAIL on phased section match

- [ ] **Step 3: Append protocol section**

Append to `config/hammond-protocol.md`:

```markdown
## Central Node audit (phased)

When Adam asks for a Central Node audit, weekly review, monthly audit, or goal audit, do **not** dump the full protocol in one reply. Life Hub may also enforce phases in the system prompt — obey the active phase contract when present.

Default sequence (one turn each):

1. **Triage** — glance Constraints / Today's Status / Cross-Agent / Recent Actions; compact Session Triage; ask **one** intake question (concerns, how he feels, or goals/thinking).
2. **Intake** — up to three questions total across triage+intake. Stop when answered or he says to continue.
3. **Stale + drift** — shaped by intake; compact.
4. **Open loops** — what matters this week/month; compact.
5. **Lock** — one non-negotiable + compact CN write-back lines in chat (Flags / Cross-Agent / Recent Actions). No fake database write.

If he cancels or changes topic mid-audit, drop the sequence and answer the new ask.
```

- [ ] **Step 4: Run test — expect PASS**

Run: `node --test tests/unit/load-hammond-protocol.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add config/hammond-protocol.md tests/unit/load-hammond-protocol.test.js
git commit -m "docs: add phased Central Node audit to Hammond protocol"
```

---

### Task 3: Wire contract into persona + chat handler

**Files:**
- Modify: `netlify/functions/_shared/persona.mjs`
- Modify: `netlify/functions/chat.mjs`
- Modify: `tests/unit/persona.test.js`
- Modify: `tests/integration/chat-function.test.js`

- [ ] **Step 1: Failing persona test**

Add to `tests/unit/persona.test.js`:

```js
test('hammond prompt includes audit phase contract when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    hammondAuditContract: 'THIS TURN ONLY: triage then one intake question.'
  });
  assert.match(prompt, /THIS TURN ONLY: triage then one intake question/);
});

test('non-hammond prompts never include hammond audit contract', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    hammondAuditContract: 'THIS TURN ONLY: triage'
  });
  assert.doesNotMatch(prompt, /THIS TURN ONLY: triage/);
});
```

- [ ] **Step 2: Run persona tests — expect FAIL**

Run: `node --test tests/unit/persona.test.js`  
Expected: FAIL on missing contract wiring

- [ ] **Step 3: Update `buildSystemPrompt`**

In `persona.mjs`, add param `hammondAuditContract = ''` and inside `hammondBlocks`:

```js
  const hammondBlocks = slug === 'hammond' ? [
    hammondProtocol
      ? `Hammond operating manual (follow these Life Hub rules):\n${hammondProtocol}`
      : '',
    hammondAuditContract
      ? `Hammond audit phase contract (hard rules for this turn):\n${hammondAuditContract}`
      : '',
    'You do not propose log_entry. Coach and triage; specialists own domain logs.',
    'Read Central Node before triage or any follow-on protocol. After direction/drift/handoff work, state compact Hammond→[Agent] lines in chat when another specialist must act.'
  ] : [];
```

- [ ] **Step 4: Failing integration test for chat parse + contract**

Append to `tests/integration/chat-function.test.js`:

```js
test('Hammond auditSession injects phase contract into the system prompt', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Triage complete. What is weighing on you?' }, { type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Hammond, Central Node audit',
    auditSession: { kind: 'cn_audit', phase: 'triage', intakeCount: 0 }
  })));

  assert.match(receivedArgs.system, /audit phase contract/i);
  assert.match(receivedArgs.system, /THIS TURN ONLY/i);
  assert.match(receivedArgs.system, /triage/i);
});

test('invalid auditSession is ignored for prompt injection', async () => {
  let receivedArgs;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: args => {
        receivedArgs = args;
        return mockedStream([{ type: 'text', delta: 'Protein target is 120g.' }, { type: 'done' }]);
      }
    })
  });

  await readSse(await handler(request({
    message: 'Hammond, what is the protein target?',
    auditSession: { kind: 'cn_audit', phase: 'not-a-phase', intakeCount: 0 }
  })));

  assert.doesNotMatch(receivedArgs.system, /audit phase contract/i);
});
```

- [ ] **Step 5: Run integration tests — expect FAIL**

Run: `node --test tests/integration/chat-function.test.js`  
Expected: FAIL (auditSession ignored)

- [ ] **Step 6: Implement chat.mjs wiring**

1. Import `normalizeAuditSession`, `buildHammondAuditContract` from `./_shared/hammond-audit.mjs`.
2. In `parseRequest` return value, add:
   ```js
   auditSession: normalizeAuditSession(body.auditSession)
   ```
3. After routing `slug`, compute:
   ```js
   const hammondAuditContract = slug === 'hammond' && parsed.auditSession
     ? buildHammondAuditContract(parsed.auditSession)
     : '';
   ```
4. Pass `hammondAuditContract` into `buildSystemPrompt({ ... })`.
5. After sending `{ type: 'agent', slug }`, if `hammondAuditContract` and `parsed.auditSession`:
   ```js
   send({ type: 'audit_phase', phase: parsed.auditSession.phase, intakeCount: parsed.auditSession.intakeCount });
   ```

- [ ] **Step 7: Run unit + integration tests**

Run:
```bash
node --test tests/unit/persona.test.js tests/unit/hammond-audit.test.js tests/integration/chat-function.test.js
```
Expected: PASS for new cases (existing tests still green)

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/_shared/persona.mjs netlify/functions/chat.mjs \
  tests/unit/persona.test.js tests/integration/chat-function.test.js
git commit -m "feat: inject Hammond audit phase contracts into chat"
```

---

### Task 4: Client API + controller session lifecycle

**Files:**
- Modify: `js/app/chat-api.js`
- Modify: `js/app/chat-controller.js`
- Create: `js/app/hammond-audit.js` (browser copy of trigger + nextAuditPhase + normalize — keep in sync with shared module; comment at top: “Keep behaviour aligned with netlify/functions/_shared/hammond-audit.mjs”)
- Modify: `tests/unit/chat-api.test.js`
- Modify: `tests/unit/chat-controller.test.js`
- Modify: `service-worker.js` (bump `life-hub-shell-vN`)

**Note:** The browser cannot import Netlify `_shared` paths in production static hosting. Duplicate the pure helpers into `js/app/hammond-audit.js` with the same exports used by the controller. Prefer identical function bodies to Task 1.

- [ ] **Step 1: Failing chat-api test**

In `tests/unit/chat-api.test.js`, add a test that `send(..., { auditSession })` JSON body includes `auditSession`.

- [ ] **Step 2: Implement chat-api change**

```js
async *send(message, { signal, history, priorAgentSlug, auditSession } = {}) {
  const response = await fetchImpl('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      ...(history?.length ? { history } : {}),
      ...(priorAgentSlug ? { priorAgentSlug } : {}),
      ...(auditSession ? { auditSession } : {})
    }),
    signal
  });
  // ... unchanged
}
```

- [ ] **Step 3: Controller session behaviour tests**

Add tests in `tests/unit/chat-controller.test.js` (follow existing harness patterns):

1. Message `Hammond, Central Node audit` with agent event `hammond` starts session phase `triage` and passes `auditSession` into `chatApi.send`.
2. After a successful triage turn (text + done), next send uses phase `intake` (or advanced session from `nextAuditPhase`).
3. Selecting another agent or sending cancel phrase (`cancel audit` / `stop audit`) clears session so subsequent sends omit `auditSession`.
4. Non-trigger Hammond message without existing session does not attach `auditSession`.

Implementation sketch for controller state:

```js
import {
  isHammondAuditTrigger,
  nextAuditPhase,
  normalizeAuditSession
} from './hammond-audit.js';

let auditSession = null;

function clearAuditSession() {
  auditSession = null;
}

function maybeStartAuditSession(message, assistantSlug) {
  if (assistantSlug === 'hammond' && isHammondAuditTrigger(message) && !auditSession) {
    auditSession = { kind: 'cn_audit', phase: 'triage', intakeCount: 0 };
  }
}

// On send:
maybeStartAuditSession(message, stickyAgentSlug() ?? routeHint);
const payloadSession = stickyAgentSlug() === 'hammond' || message matches hammond
  ? auditSession
  : null;
// pass auditSession: payloadSession into chatApi.send

// After successful turn (turnSignaled && !empty recovery):
if (auditSession) {
  if (/cancel audit|stop audit/i.test(message)) clearAuditSession();
  else {
    const askedIntake = auditSession.phase === 'triage' || auditSession.phase === 'intake';
    const skip = /\b(skip intake|continue audit|go on|next)\b/i.test(message);
    auditSession = nextAuditPhase(auditSession, {
      askedIntakeQuestion: askedIntake,
      skipRemainingIntake: skip,
      intakeComplete: skip
    });
  }
}

// On selectAgent(slug) when slug !== 'hammond': clearAuditSession()
```

**Advancement simplification for v1 (lock in tests):**  
After every successful turn while `auditSession` is set:

- If user message matches `/cancel audit|stop audit/i` → clear.  
- Else if phase is `triage` → `nextAuditPhase(session, { askedIntakeQuestion: true })`.  
- Else if phase is `intake` → if `/skip intake|continue audit|go on|\bnext\b/i` or `intakeCount >= 2` after increment path using `nextAuditPhase(..., { askedIntakeQuestion: true })` until stale_drift — use helper only, do not invent parallel logic.  
- Else → `nextAuditPhase(session, {})`.

If SSE `audit_phase` arrives, do not let it overwrite client advancement; it is informational for debugging only in v1 (optional to ignore).

- [ ] **Step 4: Implement `js/app/hammond-audit.js` + controller + SW bump**

Copy helpers from Task 1 into `js/app/hammond-audit.js`. Wire controller as above. Bump service worker shell version by 1.

- [ ] **Step 5: Run client unit tests**

Run:
```bash
node --test tests/unit/chat-api.test.js tests/unit/chat-controller.test.js tests/unit/hammond-audit.test.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/app/chat-api.js js/app/chat-controller.js js/app/hammond-audit.js \
  tests/unit/chat-api.test.js tests/unit/chat-controller.test.js service-worker.js
git commit -m "feat: drive Hammond CN audit phases from the chat client"
```

---

### Task 5: Verification sweep

**Files:** none new (commands only)

- [ ] **Step 1: Full unit + integration**

Run:
```bash
npm test
```
Expected: all PASS (or only pre-existing failures unrelated to this work — if any, note them; do not leave new failures)

- [ ] **Step 2: Optional live smoke (needs `.env.local` ANTHROPIC_API_KEY)**

Manual script or extend `scripts/live-e2e-three-agents.mjs` with a phased Hammond path:

1. Send trigger with `auditSession: triage` → assert text + triage-ish content + no long open-loops dump.  
2. Send intake answer with `phase: intake` → assert text.  
3. Send `continue audit` with `stale_drift` → assert text.  
4. `open_loops` then `lock` → assert non-negotiable / CN-line language.  
5. Each turn total &lt; 26s preferred.

- [ ] **Step 3: Final commit only if smoke script added**

```bash
git add scripts/live-hammond-audit-smoke.mjs  # if created
git commit -m "test: add live Hammond phased CN audit smoke"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Trigger phrases | Task 1 + Task 4 |
| Phases triage→intake→stale_drift→open_loops→lock | Task 1 + Task 4 |
| Intake cap 3 | Task 1 `nextAuditPhase` |
| Phase contract in system prompt | Task 3 |
| Protocol soft section | Task 2 |
| Client session send/advance/clear | Task 4 |
| Cancel / agent switch clears | Task 4 |
| CN write-back chat-only on lock | Task 1 contract + Task 2 protocol |
| No chips / auto-chain / CN Confirm | Explicitly omitted |
| Thinking disabled / timeout posture | Already shipped; contracts keep replies short |

## Placeholder scan

None intentional. Browser helper duplication is explicit (static hosting constraint), not a TBD.
