# Chat UX (Researching, Unread, Avatars) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sticky rotating status bubble while agents work, unread dots on FAB + Chat nav when a turn finishes with chat closed, and larger agent avatars (picker 64 / bubble 52).

**Architecture:** Extend the existing `workingBubble` path in `chat-controller.js` into one sticky status bubble (class + CSS pulse) instead of separate wait bubbles. Add a tiny session unread flag rendered onto FABs/nav via `render-chat.js`, cleared when chat becomes visible. Bump avatar dimensions in CSS + `render-agent-picker.js`.

**Tech Stack:** Vanilla JS PWA, CSS, node:test.

**Spec:** `docs/superpowers/specs/2026-08-05-chat-ux-researching-unread-avatars-design.md`

**Deploy:** Local commits only; do not push unless Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/chat-controller.js` | Sticky status text updates; mark unread when turn ends if chat hidden; export `clearUnread` |
| `js/app/render-chat.js` | `setChatUnread(root, unread)` toggles dots on FABs + Chat nav |
| `js/app/app-controller.js` / `js/app/main.js` | Wire `isChatVisible` + clear unread on overlay open / Chat section |
| `js/app/chat-panel.js` | Optional `onOpen` hook — prefer clearing from app-controller open paths |
| `js/app/render-agent-picker.js` | img width/height 64 / 52 |
| `css/app.css` | Status pulse; unread dot; avatar sizes |
| `tests/unit/chat-controller.test.js` | Status transitions + unread |
| `tests/unit/render-chat.test.js` or extend existing | `setChatUnread` |
| `service-worker.js` | Bump shell `v33` → `v34` |

---

### Task 1: Sticky status bubble

**Files:**
- Modify: `js/app/chat-controller.js`
- Modify: `css/app.css`
- Modify: `js/app/render-chat.js` (helper to set status text/class if cleaner)
- Test: `tests/unit/chat-controller.test.js`

- [ ] **Step 1: Write failing tests**

Extend `tests/unit/chat-controller.test.js`:

```js
test('keeps one sticky status bubble: On it… → Looking that up… → Researching… then clears on text', async () => {
  const root = new FakeDocument();
  let resolveSend;
  const events = (async function* () {
    yield { type: 'agent', slug: 'brisket' };
    yield { type: 'search', query: 'brisket macros' };
    await new Promise(r => { resolveSend = r; });
    yield { type: 'food_library_saved', name: 'Brisket' };
    yield { type: 'text', delta: 'About 40g protein.' };
  })();

  // Pause mid-stream: after search, before library — adapt harness to yield on demand
  // Assert after search: exactly one status-ish assistant bubble with "Looking that up…"
  // Assert after food_library_saved: same bubble (or single status) shows "Researching…"
  // Assert after text: no "On it…", "Looking that up…", or "Researching…" left
});

test('status bubble has chat-message--status class while waiting', async () => {
  // Assert working bubble className includes chat-message--status during On it…
  // Assert class gone after real text replaces it
});
```

Adapt to the existing FakeDocument / fake send harness in that file (see `'shows On it… immediately and clears it when real text arrives'`). Prefer one generator that yields all events; assert intermediate DOM after each awaited microtask if the harness supports stepped sends — otherwise assert final sequence and that search no longer leaves a *second* wait bubble alongside library save.

Minimum assertions that must fail on current code:

1. After `search`, there must **not** be both a removed working path and a separate permanent wait that vanishes before library — today `food_library_saved` clears wait and leaves silence; after fix, a **Researching…** status remains until text.
2. After `food_library_saved` then `text`, no status copy remains.

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test tests/unit/chat-controller.test.js
```

- [ ] **Step 3: Implement sticky status**

In `chat-controller.js` `send()`:

1. When creating `workingBubble`, mark it as status:

```js
workingBubble = appendMessage(root, {
  role: 'assistant',
  agentSlug: assistantSlug,
  text: 'On it…'
});
workingBubble?.classList?.add?.('chat-message--status');
// FakeElement may need className string fallback:
if (workingBubble && !workingBubble.classList) {
  workingBubble.className = `${workingBubble.className} chat-message--status`.trim();
}
```

2. Add helper:

```js
function setWorkingStatus(text) {
  if (!workingBubble) {
    workingBubble = appendMessage(root, {
      role: 'assistant',
      agentSlug: assistantSlug,
      text
    });
  }
  const body = workingBubble.querySelector?.('.chat-message__body') ?? workingBubble;
  if (body) body.textContent = text;
  if (workingBubble.classList?.add) workingBubble.classList.add('chat-message--status');
  else if (workingBubble) {
    workingBubble.className = `${workingBubble.className} chat-message--status`.trim();
  }
  scrollChatToBottom();
}
```

3. On `search`: **do not** `clearWorkingBubble()`. Keep search chip; set status:

```js
} else if (event.type === 'search') {
  endTextTurn();
  appendMessage(root, { role: 'assistant', text: `🔍 Searched the web: ${event.query ?? '…'}` });
  setWorkingStatus('Looking that up…');
  // Remove searchWaitBubble entirely from this function
```

4. On `food_library_saved` / `exercise_library_saved`: keep the library confirmation message, but **set status to Researching…** instead of clearing:

```js
} else if (event.type === 'food_library_saved') {
  endTextTurn();
  appendMessage(root, { role: 'assistant', text: `📚 Saved "${event.name}" to the Food Library for next time.` });
  setWorkingStatus('Researching…');
} else if (event.type === 'exercise_library_saved') {
  endTextTurn();
  appendMessage(root, { role: 'assistant', text: `Saved "${event.name}" to the Exercise Library.` });
  setWorkingStatus('Researching…');
}
```

5. `clearWorkingBubble` still removes the node; `renderLiveText` / proposal / error / `finally` still clear it. Delete all `searchWaitBubble` variables and cleanup.

In `css/app.css` add:

```css
.chat-message--status .chat-message__body {
  opacity: 0.85;
}
@media (prefers-reduced-motion: no-preference) {
  .chat-message--status .chat-message__body {
    animation: chat-status-pulse 1.4s ease-in-out infinite;
  }
}
@keyframes chat-status-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
```

- [ ] **Step 4: Run tests — PASS**

```bash
node --test tests/unit/chat-controller.test.js
```

Update the existing On it… test if it assumed searchWaitBubble behavior.

- [ ] **Step 5: Commit**

```bash
git add js/app/chat-controller.js css/app.css tests/unit/chat-controller.test.js
git commit -m "$(cat <<'EOF'
feat: sticky chat status bubble through research turns

EOF
)"
```

---

### Task 2: Unread dot on FAB + Chat nav

**Files:**
- Modify: `js/app/render-chat.js`
- Modify: `js/app/chat-controller.js`
- Modify: `js/app/app-controller.js`
- Modify: `js/app/main.js` (wire deps)
- Modify: `css/app.css`
- Test: `tests/unit/chat-controller.test.js`
- Test: add or extend `tests/unit/render-chat.test.js` if present; else cover via chat-controller + small render-chat unit file

- [ ] **Step 1: Write failing tests**

```js
// render-chat or chat-controller
test('setChatUnread toggles has-unread on FABs and Chat nav buttons', () => {
  // Fake root with .floating-chat-button and [data-section="chat"]
  setChatUnread(root, true);
  // assert class has-unread / aria-label includes Unread
  setChatUnread(root, false);
  // assert cleared
});

test('marks unread when stream ends while chat is not visible', async () => {
  let visible = false;
  const marked = [];
  createChatController({
    root,
    chatApi: apiThatYieldsTextThenEnds,
    isChatVisible: () => visible,
    onUnreadChange: value => marked.push(value)
  });
  await controller.send('hi');
  assert.deepEqual(marked, [true]);
});

test('does not mark unread when chat is visible', async () => {
  // isChatVisible: () => true → onUnreadChange never true (or not called with true)
});

test('clearUnread notifies false', () => {
  const c = createChatController({ ..., onUnreadChange });
  c.clearUnread();
  // assert onUnreadChange(false) or setChatUnread called false
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`render-chat.js`:

```js
const UNREAD_SELECTOR = '.floating-chat-button, [data-section="chat"]';

export function setChatUnread(root, unread) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll(UNREAD_SELECTOR)) {
    el.classList?.toggle?.('has-unread', Boolean(unread));
    if (!el.classList?.toggle) {
      el.className = unread
        ? `${el.className} has-unread`.trim()
        : el.className.replace(/\bhas-unread\b/g, '').trim();
    }
    if (unread) el.setAttribute?.('data-unread', '1');
    else el.removeAttribute?.('data-unread');
  }
}
```

`css/app.css`:

```css
.floating-chat-button {
  /* existing rules — keep */
  position: relative; /* add if not present */
}
.floating-chat-button.has-unread::after,
[data-section="chat"].has-unread::after {
  content: '';
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #fff;
  pointer-events: none;
}
.nav-item[data-section="chat"],
.mobile-nav [data-section="chat"] {
  position: relative;
}
[data-section="chat"].has-unread::after {
  top: 0.35rem;
  right: 0.35rem;
  border-color: transparent; /* rail may be dark — use solid red without white ring if needed */
}
```

Tune border so the dot stays visible on both light FAB and dark rail — white ring on FAB; on dark nav use `box-shadow: 0 0 0 2px rgba(15,23,42,0.9)` or no border.

`chat-controller.js` — add deps `isChatVisible`, `onUnreadChange` (optional):

```js
export function createChatController({
  ...
  isChatVisible = () => true,
  onUnreadChange
}) {
  ...
  function clearUnread() {
    onUnreadChange?.(false);
  }

  function maybeMarkUnread() {
    if (isChatVisible?.()) return;
    onUnreadChange?.(true);
  }

  // At end of send() try block success path AND catch path (terminal outcomes),
  // after stream finishes — call maybeMarkUnread() once in finally *before* or after clear,
  // but only if the turn produced assistant text, a proposal, or an error banner.
```

Track with a flag:

```js
let turnSignaled = false;
// on text / record_proposal / record_rejected / error / AbortError catch: turnSignaled = true
// in finally: if (turnSignaled) maybeMarkUnread();
```

Return `clearUnread` from the controller API.

`main.js` wiring sketch:

```js
chatController = createChatController({
  ...
  isChatVisible: () => (
    chatPanel.isOpen() || controller.getCurrentSection?.() === 'chat'
  ),
  onUnreadChange: unread => setChatUnread(document, unread)
});
```

Confirm `getCurrentSection` is exported from app-controller (add if missing — many harnesses already expose it).

`app-controller.js` — after successful `chatPanel.open(...)` and when `showSection('chat')`, call `chatClearUnread?.()`:

```js
// createAppController deps:
chatClearUnread,

// in toggleSectionChat after open:
chatClearUnread?.();

// in showSection when name === 'chat':
chatClearUnread?.();

// Mind onOpenAgent open path too
```

Wire `chatClearUnread: () => chatController.clearUnread()` from `main.js` (order: create chatController after controller, or use a let + late bind like existing patterns).

- [ ] **Step 4: Run tests — PASS**

```bash
node --test tests/unit/chat-controller.test.js tests/unit/render-chat.test.js
```

(If no render-chat test file, create `tests/unit/render-chat-unread.test.js` covering `setChatUnread` only.)

- [ ] **Step 5: Commit**

```bash
git add js/app/render-chat.js js/app/chat-controller.js js/app/app-controller.js js/app/main.js css/app.css tests/unit/
git commit -m "$(cat <<'EOF'
feat: unread dots on chat FAB and Chat nav

EOF
)"
```

---

### Task 3: Larger avatars (64 / 52)

**Files:**
- Modify: `js/app/render-agent-picker.js`
- Modify: `css/app.css`
- Test: `tests/unit/render-agent-picker.test.js` (create if missing) or extend an existing unit that builds picker/bubbles

- [ ] **Step 1: Write failing test**

```js
test('picker avatars are 64px and bubble avatars are 52px', () => {
  const root = /* minimal fake with #agent-picker + createElement */;
  renderAgentPicker(root, { selectedSlug: 'brisket', onSelect: () => {} });
  const img = root.querySelector('#agent-picker').children[0].children[0];
  assert.equal(img.width, 64);
  assert.equal(img.height, 64);

  const bubble = root.createElement('li');
  applyAgentAvatarToBubble(bubble, 'brisket');
  const avatar = bubble.querySelector('.chat-message__avatar');
  assert.equal(avatar.width, 52);
  assert.equal(avatar.height, 52);
});
```

- [ ] **Step 2: Run — expect FAIL** (still 48 / 36)

- [ ] **Step 3: Implement**

`render-agent-picker.js`:

```js
img.width = 64;
img.height = 64;
// ...
img.width = 52;
img.height = 52;
```

`css/app.css`:

```css
.agent-picker__avatar {
  width: 4rem;   /* was 3rem */
  height: 4rem;
}
.chat-message__avatar {
  width: 3.25rem;  /* 52px */
  height: 3.25rem;
}
```

- [ ] **Step 4: Run — PASS**

```bash
node --test tests/unit/render-agent-picker.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/app/render-agent-picker.js css/app.css tests/unit/render-agent-picker.test.js
git commit -m "$(cat <<'EOF'
feat: enlarge chat agent avatars in picker and bubbles

EOF
)"
```

---

### Task 4: SW bump + full verify

**Files:**
- Modify: `service-worker.js` (`life-hub-shell-v33` → `v34`)

- [ ] **Step 1: Bump cache name**

```js
const CACHE_NAME = 'life-hub-shell-v34';
```

- [ ] **Step 2: Full suites**

```bash
npm test
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64 PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npm run test:browser
```

Expected: all pass. Browser suite may need unsandboxed permissions in agent environments.

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: bump shell cache after Chat UX polish

EOF
)"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Sticky On it… / Looking that up… / Researching… + pulse | 1 |
| Clear status on text / proposal / error | 1 |
| Unread dot FAB + Chat nav; set on turn end if hidden | 2 |
| Clear on open / Chat section | 2 |
| Avatars 64 / 52 | 3 |
| SW bump | 4 |

## Out of scope

FAB face swap, numeric badge, composer status bar, server tool-round changes.
