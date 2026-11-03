import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonWhyAction, MAX_SUGGESTIONS_PER_STUDENT } from '../../netlify/functions/_shared/lesson-why.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';

const block = {
  id: 'w1', type: 'block', block_type: 'outcomes', variant: 'medium', visibility: 'student_teacher',
  content: { what: 'Sentence length', how: [] }
};
function storeFixture() {
  const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const A = 'a'.repeat(48);
const B = 'b'.repeat(48);
const student = (store, token, action, extra = {}) => lessonWhyAction(store, 'lesson1', 'w1', { token, action, ...extra });
const teacher = (store, action, extra = {}) => lessonWhyAction(store, 'lesson1', 'w1', { action, ...extra }, { teacher: true });

test('the route is open to students', () => {
  assert.equal(isPublicStudentApi('POST', '/api/published/why/lesson1/w1'), true);
});

test('a student sees the class only after writing their own, and never who wrote what', async () => {
  const store = storeFixture();
  await student(store, A, 'why', { text: 'It helps my stories' });
  const before = await student(store, B, 'status');
  assert.equal(before.mine, null);
  assert.deepEqual(before.others, []);
  const after = await student(store, B, 'why', { text: 'It helps my speeches' });
  assert.equal(after.mine, 'It helps my speeches');
  assert.deepEqual(after.others, ['It helps my stories']);
  assert.ok(!JSON.stringify(after).includes(A));
});

test('rewriting replaces a student’s Why rather than adding another', async () => {
  const store = storeFixture();
  await student(store, A, 'why', { text: 'First go' });
  await student(store, A, 'why', { text: 'Second go' });
  const view = await teacher(store, 'status');
  assert.deepEqual(view.whys.map((w) => w.text), ['Second go']);
});

test('a hidden Why leaves other students’ screens but stays with its writer', async () => {
  const store = storeFixture();
  await student(store, A, 'why', { text: 'Silly answer' });
  await student(store, B, 'why', { text: 'Real answer' });
  const { whys } = await teacher(store, 'status');
  await teacher(store, 'hide', { id: whys.find((w) => w.text === 'Silly answer').id });
  assert.deepEqual((await student(store, B, 'status')).others, []);
  assert.equal((await student(store, A, 'status')).mine, 'Silly answer');
});

test('a flagged Why waits for the teacher, and showing it covers that wording only', async () => {
  const store = storeFixture();
  await student(store, A, 'why', { text: 'this is shit' });
  await student(store, B, 'why', { text: 'Real answer' });
  assert.deepEqual((await student(store, B, 'status')).others, []);
  const flagged = (await teacher(store, 'status')).whys.find((w) => w.flagged);
  await teacher(store, 'show', { id: flagged.id });
  assert.deepEqual((await student(store, B, 'status')).others, ['this is shit']);
  await student(store, A, 'why', { text: 'this is shit, really' });
  assert.deepEqual((await student(store, B, 'status')).others, []);
});

test('an added suggestion leaves the queue and reaches students as a criterion', async () => {
  const store = storeFixture();
  await student(store, A, 'suggest', { text: 'use short sentnces' });
  const { suggestions } = await teacher(store, 'status');
  const after = await teacher(store, 'add', { id: suggestions[0].id, text: 'Use short sentences on purpose' });
  assert.equal(after.suggestions.length, 0);
  assert.deepEqual((await student(store, B, 'status')).criteria.map((c) => c.text), ['Use short sentences on purpose']);
});

test('a student can make only so many suggestions', async () => {
  const store = storeFixture();
  for (let i = 0; i < MAX_SUGGESTIONS_PER_STUDENT; i += 1) await student(store, A, 'suggest', { text: `Idea ${i}` });
  await assert.rejects(student(store, A, 'suggest', { text: 'One more' }), (e) => e.code === 'limit');
});

test('clear empties the class’s side and leaves the lesson alone', async () => {
  const store = storeFixture();
  await student(store, A, 'why', { text: 'Mine' });
  await student(store, A, 'suggest', { text: 'Idea' });
  await teacher(store, 'add', { text: 'A criterion' });
  const view = await teacher(store, 'clear');
  assert.deepEqual(view, { whys: [], suggestions: [], criteria: [] });
  assert.ok(store.data.has('published/lessons/lesson1'));
});

test('students can’t use teacher actions, and an unpublished block is closed', async () => {
  const store = storeFixture();
  await assert.rejects(student(store, A, 'clear'), (e) => e.code === 'bad_request');
  await assert.rejects(student(store, 'nope', 'status'), (e) => e.code === 'no_device');
  await assert.rejects(lessonWhyAction(store, 'lesson1', 'other', { token: A, action: 'status' }), (e) => e.code === 'not_published');
});
