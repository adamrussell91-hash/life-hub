import test from 'node:test';
import assert from 'node:assert/strict';
import { hingeAction, hingeTier } from '../../netlify/functions/_shared/hinge.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const backup = {
  prompt: 'Which force keeps a satellite circling the Earth?',
  options: [
    { id: 'hq1_bk0', text: 'Its engines', misconception: 'moving things need a push', tier: 'close' },
    { id: 'hq1_bk1', text: 'Gravity', misconception: '' },
    { id: 'hq1_bk2', text: 'Static', misconception: 'any pull is electric' }
  ],
  correct_id: 'hq1_bk1',
  source: 'teacher'
};
const hinge = ({ pace = 'independent', withBackup = true } = {}) => ({
  id: 'hq1', type: 'block', block_type: 'hinge_question', variant: 'medium', visibility: 'student_teacher',
  content: {
    prompt: 'Which force keeps the Moon in orbit?',
    options: [
      { id: 'a', text: 'Gravity', misconception: '' },
      { id: 'b', text: 'Its own speed', misconception: 'Speed alone keeps it up there.', tier: 'close' },
      { id: 'c', text: 'Magnetism', misconception: 'Every pull is magnetic.' }
    ],
    correct_id: 'a', seconds: 60, move_on: 80, reteach: 50,
    ...(pace ? { pace } : {}),
    ...(withBackup ? { backup } : {})
  }
});
function storeFor(opts = {}, mode = null) {
  const block = hinge(opts);
  const data = new Map([
    ['lessons/lesson1', { blocks: [block] }],
    ['published/lessons/lesson1', { blocks: filterBlocksForStudent([block]), ...(mode ? { pedagogical_mode: mode } : {}) }]
  ]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const tok = (c) => c.repeat(48);
const student = (store, body) => hingeAction(store, 'lesson1', 'hq1', body);
const teacher = (store) => hingeAction(store, 'lesson1', 'hq1', { action: 'independent' }, { teacher: true });

test('publish strips tiers, notes, the right answer and the back-up but keeps the pace', () => {
  const [out] = filterBlocksForStudent([hinge()]);
  assert.equal(out.content.pace, 'independent');
  assert.equal(out.content.correct_id, undefined);
  assert.equal(out.content.backup, undefined);
  for (const o of out.content.options) assert.deepEqual(Object.keys(o).sort(), ['id', 'text']);
});

test('tiers default from the right answer', () => {
  assert.equal(hingeTier({ id: 'a' }, 'a'), 'right');
  assert.equal(hingeTier({ id: 'a', tier: 'close' }, 'a'), 'right');
  assert.equal(hingeTier({ id: 'b' }, 'a'), 'mixup');
  assert.equal(hingeTier({ id: 'b', tier: 'close' }, 'a'), 'close');
  assert.equal(hingeTier({ id: 'b', tier: 'right' }, 'a'), 'mixup');
});

test('a right first answer is locked in and finishes with the answer marked', async () => {
  const store = storeFor();
  const before = await student(store, { action: 'independent_status', token: tok('a') });
  assert.deepEqual(before, { phase: 'independent', first: null, retry: null, done: false });
  const res = await student(store, { action: 'independent_answer', token: tok('a'), pick: 'a', reason: 'The Earth pulls it', sure: true });
  assert.deepEqual(res.first, { pick: 'a', sure: true, tier: 'right', note: '' });
  assert.equal(res.done, true);
  assert.equal(res.retry, null);
  assert.equal(res.correct_id, 'a');
});

test('a close answer gets its nudge and the back-up as a retry, with no right answer yet', async () => {
  const store = storeFor();
  const res = await student(store, { action: 'independent_answer', token: tok('b'), pick: 'b', reason: 'It is going fast', sure: false });
  assert.deepEqual(res.first, { pick: 'b', sure: false, tier: 'close', note: 'Speed alone keeps it up there.' });
  assert.equal(res.done, false);
  assert.equal(res.correct_id, undefined);
  assert.equal(res.retry.prompt, backup.prompt);
  assert.equal(res.retry.correct_id, undefined);
  assert.equal(res.retry.answer, null);
  for (const o of res.retry.options) assert.deepEqual(Object.keys(o).sort(), ['id', 'text']);
  assert.doesNotMatch(JSON.stringify(res), /"a"|correct_id|misconception|tier":"right/);
  // Reloading shows the same, still without the answer.
  const again = await student(store, { action: 'independent_status', token: tok('b') });
  assert.equal(again.correct_id, undefined);
  assert.equal(again.retry.correct_id, undefined);
});

test('a right retry finishes and is not stuck', async () => {
  const store = storeFor();
  await student(store, { action: 'independent_answer', token: tok('c'), pick: 'c', reason: 'Magnets pull', sure: true });
  const res = await student(store, { action: 'independent_retry', token: tok('c'), pick: 'hq1_bk1', reason: 'Gravity pulls it round' });
  assert.equal(res.done, true);
  assert.equal(res.correct_id, 'a');
  assert.equal(res.retry.correct_id, 'hq1_bk1');
  assert.deepEqual(res.retry.answer, { pick: 'hq1_bk1', sure: null, tier: 'right', note: '' });
  const report = await teacher(store);
  assert.deepEqual(report.stuck, []);
  assert.deepEqual(report.retry, { tried: 1, right: 1 });
});

test('one retry only, and a wrong retry or a skip flags still stuck', async () => {
  const store = storeFor();
  await student(store, { action: 'independent_answer', token: tok('c'), pick: 'c', reason: 'Magnets pull', sure: true });
  const res = await student(store, { action: 'independent_retry', token: tok('c'), pick: 'hq1_bk0', reason: 'Engines push it', sure: true });
  assert.equal(res.retry.answer.tier, 'close');
  assert.equal(res.retry.answer.note, 'moving things need a push');
  await assert.rejects(student(store, { action: 'independent_retry', token: tok('c'), pick: 'hq1_bk1', reason: 'Again' }), { code: 'finished' });
  await assert.rejects(student(store, { action: 'independent_answer', token: tok('c'), pick: 'a', reason: 'Again' }), { code: 'answered' });

  await student(store, { action: 'independent_answer', token: tok('d'), pick: 'b', reason: 'Speed', sure: false });
  const skipped = await student(store, { action: 'independent_skip', token: tok('d') });
  assert.equal(skipped.done, true);
  assert.equal(skipped.retry, null);
  assert.equal(skipped.correct_id, 'a');

  await student(store, { action: 'independent_answer', token: tok('e'), pick: 'a', reason: 'Gravity', sure: false });

  const report = await teacher(store);
  assert.equal(report.answered, 3);
  assert.deepEqual(report.tiers, { right: 1, close: 1, mixup: 1 });
  assert.equal(report.sure_wrong, 1);
  assert.equal(report.stuck.length, 2);
  assert.ok(report.stuck.every((id) => /^[a-f0-9]{6}$/.test(id)));
  assert.deepEqual(report.responses.map((r) => r.first.reason), ['Magnets pull', 'Speed', 'Gravity']);
  assert.equal(report.responses[0].retry.reason, 'Engines push it');
});

test('with no back-up a miss is final and stuck', async () => {
  const store = storeFor({ withBackup: false });
  const res = await student(store, { action: 'independent_answer', token: tok('f'), pick: 'c', reason: 'Magnets', sure: null });
  assert.equal(res.done, true);
  assert.equal(res.retry, null);
  assert.equal(res.correct_id, 'a');
  assert.deepEqual((await teacher(store)).stuck.length, 1);
});

test('the reason is required, capped and flagged', async () => {
  const store = storeFor();
  await assert.rejects(student(store, { action: 'independent_answer', token: tok('a'), pick: 'a', reason: '  ' }), { code: 'no_reason' });
  await assert.rejects(student(store, { action: 'independent_answer', token: tok('a'), pick: 'a', reason: 'x'.repeat(281) }), { code: 'too_long' });
  await assert.rejects(student(store, { action: 'independent_answer', token: tok('a'), pick: 'z', reason: 'why' }), { code: 'bad_pick' });
  await assert.rejects(student(store, { action: 'independent_answer', pick: 'a', reason: 'why' }), { code: 'no_device' });
  await student(store, { action: 'independent_answer', token: tok('a'), pick: 'a', reason: 'what a load of sh1t' });
  const report = await teacher(store);
  assert.equal(report.responses[0].first.flagged, true);
});

test('independent answers are refused on a live block and in a lecture', async () => {
  await assert.rejects(student(storeFor({ pace: null }), { action: 'independent_answer', token: tok('a'), pick: 'a', reason: 'x' }), { code: 'not_independent' });
  await assert.rejects(student(storeFor({}, 'lecture'), { action: 'independent_answer', token: tok('a'), pick: 'a', reason: 'x' }), { code: 'lecture' });
});

test('the client cannot send its own tier or right answer', async () => {
  const store = storeFor();
  const res = await student(store, { action: 'independent_answer', token: tok('a'), pick: 'c', reason: 'because', tier: 'right', correct_id: 'c' });
  assert.equal(res.first.tier, 'mixup');
});
