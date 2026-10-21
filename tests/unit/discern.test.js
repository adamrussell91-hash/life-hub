import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonDiscernHandler } from '../../netlify/functions/lesson-discern.mjs';
import { createPublishedDiscernHandler } from '../../netlify/functions/published-discern.mjs';
import { blockTakesDiscern, discernTailKey } from '../../netlify/functions/_shared/discern.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const LESSON = 'lesson_sww_2';
const DEVICE_A = 'devicea0123456789abc';
const DEVICE_B = 'deviceb0123456789abc';
const DISCERN = { mode: 'own', who: '', focus: 'hope', source: '', initial: { type: 'scale', preset: 'agree', options: [] } };

const BLOCKS = [
  { id: 'b_q1', block_type: 'question_set', visibility: 'student_teacher', content: {}, settings: {}, discern: DISCERN },
  { id: 'b_plain', block_type: 'question_set', visibility: 'student_teacher', content: {}, settings: {} },
  { id: 'b_private', block_type: 'rich_text', visibility: 'teacher_only', content: { html: '' }, settings: {}, discern: DISCERN },
  {
    id: 'b_sec', block_type: 'section', visibility: 'student_teacher', settings: {},
    content: { blocks: [{ id: 'b_nested', block_type: 'quote', visibility: 'student_teacher', content: {}, settings: {}, discern: DISCERN }] }
  }
];

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async delete(key) { map.delete(key); },
    async list({ prefix } = {}) { return { blobs: [...map.keys()].filter(k => k.startsWith(prefix ?? '')).map(key => ({ key })) }; }
  };
}

const seeded = () => memoryStore({
  [`lessons/${LESSON}`]: { id: LESSON, title: 'SWW', status: 'active' },
  [`published/lessons/${LESSON}`]: { lesson_id: LESSON, blocks: BLOCKS }
});

let clock = 0;
const deps = store => ({
  getContentStore: async () => store,
  verifySessionToken: () => ({ valid: true }),
  env: { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' },
  nowIso: () => new Date(Date.UTC(2026, 9, 18, 3, 0, clock++)).toISOString()
});

const req = (method, path, body) => new Request(`https://api.adam-russell.com${path}`, {
  method,
  headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'umbrella_session=ok' },
  ...(body ? { body: JSON.stringify(body) } : {})
});

async function send(store, body) {
  const res = await createPublishedDiscernHandler(deps(store))(req('POST', `/api/published/discern/${LESSON}`, body), {});
  return { status: res.status, json: await res.json() };
}
async function spread(store, blockId = 'b_q1') {
  const res = await createLessonDiscernHandler(deps(store))(req('GET', `/api/lessons/${LESSON}/discern?block_id=${blockId}`), {});
  return { status: res.status, json: await res.json() };
}

const tail = (device, overrides = {}) => ({
  block_id: 'b_q1', device_id: device, initial: 'Mostly agree',
  dots: [4, 2, 3, 4, 5], labels: ['Endings should be hopeful', 'Anger is louder', 'Final image', 'Fragile hope', 'Earned'],
  ...overrides
});

test('discern routes: student send is public, teacher spread is not', () => {
  assert.equal(isPublicStudentApi('POST', `/api/published/discern/${LESSON}`), true);
  assert.equal(isPublicStudentApi('GET', `/api/published/discern/${LESSON}`), false);
  assert.equal(isPublicStudentApi('GET', `/api/lessons/${LESSON}/discern`), false);
});

test('only student-visible blocks with Discern take tails', () => {
  const byId = Object.fromEntries(BLOCKS.map(b => [b.id, b]));
  assert.equal(blockTakesDiscern(byId.b_q1), true);
  assert.equal(blockTakesDiscern(byId.b_plain), false);
  assert.equal(blockTakesDiscern(byId.b_private), false);
});

test('tails are stored per device, a resend replaces it, and the spread returns them anonymously', async () => {
  const store = seeded();
  assert.equal((await send(store, tail(DEVICE_A, { dots: [4, 2, 3, 4] , labels: ['a', 'b', 'c', 'd'] }))).status, 200);
  assert.equal((await send(store, tail(DEVICE_A))).status, 200);
  assert.equal((await send(store, tail(DEVICE_B, { initial: 'Disagree', character: { dots: [2, 4, 1], labels: ['x', 'y', 'z'] } }))).status, 200);
  assert.ok(store.map.has(discernTailKey(LESSON, 'b_q1', DEVICE_A)));

  const { status, json } = await spread(store);
  assert.equal(status, 200);
  assert.equal(json.data.tails.length, 2);
  assert.deepEqual(json.data.tails[0].dots, [4, 2, 3, 4, 5]);
  assert.equal(json.data.tails[0].labels[0], 'Endings should be hopeful');
  assert.deepEqual(json.data.tails[1].character.dots, [2, 4, 1]);
  assert.ok(!JSON.stringify(json.data).includes(DEVICE_A), 'device ids never reach the teacher');
});

test('nested blocks take tails; blocks without Discern and bad dots are refused', async () => {
  const store = seeded();
  assert.equal((await send(store, tail(DEVICE_A, { block_id: 'b_nested' }))).status, 200);
  assert.equal((await send(store, tail(DEVICE_A, { block_id: 'b_plain' }))).status, 404);
  assert.equal((await send(store, tail(DEVICE_A, { dots: [9, 2, 3, 4, 5] }))).status, 400);
  assert.equal((await send(store, tail(DEVICE_A, { dots: [1, 2] }))).status, 400);
  assert.equal((await send(store, tail('short'))).status, 400);
});

test('labels are trimmed to 32 characters', async () => {
  const store = seeded();
  await send(store, tail(DEVICE_A, { labels: ['x'.repeat(80), '', '', '', ''] }));
  const { json } = await spread(store);
  assert.equal(json.data.tails[0].labels[0].length, 32);
});

test('reset clears a block’s tails', async () => {
  const store = seeded();
  await send(store, tail(DEVICE_A));
  await send(store, tail(DEVICE_B));
  const res = await createLessonDiscernHandler(deps(store))(req('POST', `/api/lessons/${LESSON}/discern`, { action: 'reset', block_id: 'b_q1' }), {});
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.data.tails.length, 0);
});
