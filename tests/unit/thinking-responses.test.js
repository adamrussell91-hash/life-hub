import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonThinkingHandler } from '../../netlify/functions/lesson-thinking.mjs';
import { createPublishedThinkingHandler } from '../../netlify/functions/published-thinking.mjs';
import { cleanThinkingData, thinkingKind } from '../../netlify/functions/_shared/thinking-responses.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const LESSON = 'lesson_thinking_1';
const DEVICE_A = 'devicea0123456789abc';
const DEVICE_B = 'deviceb0123456789abc';
const CARDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];

const BLOCKS = [
  { id: 'b_d9', block_type: 'diamond_nine', visibility: 'student_teacher', content: {}, settings: {} },
  { id: 'b_venn', block_type: 'venn', visibility: 'student_teacher', content: {}, settings: {} },
  { id: 'b_hidden', block_type: 'venn', visibility: 'teacher_only', content: {}, settings: {} },
  { id: 'b_panels', block_type: 'tabs', visibility: 'student_teacher', content: { tabs: [] }, settings: {} },
  {
    id: 'b_sec', block_type: 'section', visibility: 'student_teacher', settings: {},
    content: { blocks: [{ id: 'b_choice', block_type: 'tabs', visibility: 'student_teacher', content: { style: 'choice', tabs: [] }, settings: {} }] }
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
  [`lessons/${LESSON}`]: { id: LESSON, title: 'Thinking', status: 'active' },
  [`published/lessons/${LESSON}`]: { lesson_id: LESSON, blocks: BLOCKS }
});

let clock = 0;
const deps = store => ({
  getContentStore: async () => store,
  verifySessionToken: () => ({ valid: true }),
  env: { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' },
  nowIso: () => new Date(Date.UTC(2026, 10, 11, 3, 0, clock++)).toISOString()
});

const req = (method, path, body) => new Request(`https://api.adam-russell.com${path}`, {
  method,
  headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'umbrella_session=ok' },
  ...(body ? { body: JSON.stringify(body) } : {})
});

async function send(store, body) {
  const res = await createPublishedThinkingHandler(deps(store))(req('POST', `/api/published/thinking/${LESSON}`, body), {});
  return { status: res.status, json: (await res.json()).data };
}
async function read(store, blockId) {
  const res = await createLessonThinkingHandler(deps(store))(req('GET', `/api/lessons/${LESSON}/thinking?block_id=${blockId}`), {});
  return { status: res.status, json: (await res.json()).data };
}

test('thinking routes: student send is public, teacher read is not', () => {
  assert.equal(isPublicStudentApi('POST', `/api/published/thinking/${LESSON}`), true);
  assert.equal(isPublicStudentApi('GET', `/api/published/thinking/${LESSON}`), false);
  assert.equal(isPublicStudentApi('GET', `/api/lessons/${LESSON}/thinking`), false);
});

test('only student-visible thinking blocks take responses', () => {
  const byId = Object.fromEntries(BLOCKS.map(b => [b.id, b]));
  assert.equal(thinkingKind(byId.b_d9), 'diamond');
  assert.equal(thinkingKind(byId.b_venn), 'venn');
  assert.equal(thinkingKind(byId.b_hidden), null);
  assert.equal(thinkingKind(byId.b_panels), null);
  assert.equal(thinkingKind(BLOCKS[4].content.blocks[0]), 'choice');
});

test('data is cleaned to plain, bounded values', () => {
  const cleaned = cleanThinkingData({ ok: 'x'.repeat(2000), 'bad key!': 1, list: Array.from({ length: 80 }, (_, i) => i), fn: undefined, deep: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } } });
  assert.equal(cleaned.ok.length, 800);
  assert.equal('bad key!' in cleaned, false);
  assert.equal(cleaned.list.length, 40);
  assert.equal(cleaned.deep.a.b.c.d.e, null);
});

test('a Diamond 9 first round returns the class layouts, anonymous, only once sent', async () => {
  const store = seeded();
  const draft = await send(store, { block_id: 'b_d9', device_id: DEVICE_A, initials: 'jt', data: { rounds: {} } });
  assert.equal(draft.status, 200);
  assert.equal(draft.json.class, undefined);
  assert.equal(draft.json.saved, true);
  const a = await send(store, { block_id: 'b_d9', device_id: DEVICE_A, initials: 'jt', data: { rounds: { first: { slots: CARDS, reasons: { c1: 'Opens the idea' } } } } });
  assert.deepEqual(a.json.class.layouts, [CARDS]);
  const b = await send(store, { block_id: 'b_d9', device_id: DEVICE_B, initials: 'r.k.', data: { rounds: { first: { slots: [...CARDS].reverse() } } } });
  assert.equal(b.json.class.layouts.length, 2);
  assert.equal(JSON.stringify(b.json).includes('Opens the idea'), false);
  assert.equal(JSON.stringify(b.json).includes('JT'), false);

  const teacher = await read(store, 'b_d9');
  assert.equal(teacher.status, 200);
  assert.deepEqual(teacher.json.responses.map(r => r.initials), ['JT', 'RK']);
  assert.equal(teacher.json.responses[0].data.rounds.first.reasons.c1, 'Opens the idea');
});

test('resending replaces the device record; reset clears the block', async () => {
  const store = seeded();
  await send(store, { block_id: 'b_venn', device_id: DEVICE_A, initials: 'AB', data: { points: [] } });
  await send(store, { block_id: 'b_venn', device_id: DEVICE_A, initials: 'AB', data: { points: [{ id: 'p1', text: 'Both open in a storm' }] } });
  assert.equal((await read(store, 'b_venn')).json.responses.length, 1);
  const res = await createLessonThinkingHandler(deps(store))(req('POST', `/api/lessons/${LESSON}/thinking`, { action: 'reset', block_id: 'b_venn' }), {});
  assert.equal((await res.json()).data.responses.length, 0);
});

test('blocks that take no responses, and bad devices, are refused', async () => {
  const store = seeded();
  assert.equal((await send(store, { block_id: 'b_hidden', device_id: DEVICE_A, data: {} })).status, 404);
  assert.equal((await send(store, { block_id: 'b_panels', device_id: DEVICE_A, data: {} })).status, 404);
  assert.equal((await send(store, { block_id: 'b_d9', device_id: 'short', data: {} })).status, 400);
  assert.equal((await send(store, { block_id: 'b_d9', device_id: DEVICE_A })).status, 400);
  assert.equal((await send(store, { block_id: 'b_choice', device_id: DEVICE_A, data: { picks: [0, 4, 8] } })).status, 200);
});
