# Chat Turn Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every agent finishes a chat turn with text, a Confirm card, a known error, or a visible recovery message — never a vanished “On it…” — including after `web_search` / `pause_turn`.

**Architecture:** Fix `anthropic-client.mjs` to continue on `pause_turn` and replay full assistant content for client-tool rounds; raise tool-round cap; add a persona-agnostic empty-turn safety net in `chat-controller.js`; optionally emit the SSE `agent` event before slow GitHub context loads.

**Tech Stack:** Netlify Functions, Anthropic Messages SSE, vanilla JS chat UI, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-07-chat-turn-reliability-design.md`

**Deploy:** Local commits only; do not push unless Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `netlify/functions/_shared/anthropic-client.mjs` | Accumulate content blocks; read `stop_reason`; continue on `pause_turn`; full-content client-tool replay; `MAX_TOOL_ROUNDS = 6` |
| `js/app/chat-controller.js` | Empty-turn recovery message; treat status chips as non-final |
| `netlify/functions/chat.mjs` | Early `{ type: 'agent', slug }` before GitHub blob fan-out when safe |
| `tests/unit/anthropic-client.test.js` | pause_turn + mixed server/client continuation tests |
| `tests/unit/chat-controller.test.js` | Empty / search-only → recovery; text/proposal → no false recovery |
| `service-worker.js` | Bump cache if client JS changes |

**Recovery copy (canonical):** `I didn’t finish that reply — send again and I’ll pick it up.`

---

### Task 1: Failing tests for `pause_turn` continuation

**Files:**
- Modify: `tests/unit/anthropic-client.test.js`
- Modify: `netlify/functions/_shared/anthropic-client.mjs` (later task)

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/anthropic-client.test.js`:

```js
test('continues when stop_reason is pause_turn by re-sending assistant content as-is', async () => {
  const first = [
    frame('content_block_start', {
      index: 0,
      content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' }
    }),
    frame('content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"query":"bacon egg roll sodium AU"}' }
    }),
    frame('content_block_stop', { index: 0 }),
    frame('message_delta', { delta: { stop_reason: 'pause_turn' } }),
    frame('message_stop', {})
  ];
  const second = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'About 850 mg sodium.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_delta', { delta: { stop_reason: 'end_turn' } }),
    frame('message_stop', {})
  ];

  let calls = 0;
  const bodies = [];
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return sseResponse(calls === 1 ? first : second);
    }
  });

  const events = [];
  for await (const event of client.streamMessage({
    system: 's',
    messages: [{ role: 'user', content: 'bacon and egg roll' }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }]
  })) events.push(event);

  assert.equal(calls, 2);
  const continued = bodies[1].messages.at(-1);
  assert.equal(continued.role, 'assistant');
  assert.ok(continued.content.some(block => block.type === 'server_tool_use' && block.id === 'srvtoolu_1'));
  assert.deepEqual(
    events.filter(e => e.type === 'search' || e.type === 'text' || e.type === 'done'),
    [
      { type: 'search', query: 'bacon egg roll sodium AU' },
      { type: 'text', delta: 'About 850 mg sodium.' },
      { type: 'done' }
    ]
  );
});

test('client tool continuation preserves prior server_tool_use blocks in the assistant message', async () => {
  const first = [
    frame('content_block_start', {
      index: 0,
      content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' }
    }),
    frame('content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"query":"quest bar"}' }
    }),
    frame('content_block_stop', { index: 0 }),
    frame('content_block_start', {
      index: 1,
      content_block: { type: 'tool_use', id: 'call_1', name: 'save_food_library_entry' }
    }),
    frame('content_block_delta', {
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"name":"Quest Bar"}' }
    }),
    frame('content_block_stop', { index: 1 }),
    frame('message_delta', { delta: { stop_reason: 'tool_use' } }),
    frame('message_stop', {})
  ];
  const second = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Logged.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('message_stop', {})
  ];

  let calls = 0;
  const bodies = [];
  const client = createAnthropicClient({
    apiKey: 'k',
    fetchImpl: async (_url, init) => {
      calls += 1;
      bodies.push(JSON.parse(init.body));
      return sseResponse(calls === 1 ? first : second);
    }
  });

  const events = [];
  for await (const event of client.streamMessage({
    system: 's',
    messages: [{ role: 'user', content: 'quest bar' }],
    tools: [],
    executeTools: async () => JSON.stringify({ ok: true })
  })) events.push(event);

  assert.equal(calls, 2);
  const assistant = bodies[1].messages.at(-2);
  assert.equal(assistant.role, 'assistant');
  assert.ok(assistant.content.some(b => b.type === 'server_tool_use'));
  assert.ok(assistant.content.some(b => b.type === 'tool_use' && b.id === 'call_1'));
  assert.ok(events.some(e => e.type === 'text' && e.delta === 'Logged.'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/anthropic-client.test.js`

Expected: FAIL — `pause_turn` / server blocks not continued (only 1 fetch, or assistant message missing `server_tool_use`).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/anthropic-client.test.js
git commit -m "test: require pause_turn and full-content tool continuation"
```

---

### Task 2: Implement Anthropic client continuation

**Files:**
- Modify: `netlify/functions/_shared/anthropic-client.mjs`

- [ ] **Step 1: Raise round caps and accumulate streamed content + stop_reason**

Replace the top constants and rewrite `streamMessage` / `interpretEvent` so that:

```js
const MAX_TOOL_ROUNDS = 6;
const MAX_PAUSE_CONTINUATIONS = 3;
```

`interpretEvent` must:

- On `content_block_start` for `text`, `tool_use`, `server_tool_use`, and known result types (`web_search_tool_result`, etc.), start buffering a content block (for text, accumulate deltas into `text`; for tools, accumulate JSON into `input` / keep result payload).
- On `content_block_stop`, finalize that block into an `assistantBlocks` array (ordered), and still yield `{ type: 'search' }` / `{ type: 'tool_call' }` as today for UI/`executeTools`.
- On `message_delta`, if `payload.delta?.stop_reason` is set, record `stopReason`.
- On `message_stop`, yield `{ type: 'done' }` only from the outer loop when truly finished (inner `streamOnce` can yield `{ type: 'round_meta', stopReason, assistantBlocks }` **or** return them via a collector passed into `streamOnce` — prefer a collector object mutated by `interpretEvent` to avoid changing the public event stream).

Simplest shape that matches existing tests:

```js
async *streamMessage({ system, messages, tools, signal, executeTools }) {
  let roundMessages = messages;
  let pauseContinuations = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const pendingResults = [];
    const assistantBlocks = [];
    let stopReason = null;
    let sawDone = false;

    for await (const event of streamOnce({
      apiKey, fetchImpl, system, messages: roundMessages, tools, signal,
      onAssistantBlock: block => assistantBlocks.push(block),
      onStopReason: reason => { stopReason = reason; }
    })) {
      if (event.type === 'done') {
        sawDone = true;
        continue;
      }
      if (event.type === 'tool_call' && typeof executeTools === 'function') {
        const result = await executeTools(event);
        if (result != null) {
          pendingResults.push({ toolCall: event, result });
          continue;
        }
      }
      yield event;
    }

    if (pendingResults.length > 0) {
      roundMessages = [
        ...roundMessages,
        { role: 'assistant', content: assistantBlocks.length ? assistantBlocks : pendingResults.map(({ toolCall }) => ({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input ?? {}
        })) },
        {
          role: 'user',
          content: pendingResults.map(({ toolCall, result }) => ({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          }))
        }
      ];
      continue;
    }

    if (stopReason === 'pause_turn' && pauseContinuations < MAX_PAUSE_CONTINUATIONS && assistantBlocks.length > 0) {
      pauseContinuations += 1;
      roundMessages = [
        ...roundMessages,
        { role: 'assistant', content: assistantBlocks }
      ];
      continue;
    }

    if (sawDone) yield { type: 'done' };
    return;
  }

  yield { type: 'done' };
}
```

Wire `onAssistantBlock` / `onStopReason` through `streamOnce` → `interpretEvent`:

- `text` block → `{ type: 'text', text: accumulated }`
- `tool_use` → `{ type: 'tool_use', id, name, input }`
- `server_tool_use` → `{ type: 'server_tool_use', id, name, input }`
- result blocks that arrive complete on `content_block_start` → push the payload object as-is (preserve `type`, `tool_use_id`, `content`)

Keep yielding `{ type: 'search', query }` for `web_search` server tools and `{ type: 'tool_call', ... }` for client tools.

- [ ] **Step 2: Run anthropic-client tests**

Run: `node --test tests/unit/anthropic-client.test.js`

Expected: PASS (including prior continuation tests).

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/_shared/anthropic-client.mjs tests/unit/anthropic-client.test.js
git commit -m "fix: continue Anthropic turns after pause_turn and mixed tools"
```

---

### Task 3: Empty-turn recovery in chat controller

**Files:**
- Modify: `js/app/chat-controller.js`
- Modify: `tests/unit/chat-controller.test.js`
- Modify: `service-worker.js` (bump CACHE version)

- [ ] **Step 1: Add failing tests**

```js
const EMPTY_TURN_RECOVERY = 'I didn’t finish that reply — send again and I’ll pick it up.';

test('empty stream after On it shows a durable recovery message', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'chadwick' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('build a workout');
  assert.ok(
    messageBubbles(root).some(b => bubbleText(b).includes(EMPTY_TURN_RECOVERY)),
    'expected empty-turn recovery copy'
  );
  assert.ok(
    messageBubbles(root).every(b => bubbleText(b) !== 'On it…'),
    'On it bubble must not linger'
  );
});

test('search-only turn without text or proposal shows recovery message', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'search', query: 'bacon egg roll' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('bacon and egg roll');
  assert.ok(messageBubbles(root).some(b => bubbleText(b).includes(EMPTY_TURN_RECOVERY)));
});

test('text reply does not show empty-turn recovery', async () => {
  const root = new FakeDocument();
  const chatApi = {
    async *send() {
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Shoot, buddy — that roll is about 520 kcal.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });
  await controller.send('bacon egg roll');
  assert.ok(messageBubbles(root).every(b => !bubbleText(b).includes(EMPTY_TURN_RECOVERY)));
});
```

Update `a turn that only emits a search note without text/proposal/error does not mark chat unread` if recovery now counts as signaled — **recovery should set `turnSignaled = true`** and mark unread when chat is hidden.

- [ ] **Step 2: Run tests to verify fail**

Run: `node --test tests/unit/chat-controller.test.js`

Expected: FAIL on new recovery assertions.

- [ ] **Step 3: Implement recovery in `send()` finally / post-loop**

After the successful `for await` stream loop (before `catch`), if there was no useful output:

```js
const EMPTY_TURN_RECOVERY = 'I didn’t finish that reply — send again and I’ll pick it up.';

// useful = text | record_proposal | record_rejected | error event
// NOT useful alone: search | food_library_saved | exercise_library_saved | agent | done

if (!turnSignaled) {
  turnSignaled = true;
  clearWorkingBubble();
  appendMessage(root, {
    role: 'assistant',
    agentSlug: assistantSlug,
    text: EMPTY_TURN_RECOVERY
  });
}
```

Keep Chadwick library nudge as an additional line when it still applies **or** rely on recovery alone when there is no text/proposal — prefer: if nudge would fire, still fire nudge; if neither text nor proposal nor nudge, fire recovery. Simplest correct rule: **if `!turnSignaled` after stream + nudge block, append recovery.** So run nudge first (nudge sets `turnSignaled`), then recovery if still unset.

- [ ] **Step 4: Run chat-controller tests**

Run: `node --test tests/unit/chat-controller.test.js`

Expected: PASS.

- [ ] **Step 5: Bump service worker cache**

In `service-worker.js`, increment the shell cache version constant (current `vNN` → `vNN+1`) so clients pick up `chat-controller.js`.

- [ ] **Step 6: Commit**

```bash
git add js/app/chat-controller.js tests/unit/chat-controller.test.js service-worker.js
git commit -m "fix: never leave chat turns as a vanished On it bubble"
```

---

### Task 4: Early SSE agent heartbeat

**Files:**
- Modify: `netlify/functions/chat.mjs`
- Test: `tests/integration/chat-function.test.js` (optional assert first event is `agent` even when GitHub is slow — only if an existing test harness can delay blobs)

- [ ] **Step 1: Restructure `handle` so the stream starts before blob fan-out**

Pattern:

1. Auth, parse, route `slug` as today (before stream).
2. Return `ReadableStream` immediately; inside `start`:
   - `send({ type: 'agent', slug })`
   - then `await` GitHub `resolveTree` + blobs + prompt build (move the existing try/catch body into the stream start)
   - then run `anthropic.streamMessage(...)` as today
3. On GitHub failure inside the stream, keep soft-empty digest behaviour (current catch) rather than failing the whole chat, unless that already throws.

Keep `createAnthropic` / env checks that must fail fast **before** the stream if misconfigured (unchanged).

- [ ] **Step 2: Run integration chat tests**

Run: `node --test tests/integration/chat-function.test.js`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/chat.mjs tests/integration/chat-function.test.js
git commit -m "fix: emit chat agent event before GitHub context load"
```

---

### Task 5: Verification

- [ ] **Step 1: Run the focused suite**

```bash
node --test \
  tests/unit/anthropic-client.test.js \
  tests/unit/chat-controller.test.js \
  tests/integration/chat-function.test.js
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke (after local/netlify dev if available)**

1. Brisket: ask to log a food that triggers web search → expect search chip **and** follow-up text or Confirm without re-prompt.
2. Chadwick: short message → either a real reply or the recovery sentence — never blank after “On it…”.

- [ ] **Step 3: Final commit only if verification edits were needed; otherwise stop**

Do **not** push unless Adam asks.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `pause_turn` continuation with assistant content as-is | 1–2 |
| Full assistant content on client-tool continuation | 1–2 |
| `MAX_TOOL_ROUNDS` 6 | 2 |
| Empty-turn recovery (persona-agnostic) | 3 |
| Status chips alone ≠ finished turn | 3 |
| Early SSE heartbeat | 4 |
| Local commits only | all commit steps |
| Out of scope UI/nutrition/sodium | not scheduled |
