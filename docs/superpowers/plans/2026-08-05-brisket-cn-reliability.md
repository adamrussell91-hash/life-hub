# Brisket + Central Node Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After meal Save, Nutrition/CN always refresh; Brisket food research continues after Food Library save so macros/`log_entry` arrive without re-prompt; CN sync failures warn in chat without failing the meal write.

**Architecture:** Add a force post-write refresh path that aborts in-flight syncs; move `save_food_library_entry` into `executeTools` so anthropic rounds continue; return `centralNodeUpdated` from confirm and surface a chat warning when false.

**Tech Stack:** Vanilla JS PWA, Netlify functions, Anthropic streaming tools, node:test.

**Spec:** `docs/superpowers/specs/2026-08-05-brisket-cn-reliability-design.md`

**Deploy:** Local commits only; do not push unless Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/app-controller.js` | `refresh({ force: true })` — abort active, new sync, always re-render |
| `js/app/main.js` | Wire all `onRecordWritten` → `refresh({ manual: true, force: true })` |
| `tests/unit/app-controller.test.js` | Cover coalesce vs force post-write |
| `netlify/functions/chat.mjs` | Handle food save inside `executeTools`; emit `food_library_saved`; remove duplicate fire-and-forget branch |
| `tests/unit/anthropic-client.test.js` / `tests/integration/chat-function.test.js` | Continuation after food save |
| `netlify/functions/chat-confirm.mjs` | Return `centralNodeUpdated` from sync result |
| `js/app/chat-controller.js` | Warn when confirm reports CN miss |
| `tests/integration/chat-confirm-function.test.js` / unit chat-controller | CN flag + warning |
| `service-worker.js` | Bump shell if client files change |

---

### Task 1: Force post-write refresh

**Files:**
- Modify: `js/app/app-controller.js`
- Modify: `js/app/main.js`
- Test: `tests/unit/app-controller.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/unit/app-controller.test.js`, add a test that:

1. Starts a slow `loadLive` (promise that resolves later with `changed: false` and **old** events).
2. While that refresh is in flight, calls `refresh({ manual: true, force: true })` with a second `loadLive` that resolves with **new** meal events and `changed: false`.
3. Asserts Nutrition (or Home) re-render ran with the **new** data after force completes.
4. Asserts a second concurrent non-force `refresh()` still joins (existing coalesce) when appropriate — optional if harness is awkward; at minimum assert force does not return the first promise identity.

Sketch (adapt to existing `harness()` patterns for `loadLive`, `renderNutrition`, section click):

```js
test('force refresh aborts in-flight sync and re-renders even when changed is false', async () => {
  let loadCount = 0;
  let resolveFirst;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const state = harness({
    loadLive: async () => {
      loadCount += 1;
      if (loadCount === 1) {
        return first.then(() => liveData({
          changed: false,
          freshness: 'confirmed',
          events: []
        }));
      }
      return liveData({
        changed: false,
        freshness: 'confirmed',
        events: [{ record: { type: 'meal', date: '2026-07-30', meal: 'dinner', calories: 900, protein_g: 50, fat_g: 40, sodium_mg: 1, calcium_mg: 1, polyphenol_score: 1 }, body: '', path: 'x', legacy: false }]
      });
    }
  });
  await state.controller.start();
  // navigate to nutrition if harness supports it
  const firstRefresh = state.controller.refresh({ manual: true });
  const forced = state.controller.refresh({ manual: true, force: true });
  assert.notEqual(forced, firstRefresh);
  resolveFirst();
  await forced;
  // Assert section re-rendered / latestResult includes dinner — use harness call counters
});
```

If the harness cannot express abort cleanly, at least assert: when `force: true` and `activeRefresh` exists, a new refresh starts and `performRefresh` re-renders with `changed: false`.

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --test tests/unit/app-controller.test.js`

- [ ] **Step 3: Implement `refresh` force path**

In `js/app/app-controller.js` `refresh(options = {})`:

```js
function refresh(options = {}) {
  if (destroyed) return Promise.resolve();
  const force = options.force === true;
  if (activeRefresh && !force) return activeRefresh;
  if (force && activeRefresh) {
    abortActiveRefresh(new DOMException('Superseded by post-write refresh', 'AbortError'));
    activeRefresh = null;
  }
  // ... existing session/online checks ...
  const manual = options.manual === true;
  // ...
  const refreshPromise = performRefresh({
    signal: abortController.signal,
    version,
    manual,
    force
  }).finally(/* unchanged identity check */);
  activeRefresh = refreshPromise;
  return refreshPromise;
}
```

In `performRefresh`, change the render gate:

```js
if (!rendered || result.changed === true || force === true) {
  // existing renderHome + section re-renders
}
```

Ensure aborted first refresh does not clobber `latestResult` after the force refresh (existing `isCurrentRefresh` / abort checks must hold — verify abort path returns early without writing stale `latestResult`).

- [ ] **Step 4: Wire main.js**

Replace every:

```js
onRecordWritten: () => void controller.refresh({ manual: true })
```

with:

```js
onRecordWritten: () => void controller.refresh({ manual: true, force: true })
```

(chat, body, skincare — all three in `main.js`).

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add js/app/app-controller.js js/app/main.js tests/unit/app-controller.test.js
git commit -m "$(cat <<'EOF'
fix: force post-write refresh so Nutrition and CN redraw after Save

EOF
)"
```

---

### Task 2: Continue anthropic rounds after food library save

**Files:**
- Modify: `netlify/functions/chat.mjs`
- Test: `tests/unit/anthropic-client.test.js` (already covers continuation pattern)
- Test: `tests/integration/chat-function.test.js`

- [ ] **Step 1: Write / extend failing integration test**

Add a test that streams: `save_food_library_entry` tool_call → then a second Anthropic round with text (or `log_entry`). Assert:

1. `executeTools` was invoked for `save_food_library_entry` (spy on anthropic args like existing exercise test).
2. A second Anthropic fetch occurred (continuation).
3. Client receives `food_library_saved` **and** subsequent text / proposal.

Adapt existing `save_food_library_entry writes the cache…` test to use a multi-round mock fetch (mirror `continues the stream after executeTools returns a search result` in `anthropic-client.test.js`).

Also add unit test in `anthropic-client.test.js` if useful — optional when integration covers it.

- [ ] **Step 2: Run — expect FAIL** (food save still fire-and-forget → single round)

- [ ] **Step 3: Implement in `chat.mjs`**

Move save into `executeTools`:

```js
executeTools: async event => {
  if (event.name === 'search_exercise_library') {
    return searchExerciseLibrary(exerciseLibraryEntries, event.input ?? {});
  }
  if (event.name === 'save_food_library_entry') {
    const entry = validateFoodLibraryEntry(event.input);
    if (!entry) {
      return JSON.stringify({ ok: false, error: 'invalid_entry' });
    }
    try {
      foodLibraryEntries = upsertFoodLibraryEntry(foodLibraryEntries, entry, today);
      const result = await client.writeFile({
        path: FOOD_LIBRARY_PATH,
        content: JSON.stringify(foodLibraryEntries, null, 2),
        ...(foodLibrarySha ? { sha: foodLibrarySha } : {}),
        message: `chore(food-library): cache ${entry.name}`
      });
      foodLibrarySha = result.sha;
      send({ type: 'food_library_saved', name: entry.name });
      return JSON.stringify({
        ok: true,
        name: entry.name,
        calories: entry.calories,
        protein_g: entry.protein_g,
        fat_g: entry.fat_g
      });
    } catch {
      return JSON.stringify({ ok: false, error: 'write_failed' });
    }
  }
  return null;
}
```

Remove the `else if (event.type === 'tool_call' && event.name === 'save_food_library_entry')` branch from the `for await` loop (now handled in `executeTools`). Keep `log_entry` / `save_exercise_library_entry` handling as today.

- [ ] **Step 4: Run unit + integration chat tests — expect PASS**

```bash
node --test tests/unit/anthropic-client.test.js tests/integration/chat-function.test.js
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/chat.mjs tests/integration/chat-function.test.js tests/unit/anthropic-client.test.js
git commit -m "$(cat <<'EOF'
fix: continue chat tool rounds after Food Library save

EOF
)"
```

---

### Task 3: Confirm returns `centralNodeUpdated` + chat warning

**Files:**
- Modify: `netlify/functions/chat-confirm.mjs`
- Modify: `js/app/chat-controller.js`
- Test: `tests/integration/chat-confirm-function.test.js`
- Test: `tests/unit/chat-controller.test.js` (or extend confirm handling test)

- [ ] **Step 1: Change `syncCentralNodeAfterLog` to return status**

```js
async function syncCentralNodeAfterLog(client, record, notes) {
  // ... existing resolve/decode/seed ...
  if (entry) {
    content = decodeBlob(await client.readBlob(entry.sha));
    if (content === null) return { updated: false, reason: 'decode_failed' };
    existingSha = entry.sha;
  } else {
    content = loadCentralNodeSeed();
    if (!content) return { updated: false, reason: 'missing_seed' };
    existingSha = undefined;
  }
  // ... applyLog ...
  if (updated === content) return { updated: false, reason: 'unchanged' };
  await client.writeFile({ /* unchanged */ });
  return { updated: true };
}
```

- [ ] **Step 2: Confirm response includes flag**

```js
let centralNodeUpdated = false;
try {
  const cn = await syncCentralNodeAfterLog(client, validation.record, validation.notes);
  centralNodeUpdated = cn?.updated === true;
} catch {
  centralNodeUpdated = false;
}
return jsonResponse(200, {
  ok: true,
  data: {
    path,
    sha: result.sha,
    commitSha: result.commitSha,
    centralNodeUpdated
  }
}, PRIVATE_CACHE);
```

- [ ] **Step 3: Integration tests**

- Existing CN write tests: assert `payload.data.centralNodeUpdated === true`.
- New test: force sync failure (e.g. blob decode returns bad payload / write throws) → confirm still `200` with `centralNodeUpdated: false`.

- [ ] **Step 4: Client warning**

In `chat-controller.js` `confirmProposal`:

```js
const result = await chatApi.confirm({ candidate: toCandidate(edited), slug, overwrite });
proposal.card.replaceChildren(Object.assign(root.createElement('p'), { textContent: 'Saved.' }));
if (result?.centralNodeUpdated === false) {
  showChatError(root, 'Logged, but Central Node didn’t update — try Refresh.');
}
onRecordWritten?.(result);
```

Prefer ephemeral chat error (existing `showChatError` / ephemeral wiring) so it auto-dismisses.

- [ ] **Step 5: Unit test chat-controller** — confirm with `centralNodeUpdated: false` calls error banner with the warning text.

- [ ] **Step 6: Run tests — PASS**

```bash
node --test tests/integration/chat-confirm-function.test.js tests/unit/chat-controller.test.js tests/unit/chat-api.test.js
```

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/chat-confirm.mjs js/app/chat-controller.js tests/integration/chat-confirm-function.test.js tests/unit/chat-controller.test.js
git commit -m "$(cat <<'EOF'
fix: warn when Central Node sync misses after a successful Save

EOF
)"
```

---

### Task 4: SW bump + full verify

**Files:**
- Modify: `service-worker.js` (`life-hub-shell-v32` → `v33` if client JS changed)

- [ ] **Step 1: Bump SW cache name**

- [ ] **Step 2: Run full suites**

```bash
npm test
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64 PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npm run test:browser
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: bump shell cache after Brisket/CN reliability client fixes

EOF
)"
```

---

## Spec coverage

| Spec decision | Task |
|---------------|------|
| Abort + fresh sync + always re-render post-write | 1 |
| Continue rounds after `save_food_library_entry` | 2 |
| CN soft-fail warn; meal still succeeds | 3 |
| SW bump | 4 |

## Out of scope (do not implement)

Sticky Researching UI, unread badge, avatars, layout polish, Chadwick, failing confirm on CN error.
