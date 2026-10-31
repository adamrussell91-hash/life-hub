import test from 'node:test';
import assert from 'node:assert/strict';
import { listReps, planRep, stepRep, tapRep, unplanRep } from '../../netlify/functions/_shared/walkthru-reps.mjs';
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

test('a step tick saves the steps and the state follows them', async () => {
  const { applyStepTick } = await import('../../packages/walkthrus/reps.mjs');
  const fresh = { technique_id: T, lesson_id: 'l1', class_id: 'c1', goal_id: null, state: 'planned', note: '', lesson_end: null, steps_done: [], at: 'x' };
  const one = applyStepTick(null, { step: 2, done: true, steps_total: 5, fresh }, 'n1');
  assert.deepEqual([one.state, one.steps_done], ['partly', [2]]);
  let rep = one;
  for (const step of [5, 1, 4, 3]) rep = applyStepTick(rep, { step, done: true, steps_total: 5, fresh }, 'n2');
  assert.deepEqual([rep.state, rep.steps_done], ['ran', [1, 2, 3, 4, 5]]);
  // ticking the same step twice keeps one copy
  assert.deepEqual(applyStepTick(rep, { step: 3, done: true, steps_total: 5, fresh }).steps_done, [1, 2, 3, 4, 5]);
  rep = applyStepTick(rep, { step: 4, done: false, steps_total: 5, fresh });
  assert.deepEqual([rep.state, rep.steps_done], ['partly', [1, 2, 3, 5]]);
  // none left: an unscheduled lesson has no record, a scheduled one goes back to planned
  assert.equal(applyStepTick(one, { step: 2, done: false, steps_total: 5, fresh }), null);
  const scheduled = { ...one, lesson_end: '2026-10-20T04:00:00.000Z' };
  const back = applyStepTick(scheduled, { step: 2, done: false, steps_total: 5, fresh });
  assert.deepEqual([back.state, back.steps_done], ['planned', []]);
  // bad ticks change nothing
  assert.equal(applyStepTick(one, { step: 7, done: true, steps_total: 5, fresh }), one);
  assert.equal(applyStepTick(one, { step: 0, done: true, steps_total: 5, fresh }), one);
  assert.equal(applyStepTick(one, { step: 1, done: 'yes', steps_total: 5, fresh }), one);
});

test('ticks save per lesson and class, and a tap on the strip keeps them', async () => {
  const s = store();
  const target = { technique_id: T, lesson_id: 'l1', class_id: 'c1', lesson_end: end, steps_total: 5 };
  await planRep(s, target, '2026-10-19T00:00:00.000Z');
  assert.equal((await stepRep(s, { ...target, step: 1, done: true })).state, 'partly');
  assert.deepEqual((await stepRep(s, { ...target, step: 3, done: true })).steps_done, [1, 3]);
  const tapped = await tapRep(s, { ...target, state: 'ran' });
  assert.deepEqual([tapped.state, tapped.steps_done], ['ran', [1, 3]]);
  assert.equal((await stepRep(s, { ...target, step: 3, done: false })).state, 'partly');
  assert.equal((await stepRep(s, { ...target, step: 1, done: false })).state, 'planned');
  await assert.rejects(stepRep(s, { ...target, step: 6, done: true }), { status: 400 });
  await assert.rejects(stepRep(s, { ...target, step: 1, done: true, steps_total: 0 }), { status: 400 });
});

test('a fusion is a tile: its reps save like a technique’s', async () => {
  const s = store();
  const fusion = { technique_id: 'fu_abc12345', lesson_id: 'l4', class_id: null, steps_total: 4 };
  const rep = await stepRep(s, { ...fusion, step: 2, done: true });
  assert.equal(rep.technique_id, 'fu_abc12345');
  assert.equal((await listReps(s, 'fu_abc12345')).length, 1);
  assert.equal((await tapRep(s, { ...fusion, state: 'ran' })).state, 'ran');
  await assert.rejects(stepRep(s, { ...fusion, technique_id: 'fu_X', step: 1, done: true }), { status: 400 });
});

test('the reps endpoint takes a step tick', async () => {
  const s = store();
  const handler = createWalkthruRepsHandler({ env: gateEnv, getContentStore: async () => s, verifySessionToken: () => ({ valid: true }) });
  const res = await handler(post('https://example.test/api/walkthru-reps', { action: 'steps', technique_id: T, lesson_id: 'l5', class_id: 'c2', step: 1, done: true, steps_total: 5 }));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).data.rep.steps_done, [1]);
});
