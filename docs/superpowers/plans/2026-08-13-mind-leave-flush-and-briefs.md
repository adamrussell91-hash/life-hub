# Mind leave-flush and Hammond briefs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject diary metadata on Hammond 5e/6b turns from the existing CN event window, and run a hidden Vera close turn on New Chat, agent switch, or leaving Chat.

**Architecture:** Detection and digest stay in `mind-digest.mjs`. `chat.mjs` reuses already-parsed `cnEvents` (no extra GitHub read). Leave-flush is a `hiddenUser` chat send in `chat-controller.js`, triggered from `startNewChat` / `selectAgent` and from `app-controller.js` when the chat surface actually hides.

**Tech Stack:** Node test runner, existing Netlify chat function, PWA chat controller, service-worker cache bump to `life-hub-shell-v72`.

---

## File map

| File | Role |
|---|---|
| `netlify/functions/_shared/mind-digest.mjs` | `isHammondMindBriefTurn`, `hammondDiaryDigestForTurn` |
| `netlify/functions/_shared/persona.mjs` | Hammond-only `hammondDiaryDigest` block |
| `netlify/functions/chat.mjs` | Wire digest from `cnEvents` on brief turns |
| `js/app/chat-controller.js` | Hidden flush turn |
| `js/app/app-controller.js` | Flush when overlay closes or Chat section is left |
| `js/app/main.js` | Wire `chatFlushVeraSession` |
| `service-worker.js` | `CACHE_NAME` → `v72` |
| `docs/IMPLEMENTATION_STATUS.md` | Phase 37 |

---

### Task 1: Hammond brief detection + digest helper

**Files:**
- Modify: `netlify/functions/_shared/mind-digest.mjs`
- Test: `tests/unit/mind-digest.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/mind-digest.test.js`:

```js
import {
  isHammondMindBriefTurn,
  hammondDiaryDigestForTurn
} from '../../netlify/functions/_shared/mind-digest.mjs';

test('isHammondMindBriefTurn matches 5e/6b phrases and ignores audits', () => {
  assert.equal(isHammondMindBriefTurn('Hammond, monthly three-way brief'), true);
  assert.equal(isHammondMindBriefTurn('run a quarterly look-back'), true);
  assert.equal(isHammondMindBriefTurn('pattern synthesis please'), true);
  assert.equal(isHammondMindBriefTurn('two-voice retrospective'), true);
  assert.equal(isHammondMindBriefTurn('Hammond, what should I focus on?'), false);
  assert.equal(isHammondMindBriefTurn('monthly audit'), false);
  assert.equal(isHammondMindBriefTurn(''), false);
});

test('hammondDiaryDigestForTurn is empty unless Hammond and a brief phrase', () => {
  const events = [{
    record: {
      type: 'diary', date: '2026-08-10', mood: 'low',
      system_note: 'Weekend collapse'
    },
    body: 'SECRET PROSE'
  }];
  assert.equal(hammondDiaryDigestForTurn({
    slug: 'hammond', message: 'focus today', events, today: TODAY
  }), '');
  const brief = hammondDiaryDigestForTurn({
    slug: 'hammond', message: 'monthly three-way brief', events, today: TODAY
  });
  assert.match(brief, /Weekend collapse/);
  assert.doesNotMatch(brief, /SECRET PROSE/);
  assert.equal(hammondDiaryDigestForTurn({
    slug: 'vera', message: 'monthly three-way brief', events, today: TODAY
  }), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/mind-digest.test.js`  
Expected: FAIL — `isHammondMindBriefTurn` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `mind-digest.mjs`:

```js
const HAMMOND_BRIEF_RE = /retrospective|look-?back|monthly brief|three[- ]way brief|pattern synthesis|\bquarterly\b|two[- ]voice|mind brief/i;

export function isHammondMindBriefTurn(message) {
  if (typeof message !== 'string' || !message.trim()) return false;
  if (/monthly\s+audit/i.test(message) && !HAMMOND_BRIEF_RE.test(message.replace(/monthly\s+audit/gi, ''))) {
    return false;
  }
  return HAMMOND_BRIEF_RE.test(message);
}

export function hammondDiaryDigestForTurn({ slug, message, events, today }) {
  if (slug !== 'hammond') return '';
  if (!isHammondMindBriefTurn(message)) return '';
  return summarizeDiaryForPrompt(events, today);
}
```

Simpler `isHammondMindBriefTurn`: just test `HAMMOND_BRIEF_RE`. `monthly audit` does not match because the pattern is `monthly brief`, not `monthly`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/mind-digest.test.js`  
Expected: PASS

- [ ] **Step 5: Commit** (batch with later tasks unless asked to commit per task)

---

### Task 2: Persona Hammond diary block

**Files:**
- Modify: `netlify/functions/_shared/persona.mjs`
- Test: `tests/unit/persona.test.js`

- [ ] **Step 1: Failing tests**

```js
test('hammond prompt includes hammondDiaryDigest when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    hammondDiaryDigest: 'Diary (metadata only — do not quote prose):\n2026-08-10: mood low'
  });
  assert.match(prompt, /Diary \(metadata only/);
  assert.match(prompt, /mood low/);
});

test('hammond prompt omits diary digest when hammondDiaryDigest is empty', () => {
  const prompt = buildSystemPrompt({ slug: 'hammond', hammondDiaryDigest: '' });
  assert.doesNotMatch(prompt, /Diary \(metadata only/);
});

test('non-hammond prompts never include hammondDiaryDigest', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    hammondDiaryDigest: 'Diary leak'
  });
  assert.doesNotMatch(prompt, /Diary leak/);
});
```

- [ ] **Step 2: Run to verify fail**

`node --test tests/unit/persona.test.js`  
Expected: FAIL — param unused.

- [ ] **Step 3: Implementation**

Add `hammondDiaryDigest = ''` to `buildSystemPrompt` args. In `hammondBlocks`, after `mindSilence`:

```js
hammondDiaryDigest
  ? `Mind diary digest (5e/6b this turn — metadata only, do not quote prose):\n${hammondDiaryDigest}`
  : '',
```

- [ ] **Step 4: Tests pass**

---

### Task 3: chat.mjs wires CN events into Hammond brief digest

**Files:**
- Modify: `netlify/functions/chat.mjs`
- Test: `tests/integration/chat-function.test.js`

- [ ] **Step 1: Failing integration tests**

Add a diary markdown fixture and include it on the Hammond CN tree (same 30-day blob window). Assert:

1. Message `Hammond, monthly three-way brief` → `receivedArgs.system` matches the diary `system_note` and does not match diary body prose.
2. Message `Hammond, what should I focus on?` with the same tree → system does **not** match `Diary (metadata only`.
3. Both turns fetch the same blob URLs (no extra mind-digest slot). Count `git/blobs/` fetches or assert the diary blob is requested once as part of CN entries on both turns.

Reuse the existing Hammond CN GitHub mock pattern around `Hammond registers CN patch...`. Add one `data/mind/2026/08/2026-08-10-diary-2100.md` blob to the tree.

- [ ] **Step 2: Confirm fail** (digest absent)

- [ ] **Step 3: Implementation**

Import `hammondDiaryDigestForTurn`. After `const cnEvents = parseHammondEventDocuments(...)`:

```js
hammondDiaryDigest = hammondDiaryDigestForTurn({
  slug,
  message: parsed.message,
  events: cnEvents,
  today
});
```

Pass `hammondDiaryDigest` into `buildSystemPrompt`. Do not assign it to `mindDiaryDigest`.

- [ ] **Step 4: Tests pass**

---

### Task 4: Leave-flush in chat-controller

**Files:**
- Modify: `js/app/chat-controller.js`
- Test: `tests/unit/chat-controller.test.js`

Export `VERA_SESSION_FLUSH_MESSAGE = "That's enough for today — record the session if there is one."`

Behaviour:

- `send(message, { hiddenUser } = {})`
- `flushVeraSession()` — no-op unless last/pinned agent is Vera, transcript has an assistant entry, and `savedMindSessionThisThread` is false. Sets a one-shot in-flight guard. Calls `send(VERA_SESSION_FLUSH_MESSAGE, { hiddenUser: true })`.
- On `record_saved` with `record.type === 'mind_session'`, set `savedMindSessionThisThread = true`.
- `startNewChat`: abort in-flight if any; wait until `sending` is false; `await flushVeraSession()`; then existing reset; clear `savedMindSessionThisThread`.
- If `shouldFlush` is false, keep `startNewChat` synchronous-reset so existing Penelope tests stay green without awaiting.
- `selectAgent(slug)`: if leaving Vera (`(pinnedAgentSlug || lastAgentSlug) === 'vera' && slug !== 'vera'`), flush then apply pin.

Hidden send: do not append/remember the user line; `setWorkingStatus('Wrapping up…')`; skip audit start; skip `maybeMarkUnread` for this turn; skip empty-turn recovery.

- [ ] **Step 1: Failing tests** (add to `chat-controller.test.js`)

```js
test('New Chat after a Vera reply sends a hidden flush then clears the thread', async () => {
  // selectAgent vera, send a real turn, startNewChat, assert flush message + empty bubbles + no user bubble containing the flush line
});

test('New Chat does not flush Penelope threads', async () => { /* existing new-chat test still: sendCalls.length stays 2 after a later send, no flush line */ });

test('New Chat skips flush after mind_session record_saved this thread', async () => {});

test('New Chat skips flush when Vera was pinned but never replied', async () => {});

test('switching from Vera to Penelope flushes then pins Penelope', async () => {});
```

- [ ] **Step 2: Fail (flush not sent)**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Pass**, including existing `startNewChat` tests

---

### Task 5: Flush when leaving the Chat surface

**Files:**
- Modify: `js/app/app-controller.js`, `js/app/main.js`
- Test: `tests/unit/app-controller.test.js`

- [ ] **Step 1: Failing tests**

Harness: add `chatFlushVeraSession` spy. Assert:

1. Open nutrition overlay, click FAB again (close) → flush called once.
2. Open Chat section, click Home → flush called.
3. Open nutrition overlay, click Chat nav → overlay closes, flush **not** called (still on chat).

- [ ] **Step 2: Fail**
- [ ] **Step 3: Implement**

`showSection(name)`:

```js
const leavingChatSurface = (chatPanel?.isOpen() || currentSection === 'chat') && name !== 'chat';
if (leavingChatSurface) void chatFlushVeraSession?.();
```

`toggleSectionChat`: if already open, `void chatFlushVeraSession?.()` then `close()`.

`main.js`: `chatFlushVeraSession: () => chatController?.flushVeraSession?.()`

- [ ] **Step 4: Pass**

---

### Task 6: Cache bump, status, verify

**Files:**
- Modify: `service-worker.js` (`life-hub-shell-v71` → `life-hub-shell-v72`)
- Modify: `docs/IMPLEMENTATION_STATUS.md` Phase 37

- [ ] Run `npm test && npm run validate:fixtures`
- [ ] Confirm `CACHE_NAME` is `v72`
- [ ] Do not push

---

## Spec coverage

| Spec item | Task |
|---|---|
| 5e/6b regex | 1 |
| Digest from cnEvents, no extra blob | 3 |
| Persona Hammond-only | 2 |
| Hidden close turn | 4 |
| Skip rules | 4 |
| New Chat / switch agent | 4 |
| Leave overlay / Chat section | 5 |
| Nav overlay → Chat no flush | 5 |
| Cache bump | 6 |
