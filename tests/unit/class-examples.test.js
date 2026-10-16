import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonExamplesHandler } from '../../netlify/functions/lesson-examples.mjs';
import { createPublishedExamplesHandler } from '../../netlify/functions/published-examples.mjs';
import { createPublishedExamplesWriteHandler } from '../../netlify/functions/published-examples-write.mjs';
import {
  entryKey,
  MAX_WRONG_CODES,
  readPublicExamples,
  slotsKey
} from '../../netlify/functions/_shared/class-examples.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const LESSON = 'lesson_poetry_1';
const CLASS = 'class_9eng2';

/**
 * Serves stale values to plain reads after a write, like an eventually
 * consistent blob store; only `consistency: 'strong'` sees the latest (W5).
 */
function laggingStore(seed = {}) {
  const fresh = new Map(Object.entries(seed));
  const stale = new Map(Object.entries(seed));
  return {
    fresh,
    unpublish(key) {
      fresh.delete(key);
      stale.delete(key);
    },
    async get(key, options = {}) {
      const source = options.consistency === 'strong' ? fresh : stale;
      return source.has(key) ? structuredClone(source.get(key)) : null;
    },
    async setJSON(key, value) {
      fresh.set(key, structuredClone(value));
    },
    async delete(key) {
      fresh.delete(key);
    },
    async list({ prefix } = {}) {
      return { blobs: [...fresh.keys()].filter(key => key.startsWith(prefix ?? '')).map(key => ({ key })) };
    }
  };
}

function seededStore() {
  return laggingStore({
    [`lessons/${LESSON}`]: { id: LESSON, title: 'Poetry 1', status: 'active' },
    [`published/lessons/${LESSON}`]: { lesson_id: LESSON, blocks: [] },
    [`classes/${CLASS}`]: { id: CLASS, code: '9ENG2', title: 'Year 9 English', status: 'active' },
    'scheduled_lessons/s1': { id: 's1', class_id: CLASS, lesson_id: LESSON, date: '2026-10-15' }
  });
}

function deps(store, extra = {}) {
  let code = 0;
  return {
    getContentStore: async () => store,
    verifySessionToken: () => ({ valid: true }),
    env: { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' },
    randomCode: () => ['472', '815', '903'][code++ % 3],
    randomToken: () => 'token-for-luke',
    nowIso: () => '2026-10-15T01:00:00.000Z',
    ...extra
  };
}

function req(method, path, body) {
  return new Request(`https://api.adam-russell.com${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'umbrella_session=ok' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function teacher(store, body) {
  const handler = createLessonExamplesHandler(deps(store));
  const res = await handler(req('POST', `/api/lessons/${LESSON}/examples`, body), {});
  return { status: res.status, json: await res.json() };
}

async function student(store, step, body) {
  const handler = createPublishedExamplesWriteHandler(deps(store));
  const res = await handler(req('POST', `/api/published/examples/${LESSON}/${step}`, body), {});
  return { status: res.status, json: await res.json() };
}

async function addAndOpen(store) {
  const added = await teacher(store, { action: 'add_slot', block_id: 'block_q2', label: 'Question 2' });
  assert.equal(added.status, 200, JSON.stringify(added.json));
  const slotId = added.json.data.slots[0].id;
  const opened = await teacher(store, { action: 'open', context: CLASS, slot_id: slotId });
  assert.equal(opened.status, 200);
  return { slotId, code: opened.json.data.slots[0].entry.code };
}

test('class example routes: student reads and writes are public, teacher route is not', () => {
  assert.equal(isPublicStudentApi('GET', `/api/published/examples/${LESSON}`), true);
  assert.equal(isPublicStudentApi('POST', `/api/published/examples/${LESSON}/unlock`), true);
  assert.equal(isPublicStudentApi('POST', `/api/published/examples/${LESSON}/submit`), true);
  assert.equal(isPublicStudentApi('POST', `/api/published/examples/${LESSON}`), false);
  assert.equal(isPublicStudentApi('GET', `/api/lessons/${LESSON}/examples`), false);
  assert.equal(isPublicStudentApi('POST', `/api/lessons/${LESSON}/examples`), false);
});

test('teacher opens a box: code is three digits, listed classes include the bare lesson link', async () => {
  const store = seededStore();
  const { code } = await addAndOpen(store);
  assert.match(code, /^\d{3}$/);

  const handler = createLessonExamplesHandler(deps(store));
  const res = await handler(req('GET', `/api/lessons/${LESSON}/examples?context=${CLASS}`), {});
  const { data } = await res.json();
  assert.deepEqual(data.contexts.map(row => row.id), [CLASS, 'direct']);
  assert.equal(data.contexts[0].label, '9ENG2');
  assert.deepEqual(data.contexts[0].dates, ['2026-10-15']);
  assert.equal(data.slots[0].entry.status, 'open');
});

test('right code unlocks once, save locks, and the class only sees it after Show', async () => {
  const store = seededStore();
  const { slotId, code } = await addAndOpen(store);

  const unlocked = await student(store, 'unlock', { class: CLASS, slot_id: slotId, code });
  assert.equal(unlocked.status, 200);
  assert.equal(unlocked.json.data.token, 'token-for-luke');

  // The code is spent: a second student with the same code is turned away.
  const second = await student(store, 'unlock', { class: CLASS, slot_id: slotId, code });
  assert.equal(second.status, 409);
  assert.equal(second.json.error.code, 'taken');

  const saved = await student(store, 'submit', {
    class: CLASS, slot_id: slotId, token: 'token-for-luke', text: '  The volta turns grief into resolve.  '
  });
  assert.equal(saved.status, 200);

  // Saved means locked: the same token cannot overwrite it.
  const again = await student(store, 'submit', {
    class: CLASS, slot_id: slotId, token: 'token-for-luke', text: 'changed'
  });
  assert.equal(again.status, 403);

  let view = await readPublicExamples(store, LESSON, CLASS);
  assert.equal(view.slots[0].shown, false);
  assert.equal('text' in view.slots[0], false, 'unapproved text never reaches students');

  await teacher(store, { action: 'show', context: CLASS, slot_id: slotId });
  view = await readPublicExamples(store, LESSON, CLASS);
  assert.equal(view.slots[0].shown, true);
  assert.equal(view.slots[0].text, 'The volta turns grief into resolve.');

  // Another class taught the same lesson starts empty.
  const other = await readPublicExamples(store, LESSON, 'direct');
  assert.equal(other.slots[0].shown, false);
});

test(`${MAX_WRONG_CODES} wrong codes lock the box until the teacher issues a new one`, async () => {
  const store = seededStore();
  const { slotId, code } = await addAndOpen(store);
  const wrong = code === '000' ? '001' : '000';

  for (let attempt = 1; attempt < MAX_WRONG_CODES; attempt += 1) {
    const res = await student(store, 'unlock', { class: CLASS, slot_id: slotId, code: wrong });
    assert.equal(res.status, 403);
    assert.equal(res.json.error.details.attempts_left, MAX_WRONG_CODES - attempt);
  }
  const last = await student(store, 'unlock', { class: CLASS, slot_id: slotId, code: wrong });
  assert.equal(last.status, 423);

  // Even the right code no longer works.
  const right = await student(store, 'unlock', { class: CLASS, slot_id: slotId, code });
  assert.equal(right.status, 423);

  const reopened = await teacher(store, { action: 'open', context: CLASS, slot_id: slotId });
  const fresh = reopened.json.data.slots[0].entry;
  assert.equal(fresh.status, 'open');
  assert.equal(fresh.attempts, 0);
  const ok = await student(store, 'unlock', { class: CLASS, slot_id: slotId, code: fresh.code });
  assert.equal(ok.status, 200);
});

test('a closed or never-opened box refuses codes, and the public read hides codes', async () => {
  const store = seededStore();
  const added = await teacher(store, { action: 'add_slot', block_id: 'block_q1', label: 'Q1' });
  const slotId = added.json.data.slots[0].id;

  const refused = await student(store, 'unlock', { class: CLASS, slot_id: slotId, code: '123' });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.error.code, 'not_open');

  await teacher(store, { action: 'open', context: CLASS, slot_id: slotId });
  const handler = createPublishedExamplesHandler(deps(store));
  const res = await handler(req('GET', `/api/published/examples/${LESSON}?class=${CLASS}`), {});
  const raw = await res.text();
  assert.equal(res.status, 200);
  assert.equal(raw.includes('472'), false, 'the open code never appears in the public read');
  assert.match(res.headers.get('netlify-cdn-cache-control') ?? '', /s-maxage=\d+/);
});

test('unpublished or deleted lessons 404 for students', async () => {
  const store = seededStore();
  store.unpublish(`published/lessons/${LESSON}`);
  const handler = createPublishedExamplesHandler(deps(store));
  const res = await handler(req('GET', `/api/published/examples/${LESSON}`), {});
  assert.equal(res.status, 404);
  const write = await student(store, 'unlock', { slot_id: 'x', code: '123' });
  assert.equal(write.status, 404);
});

test('remove then restore keeps the saved answer (Undo)', async () => {
  const store = seededStore();
  const { slotId, code } = await addAndOpen(store);
  await student(store, 'unlock', { class: CLASS, slot_id: slotId, code });
  await student(store, 'submit', { class: CLASS, slot_id: slotId, token: 'token-for-luke', text: 'Kept' });

  const removed = await teacher(store, { action: 'remove_slot', slot_id: slotId });
  assert.equal(removed.json.data.slots.length, 0);
  assert.ok(store.fresh.has(entryKey(LESSON, CLASS, slotId)));

  await teacher(store, { action: 'restore_slot', slot: removed.json.data.removed, index: 0 });
  const back = await teacher(store, { action: 'show', context: CLASS, slot_id: slotId });
  assert.equal(back.json.data.slots[0].entry.text, 'Kept');
  assert.ok(store.fresh.get(slotsKey(LESSON)).slots.length === 1);
});

test('student writes from another origin are refused', async () => {
  const store = seededStore();
  const { slotId, code } = await addAndOpen(store);
  const handler = createPublishedExamplesWriteHandler(deps(store));
  const res = await handler(
    new Request(`https://api.adam-russell.com/api/published/examples/${LESSON}/unlock`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ class: CLASS, slot_id: slotId, code })
    }),
    {}
  );
  assert.equal(res.status, 403);
});

test('a student on the plain lesson link can use a code the teacher opened for a class', async () => {
  const store = seededStore();
  const { slotId, code } = await addAndOpen(store);

  // The shared lesson link sends no class: it follows the class the teacher is teaching.
  const unlocked = await student(store, 'unlock', { slot_id: slotId, code });
  assert.equal(unlocked.status, 200, JSON.stringify(unlocked.json));
  assert.equal(unlocked.json.data.context, CLASS);

  const saved = await student(store, 'submit', {
    class: unlocked.json.data.context, slot_id: slotId, token: 'token-for-luke', text: 'Answer'
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));

  await teacher(store, { action: 'show', context: CLASS, slot_id: slotId });
  const handler = createPublishedExamplesHandler(deps(store));
  const res = await handler(req('GET', `/api/published/examples/${LESSON}`), {});
  const { data } = await res.json();
  assert.equal(data.slots[0].shown, true);
  assert.equal(data.slots[0].text, 'Answer');
});

test('the plain lesson link stops following a class the teacher has not touched for hours', async () => {
  const store = seededStore();
  const { slotId, code } = await addAndOpen(store);
  const later = createPublishedExamplesWriteHandler(deps(store, { nowIso: () => '2026-10-16T01:00:00.000Z' }));
  const res = await later(req('POST', `/api/published/examples/${LESSON}/unlock`, { slot_id: slotId, code }), {});
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'not_open');
});
