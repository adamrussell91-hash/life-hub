// tests/unit/lecture.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { lectureAction, lectureTeacherAction } from '../../netlify/functions/_shared/lecture.mjs';
import { classKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
function storeFor({ mode = 'lecture', students = [] } = {}) {
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

test('status needs a class, and an open class lets anyone in', async () => {
  const store = storeFor();
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'handup', scene_id: 'h1' }), { code: 'need_class' });
  const status = await lectureAction(store, 'lesson1', { action: 'status', ...who(1) });
  assert.deepEqual(status, { identity: { need: null, initials: null }, handups: [] });
});

test('a hand-up is saved, capped and comes back in status', async () => {
  const store = storeFor();
  const after = await lectureAction(store, 'lesson1', { action: 'handup', ...who(1), scene_id: 'h1', scene_label: 'Tone', clip_s: 12, text: '  what is tone?  ' });
  assert.equal(after.handups.length, 1);
  assert.deepEqual({ ...after.handups[0], id: 'x', at: 'x' }, { id: 'x', at: 'x', scene_id: 'h1', scene_label: 'Tone', text: 'what is tone?', status: 'open', reply: '' });
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'handup', ...who(1), scene_id: 'nope' }), { code: 'bad_scene' });
});

test('progress keeps only known ids and one record per student', async () => {
  const store = storeFor();
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
