# Progress share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher-made private link, viewer initials and a one-off PIN give a pastoral teacher or parent a read-only page of one student's progress (next up, timed tick record with burst flags, practice, organiser, countdowns, feedback counts, unit bar), locked lesson pages, and a first-visit explainer tour that shrinks into a Help button.

**Architecture:** Server side, a new `progress-share.mjs` owns links, PINs and devices, and `progress-share-page.mjs` builds an allowlisted payload by reusing the student progress helpers (`unitState`, `todoFor`, `organiserHabits`) plus a new append-only tick record in `profile-done.mjs`. Two Netlify functions expose it: a public `/api/published/share/:token` and an operator `/api/classes/:id/shares`. Front end: new `/s/share/:token` and `/s/share/:token/lessons/:lessonId` student routes, a generic `app/tour.ts`, and a Progress share panel in the class student list.

**Tech Stack:** Node ESM Netlify functions with `node:test` unit tests (`tests/unit/*.test.js`). Vite + TypeScript SPA with vitest/happy-dom (`apps/teaching/tests/unit/*.test.ts`). Standalone Playwright browser scripts (`tests/browser/*.spec.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-15-progress-share-design.md`

**Privacy (mandatory):** all fixtures use invented students ("Ana Ames", "Ben Bolt") and viewer initials ("PT", "MA"). Never a real name, in code, tests, commits or PR text.

---

## File map

| File | Status | Job |
|---|---|---|
| `netlify/functions/_shared/profile-done.mjs` | modify | Append-only tick record: `appendTickEvent`, `listTickRecords`; `recordDone`/`undoTick` write events |
| `netlify/functions/_shared/organiser.mjs` | modify | `organiserHabits` returns `days` (last 28) |
| `netlify/functions/_shared/profile.mjs` | modify | Export `unitState` |
| `netlify/functions/_shared/progress-share.mjs` | create | Tokens, PINs, sign-in, devices, teacher actions |
| `netlify/functions/_shared/progress-share-page.mjs` | create | `burstsOf`, `tickRows`, `plannedDates`, `buildSharePage`, `shareAction` |
| `netlify/functions/published-progress-share.mjs` | create | Public route |
| `netlify/functions/class-progress-share.mjs` | create | Operator route |
| `netlify/functions/_shared/public-student-routes.mjs` | modify | Allow `/api/published/share/<token>` |
| `apps/teaching/src/student/share-api.ts` | create | Types and calls |
| `apps/teaching/src/student/share-format.ts` | create | Sydney time formatting, burst label |
| `apps/teaching/src/student/share-view.ts` + `share-view.css` | create | Sign-in form, page render, mount |
| `apps/teaching/src/student/share-lesson.ts` | create | Locked lesson view |
| `apps/teaching/src/app/tour.ts` + `tour.css` | create | Generic explainer tour with shrink-to-Help |
| `apps/teaching/src/app/router.ts`, `class-site.ts`, `main.ts` | modify | Two routes |
| `apps/teaching/src/teacher/sections/progress-share-panel.ts` | create | Teacher panel |
| `apps/teaching/src/teacher/sections/class-students.ts` | modify | Progress share button per row |
| `tests/unit/tick-record.test.js`, `progress-share.test.js`, `progress-share-page.test.js` | create | Server tests |
| `apps/teaching/tests/unit/share-view.test.ts`, `share-lesson.test.ts`, `tour.test.ts`, `progress-share-panel.test.ts` | create | Front-end tests |
| `tests/browser/progress-share.spec.mjs` | create | End-to-end at desktop and 390px |

## Setup (once)

```bash
cd /home/user/life-hub && npm ci && (cd apps/teaching && npm ci)
```

Server tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
Front-end tests: `cd apps/teaching && npx vitest run tests/unit/<file>.test.ts`

The in-memory store used by every server test (copy into each test file; it matches `tests/unit/profile-todo.test.js`):

```js
function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
```

---

### Task 1: Tick record

**Files:**
- Modify: `netlify/functions/_shared/profile-done.mjs` (top keys block; `recordDone` at ~line 44; `undoTick` at ~line 61)
- Test: `tests/unit/tick-record.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTickEvent, listTickRecords, recordDone, undoTick, TICK_RECORD_MAX } from '../../netlify/functions/_shared/profile-done.mjs';

// storeFixture from the Setup section goes here.

const kinds = (events) => events.map((e) => e.kind);

test('tick, untick, tick keeps three events in order', async () => {
  const store = storeFixture();
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  await undoTick(store, 'class1', 'st_a', 'l1');
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  const records = await listTickRecords(store, 'class1', 'st_a');
  assert.deepEqual(kinds(records.l1), ['tick', 'untick', 'tick']);
  assert.ok(records.l1[0].at <= records.l1[2].at);
});

test('a repeat tick on a ticked lesson adds nothing', async () => {
  const store = storeFixture();
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  assert.deepEqual(kinds((await listTickRecords(store, 'class1', 'st_a')).l1), ['tick']);
});

test('a quiz submission is recorded as quiz', async () => {
  const store = storeFixture();
  await recordDone(store, 'class1', 'st_a', 'l2', 'quiz');
  assert.deepEqual(kinds((await listTickRecords(store, 'class1', 'st_a')).l2), ['quiz']);
});

test('an untick with nothing ticked adds nothing', async () => {
  const store = storeFixture();
  await undoTick(store, 'class1', 'st_a', 'l1');
  assert.deepEqual(await listTickRecords(store, 'class1', 'st_a'), {});
});

test('the record caps at TICK_RECORD_MAX and keeps the first event', async () => {
  const store = storeFixture();
  for (let i = 0; i < TICK_RECORD_MAX + 5; i += 1) await appendTickEvent(store, 'class1', 'st_a', 'l1', i % 2 ? 'untick' : 'tick', new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString());
  const events = (await listTickRecords(store, 'class1', 'st_a')).l1;
  assert.equal(events.length, TICK_RECORD_MAX);
  assert.equal(events[0].at, '2026-11-01T00:00:00.000Z');
  assert.equal(events.at(-1).at, new Date(Date.UTC(2026, 10, 1, 0, TICK_RECORD_MAX + 4)).toISOString());
});

test('a failing record write leaves the tick in place', async () => {
  const store = storeFixture();
  const setJSON = store.setJSON.bind(store);
  store.setJSON = async (key, value, options) => {
    if (key.includes('/ticks/')) throw new Error('store down');
    return setJSON(key, value, options);
  };
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  assert.equal(store.data.get('profile/class1/st_a/done/l1').via, 'tick');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/tick-record.test.js`
Expected: FAIL, `appendTickEvent` is not exported.

- [ ] **Step 3: Implement**

In `profile-done.mjs`, under the existing `marksKey` line, add:

```js
const ticksKey = (classId, studentId, lessonId) => `profile/${classId}/${studentId}/ticks/${lessonId}`;
const ticksPrefix = (classId, studentId) => `profile/${classId}/${studentId}/ticks/`;

/** Events kept per lesson. Past this the oldest go, except the very first. */
export const TICK_RECORD_MAX = 50;

/**
 * Adds one event to a lesson's tick record (`tick`, `untick` or `quiz`). The record is only ever
 * read by a Progress share page. It never throws: the tick itself must stand even if this fails.
 */
export async function appendTickEvent(store, classId, studentId, lessonId, kind, at = new Date().toISOString()) {
  const key = ticksKey(classId, studentId, lessonId);
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = store.getWithMetadata ? await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }) : null;
      const held = row ? row.data : store.getWithMetadata ? null : await read(store, key);
      const events = Array.isArray(held?.events) ? held.events : [];
      const next = [...events, { at, kind }];
      const kept = next.length > TICK_RECORD_MAX ? [next[0], ...next.slice(-(TICK_RECORD_MAX - 1))] : next;
      const options = row ? { onlyIfMatch: row.etag } : store.getWithMetadata ? { onlyIfNew: true } : undefined;
      const written = await store.setJSON(key, { events: kept }, options);
      if (written?.modified !== false) return true;
    }
  } catch (e) {
    console.warn('tick record not written', e?.message ?? e);
  }
  return false;
}

/** Every lesson's tick record for one student: { [lessonId]: [{ at, kind }] }. */
export async function listTickRecords(store, classId, studentId) {
  const prefix = ticksPrefix(classId, studentId);
  const out = {};
  await mapBounded(await listBlobKeys(store, prefix), 8, async (key) => {
    const held = await read(store, key);
    if (Array.isArray(held?.events)) out[key.slice(prefix.length)] = held.events.filter((e) => e && typeof e.at === 'string' && typeof e.kind === 'string');
  });
  return out;
}
```

Replace `recordDone` and `undoTick` with:

```js
export async function recordDone(store, classId, studentId, lessonId, via) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  const key = doneKey(classId, studentId, lessonId);
  const record = { at: new Date().toISOString(), via };
  const note = () => appendTickEvent(store, classId, studentId, lessonId, via, record.at);
  const written = await store.setJSON(key, record, { onlyIfNew: true });
  if (written?.modified !== false) {
    await note();
    return;
  }
  const held = await read(store, key);
  // A teacher's "partial" mark yields to the student's own tick.
  if (held?.partial) {
    await store.setJSON(key, record);
    await note();
  }
  // Under a teacher's "complete" override, keep the tick so clearing the override brings it back.
  else if (held?.via === 'teacher' && !held.was) {
    await store.setJSON(key, { ...held, was: record });
    await note();
  }
}

export async function undoTick(store, classId, studentId, lessonId) {
  if (!isSafeId(lessonId)) reject(400, 'bad_request', 'Unknown lesson.');
  const key = doneKey(classId, studentId, lessonId);
  const held = await read(store, key);
  if (held?.via === 'tick') {
    await deleteKey(store, key);
    await appendTickEvent(store, classId, studentId, lessonId, 'untick');
  } else if (held?.via === 'teacher' && held.was) {
    const { was: _was, ...rest } = held;
    await store.setJSON(key, rest);
    await appendTickEvent(store, classId, studentId, lessonId, 'untick');
  }
}
```

`mapBounded` is already exported by `./blobs-list.mjs`. Extend the existing import: `import { listBlobKeys, mapBounded } from './blobs-list.mjs';`

- [ ] **Step 4: Run the new test and the existing profile tests**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/tick-record.test.js tests/unit/profile.test.js tests/unit/profile-todo.test.js`
Expected: all PASS. The student's own payloads are unchanged: nothing they read lists `ticks/`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/profile-done.mjs tests/unit/tick-record.test.js
git commit -m "Profile: keep a record of every tick and untick"
```

---

### Task 2: Practice days for the grid

**Files:**
- Modify: `netlify/functions/_shared/organiser.mjs:269-295` (`organiserHabits`)
- Test: create `tests/unit/organiser-habits-days.test.js`

- [ ] **Step 1: Write the failing test** (`tests/unit/organiser-habits-days.test.js`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { organiserHabits } from '../../netlify/functions/_shared/organiser.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';

// storeFixture from the Setup section goes here.

test('habits list the practice days of the last 28, sorted', async () => {
  const owner = workOwner('class1', 'st_a');
  const store = storeFixture([[`organiser_practice/class1/${owner}`, { boxes: {
    a: { box: 2, last: '2026-11-14', h: [{ d: '2026-11-14', ok: true }, { d: '2026-11-10', ok: false }, { d: '2026-09-01', ok: true }] },
    b: { box: 1, h: [{ d: '2026-11-12', ok: true }] }
  } }]]);
  const habits = await organiserHabits(store, 'class1', 'st_a', { now: new Date('2026-11-15T01:00:00Z') });
  assert.deepEqual(habits.days, ['2026-11-10', '2026-11-12', '2026-11-14']);
});
```

- [ ] **Step 2: Run, expect FAIL** (`habits.days` is undefined)

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/organiser-habits-days.test.js`

- [ ] **Step 3: Implement.** In `organiserHabits`, replace the `return { ... }` with:

```js
  const today = sydneyDay(now);
  const since = addDays(today, -27);
  return {
    streak: streakOf(days, today),
    avg_box: boxed ? Math.round((boxSum / boxed) * 10) / 10 : null,
    weekly: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week_start, w]) => ({ week_start, ...w })),
    days: [...days].filter((d) => d >= since && d <= today).sort()
  };
```

- [ ] **Step 4: Run it plus the Over time tests, expect PASS**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/organiser-habits-days.test.js tests/unit/organiser.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/organiser.mjs tests/unit/organiser-habits-days.test.js
git commit -m "Organiser habits: list the last 28 practice days"
```

---

### Task 3: Links, PINs and sign-in

**Files:**
- Create: `netlify/functions/_shared/progress-share.mjs`
- Test: `tests/unit/progress-share.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { openShare, signIn, signOut, deviceIn, teacherShareAction, SHARE_TRIES_PER_DAY, SHARE_MAX_DEVICES } from '../../netlify/functions/_shared/progress-share.mjs';

// storeFixture from the Setup section goes here.

const DEVICE = 'a'.repeat(48);
const NOW = new Date('2026-11-15T01:00:00Z');
const device = (n) => n.toString(16).padStart(48, '0');

async function setup() {
  const store = storeFixture([['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }] }]]);
  const roster = await loadRoster(store, 'class1');
  const [ana] = roster.students;
  const made = await teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: 'p.t' }, { now: NOW });
  const share = made.shares.find((s) => s.token === made.made);
  return { store, ana, token: share.token, pin: share.pin };
}

test('add makes a 24-character token and a 6-digit PIN; only the hash is checked', async () => {
  const { store, token, pin } = await setup();
  assert.match(token, /^[A-Za-z0-9_-]{24}$/);
  assert.match(pin, /^\d{6}$/);
  const held = store.data.get(`progress_share/${token}`);
  assert.equal(held.initials, 'PT');
  assert.match(held.pin_hash, /^[a-f0-9]{64}$/);
});

test('initials and PIN sign in once; the PIN is then spent', async () => {
  const { store, token, pin } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'pt', pin }, { now: NOW });
  const held = store.data.get(`progress_share/${token}`);
  assert.equal(held.pin_hash, undefined);
  assert.equal(held.pin_plain, undefined);
  assert.ok(deviceIn(held, DEVICE));
  await assert.rejects(signIn(store, token, { device_token: device(2), initials: 'PT', pin }, { now: NOW }), { code: 'pin_used' });
});

test('wrong initials and wrong PIN get the same reply and share one cap', async () => {
  const { store, token, pin } = await setup();
  const wrongPin = pin === '000000' ? '111111' : '000000';
  const a = await signIn(store, token, { device_token: DEVICE, initials: 'XX', pin }, { now: NOW }).catch((e) => e);
  const b = await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin: wrongPin }, { now: NOW }).catch((e) => e);
  assert.equal(a.code, 'wrong');
  assert.equal(a.message, b.message);
  for (let i = 2; i < SHARE_TRIES_PER_DAY; i += 1) await signIn(store, token, { device_token: DEVICE, initials: 'XX', pin }, { now: NOW }).catch(() => {});
  await assert.rejects(signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW }), { code: 'too_many_tries' });
});

test('new PIN replaces an unused one and keeps browsers already in', async () => {
  const { store, token, pin, ana } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW });
  const reply = await teacherShareAction(store, 'class1', { action: 'new_pin', token }, { now: NOW });
  const fresh = reply.shares.find((s) => s.token === token).pin;
  assert.match(fresh, /^\d{6}$/);
  assert.ok(deviceIn(store.data.get(`progress_share/${token}`), DEVICE));
  await signIn(store, token, { device_token: device(2), initials: 'PT', pin: fresh }, { now: NOW });
  assert.equal(store.data.get(`progress_share/${token}`).devices.length, 2);
  assert.equal(reply.shares[0].student_id, ana.id);
});

test('remove makes the link 404 for a browser already in', async () => {
  const { store, token, pin } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW });
  await teacherShareAction(store, 'class1', { action: 'remove', token });
  await assert.rejects(openShare(store, token), { code: 'not_found' });
});

test('unknown and malformed tokens 404 alike', async () => {
  const { store } = await setup();
  await assert.rejects(openShare(store, 'A'.repeat(24)), { code: 'not_found', message: 'This link doesn’t work any more.' });
  await assert.rejects(openShare(store, '../x'), { code: 'not_found', message: 'This link doesn’t work any more.' });
});

test('a seventh browser drops the oldest', async () => {
  const { store, token } = await setup();
  for (let i = 1; i <= SHARE_MAX_DEVICES + 1; i += 1) {
    const reply = await teacherShareAction(store, 'class1', { action: 'new_pin', token }, { now: NOW });
    await signIn(store, token, { device_token: device(i), initials: 'PT', pin: reply.shares.find((s) => s.token === token).pin }, { now: NOW });
  }
  const held = store.data.get(`progress_share/${token}`);
  assert.equal(held.devices.length, SHARE_MAX_DEVICES);
  assert.equal(deviceIn(held, device(1)), false);
});

test('sign out forgets only this browser', async () => {
  const { store, token, pin } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW });
  await signOut(store, token, DEVICE);
  assert.equal(deviceIn(store.data.get(`progress_share/${token}`), DEVICE), false);
});

test('a share for a student no longer on the list 404s', async () => {
  const { store, token } = await setup();
  const cls = store.data.get('classes/class1');
  store.data.set('classes/class1', { ...cls, students: [{ name: 'Ben Bolt' }] });
  await assert.rejects(openShare(store, token), { code: 'not_found' });
});

test('teacher add refuses bad initials and unknown students', async () => {
  const { store, ana } = await setup();
  await assert.rejects(teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: '' }), { code: 'bad_request' });
  await assert.rejects(teacherShareAction(store, 'class1', { action: 'add', student_id: 'st_nobody', initials: 'PT' }), { code: 'bad_request' });
});
```

- [ ] **Step 2: Run, expect FAIL** (module not found)

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/progress-share.test.js`

- [ ] **Step 3: Implement** `netlify/functions/_shared/progress-share.mjs`:

```js
/**
 * Progress share: a read-only link to one student's progress for one adult (a pastoral
 * teacher, a parent). The link alone reaches nothing: the viewer types their initials and a
 * one-off PIN once per browser, then the browser is remembered.
 *
 *   progress_share/{token}                   { class_id, student_id, initials, pin_hash?, pin_plain?, pin_made_at, pin_used_at?, devices, made_at, opened_at? }
 *   progress_share_by_class/{class}/{token}  { student_id, initials, made_at }
 *   progress_share_tries/{day}/{token}       { count }
 *
 * `pin_plain` lets the teacher's panel show an unused PIN again; it goes the moment the PIN is
 * used or replaced. Devices are hashes of a browser token (deviceHash), never the token.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { deviceHash, read, reject, validToken } from './question-drop.mjs';
import { deleteKey } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { loadRoster } from './class-claims.mjs';
import { INITIALS_PATTERN, normaliseInitials, STUDENT_ID_PATTERN } from './student-initials.mjs';
import { sydneyDay } from './organiser-model.mjs';

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;
export const SHARE_TRIES_PER_DAY = 5;
export const SHARE_MAX_DEVICES = 6;
export const SHARES_PER_STUDENT = 10;

const shareKey = (token) => `progress_share/${token}`;
const indexKey = (classId, token) => `progress_share_by_class/${classId}/${token}`;
const indexPrefix = (classId) => `progress_share_by_class/${classId}/`;
const triesKey = (day, token) => `progress_share_tries/${day}/${token}`;
const STRONG = { type: 'json', consistency: 'strong' };

export const makeShareToken = () => randomBytes(18).toString('base64url');
export const makePin = (pick = randomInt) => String(pick(1_000_000)).padStart(6, '0');
export const pinHash = (token, pin) => createHash('sha256').update(`${token}:${pin}`).digest('hex');

const gone = () => reject(404, 'not_found', 'This link doesn’t work any more.');

/** The share, its class list and its student. One 404 for every way it can be missing. */
export async function openShare(store, token) {
  if (typeof token !== 'string' || !SHARE_TOKEN_PATTERN.test(token)) gone();
  const share = await read(store, shareKey(token));
  if (!share) gone();
  const roster = await loadRoster(store, share.class_id);
  const student = roster?.students.find((s) => s.id === share.student_id);
  if (!student) gone();
  return { share, roster, student };
}

/** Whether this browser is already in for the share. */
export function deviceIn(share, deviceToken) {
  return validToken(deviceToken) && Array.isArray(share?.devices) && share.devices.includes(deviceHash(deviceToken));
}

/** Initials and the one-off PIN, once per browser. A browser already in goes straight through. */
export async function signIn(store, token, body, { now = new Date() } = {}) {
  const { share, roster, student } = await openShare(store, token);
  const { device_token, initials, pin } = body ?? {};
  if (!validToken(device_token)) reject(400, 'no_device', 'This browser can’t remember you. Try your usual browser.');
  if (deviceIn(share, device_token)) return { share, roster, student };
  const day = sydneyDay(now);
  const tries = Number((await read(store, triesKey(day, token)))?.count) || 0;
  if (tries >= SHARE_TRIES_PER_DAY) reject(429, 'too_many_tries', 'Too many tries today. Ask the teacher for a new PIN.');
  if (!share.pin_hash) reject(403, 'pin_used', 'That PIN has been used. Ask the teacher for a new one.');
  const typed = typeof pin === 'string' ? pin.replace(/\s+/g, '') : '';
  const right = normaliseInitials(initials) === share.initials && /^\d{6}$/.test(typed) && pinHash(token, typed) === share.pin_hash;
  if (!right) {
    await store.setJSON(triesKey(day, token), { count: tries + 1 });
    reject(403, 'wrong', 'Those initials and PIN don’t match. Check them with the teacher.');
  }
  // Spend the PIN against the version just read, so two browsers can't both use it.
  const row = store.getWithMetadata ? await store.getWithMetadata(shareKey(token), STRONG) : null;
  const current = row?.data ?? share;
  if (current.pin_hash !== share.pin_hash) reject(403, 'pin_used', 'That PIN has been used. Ask the teacher for a new one.');
  const { pin_hash: _h, pin_plain: _p, ...rest } = current;
  const at = now.toISOString();
  const next = { ...rest, devices: [...(current.devices ?? []), deviceHash(device_token)].slice(-SHARE_MAX_DEVICES), pin_used_at: at, opened_at: at };
  const written = await store.setJSON(shareKey(token), next, row ? { onlyIfMatch: row.etag } : undefined);
  if (written?.modified === false) reject(403, 'pin_used', 'That PIN has been used. Ask the teacher for a new one.');
  return { share: next, roster, student };
}

/** Forgets this browser only. */
export async function signOut(store, token, deviceToken) {
  const { share } = await openShare(store, token);
  if (!deviceIn(share, deviceToken)) return;
  const mine = deviceHash(deviceToken);
  await store.setJSON(shareKey(token), { ...share, devices: share.devices.filter((d) => d !== mine) });
}

/** Notes the day the page was last opened, at most one write a day. */
export async function noteOpened(store, token, share, now = new Date()) {
  if (share.opened_at && sydneyDay(new Date(share.opened_at)) === sydneyDay(now)) return;
  await store.setJSON(shareKey(token), { ...share, opened_at: now.toISOString() });
}

/** Teacher: every share in the class, oldest first, with any unused PIN. */
export async function listShares(store, classId) {
  const keys = await listBlobKeys(store, indexPrefix(classId));
  const rows = await mapBounded(keys, 8, async (key) => {
    const token = key.slice(indexPrefix(classId).length);
    const share = await read(store, shareKey(token));
    if (!share || share.class_id !== classId) return null;
    return {
      token,
      student_id: share.student_id,
      initials: share.initials,
      made_at: share.made_at,
      opened_at: share.opened_at ?? null,
      pin: share.pin_plain ?? null,
      pin_used_at: share.pin_used_at ?? null,
      devices: Array.isArray(share.devices) ? share.devices.length : 0
    };
  });
  return rows.filter(Boolean).sort((a, b) => String(a.made_at).localeCompare(String(b.made_at)));
}

async function ownShare(store, classId, token) {
  if (typeof token !== 'string' || !SHARE_TOKEN_PATTERN.test(token)) reject(400, 'bad_request', 'Unknown link.');
  const share = await read(store, shareKey(token));
  if (!share || share.class_id !== classId) reject(404, 'not_found', 'That link has gone.');
  return share;
}

/** Teacher actions for a class: list, add, new_pin, remove. */
export async function teacherShareAction(store, classId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'list';
  if (!['list', 'add', 'new_pin', 'remove'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const at = now.toISOString();
  let made = null;
  if (action === 'add') {
    const studentId = body.student_id;
    if (typeof studentId !== 'string' || !STUDENT_ID_PATTERN.test(studentId) || !roster.students.some((s) => s.id === studentId)) reject(400, 'bad_request', 'Unknown student.');
    const initials = normaliseInitials(body.initials);
    if (!INITIALS_PATTERN.test(initials)) reject(400, 'bad_request', 'Type the viewer’s initials, like JS.');
    const theirs = (await listShares(store, classId)).filter((s) => s.student_id === studentId);
    if (theirs.length >= SHARES_PER_STUDENT) reject(409, 'too_many', 'This student already has 10 links. Remove one first.');
    const token = makeShareToken();
    const pin = makePin();
    await store.setJSON(shareKey(token), { class_id: classId, student_id: studentId, initials, pin_hash: pinHash(token, pin), pin_plain: pin, pin_made_at: at, devices: [], made_at: at }, { onlyIfNew: true });
    await store.setJSON(indexKey(classId, token), { student_id: studentId, initials, made_at: at });
    made = token;
  }
  if (action === 'new_pin') {
    const share = await ownShare(store, classId, body.token);
    const pin = makePin();
    const { pin_used_at: _u, ...rest } = share;
    await store.setJSON(shareKey(body.token), { ...rest, pin_hash: pinHash(body.token, pin), pin_plain: pin, pin_made_at: at });
  }
  if (action === 'remove') {
    await ownShare(store, classId, body.token);
    await deleteKey(store, shareKey(body.token));
    await deleteKey(store, indexKey(classId, body.token));
  }
  return { shares: await listShares(store, classId), ...(made ? { made } : {}) };
}
```

Note: `listShares` reads through the class index; a blob listing can lag a new write by up to a minute. The test store has no lag. If the panel misses a just-made link in production, the `made` token in the reply still lets the panel show it (Task 10 does).

- [ ] **Step 4: Run, expect PASS**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/progress-share.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/progress-share.mjs tests/unit/progress-share.test.js
git commit -m "Progress share: links, one-off PINs and remembered browsers"
```

---

### Task 4: The share page payload

**Files:**
- Modify: `netlify/functions/_shared/profile.mjs` (export `unitState`: change `async function unitState(` to `export async function unitState(`)
- Create: `netlify/functions/_shared/progress-share-page.mjs`
- Test: `tests/unit/progress-share-page.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { teacherShareAction } from '../../netlify/functions/_shared/progress-share.mjs';
import { burstsOf, tickRows, shareAction, SHARE_PAGE_KEYS } from '../../netlify/functions/_shared/progress-share-page.mjs';

// storeFixture from the Setup section goes here.

const DEVICE = 'a'.repeat(48);
const VIEWER = 'c'.repeat(48);
const NOW = new Date('2026-11-15T01:00:00Z');
const minute = (m) => new Date(Date.UTC(2026, 10, 10, 10, m)).toISOString();

test('burstsOf: 5 ticks on 5 lessons in 4 minutes is one burst', () => {
  const events = [0, 1, 2, 3, 4].map((m, i) => ({ lesson_id: `l${i}`, at: minute(m), kind: 'tick' }));
  assert.deepEqual(burstsOf(events), [{ from: minute(0), to: minute(4), count: 5 }]);
});

test('burstsOf: 2 ticks is no burst; quiz and untick never count; re-ticks of one lesson count once', () => {
  assert.deepEqual(burstsOf([{ lesson_id: 'l1', at: minute(0), kind: 'tick' }, { lesson_id: 'l2', at: minute(1), kind: 'tick' }]), []);
  assert.deepEqual(burstsOf([
    { lesson_id: 'l1', at: minute(0), kind: 'tick' }, { lesson_id: 'l2', at: minute(1), kind: 'quiz' }, { lesson_id: 'l3', at: minute(2), kind: 'untick' }
  ]), []);
  assert.deepEqual(burstsOf([
    { lesson_id: 'l1', at: minute(0), kind: 'tick' }, { lesson_id: 'l1', at: minute(1), kind: 'tick' }, { lesson_id: 'l2', at: minute(2), kind: 'tick' }
  ]), []);
});

test('burstsOf: ticks 11 minutes apart do not join', () => {
  const events = [0, 11, 22].map((m, i) => ({ lesson_id: `l${i}`, at: minute(m), kind: 'tick' }));
  assert.deepEqual(burstsOf(events), []);
});

test('tickRows: keeps the first tick time after untick and re-tick, reads an old tick with no record, adds the planned date', () => {
  const rows = tickRows({
    lessons: [{ id: 'l1', title: 'One' }, { id: 'l2', title: 'Two' }, { id: 'l3', title: 'Three' }],
    doneIds: new Set(['l1', 'l2', 'l3']),
    done: { l1: { at: minute(30), via: 'tick' }, l2: { at: minute(5), via: 'tick' }, l3: { at: minute(8), via: 'teacher' } },
    records: { l1: [{ at: minute(0), kind: 'tick' }, { at: minute(20), kind: 'untick' }, { at: minute(30), kind: 'tick' }] },
    submitted: {},
    planned: { l2: '2026-11-03' }
  });
  const byId = Object.fromEntries(rows.map((r) => [r.lesson_id, r]));
  assert.equal(byId.l1.at, minute(0));
  assert.equal(byId.l1.record.length, 3);
  assert.deepEqual(byId.l2.record, [{ at: minute(5), kind: 'tick' }]);
  assert.equal(byId.l2.planned, '2026-11-03');
  assert.equal(byId.l3.via, 'teacher');
  assert.deepEqual(rows.map((r) => r.lesson_id), ['l3', 'l2', 'l1']); // newest first: teacher mark at :08, tick at :05, first tick at :00
});

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', current_unit_id: 'unit1', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }] }],
    ['units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: ['l1', 'l2', 'l3'] }],
    ['markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['lessons/l1', { id: 'l1', title: 'Ghost poem' }], ['published/lessons/l1', { id: 'l1', title: 'Ghost poem', blocks: [] }],
    ['lessons/l2', { id: 'l2', title: 'Speaker and voice' }], ['published/lessons/l2', { id: 'l2', title: 'Speaker and voice', blocks: [] }],
    ['lessons/l3', { id: 'l3', title: 'Sound and rhythm' }], ['published/lessons/l3', { id: 'l3', title: 'Sound and rhythm', blocks: [] }],
    ['scheduled_lessons/s1', { id: 's1', class_id: 'class1', lesson_id: 'l1', date: '2026-11-03' }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ana] = roster.students;
  await claimInitials(store, roster, DEVICE, ana.initials);
  await profileAction(store, 'class1', { action: 'done', lesson_id: 'l1', class_token: DEVICE });
  const made = await teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: 'PT' }, { now: NOW });
  const share = made.shares.find((s) => s.token === made.made);
  return { store, token: share.token, pin: share.pin };
}

const keysDeep = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  return out;
};

test('page before sign-in asks for it and says nothing else', async () => {
  const { store, token } = await setup();
  assert.deepEqual(await shareAction(store, token, { action: 'page', device_token: VIEWER }, { now: NOW }), { need: 'sign_in' });
});

test('signed in, the page carries only allowlisted keys', async () => {
  const { store, token, pin } = await setup();
  const page = await shareAction(store, token, { action: 'sign_in', device_token: VIEWER, initials: 'PT', pin }, { now: NOW });
  for (const key of keysDeep(page)) assert.ok(SHARE_PAGE_KEYS.has(key), `unexpected key ${key}`);
  for (const banned of ['name', 'code', 'rubric', 'score', 'scores', 'text', 'feedback_text', 'marks', 'notes', 'announcements']) assert.equal(keysDeep(page).has(banned), false, banned);
  assert.equal(page.student.first_name, 'Ana');
  assert.equal(page.viewer_initials, 'PT');
  assert.equal(page.unit.core_done, 1);
  assert.equal(page.unit.core_total, 3);
  assert.equal(page.ticks[0].lesson_id, 'l1');
  assert.equal(page.ticks[0].planned, '2026-11-03');
  assert.deepEqual(page.lesson_ids, ['l1', 'l2', 'l3']);
  assert.equal(page.next[0].title, 'Speaker and voice');
});

test('the student’s own progress payload is unchanged by the tick record', async () => {
  const { store } = await setup();
  const own = await profileAction(store, 'class1', { action: 'progress', class_token: DEVICE }, { now: NOW });
  assert.equal(JSON.stringify(own).includes('record'), false);
});
```

- [ ] **Step 2: Run, expect FAIL** (module not found)

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/progress-share-page.test.js`

- [ ] **Step 3: Implement** `netlify/functions/_shared/progress-share-page.mjs`:

```js
/**
 * The Progress share page: one student's progress for a signed-in viewer, built from the same
 * helpers as the student's own page and cut down to SHARE_PAGE_KEYS. No marks, feedback text,
 * written work, notes, codes or announcements ever leave here.
 */
import { read, reject } from './question-drop.mjs';
import { unitState } from './profile.mjs';
import { todoFor } from './profile-todo.mjs';
import { organiserHabits } from './organiser.mjs';
import { listTickRecords } from './profile-done.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { SCHEDULED_LESSON_PREFIX } from './teaching-blobs.mjs';
import { listBlobKeys, mapBounded } from './blobs-list.mjs';
import { requestStore } from './request-store.mjs';
import { deviceIn, noteOpened, openShare, signIn, signOut } from './progress-share.mjs';

/** Every key the page may carry, at any depth. The allowlist test holds the page to it. */
export const SHARE_PAGE_KEYS = new Set([
  'need', 'student', 'first_name', 'class_title', 'viewer_initials', 'lesson_ids',
  'next', 'title', 'lesson_id', 'box',
  'unit', 'core_done', 'core_total',
  'countdowns', 'due_date', 'due_time', 'assessment',
  'ticks', 'at', 'via', 'planned', 'record', 'kind',
  'bursts', 'from', 'to', 'count',
  'practice', 'streak', 'days', 'weekly', 'week_start', 'right', 'seen', 'today', 'left', 'answered',
  'feedback', 'to_act', 'redraft', 'waiting'
]);

const BURST_MIN = 3;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const TICK_KINDS = new Set(['tick', 'untick', 'quiz']);

/**
 * Runs of ticks on BURST_MIN or more different lessons inside BURST_WINDOW_MS. Only `tick`
 * events count: quiz submissions and teacher marks are not something a student can pile up.
 */
export function burstsOf(events) {
  const ticks = events.filter((e) => e.kind === 'tick' && !Number.isNaN(Date.parse(e.at))).sort((a, b) => a.at.localeCompare(b.at));
  const out = [];
  let i = 0;
  while (i < ticks.length) {
    const start = Date.parse(ticks[i].at);
    let j = i;
    while (j + 1 < ticks.length && Date.parse(ticks[j + 1].at) - start <= BURST_WINDOW_MS) j += 1;
    const lessons = new Set(ticks.slice(i, j + 1).map((e) => e.lesson_id));
    if (lessons.size >= BURST_MIN) {
      out.push({ from: ticks[i].at, to: ticks[j].at, count: lessons.size });
      i = j + 1;
    } else i += 1;
  }
  return out;
}

/**
 * One row per lesson counted as done, newest first. `at` is the first tick (or submission, or the
 * teacher's mark), so a later re-tick never hides when it was first done. A tick from before the
 * record existed reads as one event from its done record.
 */
export function tickRows({ lessons, doneIds, done, records, submitted, planned }) {
  const rows = [];
  for (const lesson of lessons) {
    if (!doneIds.has(lesson.id)) continue;
    const held = done[lesson.id];
    const own = held?.via === 'teacher' ? held.was : held;
    const record = (records[lesson.id] ?? []).filter((e) => TICK_KINDS.has(e.kind));
    const fallback = own?.at ? [{ at: own.at, kind: own.via === 'quiz' ? 'quiz' : 'tick' }] : submitted[lesson.id] ? [{ at: submitted[lesson.id], kind: 'quiz' }] : [];
    const events = record.length ? record : fallback;
    const first = events.find((e) => e.kind !== 'untick');
    const via = held?.via === 'teacher' && !held.partial ? 'teacher' : first?.kind === 'quiz' ? 'quiz' : 'tick';
    const at = via === 'teacher' && !first ? held.at : first?.at ?? held?.at ?? null;
    if (!at) continue;
    rows.push({ lesson_id: lesson.id, title: String(lesson.title ?? ''), at, via, ...(planned[lesson.id] ? { planned: planned[lesson.id] } : {}), record: events.map((e) => ({ at: e.at, kind: e.kind })) });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** The earliest calendar day each lesson is planned for this class, skipping skipped and deleted rows. */
export async function plannedDates(store, classId, lessonIds) {
  const wanted = new Set(lessonIds);
  const rows = await mapBounded(await listBlobKeys(store, SCHEDULED_LESSON_PREFIX), 8, (key) => read(store, key));
  const out = {};
  for (const r of rows) {
    if (!r || isDeletedRecord(r) || r.class_id !== classId || !wanted.has(r.lesson_id) || r.delivery_status === 'skipped' || typeof r.date !== 'string') continue;
    if (!out[r.lesson_id] || r.date < out[r.lesson_id]) out[r.lesson_id] = r.date;
  }
  return out;
}

/** The page payload for a viewer already let in. */
export async function buildSharePage(rawStore, roster, student, share, { now = new Date() } = {}) {
  const store = requestStore(rawStore);
  const classId = roster.cls.id;
  const state = await unitState(store, roster, student);
  const lessonIds = state.lessons.map((l) => l.id);
  const [todo, habits, records, planned] = await Promise.all([
    todoFor(store, roster, student, { ...state, now }),
    organiserHabits(store, classId, student.id, { now }),
    listTickRecords(store, classId, student.id),
    plannedDates(store, classId, lessonIds)
  ]);
  const submitted = {};
  for (const q of state.view.quizzes) {
    const at = q.scores?.[student.id]?.submitted_at;
    if (at) submitted[q.lesson_id] = at;
  }
  const doneIds = new Set(state.rows.filter((r) => r.done).map((r) => r.id));
  const ticks = tickRows({ lessons: state.lessons, doneIds, done: state.done, records, submitted, planned });
  const events = Object.entries(records).flatMap(([lesson_id, list]) => list.map((e) => ({ lesson_id, at: e.at, kind: e.kind })));
  const core = state.rows.filter((r) => r.role === 'core');
  const boxItems = (todo.boxes ?? []).flatMap((b) => b.items.map((item) => ({ box: b.key, item })));
  return {
    student: { first_name: String(student.name ?? '').trim().split(/\s+/)[0] ?? '' },
    class_title: String(roster.cls.display_name || roster.cls.title || ''),
    viewer_initials: share.initials,
    lesson_ids: lessonIds,
    next: boxItems
      .filter(({ box, item }) => (box === 'now' || box === 'next') && item.kind !== 'feedback' && !item.done)
      .map(({ box, item }) => ({ title: String(item.title ?? ''), lesson_id: item.id, box })),
    unit: { title: String(state.unit?.title ?? ''), core_done: core.filter((r) => r.done).length, core_total: core.length },
    countdowns: (todo.countdowns ?? []).map((c) => ({ title: c.title, lesson_id: c.lesson_id, due_date: c.due_date, due_time: c.due_time, assessment: c.assessment })),
    ticks,
    bursts: burstsOf(events),
    practice: {
      streak: habits?.streak ?? 0,
      days: habits?.days ?? [],
      weekly: (habits?.weekly ?? []).slice(-4).map((w) => ({ week_start: w.week_start, right: w.right, seen: w.seen })),
      today: todo.practice ? { left: todo.practice.today, answered: todo.practice.answered } : null
    },
    feedback: {
      to_act: boxItems.filter(({ item }) => item.kind === 'feedback' && !item.done).map(({ item }) => ({ title: String(item.title ?? ''), redraft: item.feedback?.state === 'redraft' })),
      waiting: Array.isArray(todo.waiting) ? todo.waiting.length : 0
    }
  };
}

/** The public share actions: page, sign_in, sign_out. */
export async function shareAction(store, token, body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'page';
  if (!['page', 'sign_in', 'sign_out'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'sign_out') {
    await signOut(store, token, body.device_token);
    return { need: 'sign_in' };
  }
  if (action === 'sign_in') {
    const { share, roster, student } = await signIn(store, token, body, { now });
    return buildSharePage(store, roster, student, share, { now });
  }
  const { share, roster, student } = await openShare(store, token);
  if (!deviceIn(share, body.device_token)) return { need: 'sign_in' };
  await noteOpened(store, token, share, now);
  return buildSharePage(store, roster, student, share, { now });
}
```

In `profile.mjs`, change `async function unitState(store, roster, student, t = untimed)` to `export async function unitState(store, roster, student, t = untimed)`.

- [ ] **Step 4: Run, expect PASS.** If the allowlist test names an unexpected key, the fix is to stop copying that field, never to widen `SHARE_PAGE_KEYS` with personal fields.

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/progress-share-page.test.js tests/unit/profile.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/profile.mjs netlify/functions/_shared/progress-share-page.mjs tests/unit/progress-share-page.test.js
git commit -m "Progress share: the allowlisted page with tick record and bursts"
```

---

### Task 5: The two Netlify functions

**Files:**
- Create: `netlify/functions/published-progress-share.mjs`, `netlify/functions/class-progress-share.mjs`
- Modify: `netlify/functions/_shared/public-student-routes.mjs` (add one route)
- Test: append to `tests/unit/progress-share.test.js`

- [ ] **Step 1: Write the failing test.** Add the two imports to the top of `tests/unit/progress-share.test.js` and the two tests to the end.

```js
import { createPublishedProgressShareHandler } from '../../netlify/functions/published-progress-share.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

test('the public route is open only for a 24-character token', () => {
  assert.equal(isPublicStudentApi('POST', `/api/published/share/${'A'.repeat(24)}`), true);
  assert.equal(isPublicStudentApi('POST', '/api/published/share/short'), false);
  assert.equal(isPublicStudentApi('GET', `/api/published/share/${'A'.repeat(24)}`), false);
});

test('the public handler signs in and serves the page', async () => {
  const { store, token, pin } = await setup();
  const origin = 'http://127.0.0.1:5190';
  const handler = createPublishedProgressShareHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin }, now: () => NOW });
  const call = (body) => handler(new Request(`${origin}/api/published/share/${token}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const first = await (await call({ action: 'page', device_token: DEVICE })).json();
  assert.equal(first.data.need, 'sign_in');
  const signedIn = await call({ action: 'sign_in', device_token: DEVICE, initials: 'PT', pin });
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).data.viewer_initials, 'PT');
  const wrong = await call({ action: 'sign_in', device_token: 'd'.repeat(48), initials: 'PT', pin });
  assert.equal(wrong.status, 403);
});
```

Replies are `{ ok: true, data }` (`okResponse` in `_shared/http.mjs`), hence the `.data` reads.

- [ ] **Step 2: Run, expect FAIL** (module not found)

- [ ] **Step 3: Implement**

`netlify/functions/published-progress-share.mjs`:

```js
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { shareAction } from './_shared/progress-share-page.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/share/:token', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
const MAX_BODY = 4000;
/** A Progress share page: one student's progress, read-only, for a viewer the link and PIN let in. */
export function createPublishedProgressShareHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That request is too large.', false), request, env);
    const token = new URL(request.url).pathname.match(/\/published\/share\/([^/]+)$/)?.[1];
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new QuizError(413, 'too_large', 'That request is too large.');
      const result = await shareAction(store, token, JSON.parse(text), { now: deps.now?.() });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedProgressShareHandler();
```

`netlify/functions/class-progress-share.mjs`:

```js
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { teacherShareAction } from './_shared/progress-share.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/classes/:id/shares' };
/** Teacher only: a class's Progress share links. */
export function createClassProgressShareHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const classId = new URL(request.url).pathname.match(/\/classes\/([^/]+)\/shares$/)?.[1];
    try {
      const result = await teacherShareAction(store, classId, await request.json());
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createClassProgressShareHandler();
```

In `public-student-routes.mjs`, after the `profile` entry add:

```js
  { method: 'POST', pattern: /^\/api\/published\/share\/[A-Za-z0-9_-]{24}$/ },
```

- [ ] **Step 4: Run all server tests, expect PASS**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/progress-share.test.js tests/unit/progress-share-page.test.js tests/unit/tick-record.test.js`
Then the full suite: `npm run test:unit`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/published-progress-share.mjs netlify/functions/class-progress-share.mjs netlify/functions/_shared/public-student-routes.mjs tests/unit/progress-share.test.js
git commit -m "Progress share: public and teacher routes"
```

---

### Task 6: Front-end API, formatting and routes

**Files:**
- Create: `apps/teaching/src/student/share-api.ts`, `apps/teaching/src/student/share-format.ts`
- Modify: `apps/teaching/src/app/router.ts`, `apps/teaching/src/app/class-site.ts`
- Test: `apps/teaching/tests/unit/share-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { burstLabel, formatTickTime, formatPlanned } from '@/student/share-format';
import { match } from '@/app/router';

describe('share format', () => {
  it('shows Sydney time with weekday', () => {
    expect(formatTickTime('2026-11-11T10:42:00Z')).toBe('Wed 11 Nov, 9:42pm');
  });
  it('labels a burst in whole minutes, at least one', () => {
    expect(burstLabel({ from: '2026-11-11T10:40:00Z', to: '2026-11-11T10:43:10Z', count: 5 })).toBe('5 ticked within 4 minutes');
    expect(burstLabel({ from: '2026-11-11T10:40:00Z', to: '2026-11-11T10:40:20Z', count: 3 })).toBe('3 ticked within 1 minute');
  });
  it('shows a planned day', () => {
    expect(formatPlanned('2026-11-03')).toBe('planned Tue 3 Nov');
  });
});

describe('share routes', () => {
  const token = 'Abc123_-Abc123_-Abc123_-';
  it('matches the page and a lesson', () => {
    expect(match(`/s/share/${token}`)).toMatchObject({ name: 'student-share', params: { token }, requiresAuth: false });
    expect(match(`/s/share/${token}/lessons/l1`)).toMatchObject({ name: 'student-share-lesson', params: { token, lessonId: 'l1' } });
  });
});
```

`match(pathname)` is the router's exported path matcher (`router.ts:97`).

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/teaching && npx vitest run tests/unit/share-format.test.ts`

- [ ] **Step 3: Implement**

`apps/teaching/src/student/share-format.ts`:

```ts
/** Times on a Progress share page, always in Sydney time: the class's time, wherever the viewer is. */
const TZ = 'Australia/Sydney';
const parts = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const dayOnly = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

function pick(fmt: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "Wed 11 Nov, 9:42pm". */
export function formatTickTime(iso: string): string {
  const p = pick(parts, new Date(iso));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}${String(p.dayPeriod ?? '').toLowerCase()}`;
}

/** A YYYY-MM-DD calendar day: "planned Tue 3 Nov". */
export function formatPlanned(day: string): string {
  const p = pick(dayOnly, new Date(`${day}T00:00:00Z`));
  return `planned ${p.weekday} ${p.day} ${p.month}`;
}

/** "5 ticked within 4 minutes". */
export function burstLabel(burst: { from: string; to: string; count: number }): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(burst.to) - Date.parse(burst.from)) / 60_000));
  return `${burst.count} ticked within ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
```

`apps/teaching/src/student/share-api.ts`:

```ts
import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';

export type ShareTickKind = 'tick' | 'untick' | 'quiz';
export type ShareTick = { lesson_id: string; title: string; at: string; via: 'tick' | 'quiz' | 'teacher'; planned?: string; record: Array<{ at: string; kind: ShareTickKind }> };
export type ShareBurst = { from: string; to: string; count: number };
export type SharePage = {
  student: { first_name: string };
  class_title: string;
  viewer_initials: string;
  lesson_ids: string[];
  next: Array<{ title: string; lesson_id: string; box: 'now' | 'next' }>;
  unit: { title: string; core_done: number; core_total: number };
  countdowns: Array<{ title: string; lesson_id: string; due_date: string; due_time: string; assessment: boolean }>;
  ticks: ShareTick[];
  bursts: ShareBurst[];
  practice: { streak: number; days: string[]; weekly: Array<{ week_start: string; right: number; seen: number }>; today: { left: number; answered: number } | null };
  feedback: { to_act: Array<{ title: string; redraft: boolean }>; waiting: number };
};
export type ShareReply = SharePage | { need: 'sign_in' };

const path = (token: string) => `/api/published/share/${encodeURIComponent(token)}`;
const device = (token: string) => deviceToken(`share:${token}`);

export const sharePage = (token: string) => apiPost<ShareReply>(path(token), { action: 'page', device_token: device(token) });
export const shareSignIn = (token: string, initials: string, pin: string) => apiPost<ShareReply>(path(token), { action: 'sign_in', device_token: device(token), initials, pin });
export const shareSignOut = (token: string) => apiPost<ShareReply>(path(token), { action: 'sign_out', device_token: device(token) });

export const isSignInNeeded = (reply: ShareReply): reply is { need: 'sign_in' } => 'need' in reply;
```

Router (`apps/teaching/src/app/router.ts`):
1. Add `| 'student-share'` and `| 'student-share-lesson'` to `RouteName` after `'student-sheet'`.
2. Add to `RouteParams`: `'student-share': { token: string };` and `'student-share-lesson': { token: string; lessonId: string };`
3. In the matcher, before the `studentProfile` match, add:

```ts
  const studentShareLesson = path.match(/^\/s\/share\/([A-Za-z0-9_-]{24})\/lessons\/([^/]+)$/);
  if (studentShareLesson) {
    return { name: 'student-share-lesson', params: { token: studentShareLesson[1], lessonId: studentShareLesson[2] }, requiresAuth: false, path };
  }

  const studentShare = path.match(/^\/s\/share\/([A-Za-z0-9_-]{24})$/);
  if (studentShare) {
    return { name: 'student-share', params: { token: studentShare[1] }, requiresAuth: false, path };
  }
```

`class-site.ts`: add `'student-share'` and `'student-share-lesson'` to `STUDENT_ROUTES`.

- [ ] **Step 4: Run, expect PASS**, then `cd apps/teaching && npx tsc --noEmit -p .` (no new errors; `main.ts` gets its cases in Task 8, so a "not all cases handled" error, if the switch is exhaustive, is fixed there).

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/student/share-api.ts apps/teaching/src/student/share-format.ts apps/teaching/src/app/router.ts apps/teaching/src/app/class-site.ts apps/teaching/tests/unit/share-format.test.ts
git commit -m "Progress share: client calls, Sydney time formatting and routes"
```

---

### Task 7: The share page view

**Files:**
- Create: `apps/teaching/src/student/share-view.ts`, `apps/teaching/src/student/share-view.css`
- Test: `apps/teaching/tests/unit/share-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderSharePage, renderShareSignIn } from '@/student/share-view';
import type { SharePage } from '@/student/share-api';

const page: SharePage = {
  student: { first_name: 'Ana' },
  class_title: '9 English',
  viewer_initials: 'PT',
  lesson_ids: ['l1', 'l2', 'l3', 'l4'],
  next: [{ title: 'Speaker and voice', lesson_id: 'l2', box: 'now' }],
  unit: { title: 'Poetry', core_done: 7, core_total: 12 },
  countdowns: [{ title: 'Poem task', lesson_id: 'l4', due_date: '2026-11-21', due_time: '15:00', assessment: true }],
  ticks: [
    { lesson_id: 'l1', title: 'Ghost poem', at: '2026-11-11T10:42:00Z', via: 'tick', planned: '2026-11-03', record: [{ at: '2026-11-04T00:02:00Z', kind: 'tick' }, { at: '2026-11-11T10:40:00Z', kind: 'untick' }, { at: '2026-11-11T10:42:00Z', kind: 'tick' }] },
    { lesson_id: 'l3', title: 'Sound and rhythm', at: '2026-11-11T10:41:00Z', via: 'tick', record: [{ at: '2026-11-11T10:41:00Z', kind: 'tick' }] }
  ],
  bursts: [{ from: '2026-11-11T10:40:00Z', to: '2026-11-11T10:43:00Z', count: 5 }],
  practice: { streak: 3, days: ['2026-11-13', '2026-11-14', '2026-11-15'], weekly: [{ week_start: '2026-11-09', right: 18, seen: 24 }], today: { left: 4, answered: 6 } },
  feedback: { to_act: [{ title: 'Ghost poem draft', redraft: true }], waiting: 1 }
};

const opts = { token: 'Abc123_-Abc123_-Abc123_-', today: '2026-11-15', onSignOut: () => {} };

describe('renderSharePage', () => {
  const root = renderSharePage(page, opts);
  const text = root.textContent ?? '';
  it('shows every section with a data-tour hook', () => {
    for (const key of ['next', 'unit', 'coming', 'ticks', 'practice', 'organiser', 'feedback']) expect(root.querySelector(`[data-tour="${key}"]`)).not.toBeNull();
  });
  it('names the student and the class', () => {
    expect(text).toContain('Ana');
    expect(text).toContain('9 English');
  });
  it('shows tick times, the planned day, the record and the burst', () => {
    expect(text).toContain('Wed 11 Nov, 9:42pm');
    expect(text).toContain('planned Tue 3 Nov');
    expect(text).toContain('Ticked 2 times');
    expect(text).toContain('5 ticked within 3 minutes');
  });
  it('links lessons to the locked view', () => {
    const link = root.querySelector<HTMLAnchorElement>('a[href$="/s/share/Abc123_-Abc123_-Abc123_-/lessons/l2"]');
    expect(link?.textContent).toBe('Speaker and voice');
  });
  it('draws 28 practice squares and fills the practised days', () => {
    expect(root.querySelectorAll('.share-grid__day')).toHaveLength(28);
    expect(root.querySelectorAll('.share-grid__day.is-on')).toHaveLength(3);
  });
  it('shows the unit bar and counts only', () => {
    expect(text).toContain('7 of 12 core lessons');
    expect(text).toContain('Ghost poem draft');
    expect(text).toContain('1 piece waiting to be marked');
  });
  it('drops sections with nothing in them', () => {
    const bare = renderSharePage({ ...page, countdowns: [], ticks: [], bursts: [] }, opts);
    expect(bare.querySelector('[data-tour="coming"]')).toBeNull();
    expect(bare.textContent).toContain('Nothing ticked off in this unit yet.');
  });
});

describe('renderShareSignIn', () => {
  it('asks for initials and a 6-digit PIN', () => {
    const form = renderShareSignIn({ onSubmit: async () => {} });
    expect(form.querySelector('input[name="initials"]')).not.toBeNull();
    const pin = form.querySelector<HTMLInputElement>('input[name="pin"]');
    expect(pin?.inputMode).toBe('numeric');
    expect(pin?.maxLength).toBe(6);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/teaching && npx vitest run tests/unit/share-view.test.ts`

- [ ] **Step 3: Implement** `apps/teaching/src/student/share-view.ts`:

```ts
import { ApiClientError } from '@/api/client';
import { el } from '@/quiz/dom';
import { createStudentShell, renderStudentChrome, renderStudentStatus, studentAnchor } from '@/student/shell';
import { isSignInNeeded, sharePage, shareSignIn, shareSignOut, type SharePage, type ShareTick } from '@/student/share-api';
import { burstLabel, formatPlanned, formatTickTime } from '@/student/share-format';
import { mountTour, type TourHandle } from '@/app/tour';
import './share-view.css';

const SHOW_TICKS = 20;
const VIA: Record<ShareTick['via'], string> = { tick: 'Ticked', quiz: 'Quiz submitted', teacher: 'Marked by teacher' };
const KIND: Record<string, string> = { tick: 'Ticked', untick: 'Unticked', quiz: 'Quiz submitted' };

export type RenderShareOptions = { token: string; today: string; onSignOut: () => void };

const lessonHref = (token: string, lessonId: string) => `/s/share/${token}/lessons/${encodeURIComponent(lessonId)}`;

function section(key: string, title: string): { box: HTMLElement; body: HTMLElement } {
  const box = el('section', `share-card share-card--${key}`);
  box.dataset.tour = key;
  box.append(el('h2', 'share-card__title', title));
  const body = el('div', 'share-card__body');
  box.append(body);
  return { box, body };
}

function lessonLink(token: string, lessonId: string, title: string): HTMLElement {
  const a = studentAnchor(lessonHref(token, lessonId), 'share-lesson-link');
  a.textContent = title;
  return a;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function tickRow(token: string, tick: ShareTick): HTMLElement {
  const li = el('li', 'share-tick');
  li.append(lessonLink(token, tick.lesson_id, tick.title));
  const meta = el('p', 'share-tick__meta', `${VIA[tick.via]} ${formatTickTime(tick.at)}`);
  if (tick.planned) meta.append(el('span', 'share-tick__planned', ` · ${formatPlanned(tick.planned)}`));
  li.append(meta);
  const ticks = tick.record.filter((e) => e.kind === 'tick').length;
  if (tick.record.length > 1) {
    const more = el('details', 'share-tick__record');
    more.append(el('summary', '', ticks > 1 ? `Ticked ${ticks} times` : `${tick.record.length} changes`));
    const list = el('ol', 'share-tick__events');
    for (const e of tick.record) list.append(el('li', '', `${KIND[e.kind] ?? e.kind} ${formatTickTime(e.at)}`));
    more.append(list);
    li.append(more);
  }
  return li;
}

/** The page itself, from the payload. Pure: no calls, so tests and the tour can use it directly. */
export function renderSharePage(page: SharePage, options: RenderShareOptions): HTMLElement {
  const { token, today } = options;
  const root = el('div', 'share-page');
  const head = el('header', 'share-head');
  head.append(el('h1', 'share-head__title', `${page.student.first_name}’s English`), el('p', 'share-head__class', page.class_title));
  const who = el('p', 'share-head__who');
  who.append(el('span', 'share-head__initials', page.viewer_initials));
  const out = el('button', 'btn btn--ghost share-head__out', 'Sign out of this browser');
  out.type = 'button';
  out.addEventListener('click', options.onSignOut);
  who.append(out);
  head.append(who);
  root.append(head);

  const next = section('next', 'Up next');
  if (page.next.length) {
    const list = el('ul', 'share-list');
    for (const item of page.next) {
      const li = el('li', `share-list__item is-${item.box}`);
      li.append(el('span', 'share-list__box', item.box === 'now' ? 'Do now' : 'Do next'), lessonLink(token, item.lesson_id, item.title));
      list.append(li);
    }
    next.body.append(list);
  } else next.body.append(el('p', 'share-empty', 'Nothing waiting right now.'));
  root.append(next.box);

  const unit = section('unit', page.unit.title ? `Unit: ${page.unit.title}` : 'Unit progress');
  const bar = el('div', 'share-bar');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(page.unit.core_total));
  bar.setAttribute('aria-valuenow', String(page.unit.core_done));
  const fill = el('span', 'share-bar__fill');
  fill.style.width = `${page.unit.core_total ? Math.round((page.unit.core_done / page.unit.core_total) * 100) : 0}%`;
  bar.append(fill);
  unit.body.append(bar, el('p', 'share-bar__label', `${page.unit.core_done} of ${page.unit.core_total} core lessons`));
  root.append(unit.box);

  if (page.countdowns.length) {
    const coming = section('coming', 'Coming up');
    const list = el('ul', 'share-list');
    for (const c of page.countdowns) {
      const days = Math.round((Date.parse(`${c.due_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      list.append(el('li', 'share-list__item', `${c.title} · ${when}`));
    }
    coming.body.append(list);
    root.append(coming.box);
  }

  const ticks = section('ticks', 'Ticked off');
  for (const b of page.bursts) {
    ticks.body.append(el('p', 'share-burst', `${burstLabel(b)} · ${formatTickTime(b.from)}`));
  }
  if (page.ticks.length) {
    const list = el('ol', 'share-ticks');
    page.ticks.forEach((t, i) => {
      const row = tickRow(token, t);
      if (i >= SHOW_TICKS) row.hidden = true;
      list.append(row);
    });
    ticks.body.append(list);
    if (page.ticks.length > SHOW_TICKS) {
      const more = el('button', 'btn btn--ghost share-more', 'Show earlier');
      more.type = 'button';
      more.addEventListener('click', () => {
        list.querySelectorAll<HTMLElement>('.share-tick[hidden]').forEach((r) => (r.hidden = false));
        more.remove();
      });
      ticks.body.append(more);
    }
  } else ticks.body.append(el('p', 'share-empty', 'Nothing ticked off in this unit yet.'));
  root.append(ticks.box);

  const practice = section('practice', 'Practice');
  practice.body.append(el('p', 'share-streak', page.practice.streak ? `${page.practice.streak} ${page.practice.streak === 1 ? 'day' : 'days'} in a row` : 'No streak right now'));
  const grid = el('div', 'share-grid');
  grid.setAttribute('role', 'img');
  const on = new Set(page.practice.days);
  // Four weeks ending this week, Monday first.
  const back = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -back - 21);
  for (let i = 0; i < 28; i += 1) {
    const day = addDays(start, i);
    const cell = el('span', `share-grid__day${on.has(day) ? ' is-on' : ''}${day > today ? ' is-future' : ''}`);
    cell.title = day;
    grid.append(cell);
  }
  grid.setAttribute('aria-label', `Practised on ${on.size} of the last 28 days`);
  practice.body.append(grid);
  if (page.practice.weekly.length) {
    const weeks = el('ul', 'share-weeks');
    for (const w of page.practice.weekly) weeks.append(el('li', '', `Week of ${formatPlanned(w.week_start).replace('planned ', '')}: ${w.right} of ${w.seen} right`));
    practice.body.append(weeks);
  } else if (!on.size) practice.body.append(el('p', 'share-empty', 'No practice in the last 4 weeks.'));
  root.append(practice.box);

  const organiser = section('organiser', 'Today’s organiser');
  organiser.body.append(el('p', '', page.practice.today ? `${page.practice.today.left} cards left today · ${page.practice.today.answered} answered` : 'No organiser cards today.'));
  root.append(organiser.box);

  const feedback = section('feedback', 'Feedback to act on');
  if (page.feedback.to_act.length) {
    const list = el('ul', 'share-list');
    for (const f of page.feedback.to_act) list.append(el('li', 'share-list__item', `${f.title} · ${f.redraft ? 'redraft asked for' : 'to read'}`));
    feedback.body.append(list);
  } else feedback.body.append(el('p', 'share-empty', 'Nothing to act on.'));
  if (page.feedback.waiting) feedback.body.append(el('p', 'share-waiting', `${page.feedback.waiting} ${page.feedback.waiting === 1 ? 'piece' : 'pieces'} waiting to be marked`));
  root.append(feedback.box);
  return root;
}

export type ShareSignInOptions = { onSubmit: (initials: string, pin: string) => Promise<void> };

/** Initials and the PIN. Errors from the server show under the button. */
export function renderShareSignIn(options: ShareSignInOptions): HTMLElement {
  const form = el('form', 'share-signin');
  form.append(el('h1', 'share-signin__title', 'Progress share'), el('p', 'share-signin__lead', 'Type your initials and the PIN the teacher gave you. This browser will remember you.'));
  const initials = el('input', 'share-signin__input');
  initials.name = 'initials';
  initials.autocomplete = 'off';
  initials.maxLength = 5;
  initials.required = true;
  const pin = el('input', 'share-signin__input');
  pin.name = 'pin';
  pin.inputMode = 'numeric';
  pin.autocomplete = 'one-time-code';
  pin.maxLength = 6;
  pin.pattern = '\\d{6}';
  pin.required = true;
  const label = (text: string, input: HTMLInputElement) => {
    const l = el('label', 'share-signin__field');
    l.append(el('span', '', text), input);
    return l;
  };
  const go = el('button', 'btn btn--primary', 'Open');
  go.type = 'submit';
  const say = el('p', 'share-signin__say');
  say.setAttribute('role', 'alert');
  form.append(label('Your initials', initials), label('PIN', pin), go, say);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    go.disabled = true;
    say.textContent = '';
    options.onSubmit(initials.value, pin.value).catch((e: unknown) => {
      say.textContent = e instanceof ApiClientError ? e.message : 'That didn’t go through. Check your connection and try again.';
      go.disabled = false;
    });
  });
  return form;
}

export type MountShareViewOptions = { root: HTMLElement; token: string; isStale?: () => boolean; today?: () => string };
export type ShareViewHandle = { dispose(): void };

const sydneyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());

export function mountShareView(options: MountShareViewOptions): ShareViewHandle {
  const { root, token, isStale = () => false } = options;
  const today = options.today ?? sydneyToday;
  let disposed = false;
  let tour: TourHandle | null = null;
  root.replaceChildren();
  const { surface, header, content } = createStudentShell('share-shell');
  root.append(surface);
  renderStudentChrome(header, {});
  renderStudentStatus(content, 'Loading…');

  const live = () => !disposed && !isStale();
  const showPage = (page: SharePage) => {
    tour?.dispose();
    content.replaceChildren(renderSharePage(page, { token, today: today(), onSignOut: () => void shareSignOut(token).then(() => live() && showSignIn()) }));
    tour = mountShareTour(content, page);
  };
  const showSignIn = () => {
    tour?.dispose();
    tour = null;
    content.replaceChildren(renderShareSignIn({
      onSubmit: async (initials, pin) => {
        const reply = await shareSignIn(token, initials, pin);
        if (live() && !isSignInNeeded(reply)) showPage(reply);
      }
    }));
  };

  sharePage(token).then(
    (reply) => {
      if (!live()) return;
      if (isSignInNeeded(reply)) showSignIn();
      else showPage(reply);
    },
    (e: unknown) => {
      if (!live()) return;
      content.replaceChildren(el('p', 'share-gone', e instanceof ApiClientError && e.code === 'not_found' ? 'This link doesn’t work any more.' : 'The page didn’t load. Check your connection and try again.'));
    }
  );

  return {
    dispose() {
      disposed = true;
      tour?.dispose();
    }
  };
}

/** The tour's steps for this page. Defined in Task 9; returns null until then. */
function mountShareTour(content: HTMLElement, page: SharePage): TourHandle | null {
  void content;
  void page;
  void mountTour;
  return null;
}
```

Note: `createStudentShell(contentExtraClass)` exists in `student/shell.ts`. Check `renderStudentChrome`'s options type there and pass `{}` only if it accepts it (it does in `lesson-view.ts`).

`apps/teaching/src/student/share-view.css` (design-kit tokens only; no raw colours):

```css
.share-page { display: grid; gap: var(--space-4, 16px); max-width: 720px; margin: 0 auto; padding: 0 16px 64px; }
.share-head { display: grid; gap: 4px; padding-top: 8px; }
.share-head__title { font-size: 1.6rem; margin: 0; }
.share-head__class { margin: 0; color: var(--ink-muted); }
.share-head__who { display: flex; align-items: center; gap: 8px; margin: 4px 0 0; }
.share-head__initials { font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--paper-raised); }
.share-card { border: 1px solid var(--rule); border-radius: 12px; padding: 16px; background: var(--paper-raised); min-width: 0; }
.share-card__title { font-size: 1.05rem; margin: 0 0 8px; }
.share-list, .share-ticks, .share-weeks { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.share-list__item { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.share-list__box { font-size: 0.8rem; color: var(--ink-muted); min-width: 4.5em; }
.share-lesson-link { overflow-wrap: anywhere; }
.share-empty { color: var(--ink-muted); margin: 0; }
.share-bar { height: 10px; border-radius: 999px; background: var(--rule); overflow: hidden; }
.share-bar__fill { display: block; height: 100%; background: var(--accent); }
.share-bar__label { margin: 6px 0 0; }
.share-burst { margin: 0 0 8px; padding: 6px 10px; border-radius: 8px; background: var(--warn-soft, var(--paper)); border: 1px solid var(--warn, var(--rule)); font-weight: 600; }
.share-tick__meta { margin: 2px 0 0; font-size: 0.9rem; color: var(--ink-muted); }
.share-tick__record summary { cursor: pointer; font-size: 0.9rem; }
.share-tick__events { margin: 4px 0 0; padding-left: 18px; font-size: 0.85rem; }
.share-grid { display: grid; grid-template-columns: repeat(7, 32px); gap: 6px; margin: 8px 0; }
.share-grid__day { width: 32px; height: 32px; border-radius: 6px; background: var(--rule); }
.share-grid__day.is-on { background: var(--accent); }
.share-grid__day.is-future { opacity: 0.35; }
.share-signin { display: grid; gap: 12px; max-width: 360px; margin: 32px auto; padding: 0 16px; }
.share-signin__field { display: grid; gap: 4px; }
.share-signin__input { font: inherit; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 8px; }
.share-signin__say { color: var(--danger, var(--ink)); min-height: 1.2em; margin: 0; }
.share-gone { text-align: center; margin: 48px 16px; }
```

Before committing, open `packages/design-kit/tokens.css` and replace any token above that doesn't exist with its nearest real token (`grep -o -- '--[a-z-]*' packages/design-kit/tokens.css | sort -u`). Keep the fallbacks.

- [ ] **Step 4: Run, expect PASS**

Run: `cd apps/teaching && npx vitest run tests/unit/share-view.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/student/share-view.ts apps/teaching/src/student/share-view.css apps/teaching/tests/unit/share-view.test.ts
git commit -m "Progress share: sign-in form and the progress page"
```

---

### Task 8: Locked lessons and wiring the routes

**Files:**
- Create: `apps/teaching/src/student/share-lesson.ts`
- Modify: `apps/teaching/src/app/main.ts` (imports ~line 66; handles ~line 127; teardowns ~line 205 and ~line 1213; switch ~line 1168)
- Test: `apps/teaching/tests/unit/share-lesson.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderLockedLesson } from '@/student/share-lesson';
import type { PublishedLesson } from '@/schemas/published-lesson';

const lesson = {
  lesson_id: 'l1',
  title: 'Ghost poem',
  unit_id: 'unit1',
  blocks: [
    { id: 'b1', type: 'block', block_type: 'text', visibility: 'student_teacher', content: { html: '<p>Read the poem.</p>' } },
    { id: 'b2', type: 'block', block_type: 'section', visibility: 'student_teacher', content: { title: 'Part one', collapsed: true, blocks: [] } }
  ]
} as unknown as PublishedLesson;

describe('renderLockedLesson', () => {
  const root = renderLockedLesson(lesson, { backHref: '/s/share/Abc123_-Abc123_-Abc123_-' });
  it('says it is view only, with a way back', () => {
    expect(root.textContent).toContain('Viewing only. Nothing here can be changed.');
    expect(root.querySelector<HTMLAnchorElement>('a.share-locked__back')?.getAttribute('href')).toContain('/s/share/Abc123_-Abc123_-Abc123_-');
  });
  it('makes the lesson content inert and opens every details', () => {
    const blocks = root.querySelector<HTMLElement>('.lesson-blocks');
    expect(blocks?.hasAttribute('inert')).toBe(true);
    for (const d of root.querySelectorAll('details')) expect(d.open).toBe(true);
  });
  it('shows a plain note when there is nothing to read', () => {
    const empty = renderLockedLesson({ ...lesson, blocks: [] } as PublishedLesson, { backHref: '/x' });
    expect(empty.textContent).toContain('This lesson runs as an activity in class');
  });
});
```

Check the real text block shape with `grep -n "block_type: 'text'" apps/teaching/src/blocks/create-block.ts` and adjust the fixture's `content` to match before running.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** `apps/teaching/src/student/share-lesson.ts`:

```ts
import { apiGet, ApiClientError } from '@/api/client';
import { renderBlock } from '@/blocks/render';
import { studentUnitAnthology } from '@/blocks/anthology-load';
import { isSidePath } from '@/lecture/scenes';
import { el } from '@/quiz/dom';
import type { Block } from '@/schemas/block';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { createStudentShell, renderStudentChrome, renderStudentStatus, studentAnchor } from '@/student/shell';
import { renderPublishedLessonHero } from '@/student/lesson-view';
import { isSignInNeeded, sharePage } from '@/student/share-api';
import './share-view.css';

/**
 * A lesson as the student sees it, locked. No class id goes to the blocks, so nothing saves or
 * claims; `inert` stops every click, keypress and focus inside. Collapsed parts open, because
 * the viewer can't press the button that would open them.
 */
export function renderLockedLesson(lesson: PublishedLesson, options: { backHref: string }): HTMLElement {
  const root = el('div', 'share-locked');
  const banner = el('div', 'share-locked__banner');
  banner.append(el('span', '', 'Viewing only. Nothing here can be changed.'));
  const back = studentAnchor(options.backHref, 'share-locked__back');
  back.textContent = 'Back to progress';
  banner.append(back);
  root.append(banner);
  renderPublishedLessonHero(root, lesson);
  const blocks = el('div', 'lesson-blocks');
  const list = (lesson.blocks ?? []).filter((b) => !isSidePath(b as Block));
  for (const block of list) {
    blocks.append(renderBlock(block as Block, 'student', { lessonId: lesson.lesson_id, pageBlocks: lesson.blocks, loadAnthology: () => studentUnitAnthology(lesson.unit_id) }));
  }
  if (!list.length) blocks.append(el('p', 'share-empty', 'This lesson runs as an activity in class, so there’s nothing to read here.'));
  for (const d of blocks.querySelectorAll('details')) d.open = true;
  blocks.setAttribute('inert', '');
  blocks.setAttribute('aria-readonly', 'true');
  root.append(blocks);
  return root;
}

export type MountShareLessonOptions = { root: HTMLElement; token: string; lessonId: string; isStale?: () => boolean };

export function mountShareLesson(options: MountShareLessonOptions): { dispose(): void } {
  const { root, token, lessonId, isStale = () => false } = options;
  let disposed = false;
  const live = () => !disposed && !isStale();
  const backHref = `/s/share/${token}`;
  root.replaceChildren();
  const { surface, header, content } = createStudentShell('share-shell');
  root.append(surface);
  renderStudentChrome(header, {});
  renderStudentStatus(content, 'Loading lesson…');
  // The share must let this browser in, and the lesson must be on the student's list.
  void sharePage(token)
    .then(async (reply) => {
      if (!live()) return;
      if (isSignInNeeded(reply) || !reply.lesson_ids.includes(lessonId)) {
        window.location.assign(backHref);
        return;
      }
      const lesson = await apiGet<PublishedLesson>(`/api/published/lessons/${encodeURIComponent(lessonId)}`);
      if (live()) content.replaceChildren(renderLockedLesson(lesson, { backHref }));
    })
    .catch((e: unknown) => {
      if (!live()) return;
      content.replaceChildren(el('p', 'share-gone', e instanceof ApiClientError && e.code === 'not_found' ? 'This link doesn’t work any more.' : 'The lesson didn’t load. Check your connection and try again.'));
    });
  return { dispose() { disposed = true; } };
}
```

Append to `share-view.css`:

```css
.share-locked__banner { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; padding: 10px 16px; background: var(--paper-raised); border-bottom: 1px solid var(--rule); font-weight: 600; }
.share-locked .lesson-blocks[inert] input, .share-locked .lesson-blocks[inert] textarea, .share-locked .lesson-blocks[inert] button, .share-locked .lesson-blocks[inert] select, .share-locked .lesson-blocks[inert] [contenteditable] { opacity: 0.6; cursor: not-allowed; }
```

`main.ts`:
1. Imports: `import { mountShareView, type ShareViewHandle } from '@/student/share-view';` and `import { mountShareLesson } from '@/student/share-lesson';`
2. Handles, next to `studentProfileViewHandle`: `let shareViewHandle: { dispose(): void } | null = null;`
3. Teardown, next to `teardownStudentProfileView`:

```ts
function teardownShareView(): void {
  shareViewHandle?.dispose();
  shareViewHandle = null;
}
```

4. Call `teardownShareView();` right after `teardownStudentProfileView();` in the route-change teardown list (~line 1213).
5. Render functions next to `renderStudentProfileRoute`:

```ts
function renderShareRoute(token: string, renderTok: number): void {
  teardownShareView();
  shareViewHandle = mountShareView({ root: appRoot, token, isStale: () => renderTok !== renderToken });
}

function renderShareLessonRoute(token: string, lessonId: string, renderTok: number): void {
  teardownShareView();
  shareViewHandle = mountShareLesson({ root: appRoot, token, lessonId, isStale: () => renderTok !== renderToken });
}
```

6. Switch cases after `student-profile`:

```ts
    case 'student-share':
      renderShareRoute(match.params.token, token);
      break;
    case 'student-share-lesson':
      renderShareLessonRoute(match.params.token, match.params.lessonId, token);
      break;
```

7. Line ~386 and ~1279 return early for `/s/` paths; share paths start with `/s/` so they're covered. Confirm nothing else (such as a teacher session check) runs for them.

The `ShareViewHandle` type import is unused if you type the handle as `{ dispose(): void }`; drop it from the import.

- [ ] **Step 4: Run, expect PASS**, then `cd apps/teaching && npx tsc --noEmit -p .` with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/student/share-lesson.ts apps/teaching/src/student/share-view.css apps/teaching/src/app/main.ts apps/teaching/tests/unit/share-lesson.test.ts
git commit -m "Progress share: locked lesson pages and route wiring"
```

---

### Task 9: The explainer tour

**Files:**
- Create: `apps/teaching/src/app/tour.ts`, `apps/teaching/src/app/tour.css`
- Modify: `apps/teaching/src/student/share-view.ts` (replace the `mountShareTour` stub)
- Test: `apps/teaching/tests/unit/tour.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountTour } from '@/app/tour';

function page(): HTMLElement {
  document.body.innerHTML = '<main id="m"><section data-tour="a">A</section><section data-tour="b">B</section></main>';
  return document.getElementById('m')!;
}
const steps = () => [
  { title: 'Welcome', body: 'Hello.' },
  { target: () => document.querySelector<HTMLElement>('[data-tour="a"]'), title: 'A', body: 'Section A.' },
  { target: () => document.querySelector<HTMLElement>('[data-tour="missing"]'), title: 'Gone', body: 'Not here.' },
  { target: () => document.querySelector<HTMLElement>('[data-tour="b"]'), title: 'B', body: 'Section B.' }
];
const card = () => document.querySelector<HTMLElement>('.tour-card');

describe('mountTour', () => {
  beforeEach(() => localStorage.clear());

  it('runs once on a new browser, dropping steps with no target', () => {
    const page1 = page();
    const tour = mountTour({ host: page1, steps: steps(), storageKey: 'k:v1' });
    expect(card()?.textContent).toContain('Welcome');
    expect(card()?.textContent).toContain('1 of 3');
    tour.next(); tour.next();
    expect(card()?.textContent).toContain('B');
    tour.next();
    expect(card()).toBeNull();
    expect(localStorage.getItem('k:v1')).toBe('seen');
    tour.dispose();
    const again = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    expect(card()).toBeNull();
    again.dispose();
  });

  it('skip ends it, marks it seen and leaves the Help button', () => {
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    document.querySelector<HTMLButtonElement>('.tour-card__skip')!.click();
    expect(card()).toBeNull();
    expect(localStorage.getItem('k:v1')).toBe('seen');
    const help = document.querySelector<HTMLButtonElement>('.tour-help');
    expect(help?.hidden).toBe(false);
    expect(help?.getAttribute('aria-label')).toBe('Show the tour again');
    tour.dispose();
  });

  it('Escape skips; Help replays from the start; focus returns to Help', () => {
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card()).toBeNull();
    const help = document.querySelector<HTMLButtonElement>('.tour-help')!;
    expect(document.activeElement).toBe(help);
    help.click();
    expect(card()?.textContent).toContain('Welcome');
    tour.dispose();
  });

  it('with storage throwing, it does not auto-run but Help still works', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const tour = mountTour({ host: page(), steps: steps(), storageKey: 'k:v1' });
    expect(card()).toBeNull();
    document.querySelector<HTMLButtonElement>('.tour-help')!.click();
    expect(card()).not.toBeNull();
    tour.dispose();
    get.mockRestore(); set.mockRestore();
  });

  it('makes the page inert while open', () => {
    const host = page();
    const tour = mountTour({ host, steps: steps(), storageKey: 'k:v1' });
    expect(host.hasAttribute('inert')).toBe(true);
    tour.skip();
    expect(host.hasAttribute('inert')).toBe(false);
    tour.dispose();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/teaching && npx vitest run tests/unit/tour.test.ts`

- [ ] **Step 3: Implement** `apps/teaching/src/app/tour.ts`:

```ts
import './tour.css';

export type TourStep = { target?: () => HTMLElement | null; title: string; body: string };
export type TourOptions = {
  /** The page under the tour: inert while the tour is open. */
  host: HTMLElement;
  steps: TourStep[];
  /** localStorage key; bump its version to show the tour again after a big change. */
  storageKey: string;
  /** Where the Help button goes. Defaults to document.body (fixed top right). */
  helpParent?: HTMLElement;
};
export type TourHandle = { start(): void; next(): void; back(): void; skip(): void; dispose(): void };

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const PAD = 8;

function seen(key: string): boolean | null {
  try { return localStorage.getItem(key) === 'seen'; } catch { return null; }
}
function markSeen(key: string): void {
  try { localStorage.setItem(key, 'seen'); } catch { /* the Help button still works */ }
}

/**
 * A guided tour: a dimmed page with a spotlight on each section and a card that explains it.
 * Shows once per browser. Ending it (Done, Skip, Esc) shrinks the card into a small Help button
 * at the top right, which replays it.
 */
export function mountTour(options: TourOptions): TourHandle {
  const { host, storageKey } = options;
  const helpParent = options.helpParent ?? document.body;
  let steps: TourStep[] = [];
  let at = 0;
  let layer: HTMLElement | null = null;
  let spot: HTMLElement | null = null;
  let card: HTMLElement | null = null;
  let disposed = false;

  const help = document.createElement('button');
  help.type = 'button';
  help.className = 'tour-help';
  help.textContent = '?';
  help.setAttribute('aria-label', 'Show the tour again');
  help.hidden = true;
  help.addEventListener('click', () => start());
  helpParent.append(help);

  const onKey = (event: KeyboardEvent) => {
    if (!card) return;
    if (event.key === 'Escape') { event.preventDefault(); skip(); }
    else if (event.key === 'ArrowRight' || (event.key === 'Enter' && (event.target as HTMLElement)?.tagName !== 'BUTTON')) { event.preventDefault(); next(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); back(); }
    else if (event.key === 'Tab') {
      const focusable = [...card.querySelectorAll<HTMLElement>('button')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  const onResize = () => place();

  function button(text: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function paint(): void {
    if (!card) return;
    const step = steps[at]!;
    const title = document.createElement('h2');
    title.className = 'tour-card__title';
    title.id = 'tour-card-title';
    title.textContent = step.title;
    const body = document.createElement('p');
    body.className = 'tour-card__body';
    body.textContent = step.body;
    const dots = document.createElement('p');
    dots.className = 'tour-card__dots';
    dots.textContent = `${at + 1} of ${steps.length}`;
    const actions = document.createElement('div');
    actions.className = 'tour-card__actions';
    const last = at === steps.length - 1;
    actions.append(button('Skip tour', 'btn btn--ghost tour-card__skip', skip));
    if (at > 0) actions.append(button('Back', 'btn btn--secondary tour-card__back', back));
    actions.append(button(last ? 'Done' : 'Next', 'btn btn--primary tour-card__next', next));
    card.replaceChildren(title, body, dots, actions);
    card.setAttribute('aria-labelledby', 'tour-card-title');
    place();
    card.querySelector<HTMLElement>('.tour-card__next')?.focus();
  }

  /** Spotlight the target and put the card beside it, or dock it at the bottom on a phone. */
  function place(): void {
    if (!card || !spot) return;
    const target = steps[at]?.target?.() ?? null;
    const phone = window.innerWidth < 600;
    card.classList.toggle('is-docked', phone);
    if (!target) {
      spot.classList.add('is-off');
      card.classList.add('is-centred');
      card.style.removeProperty('top');
      card.style.removeProperty('left');
      return;
    }
    card.classList.remove('is-centred');
    spot.classList.remove('is-off');
    target.scrollIntoView?.({ block: phone ? 'start' : 'center', behavior: reduced() ? 'auto' : 'smooth' });
    const r = target.getBoundingClientRect();
    Object.assign(spot.style, { top: `${r.top - PAD}px`, left: `${r.left - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` });
    if (phone) return;
    const c = card.getBoundingClientRect();
    const below = r.bottom + PAD * 2;
    const top = below + c.height < window.innerHeight ? below : Math.max(PAD, r.top - PAD * 2 - c.height);
    const left = Math.min(Math.max(PAD, r.left), window.innerWidth - c.width - PAD);
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function start(): void {
    if (disposed) return;
    steps = options.steps.filter((s) => !s.target || s.target());
    if (!steps.length) return;
    close(false);
    at = 0;
    layer = document.createElement('div');
    layer.className = 'tour-layer';
    spot = document.createElement('div');
    spot.className = 'tour-spot';
    card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-live', 'polite');
    layer.append(spot, card);
    document.body.append(layer);
    host.setAttribute('inert', '');
    help.hidden = true;
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    paint();
  }

  function next(): void {
    if (!card) return;
    if (at >= steps.length - 1) { finish(); return; }
    at += 1;
    paint();
  }
  function back(): void {
    if (!card || at === 0) return;
    at -= 1;
    paint();
  }
  function skip(): void { finish(); }

  function finish(): void {
    markSeen(storageKey);
    close(true);
  }

  /** Takes the tour down; with `shrink`, flies the card into the Help button first. */
  function close(shrink: boolean): void {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    host.removeAttribute('inert');
    const leaving = layer;
    const from = card?.getBoundingClientRect();
    layer = null; spot = null; card = null;
    if (!leaving) return;
    help.hidden = false;
    if (!shrink) { leaving.remove(); return; }
    const to = help.getBoundingClientRect();
    const ghost = leaving.querySelector<HTMLElement>('.tour-card');
    if (!ghost || !from || reduced() || typeof ghost.animate !== 'function') {
      leaving.remove();
      help.focus();
      return;
    }
    leaving.classList.add('is-leaving');
    ghost.replaceChildren();
    // No longer the live card: only its shape flies, pinned where the card was.
    ghost.className = 'tour-ghost';
    ghost.removeAttribute('role');
    Object.assign(ghost.style, { top: `${from.top}px`, left: `${from.left}px`, width: `${from.width}px`, height: `${from.height}px`, right: 'auto', bottom: 'auto', transform: 'none' });
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(to.width / Math.max(from.width, 1), 0.05);
    const fly = ghost.animate(
      [{ transform: 'translate(0, 0) scale(1)', borderRadius: '12px' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, borderRadius: '50%' }],
      { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }
    );
    help.focus();
    fly.finished.then(() => {
      leaving.remove();
      help.classList.add('is-pulse');
      help.addEventListener('animationend', () => help.classList.remove('is-pulse'), { once: true });
    }, () => leaving.remove());
  }

  // First visit only. A storage error counts as seen: better to miss it than repeat it every visit.
  const already = seen(storageKey);
  if (already === false) start();
  else help.hidden = false;

  return {
    start, next, back, skip,
    dispose() {
      disposed = true;
      close(false);
      help.remove();
    }
  };
}
```

Note on the test: in happy-dom `Element.animate` may be missing, so `close(true)` takes the immediate path and focuses Help, which the test checks.

`apps/teaching/src/app/tour.css`:

```css
.tour-layer { position: fixed; inset: 0; z-index: 1000; pointer-events: auto; }
.tour-spot { position: fixed; border-radius: 12px; box-shadow: 0 0 0 9999px color-mix(in srgb, var(--ink) 55%, transparent); transition: top 300ms ease-out, left 300ms ease-out, width 300ms ease-out, height 300ms ease-out, opacity 200ms; pointer-events: none; }
.tour-spot.is-off { top: 50%; left: 50%; width: 0; height: 0; }
.tour-card { position: fixed; width: min(340px, calc(100vw - 32px)); padding: 16px; border-radius: 12px; background: var(--paper-raised, var(--paper)); color: var(--ink); box-shadow: 0 12px 32px color-mix(in srgb, var(--ink) 25%, transparent); transition: top 300ms ease-out, left 300ms ease-out; }
.tour-card.is-centred { top: 50%; left: 50%; transform: translate(-50%, -50%); }
.tour-card.is-docked { top: auto !important; left: 16px !important; right: 16px; bottom: 16px; width: auto; transform: none; }
.tour-card__title { font-size: 1.05rem; margin: 0 0 6px; }
.tour-card__body { margin: 0 0 10px; }
.tour-card__dots { margin: 0 0 12px; font-size: 0.85rem; color: var(--ink-muted); }
.tour-card__actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.tour-card__skip { margin-right: auto; }
.tour-layer.is-leaving .tour-spot { opacity: 0; }
.tour-ghost { position: fixed; background: var(--paper-raised, var(--paper)); border-radius: 12px; }
.tour-help { position: fixed; top: 16px; right: 16px; z-index: 900; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--rule); background: var(--paper-raised, var(--paper)); color: var(--ink-muted); font-weight: 600; cursor: pointer; }
.tour-help[hidden] { display: none; }
.tour-help.is-pulse { animation: tour-pulse 600ms ease-out 1; }
@keyframes tour-pulse { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); } to { box-shadow: 0 0 0 12px transparent; } }
@media (max-width: 599px) { .tour-help { top: 12px; right: 12px; } }
@media (prefers-reduced-motion: reduce) { .tour-spot, .tour-card { transition: none; } .tour-help.is-pulse { animation: none; } }
```

Replace the stub at the end of `share-view.ts` with:

```ts
export const SHARE_TOUR_KEY = 'progress-share-tour:v1';

/** The tour's steps for this page; a step whose section isn't there is left out. */
function mountShareTour(content: HTMLElement, page: SharePage): TourHandle {
  const name = page.student.first_name || 'the student';
  const at = (key: string) => () => content.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  return mountTour({
    host: content,
    storageKey: SHARE_TOUR_KEY,
    steps: [
      { title: 'Welcome', body: `This page shows how ${name} is getting on in English. You can look at anything, but nothing here can be changed.` },
      { target: at('next'), title: 'Up next', body: `What ${name} should work on now and next.` },
      { target: at('unit'), title: 'Unit progress', body: `How far through the current unit ${name} is, counting the core lessons.` },
      { target: at('coming'), title: 'Coming up', body: 'Assessments on the way, soonest first.' },
      { target: at('ticks'), title: 'Ticked off', body: `Everything ${name} has finished, with the time it was done. When lots are ticked within a few minutes, you’ll see a label saying so.` },
      { target: at('practice'), title: 'Practice', body: `Each square is a day ${name} practised with their organiser. The weeks show how many cards they got right.` },
      { target: at('organiser'), title: 'Today’s organiser', body: 'Cards left to practise today, and how many are done.' },
      { target: at('feedback'), title: 'Feedback to act on', body: `Work handed back that ${name} still needs to read or redraft, and work waiting to be marked.` },
      { target: () => content.querySelector<HTMLElement>('.share-lesson-link'), title: 'Lessons', body: `Tap any lesson to read it as ${name} sees it. It opens locked, so you can help without changing anything.` }
    ]
  });
}
```

Remove the now-unused `void mountTour;` stub lines.

- [ ] **Step 4: Run tour and share-view tests, expect PASS**

Run: `cd apps/teaching && npx vitest run tests/unit/tour.test.ts tests/unit/share-view.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/app/tour.ts apps/teaching/src/app/tour.css apps/teaching/src/student/share-view.ts apps/teaching/tests/unit/tour.test.ts
git commit -m "Tour: a spotlight explainer that shrinks into a Help button; on the Progress share page"
```

---

### Task 10: Teacher panel

**Files:**
- Create: `apps/teaching/src/teacher/sections/progress-share-panel.ts`
- Modify: `apps/teaching/src/teacher/sections/class-students.ts` (row building, ~line 235, before `item.append(label)`)
- Test: `apps/teaching/tests/unit/progress-share-panel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { mountProgressSharePanel, type ShareRow } from '@/teacher/sections/progress-share-panel';

const row = (over: Partial<ShareRow> = {}): ShareRow => ({ token: 'Abc123_-Abc123_-Abc123_-', student_id: 'st_a', initials: 'PT', made_at: '2026-11-15T01:00:00Z', opened_at: null, pin: '123456', pin_used_at: null, devices: 0, ...over });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('progress share panel', () => {
  it('adds a share and shows the link and PIN', async () => {
    const api = {
      list: vi.fn(async () => ({ shares: [] as ShareRow[] })),
      add: vi.fn(async () => ({ shares: [row()], made: 'Abc123_-Abc123_-Abc123_-' })),
      newPin: vi.fn(), remove: vi.fn()
    };
    const host = document.createElement('div');
    mountProgressSharePanel(host, { classId: 'class1', studentId: 'st_a', studentName: 'Ana Ames', api, origin: 'https://class.example' });
    await flush();
    host.querySelector<HTMLInputElement>('input[name="viewer-initials"]')!.value = 'pt';
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(api.add).toHaveBeenCalledWith('class1', 'st_a', 'pt');
    expect(host.textContent).toContain('https://class.example/s/share/Abc123_-Abc123_-Abc123_-');
    expect(host.textContent).toContain('123456');
  });

  it('shows Used once the PIN is spent, and only this student’s shares', async () => {
    const api = {
      list: vi.fn(async () => ({ shares: [row({ pin: null, pin_used_at: '2026-11-15T02:00:00Z', devices: 1 }), row({ token: 'Zzz123_-Zzz123_-Zzz123_-', student_id: 'st_b' })] })),
      add: vi.fn(), newPin: vi.fn(), remove: vi.fn()
    };
    const host = document.createElement('div');
    mountProgressSharePanel(host, { classId: 'class1', studentId: 'st_a', studentName: 'Ana Ames', api, origin: 'https://class.example' });
    await flush();
    expect(host.querySelectorAll('.share-panel__row')).toHaveLength(1);
    expect(host.textContent).toContain('PIN used');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** `apps/teaching/src/teacher/sections/progress-share-panel.ts`:

```ts
import { apiPost } from '@/api/client';
import { studentSiteOrigin } from '@/app/class-site';

export type ShareRow = { token: string; student_id: string; initials: string; made_at: string; opened_at: string | null; pin: string | null; pin_used_at: string | null; devices: number };
type Reply = { shares: ShareRow[]; made?: string };
export type ShareApi = {
  list: (classId: string) => Promise<Reply>;
  add: (classId: string, studentId: string, initials: string) => Promise<Reply>;
  newPin: (classId: string, token: string) => Promise<Reply>;
  remove: (classId: string, token: string) => Promise<Reply>;
};

const call = (classId: string, body: Record<string, string>) => apiPost<Reply>(`/api/classes/${encodeURIComponent(classId)}/shares`, body);
export const defaultShareApi: ShareApi = {
  list: (classId) => call(classId, { action: 'list' }),
  add: (classId, studentId, initials) => call(classId, { action: 'add', student_id: studentId, initials }),
  newPin: (classId, token) => call(classId, { action: 'new_pin', token }),
  remove: (classId, token) => call(classId, { action: 'remove', token })
};

const day = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
const when = (iso: string | null) => (iso ? day.format(new Date(iso)) : '');

export type ProgressSharePanelOptions = { classId: string; studentId: string; studentName: string; api?: ShareApi; origin?: string };

/** The teacher's Progress share links for one student: add, new PIN, remove. */
export function mountProgressSharePanel(host: HTMLElement, options: ProgressSharePanelOptions): { dispose(): void } {
  const { classId, studentId, studentName } = options;
  const api = options.api ?? defaultShareApi;
  const origin = options.origin ?? studentSiteOrigin();
  const box = document.createElement('div');
  box.className = 'share-panel';
  const list = document.createElement('ul');
  list.className = 'share-panel__list';
  const say = document.createElement('p');
  say.className = 'share-panel__say';
  say.setAttribute('role', 'status');
  const form = document.createElement('form');
  form.className = 'share-panel__add';
  const input = document.createElement('input');
  input.name = 'viewer-initials';
  input.maxLength = 5;
  input.autocomplete = 'off';
  input.placeholder = 'Viewer initials';
  input.setAttribute('aria-label', `Initials of the person to share ${studentName}’s progress with`);
  const add = document.createElement('button');
  add.type = 'submit';
  add.className = 'btn btn--secondary';
  add.textContent = 'Make a link';
  form.append(input, add);
  box.append(list, form, say);
  host.append(box);

  const paint = (shares: ShareRow[]) => {
    list.replaceChildren(...shares.filter((s) => s.student_id === studentId).map((s) => {
      const li = document.createElement('li');
      li.className = 'share-panel__row';
      const link = `${origin}/s/share/${s.token}`;
      const head = document.createElement('p');
      head.textContent = `${s.initials} · made ${when(s.made_at)}${s.opened_at ? ` · last opened ${when(s.opened_at)}` : ''}`;
      const url = document.createElement('code');
      url.className = 'share-panel__link';
      url.textContent = link;
      const pin = document.createElement('p');
      pin.className = 'share-panel__pin';
      pin.textContent = s.pin ? `PIN ${s.pin} (works once)` : `PIN used ${when(s.pin_used_at)} · ${s.devices} ${s.devices === 1 ? 'browser' : 'browsers'} in`;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn--ghost';
      copy.textContent = 'Copy link';
      copy.addEventListener('click', () => void navigator.clipboard?.writeText(link).then(() => (say.textContent = 'Link copied.')));
      const fresh = document.createElement('button');
      fresh.type = 'button';
      fresh.className = 'btn btn--ghost';
      fresh.textContent = 'New PIN';
      fresh.addEventListener('click', () => void run(() => api.newPin(classId, s.token), `New PIN made for ${s.initials}.`));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Remove ${s.initials}’s link? It stops working at once.`)) return;
        void run(() => api.remove(classId, s.token), `${s.initials}’s link is removed.`);
      });
      li.append(head, url, pin, copy, fresh, remove);
      return li;
    }));
  };

  const run = async (fn: () => Promise<Reply>, done: string) => {
    try {
      const reply = await fn();
      paint(reply.shares);
      say.textContent = done;
    } catch {
      say.textContent = 'That didn’t go through. Check your connection and try again.';
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const initials = input.value.trim();
    if (!initials) { say.textContent = 'Type the viewer’s initials first.'; return; }
    void run(() => api.add(classId, studentId, initials), 'Link made. Give them the link and the PIN.').then(() => (input.value = ''));
  });

  void api.list(classId).then((r) => paint(r.shares), () => (say.textContent = 'Links didn’t load.'));
  return { dispose: () => box.remove() };
}
```

In `class-students.ts`, inside the row builder before `item.append(label);`:

```ts
        if (student.id) {
          const shareBtn = el('button', 'btn btn--ghost class-students__share', 'Progress share');
          shareBtn.type = 'button';
          shareBtn.setAttribute('aria-expanded', 'false');
          shareBtn.setAttribute('aria-label', `Progress share links for ${student.name}`);
          let panel: { dispose(): void } | null = null;
          const shareHost = el('div', 'class-students__share-host');
          const studentId = student.id;
          shareBtn.addEventListener('click', () => {
            if (panel) { panel.dispose(); panel = null; shareBtn.setAttribute('aria-expanded', 'false'); return; }
            panel = mountProgressSharePanel(shareHost, { classId: cls.id, studentId, studentName: student.name });
            shareBtn.setAttribute('aria-expanded', 'true');
          });
          item.append(shareBtn, shareHost);
        }
```

Add the import at the top: `import { mountProgressSharePanel } from '@/teacher/sections/progress-share-panel';`

Add to the class-students stylesheet (find it with `grep -rn "class-students__release" apps/teaching/src --include=*.css`):

```css
.class-students__share-host { flex-basis: 100%; }
.share-panel { display: grid; gap: 8px; padding: 8px 0; }
.share-panel__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.share-panel__row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.share-panel__row p { margin: 0; flex-basis: 100%; }
.share-panel__link { overflow-wrap: anywhere; flex-basis: 100%; }
.share-panel__add { display: flex; gap: 8px; }
```

- [ ] **Step 4: Run, expect PASS**, plus the existing class-students tests: `cd apps/teaching && npx vitest run tests/unit/progress-share-panel.test.ts $(grep -l "mountClassStudents" tests/unit/*.ts)`

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/teacher/sections/progress-share-panel.ts apps/teaching/src/teacher/sections/class-students.ts apps/teaching/tests/unit/progress-share-panel.test.ts
git add <the class-students stylesheet found above>
git commit -m "Class students: Progress share links per student"
```

---

### Task 11: Browser walk at desktop and 390px

**Files:**
- Create: `tests/browser/progress-share.spec.mjs`
- Modify: root `package.json` `test:browser` list (append the new file)

- [ ] **Step 1: Write the spec.** Model it on `tests/browser/profile.spec.mjs` (same store, vite server and route interception). Fixture: class `class1` with invented students `Ana Ames`, `Ben Bolt`; unit `Poetry` with lessons l1–l4 (l4 an assessment with a countdown block due in 6 days); a scheduled row for l1; Ana's done records for l1, l2, l3 ticked within 3 minutes of each other via `profileAction` with her claimed device; a share made with `teacherShareAction` for viewer `PT`. A text block on l2 and a `question_set` block so the locked view has an input.

```js
/** Progress share: sign in, every section, tour, locked lesson. Production handlers, invented data only. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { createPublishedProgressShareHandler } from '../../netlify/functions/published-progress-share.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { teacherShareAction } from '../../netlify/functions/_shared/progress-share.mjs';

// Same `data` Map + `store` object as tests/browser/profile.spec.mjs, with the fixture above.
// Seed: claimInitials(store, roster, 'a'.repeat(48), ana.initials); three profileAction 'done' calls;
// const made = await teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: 'PT' });
// const { token, pin } = made.shares.find((s) => s.token === made.made);

const origin = 'http://127.0.0.1:5191';
const handler = createPublishedProgressShareHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
// Serve /share-check?lesson=… with a page that imports mountShareView or mountShareLesson by query.
// Route `${origin}/api/published/share/**` to `handler`; route `${origin}/api/published/lessons/**`
// to a stub returning the published lesson JSON from `data`.

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  // 1. Fresh context. Open the page: the sign-in form shows.
  // 2. Wrong PIN: the alert text is "Those initials and PIN don’t match. Check them with the teacher."
  //    (First context only: the PIN is one-off, so the second context gets a fresh PIN from new_pin.)
  // 3. Right initials and PIN: the tour card shows "Welcome" and "1 of N".
  // 4. Next through every step; each spotlit section is the one named in the card title.
  //    At 390px the card has class is-docked and its top is below the spotlight's bottom.
  // 5. Done: wait 600ms; .tour-help is visible within 24px of the top-right corner.
  // 6. Reload: no .tour-card; the page shows "Ticked off", "3 ticked within", "planned".
  // 7. No sideways scroll: document.documentElement.scrollWidth <= innerWidth.
  // 8. Click the first lesson link: the banner says "Viewing only. Nothing here can be changed.";
  //    clicking a textarea and typing leaves its value empty; Back to progress returns.
  // 9. Screenshot at deviceScaleFactor 1 to /tmp/progress-share-<width>.png for review.
}
```

Write the steps as real Playwright calls (`page.goto`, `page.fill`, `page.click`, `page.locator(...).textContent()`, `assert`), following `profile.spec.mjs`'s helper style. Every step above becomes at least one assertion.

- [ ] **Step 2: Run it**

Run: `node --test tests/browser/progress-share.spec.mjs`
Expected: PASS at both widths. Open the two screenshots and check them against `docs/CURSOR-UI-FAILURES.md` (overflow at phone width, controls that look live but do nothing, empty states). Fix anything found and rerun.

- [ ] **Step 3: Add the file to the root `test:browser` script and commit**

```bash
git add tests/browser/progress-share.spec.mjs package.json
git commit -m "Progress share: browser walk at desktop and phone width"
```

---

### Task 12: Spec touch-ups, gate and PR

- [ ] **Step 1: Update the spec for the plan's three adjustments**, in `docs/superpowers/specs/2026-11-15-progress-share-design.md`:
  - Tour: "Positioned with the design kit's vendored floating-ui" → "Positioned by the tour itself (below the section, else above, clamped to the screen)".
  - Lessons: "The server checks the lesson is in the student's current unit list" → "The page payload carries `lesson_ids`; the lesson view opens only those, and sends the viewer back to the progress page otherwise. Published lessons are already public at `/s/lessons/<id>`, so no extra server check adds protection." Also change "the view mounts in a `viewer` mode" → "the lesson renders through `renderLockedLesson`, which passes no class id, so nothing saves or claims".
  - Payload: `feedback: { to_act: [{ title, lesson_id }] ...` → `feedback: { to_act: [{ title, redraft }], waiting }`, and add `lesson_ids` and `bursts` to the payload block.

- [ ] **Step 2: Run the gate**

Run: `npm run pre-pr-check`
Expected: exit 0, ending `pre-pr-check PASSED`. If `privacy-guard` flags anything, move the content; never weaken the guard.

- [ ] **Step 3: Commit, push, open the PR (ready, not draft) and enable auto-merge (merge commit)**

```bash
git add docs/superpowers/specs/2026-11-15-progress-share-design.md
git commit -m "Progress share spec: match the plan"
git push -u origin claude/zen-hypatia-c0hadp
```

PR title: `Progress share: a read-only progress link for a pastoral teacher or parent`. Body: what it does, the three-part sign-in, the tick record and bursts, the tour, test commands run. No real names.
