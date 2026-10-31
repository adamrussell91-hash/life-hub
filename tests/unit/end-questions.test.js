import test from 'node:test';
import assert from 'node:assert/strict';
import { END_QUESTIONS, endQuestionSettings, endQuestionsAction, endQuestionResults, pickQuestions } from '../../netlify/functions/_shared/end-questions.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { profileAction } from '../../netlify/functions/_shared/profile.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e0' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const lesson = { id: 'lesson1', title: 'Weighing the evidence', unit_id: 'unit1', pedagogical_mode: 'lesson', blocks: [] };
const tokenA = 'a'.repeat(48);
const tokenB = 'b'.repeat(48);

async function setup(draft = lesson) {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '10 History', status: 'active', active_unit_ids: ['unit1'], students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }, { name: 'Ann Ames' }] }],
    ['classes/class2', { id: 'class2', type: 'class', title: 'Open class', status: 'active', active_unit_ids: ['unit1'], students: [] }],
    ['units/unit1', { id: 'unit1', lesson_ids: ['lesson1'] }],
    ['lessons/lesson1', draft],
    ['published/lessons/lesson1', { lesson_id: 'lesson1', title: draft.title, blocks: [] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  await claimInitials(store, roster, tokenA, 'BB');
  await claimInitials(store, roster, tokenB, 'TT');
  return { store, roster };
}
const ask = (store, token = tokenA, extra = {}) => endQuestionsAction(store, 'lesson1', { action: 'ask', class_id: 'class1', class_token: token, ...extra }, () => 0.1);
const send = (store, token, answers, unclear) => endQuestionsAction(store, 'lesson1', { action: 'send', class_id: 'class1', class_token: token, answers, ...(unclear !== undefined ? { unclear } : {}) });

test('the student route is public', () => {
  assert.equal(isPublicStudentApi('POST', '/api/published/end-questions/lesson1'), true);
});

test('every answer in the bank is an option to tap', () => {
  assert.equal(END_QUESTIONS.length, 6);
  for (const q of END_QUESTIONS) assert.ok(q.options.length >= 3 && q.options.every((o) => typeof o === 'string' && o.length));
});

test('settings: on by default, off for assessments and quizzes, and a lesson can change either', () => {
  assert.equal(endQuestionSettings({ pedagogical_mode: 'lesson' }).on, true);
  assert.equal(endQuestionSettings({}).on, true);
  assert.equal(endQuestionSettings({ pedagogical_mode: 'assessment' }).on, false);
  assert.equal(endQuestionSettings({ pedagogical_mode: 'quiz' }).on, false);
  assert.equal(endQuestionSettings({ pedagogical_mode: 'quiz', end_questions: { on: true } }).on, true);
  assert.equal(endQuestionSettings({ end_questions: { on: false } }).on, false);
  const skipped = endQuestionSettings({ end_questions: { skip: ['example', 'earlier'] } });
  assert.deepEqual(skipped.pool, ['clear_task', 'unstuck', 'explain', 'checked']);
  assert.equal(endQuestionSettings({ end_questions: { skip: END_QUESTIONS.slice(1).map((q) => q.id) } }).on, false, 'one question left asks nothing');
  assert.equal(endQuestionSettings({ end_questions: { unclear: false } }).unclear, false);
});

test('picks the two questions with the fewest answers', () => {
  const pool = ['clear_task', 'unstuck', 'explain', 'checked'];
  const pair = pickQuestions(pool, { clear_task: 5, unstuck: 1, explain: 0, checked: 3 }, () => 0.9);
  assert.deepEqual([...pair].sort(), ['explain', 'unstuck']);
});

test('a student on the list gets two questions and the box, once per device', async () => {
  const { store } = await setup();
  const first = await ask(store);
  assert.equal(first.questions.length, 2);
  assert.equal(first.unclear, 'Anything from this lesson still unclear?');
  for (const q of first.questions) assert.ok(Array.isArray(q.options));
  const [a, b] = first.questions;
  assert.deepEqual(await send(store, tokenA, { [a.id]: 0, [b.id]: 1 }, '  why corroboration matters  '), { given: true, saved: true });
  assert.deepEqual(await ask(store), { given: true }, 'this device has answered');
  assert.deepEqual(await send(store, tokenA, { [a.id]: 3 }), { given: true }, 'a second send changes nothing');
  const counts = store.data.get('end-questions/lesson1/counts');
  assert.equal(counts[a.id], 1);
  assert.equal(counts[b.id], 1);
});

test('nothing stored names the student or the time', async () => {
  const { store, roster } = await setup();
  await send(store, tokenA, { clear_task: 1, unstuck: 3 }, 'x');
  const stored = [...store.data.entries()].filter(([k]) => k.startsWith('end-questions/lesson1/'));
  const text = JSON.stringify(stored);
  for (const s of roster.students) assert.ok(!text.includes(s.id), 'no student id');
  assert.ok(!text.includes(tokenA), 'no device token');
  const [, answer] = stored.find(([k]) => k.includes('/answers/'));
  assert.deepEqual(Object.keys(answer).sort(), ['answers', 'day', 'unclear']);
  assert.match(answer.day, /^\d{4}-\d{2}-\d{2}$/);
});

test('refuses answers it should not keep', async () => {
  const { store } = await setup({ ...lesson, end_questions: { skip: ['example'] } });
  await send(store, tokenA, { example: 0, clear_task: 9, unstuck: 1.5, made_up: 0, explain: 2, checked: 1 }, 'y'.repeat(400));
  const [, answer] = [...store.data.entries()].find(([k]) => k.includes('/answers/'));
  assert.deepEqual(answer.answers, { explain: 2, checked: 1 });
  assert.equal(answer.unclear.length, 300);
});

test('skipping everything still counts as given, and stores no answer', async () => {
  const { store } = await setup();
  assert.deepEqual(await send(store, tokenA, {}), { given: true, saved: false });
  assert.equal([...store.data.keys()].some((k) => k.includes('/answers/')), false);
});

test('off lessons, unknown devices and classes with no list are not asked', async () => {
  const off = await setup({ ...lesson, pedagogical_mode: 'assessment' });
  assert.deepEqual(await ask(off.store), { off: true });
  const { store } = await setup();
  assert.deepEqual(await ask(store, 'c'.repeat(48)), { off: true }, 'a device with no claim on the list');
  assert.deepEqual(await endQuestionsAction(store, 'lesson1', { action: 'ask', class_id: 'class2', class_token: tokenA }), { off: true });
  await assert.rejects(endQuestionsAction(store, 'lesson1', { action: 'ask', class_id: 'class1', class_token: 'short' }), /browser/);
  await assert.rejects(endQuestionsAction(store, 'nope', { action: 'ask', class_id: 'class1', class_token: tokenA }), /not found/);
});

test('teacher results pool the answers and show the share who ticked', async () => {
  const { store } = await setup();
  await send(store, tokenA, { clear_task: 0, unstuck: 3 }, 'what counts as corroboration');
  await send(store, tokenB, { clear_task: 1, explain: 0 });
  await profileAction(store, 'class1', { action: 'done', class_token: tokenA, lesson_id: 'lesson1', quick: true });
  const results = await endQuestionResults(store, 'lesson1');
  assert.equal(results.classes.length, 1);
  const cls = results.classes[0];
  assert.equal(cls.students, 3);
  assert.equal(cls.ticked, 1);
  assert.equal(cls.responses, 2);
  const clear = cls.questions.find((q) => q.id === 'clear_task');
  assert.deepEqual(clear.counts, [1, 1, 0, 0]);
  assert.equal(clear.n, 2);
  assert.deepEqual(cls.unclear, ['what counts as corroboration']);
  assert.equal(results.all.responses, 2);
  assert.equal(results.settings.on, true);
});

test('a student can untick their own lesson, but not a teacher’s mark', async () => {
  const { store, roster } = await setup();
  const bob = roster.students[0];
  await profileAction(store, 'class1', { action: 'done', class_token: tokenA, lesson_id: 'lesson1', quick: true });
  assert.ok(store.data.has(`profile/class1/${bob.id}/done/lesson1`));
  assert.deepEqual(await profileAction(store, 'class1', { action: 'undone', class_token: tokenA, lesson_id: 'lesson1', quick: true }), { need: null, initials: 'BB' });
  assert.equal(store.data.has(`profile/class1/${bob.id}/done/lesson1`), false);
  store.data.set(`profile/class1/${bob.id}/done/lesson1`, { at: '2026-10-30T00:00:00.000Z', via: 'teacher' });
  await profileAction(store, 'class1', { action: 'undone', class_token: tokenA, lesson_id: 'lesson1', quick: true });
  assert.equal(store.data.get(`profile/class1/${bob.id}/done/lesson1`).via, 'teacher');
});
