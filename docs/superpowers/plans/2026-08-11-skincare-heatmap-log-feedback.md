# Skincare Heatmap Contrast + Log Button Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AM / PM / both heatmap tiles visually distinct, and give Log buttons immediate press + **Logging…** feedback before save settles.

**Architecture:** CSS-only remapping of existing `data-skincare-state` heatmap tiles (light purple AM, dark purple PM, dark purple + gold inset ring for both). Controller `onLogRoutine` / `onLogProcedure` return the `save()` promise; render click handlers await it, set button pending/disabled/**Logging…**, and restore the prior label on failure.

**Tech Stack:** Vanilla JS PWA, CSS in `css/app.css`, `node:test` unit tests.

**Spec:** `docs/superpowers/specs/2026-08-11-skincare-heatmap-log-feedback-design.md`

**Deploy:** Local commits only until Adam asks to push.

---

## File map

| File | Responsibility |
|------|----------------|
| `css/app.css` | Heatmap + legend colors; `.skincare-done:disabled` dim |
| `js/app/skincare-controller.js` | Return `save()` promise from log handlers (drop `void`) |
| `js/app/render-skincare.js` | Await log callbacks; pending **Logging…** / restore on failure |
| `tests/unit/render-skincare.test.js` | Pending + failure restore; FakeElement `disabled` |
| `tests/unit/skincare-controller.test.js` | Assert log handlers return the save promise |
| `service-worker.js` | Bump `life-hub-shell-v59` → `v60` |

No model / API / HTML structure changes. Legend markup in `index.html` already uses `data-state="am|pm|both|miss"`.

### Locked colors

| State | Fill | Border |
|-------|------|--------|
| miss | `rgba(185, 158, 224, 0.12)` (unchanged) | none |
| am | `#F3E9F8` | none |
| pm | `#4E3478` | none |
| both | `#4E3478` | inset gold ring `#C9A24A` (~2px) |

Today’s outer ring stays; for `both` + today combine inset gold + existing outer today glow.

---

### Task 1: Heatmap CSS contrast + legend

**Files:**
- Modify: `css/app.css` (approx lines 1154–1182, and `.skincare-done` ~1385)

- [ ] **Step 1: Replace skincare heatmap tile + legend fills**

Find the block:

```css
.skincare-heatmap .heatmap-tile { background: rgba(185, 158, 224, 0.12); transition: background 220ms ease; }
.skincare-heatmap .heatmap-tile[data-skincare-state="am"] { background: #E7CFEF; }
.skincare-heatmap .heatmap-tile[data-skincare-state="pm"] { background: #8F6FB8; }
.skincare-heatmap .heatmap-tile[data-skincare-state="both"] { background: #B99EE0; }
.skincare-heatmap .heatmap-tile[data-today="true"] { box-shadow: 0 0 0 2px rgba(185, 158, 224, 0.55); }
```

Replace with:

```css
.skincare-heatmap .heatmap-tile { background: rgba(185, 158, 224, 0.12); transition: background 220ms ease, box-shadow 220ms ease; }
.skincare-heatmap .heatmap-tile[data-skincare-state="am"] { background: #F3E9F8; }
.skincare-heatmap .heatmap-tile[data-skincare-state="pm"] { background: #4E3478; }
.skincare-heatmap .heatmap-tile[data-skincare-state="both"] {
  background: #4E3478;
  box-shadow: inset 0 0 0 2px #C9A24A;
}
.skincare-heatmap .heatmap-tile[data-today="true"] { box-shadow: 0 0 0 2px rgba(185, 158, 224, 0.55); }
.skincare-heatmap .heatmap-tile[data-skincare-state="both"][data-today="true"] {
  box-shadow: inset 0 0 0 2px #C9A24A, 0 0 0 2px rgba(185, 158, 224, 0.55);
}
```

Update legend swatches to match:

```css
.skincare-heatmap-legend li[data-state="am"]::before { background: #F3E9F8; }
.skincare-heatmap-legend li[data-state="pm"]::before { background: #4E3478; }
.skincare-heatmap-legend li[data-state="both"]::before {
  background: #4E3478;
  box-shadow: inset 0 0 0 2px #C9A24A;
}
```

Add disabled dim for log buttons (same file, after `.skincare-done` block):

```css
.skincare-done:disabled {
  opacity: 0.72;
  cursor: wait;
}
```

Keep brand `#B99EE0` on cards/chips/now-chip unchanged.

- [ ] **Step 2: Visual sanity (optional local)**

Open Skincare in the app if running; confirm legend AM / PM / Both read as light / dark / dark+gold. No automated CSS color assert required.

- [ ] **Step 3: Commit**

```bash
git add css/app.css
git commit -m "$(cat <<'EOF'
fix(skincare): increase AM/PM heatmap contrast with gold both ring

EOF
)"
```

---

### Task 2: Controller returns save promise from log handlers

**Files:**
- Modify: `js/app/skincare-controller.js` (return object ~123–131)
- Test: `tests/unit/skincare-controller.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/skincare-controller.test.js`:

```js
test('onLogRoutine returns the save promise so callers can await settle', async () => {
  const root = createRoot();
  let resolveConfirm;
  const confirmPromise = new Promise(resolve => { resolveConfirm = resolve; });
  const written = [];
  const controller = createSkincareController({
    root,
    chatApi: {
      confirm() {
        return confirmPromise;
      }
    },
    skincareApi: {},
    onRecordWritten: value => written.push(value),
    isOnline: () => true
  });

  const pending = controller.onLogRoutine({
    payload: {
      candidate: { type: 'skincare', date: '2026-08-11', routine: 'am', products: ['Serum'] },
      slug: 'am',
      overwrite: true
    }
  });

  assert.equal(typeof pending?.then, 'function', 'onLogRoutine must return a thenable');
  assert.equal(root.status.textContent, 'Saving…');
  assert.equal(written.length, 0);

  resolveConfirm({ ok: true });
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(written.length, 1);
  assert.equal(root.status.textContent, 'Logged ✨');
});

test('onLogProcedure returns the save promise', async () => {
  const root = createRoot();
  const controller = createSkincareController({
    root,
    chatApi: {
      async confirm() {
        return { ok: true };
      }
    },
    skincareApi: {},
    isOnline: () => true
  });

  const result = await controller.onLogProcedure({
    payload: {
      candidate: { type: 'skincare', date: '2026-08-11', routine: 'pm', products: ['Laser'] },
      overwrite: true
    }
  });
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/unit/skincare-controller.test.js
```

Expected: FAIL — `onLogRoutine must return a thenable` (current handlers use `void save(payload)` and return `undefined`).

- [ ] **Step 3: Minimal implementation**

In `js/app/skincare-controller.js`, change the return handlers from:

```js
onLogRoutine: ({ payload }) => void save(payload),
onLogProcedure: ({ payload }) => void save(payload),
```

to:

```js
onLogRoutine: ({ payload }) => save(payload),
onLogProcedure: ({ payload }) => save(payload),
```

Do not change `save()` itself.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/unit/skincare-controller.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/skincare-controller.js tests/unit/skincare-controller.test.js
git commit -m "$(cat <<'EOF'
fix(skincare): return save promise from log handlers for awaitable UI

EOF
)"
```

---

### Task 3: Log button pending state (Logging…)

**Files:**
- Modify: `js/app/render-skincare.js` (routine done click ~512–536; procedure button ~559–577)
- Test: `tests/unit/render-skincare.test.js` (`FakeElement` + new tests)

- [ ] **Step 1: Extend FakeElement for `disabled`**

In `tests/unit/render-skincare.test.js`, add to `FakeElement` constructor:

```js
this.disabled = false;
```

And in `setAttribute` / property usage, ensure tests can set `button.disabled = true` as a plain field (constructor default is enough for reads/writes).

- [ ] **Step 2: Write failing pending-state tests**

Append:

```js
test('Log button shows Logging… and disables until onLogRoutine settles', async () => {
  const root = fakeSkincareRoot();
  let resolveLog;
  const logPromise = new Promise(resolve => { resolveLog = resolve; });
  renderSkincare(root, baseModel({ amLogged: false }), {
    onLogRoutine: () => logPromise
  });

  const amCard = root._routineCards.children[0];
  const done = descendants(amCard).find(control => control.className === 'skincare-done');
  assert.equal(done.textContent, 'Log');

  const clickResult = done.click();
  assert.equal(done.textContent, 'Logging…');
  assert.equal(done.disabled, true);

  resolveLog({ ok: true });
  await clickResult;
  // Button stays pending until a full re-render; do not assert Log again here.
  assert.equal(done.textContent, 'Logging…');
  assert.equal(done.disabled, true);
});

test('Log button restores prior label when onLogRoutine rejects', async () => {
  const root = fakeSkincareRoot();
  renderSkincare(root, baseModel({ pmLogged: true }), {
    onLogRoutine: async () => {
      throw new Error('offline');
    }
  });

  const pmCard = root._routineCards.children[1];
  const done = descendants(pmCard).find(control => control.className === 'skincare-done');
  assert.equal(done.textContent, 'Log again');

  await done.click();
  assert.equal(done.textContent, 'Log again');
  assert.equal(done.disabled, false);
});

test('procedure Log button shows Logging… until onLogProcedure settles', async () => {
  const root = fakeSkincareRoot();
  let resolveLog;
  const logPromise = new Promise(resolve => { resolveLog = resolve; });
  renderSkincare(root, baseModel(), {
    onLogProcedure: () => logPromise
  });

  const button = descendants(root._procedureCard).find(control =>
    control.className === 'skincare-done' && control.textContent === 'Log procedure'
  );
  assert.ok(button);

  const clickResult = button.click();
  assert.equal(button.textContent, 'Logging…');
  assert.equal(button.disabled, true);

  resolveLog({ ok: true });
  await clickResult;
});
```

`fakeSkincareRoot` already exposes `_procedureCard` for `#skincare-procedure`.

**FakeElement `click` must return the handler’s return value** so `await done.click()` works. Update `FakeElement.click`:

```js
click(event = {}) {
  let last;
  for (const handler of this._listeners.click ?? []) {
    last = handler({ stopPropagation: () => {}, ...event, target: this, currentTarget: this });
  }
  return last;
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
node --test tests/unit/render-skincare.test.js
```

Expected: FAIL — button text stays `Log` / `Log again` / `Log procedure` (no pending state yet).

- [ ] **Step 4: Implement pending handlers in render-skincare.js**

Replace the routine `done` click listener with an async handler:

```js
done.addEventListener('click', async () => {
  if (done.disabled) return;
  const priorLabel = done.textContent;
  done.disabled = true;
  done.textContent = 'Logging…';
  const products = buildProductList(key, {
    choiceSelections: state.choices,
    enabledProducts: [...state.enabled],
    extras: [...state.extras],
    activeProducts: routine.products,
    oneOffs: state.oneOffs
  });
  try {
    await onLogRoutine?.({
      routine: key,
      products,
      notes: state.notes,
      payload: toSkincareConfirmPayload({
        date: model.date,
        routine: key,
        products,
        notes: state.notes,
        slug: key
      })
    });
  } catch {
    done.textContent = priorLabel;
    done.disabled = false;
  }
});
```

Procedure button:

```js
button.addEventListener('click', async () => {
  if (button.disabled) return;
  const priorLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Logging…';
  const procedureTitle = name.value.trim() || 'procedure';
  const routine = model.currentRoutine === 'am' ? 'am' : 'pm';
  try {
    await onLogProcedure?.({
      payload: toSkincareConfirmPayload({
        date: model.date,
        routine,
        products: [procedureTitle],
        notes: notes.value.trim(),
        procedureTitle,
        slug: undefined
      })
    });
  } catch {
    button.textContent = priorLabel;
    button.disabled = false;
  }
});
```

**Important:** `save()` in the controller catches errors internally and does **not** rethrow — it sets status to `Couldn’t save — try again.` and returns `undefined`. For failure restore to work, either:

1. **Preferred for this plan:** Change `save()` to rethrow after setting the error status (so await rejects), **or**
2. Have `save()` return `{ ok: false }` on failure and have the render handler treat non-ok / undefined-after-online-attempt as failure.

Implement option 1 minimally inside `save()`:

```js
} catch (error) {
  setStatus('Couldn’t save — try again.');
  throw error;
}
```

Also treat offline early-return as failure for the button: either throw a small `Error('offline')` after `setStatus('Connect to log skincare.')`, or return a rejected promise. Prefer:

```js
if (!isOnline()) {
  setStatus('Connect to log skincare.');
  throw new Error('offline');
}
```

Update any controller tests that expect `save` / log helpers to swallow errors — they should now reject; wrap with `await assert.rejects(...)` only if such tests exist. Existing shelf tests are unaffected.

Add a controller test that failed confirm rejects:

```js
test('save rejects after status error so UI can restore the Log button', async () => {
  const root = createRoot();
  const controller = createSkincareController({
    root,
    chatApi: {
      async confirm() {
        throw new Error('network');
      }
    },
    skincareApi: {},
    isOnline: () => true
  });

  await assert.rejects(
    () => controller.save({
      candidate: { type: 'skincare', date: '2026-08-11', routine: 'am', products: [] },
      slug: 'am',
      overwrite: true
    }),
    /network/
  );
  assert.equal(root.status.textContent, 'Couldn’t save — try again.');
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/unit/render-skincare.test.js tests/unit/skincare-controller.test.js
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/app/render-skincare.js js/app/skincare-controller.js tests/unit/render-skincare.test.js tests/unit/skincare-controller.test.js
git commit -m "$(cat <<'EOF'
fix(skincare): show Logging… on Log buttons until save settles

EOF
)"
```

---

### Task 4: Cache bump + full verify

**Files:**
- Modify: `service-worker.js` line 1 (`life-hub-shell-v59` → `life-hub-shell-v60`)

- [ ] **Step 1: Bump cache**

```js
const CACHE_NAME = 'life-hub-shell-v60';
```

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: bump shell cache for skincare heatmap and log feedback

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| AM light purple / PM dark purple | Task 1 |
| Both = dark purple + gold ring | Task 1 |
| Legend matches | Task 1 |
| Brand `#B99EE0` unchanged on cards | Task 1 (explicit non-touch) |
| Press animation kept (global `:active`) | No change needed |
| **Logging…** + disabled + dim | Tasks 1 + 3 |
| Await save; restore on failure | Tasks 2 + 3 (`save` rethrows) |
| Procedure button included | Task 3 |
| SW cache bump + `npm test` | Task 4 |
| No model/API changes | File map |

---

## Manual check (after local deploy / refresh)

1. Heatmap: AM-only days look light; PM-only dark; both dark with gold inset; miss stays faint.
2. Tap **Log**: immediate press + **Logging…**; after success, card re-renders as **Log again**.
3. Force a failure (offline): button returns to **Log** / **Log again**, status shows connect/error text.
