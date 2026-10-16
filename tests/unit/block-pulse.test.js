import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonPulseHandler } from '../../netlify/functions/lesson-pulse.mjs';
import { createPublishedPulseHandler } from '../../netlify/functions/published-pulse.mjs';
import {
  blockTakesPulse,
  pulseResetsKey,
  pulseTapKey
} from '../../netlify/functions/_shared/block-pulse.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const LESSON = 'lesson_hamlet_3';
const DEVICE_A = 'devicea0123456789abc';
const DEVICE_B = 'deviceb0123456789abc';

const BLOCKS = [
  { id: 'b_heading', block_type: 'heading', visibility: 'student_teacher', content: { text: 'Act 3' }, settings: {} },
  { id: 'b_divider', block_type: 'divider', visibility: 'student_teacher', content: {}, settings: {} },
  { id: 'b_q1', block_type: 'question_set', visibility: 'student_teacher', content: {}, settings: {} },
  { id: 'b_private', block_type: 'rich_text', visibility: 'teacher_only', content: { html: '' }, settings: {} },
  { id: 'b_quiet', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '' }, settings: { feedback_off: true } },
  {
    id: 'b_tabs',
    block_type: 'tabs',
    visibility: 'student_teacher',
    settings: {},
    content: {
      tabs: [
        { id: 't1', label: 'One', blocks: [{ id: 'b_in_tab', block_type: 'cloze', visibility: 'student_teacher', content: {}, settings: {} }] }
      ]
    }
  },
  {
    id: 'b_cols',
    block_type: 'columns',
    visibility: 'student_teacher',
    settings: {},
    content: {
      columns: [{ id: 'c1', blocks: [{ id: 'b_in_col', block_type: 'quote', visibility: 'student_teacher', content: {}, settings: {} }] }]
    }
  }
];

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix ?? '')).map(key => ({ key })) };
    }
  };
}

function seededStore(snapshot = {}) {
  return memoryStore({
    [`lessons/${LESSON}`]: { id: LESSON, title: 'Hamlet 3', status: 'active' },
    [`published/lessons/${LESSON}`]: { lesson_id: LESSON, blocks: BLOCKS, ...snapshot }
  });
}

function deps(store) {
  return {
    getContentStore: async () => store,
    verifySessionToken: () => ({ valid: true }),
    env: { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' },
    nowIso: () => '2026-10-16T03:00:00.000Z'
  };
}

function req(method, path, body, origin = ORIGIN) {
  return new Request(`https://api.adam-russell.com${path}`, {
    method,
    headers: { origin, 'content-type': 'application/json', cookie: 'umbrella_session=ok' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function tap(store, body, origin) {
  const handler = createPublishedPulseHandler(deps(store));
  const res = await handler(req('POST', `/api/published/pulse/${LESSON}`, body, origin), {});
  return { status: res.status, json: await res.json() };
}

async function teacherGet(store) {
  const handler = createLessonPulseHandler(deps(store));
  const res = await handler(req('GET', `/api/lessons/${LESSON}/pulse`), {});
  return { status: res.status, json: await res.json() };
}

async function teacherReset(store, blockId) {
  const handler = createLessonPulseHandler(deps(store));
  const res = await handler(req('POST', `/api/lessons/${LESSON}/pulse`, { action: 'reset', block_id: blockId }), {});
  return { status: res.status, json: await res.json() };
}

test('pulse routes: student tap is public, teacher counts are not', () => {
  assert.equal(isPublicStudentApi('POST', `/api/published/pulse/${LESSON}`), true);
  assert.equal(isPublicStudentApi('GET', `/api/published/pulse/${LESSON}`), false);
  assert.equal(isPublicStudentApi('GET', `/api/lessons/${LESSON}/pulse`), false);
  assert.equal(isPublicStudentApi('POST', `/api/lessons/${LESSON}/pulse`), false);
});

test('blockTakesPulse skips structure, containers, teacher-only and switched-off blocks', () => {
  const byId = Object.fromEntries(BLOCKS.map(block => [block.id, block]));
  assert.equal(blockTakesPulse(byId.b_q1), true);
  for (const id of ['b_heading', 'b_divider', 'b_private', 'b_quiet', 'b_tabs', 'b_cols']) {
    assert.equal(blockTakesPulse(byId[id]), false, id);
  }
});

test('taps are counted per option, a repeat tap from one device counts once, and un-tap removes it', async () => {
  const store = seededStore();
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A })).status, 200);
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A })).status, 200);
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_B })).status, 200);
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'example', device_id: DEVICE_B })).status, 200);

  let { json } = await teacherGet(store);
  assert.deepEqual(json.data.blocks.b_q1.counts, { confused: 2, stuck: 0, example: 1, flat: 0, worked: 0 });
  assert.equal(json.data.blocks.b_q1.total, 3);

  await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A, on: false });
  ({ json } = await teacherGet(store));
  assert.equal(json.data.blocks.b_q1.counts.confused, 1);

  // Nothing identifying is stored: the key holds the random device id and the value only a time.
  assert.deepEqual(store.map.get(pulseTapKey(LESSON, 'b_q1', 'example', DEVICE_B)), { at: '2026-10-16T03:00:00.000Z' });
});

test('blocks inside tabs and columns take taps of their own', async () => {
  const store = seededStore();
  assert.equal((await tap(store, { block_id: 'b_in_tab', option: 'stuck', device_id: DEVICE_A })).status, 200);
  assert.equal((await tap(store, { block_id: 'b_in_col', option: 'worked', device_id: DEVICE_A })).status, 200);
  assert.equal((await tap(store, { block_id: 'b_tabs', option: 'worked', device_id: DEVICE_A })).status, 404);
  const { json } = await teacherGet(store);
  assert.equal(json.data.blocks.b_in_tab.counts.stuck, 1);
  assert.equal(json.data.blocks.b_in_col.counts.worked, 1);
  assert.equal(json.data.blocks.b_tabs, undefined);
});

test('taps are refused on headings, teacher-only and switched-off blocks, and bad input', async () => {
  const store = seededStore();
  for (const blockId of ['b_heading', 'b_divider', 'b_private', 'b_quiet', 'b_missing']) {
    const res = await tap(store, { block_id: blockId, option: 'confused', device_id: DEVICE_A });
    assert.equal(res.status, 404, blockId);
  }
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'bored', device_id: DEVICE_A })).status, 400);
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'confused', device_id: 'short' })).status, 400);
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'confused', device_id: '../../../x' })).status, 400);
  assert.equal((await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A }, 'https://evil.example')).status, 403);
});

test('a lesson with feedback off refuses every tap', async () => {
  const store = seededStore({ feedback_off: true });
  const res = await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A });
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, 'feedback_off');
});

test('an unpublished or trashed lesson refuses taps', async () => {
  const unpublished = memoryStore({ [`lessons/${LESSON}`]: { id: LESSON, status: 'active' } });
  assert.equal((await tap(unpublished, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A })).status, 404);

  const trashed = seededStore();
  trashed.map.set(`lessons/${LESSON}`, { id: LESSON, status: 'active', deleted_at: '2026-10-01T00:00:00.000Z' });
  assert.equal((await tap(trashed, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A })).status, 404);
});

test('reset archives the counts with a date and clears only that block', async () => {
  const store = seededStore();
  await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A });
  await tap(store, { block_id: 'b_q1', option: 'flat', device_id: DEVICE_B });
  await tap(store, { block_id: 'b_in_tab', option: 'worked', device_id: DEVICE_A });

  const { status, json } = await teacherReset(store, 'b_q1');
  assert.equal(status, 200);
  assert.equal(json.data.blocks.b_q1.total, 0);
  assert.deepEqual(json.data.blocks.b_q1.resets, [
    {
      reset_at: '2026-10-16T03:00:00.000Z',
      counts: { confused: 1, stuck: 0, example: 0, flat: 1, worked: 0 },
      total: 2
    }
  ]);
  assert.equal(json.data.blocks.b_in_tab.total, 1);
  assert.ok(store.map.has(pulseResetsKey(LESSON)));

  // The same device can tap again after a reset.
  await tap(store, { block_id: 'b_q1', option: 'confused', device_id: DEVICE_A });
  const after = await teacherGet(store);
  assert.equal(after.json.data.blocks.b_q1.counts.confused, 1);
});

test('teacher pulse route needs a live lesson and a known action', async () => {
  const store = memoryStore();
  assert.equal((await teacherGet(store)).status, 404);
  const seeded = seededStore();
  const handler = createLessonPulseHandler(deps(seeded));
  const res = await handler(req('POST', `/api/lessons/${LESSON}/pulse`, { action: 'wipe' }), {});
  assert.equal(res.status, 400);
});
