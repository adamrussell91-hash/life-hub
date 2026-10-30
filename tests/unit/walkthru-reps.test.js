import test from 'node:test';
import assert from 'node:assert/strict';
import { listReps, planRep, tapRep, unplanRep } from '../../netlify/functions/_shared/walkthru-reps.mjs';
import { createWalkthruRepsHandler } from '../../netlify/functions/walkthru-reps.mjs';
import { createWalkthrusBoardHandler } from '../../netlify/functions/walkthrus-board.mjs';

function store() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : null; },
    async setJSON(k, v) { map.set(k, structuredClone(v)); },
    async delete(k) { map.delete(k); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const T = 'w1-cold-calling';
const end = '2026-10-20T04:00:00.000Z';

test('plan, tap, undo and unplan keep one small record per lesson and class', async () => {
  const s = store();
  await planRep(s, { technique_id: T, lesson_id: 'l1', class_id: 'c1', lesson_end: end }, '2026-10-19T00:00:00.000Z');
  assert.equal((await listReps(s)).length, 1);
  assert.equal((await listReps(s, T))[0].state, 'planned');
  assert.equal((await tapRep(s, { technique_id: T, lesson_id: 'l1', class_id: 'c1', lesson_end: end, state: 'ran' }, '2026-10-20T05:00:00.000Z')).state, 'ran');
  // planning again never overwrites a logged rep
  await planRep(s, { technique_id: T, lesson_id: 'l1', class_id: 'c1', lesson_end: end });
  assert.equal((await listReps(s, T))[0].state, 'ran');
  assert.equal((await tapRep(s, { technique_id: T, lesson_id: 'l1', class_id: 'c1', state: 'ran' })).state, 'planned');
  assert.equal((await unplanRep(s, { technique_id: T, lesson_id: 'l1', class_id: 'c1' })).removed, true);
  assert.equal((await listReps(s)).length, 0);
  // an unscheduled lesson: a tap makes the record, the same tap removes it
  assert.equal((await tapRep(s, { technique_id: T, lesson_id: 'l2', state: 'partly' })).state, 'partly');
  assert.equal(await tapRep(s, { technique_id: T, lesson_id: 'l2', state: 'partly' }), null);
  assert.equal((await listReps(s)).length, 0);
});

test('bad input is refused', async () => {
  const s = store();
  await assert.rejects(tapRep(s, { technique_id: 'nope', lesson_id: 'l1', state: 'ran' }), { status: 400 });
  await assert.rejects(tapRep(s, { technique_id: T, lesson_id: 'l1', state: 'sideways' }), { status: 400 });
  await assert.rejects(planRep(s, { technique_id: T, lesson_id: '../x' }), { status: 400 });
  await assert.rejects(listReps(s, 'nope'), { status: 400 });
});

const gateEnv = { GITHUB_TOKEN: 't', LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const post = (url, body) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the reps endpoint is teacher only and never cached', async () => {
  const s = store();
  const make = (valid) => createWalkthruRepsHandler({ env: gateEnv, getContentStore: async () => s, verifySessionToken: () => ({ valid }) });
  assert.equal((await make(false)(new Request('https://example.test/api/walkthru-reps'))).status, 401);
  const tapped = await make(true)(post('https://example.test/api/walkthru-reps', { action: 'tap', technique_id: T, lesson_id: 'l9', state: 'ran' }));
  assert.equal(tapped.status, 200);
  const listed = await make(true)(new Request('https://example.test/api/walkthru-reps'));
  assert.equal(listed.headers.get('cache-control'), 'no-store');
  assert.equal((await listed.json()).data.reps.length, 1);
  assert.equal((await make(true)(post('https://example.test/api/walkthru-reps', { action: 'tap', technique_id: 'nope', lesson_id: 'l9', state: 'ran' }))).status, 400);
  assert.equal((await make(true)(post('https://example.test/api/walkthru-reps', { action: 'nope' }))).status, 400);
});

test('the board endpoint keeps only valid arrows', async () => {
  const s = store();
  const make = (valid) => createWalkthrusBoardHandler({ env: gateEnv, getContentStore: async () => s, verifySessionToken: () => ({ valid }) });
  assert.equal((await make(false)(new Request('https://example.test/api/walkthrus-board'))).status, 401);
  const saved = await make(true)(post('https://example.test/api/walkthrus-board', { arrows: [{ id: 'a1', from: T, to: 'w1-quizzing', type: 'leads_to' }, { id: 'a2', from: T, to: 'nope', type: 'leads_to' }] }));
  assert.equal(saved.status, 200);
  const read = await make(true)(new Request('https://example.test/api/walkthrus-board'));
  assert.deepEqual((await read.json()).data.board.arrows.map((a) => a.id), ['a1']);
});

test('the board endpoint keeps Adam’s picks apart from his arrows', async () => {
  const s = store();
  const handler = createWalkthrusBoardHandler({ env: gateEnv, getContentStore: async () => s, verifySessionToken: () => ({ valid: true }) });
  const read = async () => (await (await handler(new Request('https://example.test/api/walkthrus-board'))).json()).data.board;
  assert.equal((await read()).picked, null, 'null until he first picks');
  await handler(post('https://example.test/api/walkthrus-board', { picked: [T, 'nope', T, 'w1-quizzing'] }));
  assert.deepEqual((await read()).picked, [T, 'w1-quizzing']);
  // saving arrows alone keeps the picks, and picks alone keep the arrows
  await handler(post('https://example.test/api/walkthrus-board', { arrows: [{ id: 'a1', from: T, to: 'w1-quizzing', type: 'leads_to' }] }));
  await handler(post('https://example.test/api/walkthrus-board', { picked: [T] }));
  const board = await read();
  assert.deepEqual(board.picked, [T]);
  assert.deepEqual(board.arrows.map((a) => a.id), ['a1']);
});
