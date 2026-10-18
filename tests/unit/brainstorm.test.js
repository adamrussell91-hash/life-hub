import test from 'node:test';
import assert from 'node:assert/strict';
import { brainstormAction, MAX_PER_STUDENT } from '../../netlify/functions/_shared/brainstorm.mjs';

const blockWith = (content = {}) => ({
  id: 'bs1', type: 'block', block_type: 'brainstorm', variant: 'medium', visibility: 'student_teacher',
  content: { question: 'What does the storm tell us?', safety: 'instant', per_student: 3, max_length: 140, layout: 'grid', ...content },
  created_at: '2026-10-18T00:00:00.000Z', updated_at: '2026-10-18T00:00:00.000Z', schema_version: 1
});
function storeFixture(content) {
  const block = blockWith(content);
  const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
  return {
    data,
    async get(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    }
  };
}
const teach = (store, body, opts = {}) => brainstormAction(store, 'lesson1', 'bs1', body, { teacher: true, ...opts });
const learn = (store, body) => brainstormAction(store, 'lesson1', 'bs1', body);
const tokens = n => Array.from({ length: n }, (_, i) => (i + 1).toString(16).repeat(48).slice(0, 48));
async function startWith(store, n) {
  const round = await teach(store, { action: 'start' });
  const students = tokens(n).map(token => ({ token, session: round.session }));
  for (const s of students) await learn(store, { ...s, action: 'join', code: round.code });
  return { round, students };
}
const submit = (store, s, text) => learn(store, { ...s, action: 'submit', text });

test('instant: clean answers go up, flagged ones wait for the teacher', async () => {
  const store = storeFixture({ safety: 'instant' });
  const { students: [a] } = await startWith(store, 1);
  await submit(store, a, 'His mind is breaking');
  const mine = await submit(store, a, 'what a load of sh1t');
  assert.deepEqual(mine.mine.map(m => m.status), ['shown', 'pending']);
  const t = await teach(store, {});
  assert.deepEqual(t.answers.map(x => [x.status, x.flagged]), [['shown', false], ['pending', true]]);
  assert.ok(t.answers.every(x => x.symbol && x.id));
});

test('approve: every answer waits until approved', async () => {
  const store = storeFixture({ safety: 'approve' });
  const { students: [a] } = await startWith(store, 1);
  await submit(store, a, 'Nature mirrors him');
  const [answer] = (await teach(store, {})).answers;
  assert.equal(answer.status, 'pending');
  await teach(store, { action: 'approve', id: answer.id });
  assert.equal((await teach(store, {})).answers[0].status, 'shown');
  assert.equal((await learn(store, a)).mine[0].status, 'shown');
});

test('per-student cap comes from the block, and unlimited still stops at the hard cap', async () => {
  const store = storeFixture({ per_student: 3 });
  const { students: [a] } = await startWith(store, 1);
  for (const n of [1, 2, 3]) await submit(store, a, `Idea ${n}`);
  await assert.rejects(submit(store, a, 'Idea 4'), /answer limit/);
  const open = storeFixture({ per_student: 0 });
  const { students: [b] } = await startWith(open, 1);
  for (let n = 0; n < MAX_PER_STUDENT; n++) await submit(open, b, `Idea ${n}`);
  await assert.rejects(submit(open, b, 'one more'), /answer limit/);
  assert.equal((await learn(open, b)).per_student, 0);
});

test('length, empty, wrong code and new rounds are refused', async () => {
  const store = storeFixture({ max_length: 20 });
  const { round, students: [a] } = await startWith(store, 1);
  await assert.rejects(submit(store, a, 'x'.repeat(21)), /20 characters/);
  await assert.rejects(submit(store, a, '   '), /Write something/);
  await assert.rejects(learn(store, { token: tokens(2)[1], session: round.session, action: 'join', code: '000000' }), /didn’t match/);
  await teach(store, { action: 'start' });
  await assert.rejects(learn(store, a), /Join again/);
});

test('students see only their own answers unless the teacher shares the board, and the board shows text only once revealed', async () => {
  const store = storeFixture({ safety: 'instant' });
  const { students: [a, b] } = await startWith(store, 2);
  await submit(store, a, 'Guilt');
  await submit(store, b, 'Chaos');
  await submit(store, b, 'you idiot');
  const own = (await learn(store, a)).board;
  assert.deepEqual([own.revealed, own.answers, own.count], [false, [], 2]);
  await teach(store, { action: 'reveal' });
  assert.deepEqual((await learn(store, a)).board.answers, [], 'own: no text even after reveal');
  await teach(store, { action: 'hide' });
  await teach(store, { action: 'students_see', value: 'all' });
  const before = (await learn(store, a)).board;
  assert.deepEqual([before.revealed, before.answers, before.count], [false, [], 2]);
  await teach(store, { action: 'reveal' });
  const after = (await learn(store, a)).board;
  assert.deepEqual(after.answers.map(x => x.text).sort(), ['Chaos', 'Guilt']);
  for (const x of after.answers) assert.deepEqual(Object.keys(x).sort(), ['id', 'text'], 'no symbols, no flags');
  const chaos = (await teach(store, {})).answers.find(x => x.text === 'Chaos');
  await teach(store, { action: 'remove', id: chaos.id });
  assert.deepEqual((await learn(store, a)).board.answers.map(x => x.text), ['Guilt']);
  assert.deepEqual((await learn(store, b)).mine.map(m => m.status), ['removed', 'pending']);
  assert.equal((await teach(store, {})).answers.find(x => x.id === chaos.id).status, 'removed');
});

test('hidden until reveal: nothing leaks before reveal, and revealing closes answering', async () => {
  const store = storeFixture({ safety: 'reveal' });
  const { students: [a, b] } = await startWith(store, 2);
  await teach(store, { action: 'students_see', value: 'all' });
  await submit(store, a, 'Powerless');
  await submit(store, b, 'Humbled');
  const early = await learn(store, a);
  assert.deepEqual(early.board.answers, []);
  assert.ok(!JSON.stringify(early).includes('Humbled'));
  const revealed = await teach(store, { action: 'reveal' });
  assert.equal(revealed.open, false);
  assert.deepEqual((await learn(store, a)).board.answers.map(x => x.text).sort(), ['Humbled', 'Powerless']);
  await assert.rejects(submit(store, a, 'late idea'), /closed/);
});

test('students always see the orbit as symbols, untraceable to any card', async () => {
  const store = storeFixture({ safety: 'instant' });
  const { students: [a, b] } = await startWith(store, 2);
  await submit(store, a, 'Guilt');
  await submit(store, b, 'Chaos');
  const t = await teach(store, {});
  const symbols = t.answers.map(x => x.symbol).sort();
  const before = (await learn(store, a)).board;
  assert.deepEqual(before.orbit.map(o => o.symbol).sort(), symbols);
  assert.deepEqual(before.orbit, (await learn(store, a)).board.orbit, 'stable between polls');
  await teach(store, { action: 'students_see', value: 'all' });
  await teach(store, { action: 'reveal' });
  const after = (await learn(store, a)).board;
  const seen = JSON.stringify([after.answers, after.orbit.map(o => o.id)]);
  for (const x of t.answers) assert.ok(!seen.includes(x.id), 'no real answer id reaches a student');
  const cardIds = new Set(after.answers.map(x => x.id));
  assert.ok(after.orbit.every(o => !cardIds.has(o.id)), 'a shape never shares an id with a card');
});

test('symbols stay hidden from students unless the teacher shows them', async () => {
  const store = storeFixture();
  const { students: [a] } = await startWith(store, 1);
  assert.equal((await learn(store, a)).symbol, null);
  await teach(store, { action: 'symbols', show: true });
  assert.match((await learn(store, a)).symbol, /^\d-\d$/);
  const publicState = await learn(store, {});
  assert.deepEqual(Object.keys(publicState).sort(), ['open', 'phase', 'session']);
});

test('teacher settings: layout, symbols on cards and ending keep the board', async () => {
  const store = storeFixture({ layout: 'cloud' });
  const { students: [a] } = await startWith(store, 1);
  assert.equal((await teach(store, {})).layout, 'cloud');
  assert.equal((await teach(store, { action: 'layout', value: 'groups' })).layout, 'groups');
  await assert.rejects(teach(store, { action: 'layout', value: 'pie' }), /Unknown layout/);
  assert.equal((await teach(store, { action: 'symbols_on_cards', show: false })).symbols_on_cards, false);
  await submit(store, a, 'Madness');
  const ended = await teach(store, { action: 'end' });
  assert.equal(ended.open, false);
  assert.equal(ended.answers.length, 1, 'the board stays after the round ends');
  await assert.rejects(submit(store, a, 'more'), /closed/);
  await assert.rejects(teach(store, { action: 'approve', id: 'nope' }), /Unknown answer/);
});

test('an unpublished or wrong block is unreachable', async () => {
  const store = storeFixture();
  await assert.rejects(brainstormAction(store, 'lesson1', 'other', {}, { teacher: true }), /Publish this lesson/);
  await assert.rejects(brainstormAction(store, '../x', 'bs1', {}), /not found/);
});
