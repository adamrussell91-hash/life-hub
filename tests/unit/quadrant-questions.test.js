import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonQuadrantHandler } from '../../netlify/functions/lesson-quadrant.mjs';
import { createPublishedQuadrantHandler } from '../../netlify/functions/published-quadrant.mjs';
import {
  blockTakesQuestions, placeWithClaude, point, quadrantQuestionKey, symbolFor
} from '../../netlify/functions/_shared/quadrant-questions.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const LESSON = 'lesson_land_1';
const DEVICE_A = 'devicea0123456789abc';
const DEVICE_B = 'deviceb0123456789abc';

const quadrant = (id, extra = {}) => ({
  id, block_type: 'question_quadrant', visibility: 'student_teacher', settings: {},
  content: { stimulus: 'A story about country.', collect_questions: true, questions: [], converters: [] }, ...extra
});
const BLOCKS = [
  quadrant('b_qq'),
  quadrant('b_off', { content: { stimulus: '', collect_questions: false } }),
  quadrant('b_private', { visibility: 'teacher_only' }),
  { id: 'b_sec', block_type: 'section', visibility: 'student_teacher', settings: {}, content: { blocks: [quadrant('b_nested')] } }
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
  [`lessons/${LESSON}`]: { id: LESSON, title: 'Land', status: 'active' },
  [`published/lessons/${LESSON}`]: { lesson_id: LESSON, blocks: BLOCKS }
});

let clock = 0;
let ids = 0;
const deps = (store, placeQuestion = async () => ({ x: 0.8, y: 0.8 })) => ({
  getContentStore: async () => store,
  verifySessionToken: () => ({ valid: true }),
  env: { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' },
  nowIso: () => new Date(Date.UTC(2026, 9, 18, 3, 0, clock++)).toISOString(),
  newId: () => `q${ids++}`,
  placeQuestion
});

const req = (method, path, body) => new Request(`https://api.adam-russell.com${path}`, {
  method,
  headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'umbrella_session=ok' },
  ...(body ? { body: JSON.stringify(body) } : {})
});

async function student(store, body, place) {
  const res = await createPublishedQuadrantHandler(deps(store, place))(req('POST', `/api/published/quadrant/${LESSON}`, body), {});
  return { status: res.status, json: await res.json() };
}
async function teacher(store, body) {
  const handler = createLessonQuadrantHandler(deps(store));
  const res = body
    ? await handler(req('POST', `/api/lessons/${LESSON}/quadrant`, { block_id: 'b_qq', ...body }), {})
    : await handler(req('GET', `/api/lessons/${LESSON}/quadrant?block_id=b_qq`), {});
  return { status: res.status, json: await res.json() };
}

const ask = (device, text, student = { x: 0.2, y: 0.2 }, extra = {}) =>
  ({ action: 'send', block_id: 'b_qq', device_id: device, text, student, ...extra });

test('quadrant routes: student endpoint is public, teacher map is not', () => {
  assert.equal(isPublicStudentApi('POST', `/api/published/quadrant/${LESSON}`), true);
  assert.equal(isPublicStudentApi('GET', `/api/lessons/${LESSON}/quadrant`), false);
});

test('only student-visible quadrants with collecting on take questions', () => {
  const byId = Object.fromEntries(BLOCKS.map(b => [b.id, b]));
  assert.equal(blockTakesQuestions(byId.b_qq), true);
  assert.equal(blockTakesQuestions(byId.b_off), false);
  assert.equal(blockTakesQuestions(byId.b_private), false);
});

test('points clamp to 0–1 and symbols give the first six students six colours and six shapes', () => {
  assert.deepEqual(point({ x: -1, y: 2 }), { x: 0, y: 1 });
  assert.equal(point({ x: 'a', y: 1 }), null);
  const first = Array.from({ length: 6 }, (_, i) => symbolFor(i).split('-'));
  assert.equal(new Set(first.map(([c]) => c)).size, 6);
  assert.equal(new Set(first.map(([, s]) => s)).size, 6);
  assert.equal(new Set(Array.from({ length: 36 }, (_, i) => symbolFor(i))).size, 36);
});

test('a student sends a question with their own placement; the teacher sees it with the app’s guess', async () => {
  const store = seeded();
  const sent = await student(store, ask(DEVICE_A, '  What land did Uncle   come from? '));
  assert.equal(sent.status, 200);
  assert.equal(sent.json.data.mine.length, 1);
  assert.equal(sent.json.data.mine[0].text, 'What land did Uncle come from?');
  assert.equal(sent.json.data.mine[0].ai, undefined, 'students never see the app’s guess');
  assert.ok(store.map.has(quadrantQuestionKey(LESSON, 'b_qq', DEVICE_A)));

  await student(store, ask(DEVICE_B, 'Can anyone own land?', { x: 0.9, y: 0.9 }));
  const { status, json } = await teacher(store);
  assert.equal(status, 200);
  assert.equal(json.data.questions.length, 2);
  const [a, b] = json.data.questions;
  assert.deepEqual(a.student, { x: 0.2, y: 0.2 });
  assert.deepEqual(a.ai, { x: 0.8, y: 0.8 });
  assert.notEqual(a.symbol, b.symbol, 'each device gets its own symbol');
  assert.ok(!JSON.stringify(json.data).includes(DEVICE_A), 'device ids never reach the teacher');
});

test('the question still saves when the app cannot place it', async () => {
  const store = seeded();
  await student(store, ask(DEVICE_A, 'Why?'), async () => null);
  const { json } = await teacher(store);
  assert.equal(json.data.questions[0].ai, undefined);
});

test('students are refused without text, without a placement, past three, on other blocks, and when closed', async () => {
  const store = seeded();
  assert.equal((await student(store, ask(DEVICE_A, '   '))).status, 400);
  assert.equal((await student(store, ask(DEVICE_A, 'Why?', null))).status, 400);
  assert.equal((await student(store, ask(DEVICE_A, 'Why?', undefined, { block_id: 'b_off' }))).status, 404);
  assert.equal((await student(store, ask(DEVICE_A, 'Why?', undefined, { block_id: 'b_nested' }))).status, 200);
  for (const n of [1, 2, 3]) assert.equal((await student(store, ask(DEVICE_A, `Q${n}`))).status, 200);
  assert.equal((await student(store, ask(DEVICE_A, 'Q4'))).status, 409);
  await teacher(store, { action: 'open', on: false });
  const closed = await student(store, ask(DEVICE_B, 'Late'));
  assert.equal(closed.status, 409);
  assert.equal(closed.json.error.code, 'closed');
});

test('the teacher moves, chooses, hides and resets; students see chosen questions', async () => {
  const store = seeded();
  await student(store, ask(DEVICE_A, 'Who taught him the songs?'));
  await student(store, ask(DEVICE_B, 'Is belonging the same as owning?'));
  const [qa, qb] = (await teacher(store)).json.data.questions;

  let board = (await teacher(store, { action: 'move', question_id: qa.id, to: { x: 0.3, y: 0.7 } })).json.data;
  assert.deepEqual(board.questions[0].teacher, { x: 0.3, y: 0.7 });
  board = (await teacher(store, { action: 'unmove', question_id: qa.id })).json.data;
  assert.equal(board.questions[0].teacher, undefined);

  board = (await teacher(store, { action: 'choose', question_id: qb.id })).json.data;
  assert.deepEqual(board.chosen, [qb.id]);
  const status = await student(store, { action: 'status', block_id: 'b_qq', device_id: DEVICE_A });
  assert.deepEqual(status.json.data.chosen.map(c => c.text), ['Is belonging the same as owning?']);

  board = (await teacher(store, { action: 'hide', question_id: qb.id })).json.data;
  assert.equal(board.questions.length, 1);
  assert.deepEqual(board.chosen, []);

  board = (await teacher(store, { action: 'reset' })).json.data;
  assert.equal(board.questions.length, 0);
  assert.equal([...store.map.keys()].filter(k => k.startsWith('quadrant/')).length, 0);
  assert.equal((await teacher(store, { action: 'fly' })).status, 400);
});

test('the app’s guess reads Claude’s JSON, and gives up quietly without a key or on a bad reply', async () => {
  assert.equal(await placeWithClaude({ env: {}, text: 'Why?' }), null);
  const reply = text => async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
  assert.deepEqual(await placeWithClaude({ env: { ANTHROPIC_API_KEY: 'k' }, text: 'Why?', fetchImpl: reply('{"x": 0.62, "y": 0.4}') }), { x: 0.62, y: 0.4 });
  assert.equal(await placeWithClaude({ env: { ANTHROPIC_API_KEY: 'k' }, text: 'Why?', fetchImpl: reply('no idea') }), null);
  assert.equal(await placeWithClaude({ env: { ANTHROPIC_API_KEY: 'k' }, text: 'Why?', fetchImpl: async () => new Response('', { status: 500 }) }), null);
});
