# Chadwick Workout Builder Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Chadwick designs a workout, Adam gets a Confirm card (planned `log_entry`) in the same turn — not chat-only text — including when exercise-library tools run; plus a soft nudge if a turn still ends without a proposal; plus stronger Central Node use in Chadwick prompts.

**Architecture:** Mirror Brisket’s `save_food_library_entry` → `executeTools` continuation for `save_exercise_library_entry`. Align `chadwick-protocol.md` + `persona.mjs` so design/build must propose `planned`. Track library-saved-without-proposal in `chat-controller.js` for a one-line nudge. No auto-write without Confirm.

**Tech Stack:** Netlify chat function, Anthropic tool loop, vanilla chat UI, node:test.

**Spec:** `docs/superpowers/specs/2026-08-06-chadwick-workout-builder-reliability-design.md`

**Deploy:** Local commits only; do not push unless Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `netlify/functions/chat.mjs` | Move exercise save into `executeTools`; emit `exercise_library_saved`; remove fire-and-forget branch |
| `config/chadwick-protocol.md` | Job/Logging: design/build → planned `log_entry`; CN must shape plan |
| `netlify/functions/_shared/persona.mjs` | Chadwick must-propose + stronger CN-use lines |
| `js/app/chat-controller.js` | Nudge when `exercise_library_saved` and no `record_proposal` |
| `tests/integration/chat-function.test.js` | Continuation + proposal after exercise save |
| `tests/unit/persona.test.js` | Assert new prompt strings |
| `tests/unit/chat-controller.test.js` | Nudge behavior |
| `service-worker.js` | Bump `v35` → `v36` if client JS changes |

---

### Task 1: Continue rounds after `save_exercise_library_entry`

**Files:**
- Modify: `netlify/functions/chat.mjs`
- Test: `tests/integration/chat-function.test.js`

- [ ] **Step 1: Rewrite failing integration test**

Replace / extend `save_exercise_library_entry writes data/exercise-library.json…` to require continuation (mirror food test at ~line 291):

```js
test('save_exercise_library_entry continues the stream so Chadwick can propose next', async () => {
  // fetchImpl: commits + empty tree + PUT ok (same as current exercise save test)
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl,
    createAnthropicClient: () => ({
      streamMessage: async function* ({ executeTools }) {
        const toolResult = await executeTools({
          id: 'call_1',
          name: 'save_exercise_library_entry',
          input: {
            name: 'Bar Press',
            target_area: 'Chest',
            default_cable_type: 'concentric'
          }
        });
        assert.ok(toolResult != null, 'executeTools must return so the round continues');
        assert.equal(JSON.parse(toolResult).ok, true);
        // Second round: model proposes planned workout (minimal valid log_entry input
        // matching validateLogEntry — copy fields from an existing workout proposal fixture/test)
        yield {
          type: 'tool_call',
          id: 'call_2',
          name: 'log_entry',
          input: { /* valid planned workout — see existing chat-function log_entry tests */ }
        };
        yield { type: 'done' };
      }
    })
  });

  const events = await readSse(await handler(request({ message: 'Chadwick, build today\'s chest session' })));
  assert.ok(events.some(e => e.type === 'exercise_library_saved' && e.name === 'Bar Press'));
  assert.ok(events.some(e => e.type === 'record_proposal' && e.record?.status === 'planned'));
});
```

Also add invalid-entry test returning `{ ok: false, error: 'invalid_entry' }` with no PUT (mirror food invalid test).

Find a valid planned workout `log_entry` payload from existing tests (`chat-function.test.js` or `chat-schema` fixtures) — use the same shape so validation succeeds.

- [ ] **Step 2: Run — expect FAIL** (current fire-and-forget: `executeTools` returns null for exercise save; old test pattern yields tool_call via mockedStream without calling executeTools)

```bash
node --test tests/integration/chat-function.test.js
```

- [ ] **Step 3: Implement in `chat.mjs`**

Inside `executeTools`, after food save block:

```js
if (event.name === 'save_exercise_library_entry') {
  const entry = validateExerciseLibraryEntry(event.input);
  if (!entry) {
    return JSON.stringify({ ok: false, error: 'invalid_entry' });
  }
  try {
    exerciseLibraryEntries = upsertExerciseLibraryEntry(
      exerciseLibraryEntries,
      entry,
      getSydneyTimestamp(nowInstant)
    );
    const result = await client.writeFile({
      path: EXERCISE_LIBRARY_PATH,
      content: JSON.stringify(exerciseLibraryEntries, null, 2),
      ...(exerciseLibrarySha ? { sha: exerciseLibrarySha } : {}),
      message: `chore(exercise-library): upsert ${entry.name}`
    });
    exerciseLibrarySha = result.sha;
    send({ type: 'exercise_library_saved', name: entry.name });
    return JSON.stringify({
      ok: true,
      name: entry.name,
      target_area: entry.target_area,
      default_cable_type: entry.default_cable_type
    });
  } catch {
    return JSON.stringify({ ok: false, error: 'write_failed' });
  }
}
```

Delete the `else if (event.type === 'tool_call' && event.name === 'save_exercise_library_entry')` branch from the `for await` loop (lines ~297–317). Keep `log_entry` handling as today.

- [ ] **Step 4: Run — PASS**

```bash
node --test tests/integration/chat-function.test.js tests/unit/anthropic-client.test.js
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/chat.mjs tests/integration/chat-function.test.js
git commit -m "$(cat <<'EOF'
fix: continue chat tool rounds after Exercise Library save

EOF
)"
```

---

### Task 2: Protocol + persona — must propose planned + use Central Node

**Files:**
- Modify: `config/chadwick-protocol.md`
- Modify: `netlify/functions/_shared/persona.mjs`
- Test: `tests/unit/persona.test.js`

- [ ] **Step 1: Write failing persona assertions**

```js
test('Chadwick prompt requires planned log_entry after design and CN-shaped programming', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', /* minimal deps with centralNodeLog + chadwickProtocol */ });
  assert.match(prompt, /must.*log_entry|Confirm card|Fitness tab/i); // tune to exact new copy
  assert.match(prompt, /Central Node/i);
  assert.match(prompt, /shape|visibly|concrete/i); // CN must shape prescription
  assert.doesNotMatch(prompt, /lock today's session onto Fitness/); // remove conflicting gate if deleted from protocol string embedded in prompt
});
```

Adapt to how `buildSystemPrompt` / persona helpers are invoked in existing tests.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Edit protocol**

In `config/chadwick-protocol.md`:

**Job §1** — replace “When he asks you to lock today's session onto Fitness…” with: when he asks you to **design, build, or set today’s session** and the plan is ready, end that turn with one `log_entry` (`status: planned`) so he gets a Confirm card onto Fitness. Programming chatter mid-iteration is fine; a finished prescription is not chat-only.

**Line 14** — replace “stay in chat until he asks to commit” with: stay conversational while iterating; once Adam accepts a concrete plan or asks to build/set today’s session, propose `planned` in that turn.

**Before designing** — add: when Status or Cross-Agent has a relevant flag, the planned session (and chat pitch) must reflect at least one concrete adjustment, or briefly state why CN did not change the plan (“CN clear — normal load”).

**Logging §66** — keep planned/completed split; reinforce that chat-only exercise lists do not appear on Fitness.

- [ ] **Step 4: Edit persona Chadwick blocks**

In `persona.mjs` chadwickBlocks, replace/strengthen the design line (~62) and CN line (~50–51):

```js
centralNodeLog
  ? 'When designing a session you MUST use the Central Node Today\'s Status and Cross-Agent Coordination above to shape the prescription (volume, focus, or intensity). Mention that influence briefly in chat when you propose. If nothing relevant applies, say so in one short line.'
  : '',
// ...
'When Adam asks you to design or build today\'s session, you MUST call log_entry with status planned in that same turn once the prescription is ready (full exercises, cable_type on every strength set). Chat text alone never appears on the Fitness tab — only a Confirm card does. Mid-iteration questions can stay conversational; a finished plan requires the tool call.',
```

Keep template/library lines. Do not weaken completed-actuals rules.

- [ ] **Step 5: Run persona tests — PASS; commit**

```bash
node --test tests/unit/persona.test.js
git add config/chadwick-protocol.md netlify/functions/_shared/persona.mjs tests/unit/persona.test.js
git commit -m "$(cat <<'EOF'
fix: require Chadwick planned proposals and CN-shaped builds

EOF
)"
```

---

### Task 3: Client flow-clause nudge

**Files:**
- Modify: `js/app/chat-controller.js`
- Test: `tests/unit/chat-controller.test.js`

- [ ] **Step 1: Write failing test**

```js
test('nudge when exercise library saved but no record_proposal in the turn', async () => {
  const api = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'exercise_library_saved', name: 'Bar Press' };
      yield { type: 'done' };
    }
  };
  // createChatController + send('build chest')
  // assert a chat message contains lock/Fitness/Confirm wording
  // assert no record_proposal path required
});

test('no nudge when exercise_library_saved then record_proposal', async () => {
  // yield library saved then record_proposal (minimal fake proposal event shape)
  // assert nudge text absent
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

In `send()`:

```js
let sawExerciseLibrarySaved = false;
let sawRecordProposal = false;
// in loop:
} else if (event.type === 'record_proposal') {
  sawRecordProposal = true;
  ...
} else if (event.type === 'exercise_library_saved') {
  sawExerciseLibrarySaved = true;
  ...
}
// in finally, before clearWorkingBubble / after stream:
if (sawExerciseLibrarySaved && !sawRecordProposal) {
  appendMessage(root, {
    role: 'assistant',
    agentSlug: assistantSlug,
    text: 'That stayed in chat only — ask me to lock it onto Fitness so you get a Confirm card.'
  });
}
```

Place nudge after stream completes successfully (not on hard error if that feels wrong — still OK on clean `done` without proposal). Prefer only when `assistantSlug === 'chadwick'` if slug known.

- [ ] **Step 4: Run — PASS**

```bash
node --test tests/unit/chat-controller.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/app/chat-controller.js tests/unit/chat-controller.test.js
git commit -m "$(cat <<'EOF'
feat: nudge when Chadwick library save ends without a Confirm card

EOF
)"
```

---

### Task 4: SW bump + full verify

**Files:**
- Modify: `service-worker.js` (`life-hub-shell-v35` → `v36`)

- [ ] **Step 1: Bump cache name**

- [ ] **Step 2: Full suites**

```bash
npm test
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64 PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npm run test:browser
```

Use full permissions if needed; `npm install` in worktree if missing deps. Stay on feature branch (no detached HEAD).

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: bump shell cache after Chadwick builder reliability

EOF
)"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Exercise save → continue rounds | 1 |
| Protocol/persona must propose planned | 2 |
| CN must shape build | 2 |
| Client nudge without proposal | 3 |
| SW bump | 4 |

## Out of scope

Auto-write without Confirm; Finish-button races; raising `MAX_TOOL_ROUNDS` unless Task 1 tests exhaust rounds.
