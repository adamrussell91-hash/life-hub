// tests/unit/lecture.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { lectureAction, lectureTeacherAction } from '../../netlify/functions/_shared/lecture.mjs';
import { classKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
const ROSTER = [{ id: 'st_ann', name: 'Ann Bell' }, { id: 'st_cy', name: 'Cy Dale' }];
function storeFor({ mode = 'lecture', students = ROSTER } = {}) {
  const data = new Map([
    [publishedLessonKey('lesson1'), { lesson_id: 'lesson1', pedagogical_mode: mode, blocks: [block('h1', 'heading', { text: 'Tone' }), block('k1', 'cloze', { text: 'x' }), block('h2', 'heading', { text: 'Mood' })] }],
    [classKey('class1'), { id: 'class1', status: 'active', title: '9A', students }]
  ]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const tok = (n) => String(n).repeat(48).slice(0, 48);
const who = (n) => ({ class_id: 'class1', class_token: tok(n) });
const INITIALS = { 1: 'AB', 2: 'CD' };
/** Claim the initials for device n, as the player does before it sends anything. */
const claim = (store, n) => lectureAction(store, 'lesson1', { action: 'claim', ...who(n), initials: INITIALS[n] });

test('status needs a class; a rostered class asks for initials until claimed', async () => {
  const store = storeFor();
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'handup', scene_id: 'h1' }), { code: 'need_class', message: 'Open this lecture from your class page.' });
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'status', class_id: 'nope', class_token: tok(1) }), { code: 'need_class', message: 'Open this lecture from your class page.' });
  const status = await lectureAction(store, 'lesson1', { action: 'status', ...who(1) });
  assert.deepEqual(status, { identity: { need: 'initials', initials: null }, handups: [] });
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'handup', ...who(1), scene_id: 'h1' }), { code: 'need_initials' });
  const claimed = await claim(store, 1);
  assert.deepEqual(claimed, { identity: { need: null, initials: 'AB' }, handups: [] });
});

test('a class with no list is anonymous: status says so and nothing is recorded', async () => {
  const store = storeFor({ students: [] });
  const status = await lectureAction(store, 'lesson1', { action: 'status', ...who(1) });
  assert.deepEqual(status, { identity: { need: null, initials: null }, anonymous: true, handups: [] });
  for (const body of [{ action: 'handup', scene_id: 'h1', text: 'hi' }, { action: 'progress', reached: ['h1'] }]) {
    await assert.rejects(lectureAction(store, 'lesson1', { ...body, ...who(1) }), { code: 'no_list', status: 403, message: 'Your teacher hasn’t added a class list yet, so hand-ups are off for now.' });
  }
  assert.deepEqual([...store.data.keys()].filter((k) => k.startsWith('lecture/')), []);
});

test('a hand-up is saved, capped and comes back in status', async () => {
  const store = storeFor();
  await claim(store, 1);
  const after = await lectureAction(store, 'lesson1', { action: 'handup', ...who(1), scene_id: 'h1', scene_label: 'Tone', clip_s: 12, text: '  what is tone?  ' });
  assert.equal(after.handups.length, 1);
  assert.deepEqual({ ...after.handups[0], id: 'x', at: 'x' }, { id: 'x', at: 'x', scene_id: 'h1', scene_label: 'Tone', text: 'what is tone?', status: 'open', reply: '' });
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'handup', ...who(1), scene_id: 'nope' }), { code: 'bad_scene' });
});

test('progress keeps only known ids and one record per student', async () => {
  const store = storeFor();
  await claim(store, 1);
  const body = { action: 'progress', ...who(1), reached: ['h1', 'h2', 'evil'], replays: { h1: 2, evil: 9 }, last_scene: 'h2', missed: ['k1', 'h9'], ticked: 3, finished: true };
  await lectureAction(store, 'lesson1', body);
  await lectureAction(store, 'lesson1', body);
  const records = [...store.data.keys()].filter((k) => k.startsWith('lecture/lesson1/progress/'));
  assert.equal(records.length, 1);
  const saved = store.data.get(records[0]);
  assert.deepEqual([saved.reached, saved.replays, saved.missed, saved.finished], [['h1', 'h2'], { h1: 2 }, ['k1'], true]);
});

test('refused when the lesson is not a published lecture', async () => {
  await assert.rejects(lectureAction(storeFor({ mode: 'quiz' }), 'lesson1', { action: 'status', ...who(1) }), { code: 'not_lecture' });
});

test('the teacher sees counts per scene, misses per gate and the hand-ups, and can answer one', async () => {
  const store = storeFor();
  await claim(store, 1);
  await claim(store, 2);
  await lectureAction(store, 'lesson1', { action: 'progress', ...who(1), reached: ['h1', 'h2'], replays: { h1: 1 }, last_scene: 'h2', missed: ['k1'], ticked: 0, finished: false });
  await lectureAction(store, 'lesson1', { action: 'progress', ...who(2), reached: ['h1'], replays: {}, last_scene: 'h1', missed: [], ticked: 0, finished: false });
  await lectureAction(store, 'lesson1', { action: 'handup', ...who(2), scene_id: 'h1', scene_label: 'Tone', clip_s: 3, text: 'lost' });
  const summary = await lectureTeacherAction(store, 'lesson1', { action: 'summary' });
  assert.equal(summary.students, 2);
  assert.deepEqual(summary.scenes, { h1: { reached: 2, replays: 1 }, h2: { reached: 1, replays: 0 } });
  assert.deepEqual(summary.misses, { k1: 1 });
  assert.equal(summary.handups.length, 1);
  const answered = await lectureTeacherAction(store, 'lesson1', { action: 'answer', id: summary.handups[0].id, reply: 'Tone is the speaker’s attitude.' });
  assert.equal(answered.handups[0].status, 'answered');
  const mine = await lectureAction(store, 'lesson1', { action: 'status', ...who(2) });
  assert.equal(mine.handups[0].reply, 'Tone is the speaker’s attitude.');
});
