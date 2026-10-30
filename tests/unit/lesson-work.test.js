import test from 'node:test';
import assert from 'node:assert/strict';
import { workAction, classWork, WORK_LIMITS } from '../../netlify/functions/_shared/lesson-work.mjs';
import { markbookAction } from '../../netlify/functions/_shared/markbook.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e0' } : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const questions = { id: 'qset1', block_type: 'question_set', visibility: 'student_teacher', content: { title: 'The crash', questions: [{ id: 'q1', prompt: 'Who decided?' }, { id: 'q2', prompt: 'Why?' }] } };
const hidden = { id: 'notes1', block_type: 'text', visibility: 'teacher_only', content: {} };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '11 History', active_unit_ids: ['unit1'], students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }] }],
    ['classes/class2', { id: 'class2', type: 'class', title: 'Open class', active_unit_ids: ['unit1'], students: [] }],
    ['units/unit1', { id: 'unit1', lesson_ids: ['lesson1'] }],
    ['lessons/lesson1', { id: 'lesson1', title: 'Highway case', unit_id: 'unit1', blocks: [] }],
    ['published/lessons/lesson1', { lesson_id: 'lesson1', title: 'Highway case', blocks: [{ id: 'sec', block_type: 'section', content: { blocks: [questions] } }, hidden] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  return { store, bob: roster.students[0], tom: roster.students[1] };
}

const bobDevice = { class_id: 'class1', class_token: 'b'.repeat(48) };
const save = (store, extra) => workAction(store, 'lesson1', { ...bobDevice, action: 'save', ...extra });

test('the student route is public', () => {
  assert.equal(isPublicStudentApi('POST', '/api/published/work/lesson1'), true);
  assert.equal(isPublicStudentApi('GET', '/api/published/work/lesson1'), false);
});

test('a student must claim initials before anything is saved', async () => {
  const { store } = await setup();
  assert.deepEqual(await workAction(store, 'lesson1', { ...bobDevice, action: 'status' }), { need: 'initials' });
  await assert.rejects(save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'The council' } }), /initials/);
  const claimed = await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  assert.deepEqual(claimed, { need: null, initials: 'BB' });
  assert.deepEqual(await workAction(store, 'lesson1', { ...bobDevice, action: 'status' }), { need: null, initials: 'BB' });
});

test('saves each part as the student writes, and the markbook reads it back with prompts', async () => {
  const { store, bob } = await setup();
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  const out = await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'The council', q2: '   ', bad: 3 } });
  assert.equal(out.saved, true);
  await save(store, { block_id: 'qset1', part: 'format.because_but_so', fields: { because: 'cost' } });
  // A later save of a part replaces it.
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'The state', q2: 'Money' } });

  const work = await classWork(store, 'lesson1', 'class1', [bob.id]);
  assert.equal(work.title, 'Highway case');
  assert.deepEqual(work.blocks, [{ id: 'qset1', block_type: 'question_set', title: 'The crash', prompts: { q1: 'Who decided?', q2: 'Why?' } }]);
  assert.deepEqual(work.students[bob.id].blocks, { qset1: { answers: { q1: 'The state', q2: 'Money' }, 'format.because_but_so': { because: 'cost' } } });

  const loaded = await markbookAction(store, 'class1', { action: 'load', skip_done: true });
  assert.deepEqual(loaded.work.map((w) => [w.id, Object.keys(w.students)]), [['work:lesson1', [bob.id]]]);

  // Clearing every field drops the part, then the block.
  await save(store, { block_id: 'qset1', part: 'answers', fields: {} });
  await save(store, { block_id: 'qset1', part: 'format.because_but_so', fields: { because: '' } });
  assert.equal(await classWork(store, 'lesson1', 'class1', [bob.id]), null);
});

test('refuses blocks, parts and sizes it should not keep', async () => {
  const { store } = await setup();
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await assert.rejects(save(store, { block_id: 'nope', part: 'answers', fields: { q1: 'x' } }), /changed/);
  await assert.rejects(save(store, { block_id: 'notes1', part: 'answers', fields: { q1: 'x' } }), /changed/, 'teacher-only blocks never take answers');
  await assert.rejects(save(store, { block_id: 'qset1', part: 'flashcards', fields: { q1: 'x' } }), /can’t be saved/);
  await assert.rejects(save(store, { block_id: 'qset1', part: 'answers', fields: ['x'] }), /can’t be saved/);
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'y'.repeat(WORK_LIMITS.text + 50) } });
  const kept = [...store.data.entries()].find(([k]) => k.startsWith('work/lesson1/'))[1];
  assert.equal(kept.blocks.qset1.answers.q1.length, WORK_LIMITS.text);
  await assert.rejects(workAction(store, 'lesson1', { ...bobDevice, action: 'save', block_id: 'qset1', part: 'answers', fields: {}, class_id: 'missing' }), /class page/);
});

test('a class with no list records nothing', async () => {
  const { store } = await setup();
  const device = { class_id: 'class2', class_token: 'c'.repeat(48) };
  assert.deepEqual(await workAction(store, 'lesson1', { ...device, action: 'status' }), { need: null, anonymous: true });
  await assert.rejects(workAction(store, 'lesson1', { ...device, action: 'save', block_id: 'qset1', part: 'answers', fields: { q1: 'x' } }), /class list/);
});

test('the markbook only shows students on this class’s list', async () => {
  const { store, bob, tom } = await setup();
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'A' } });
  assert.equal(await classWork(store, 'lesson1', 'class1', [tom.id]), null);
  assert.equal(await classWork(store, 'lesson1', 'class2', [bob.id]), null);
});

const linkColumn = (store) => store.data.set('markbook/class1', {
  columns: [{ id: 'column001', kind: 'assessment', title: 'The crash', date: '2026-10-27', weight: 0, piece: { lesson_id: 'lesson1', block_id: 'qset1' }, criteria: [{ id: 'crit0001', label: 'Analysis', max: 10, outcomes: [], concepts: [] }] }],
  marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: []
});

test('status names the blocks this class marks', async () => {
  const { store } = await setup();
  linkColumn(store);
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  const status = await workAction(store, 'lesson1', { ...bobDevice, action: 'status' });
  assert.deepEqual(status.handin_blocks, ['qset1']);
});

test('hand in freezes the block text and can be redone until it is returned', async () => {
  const { store, bob } = await setup();
  linkColumn(store);
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'First go.' } });
  const first = await workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' });
  assert.ok(first.handed_in_at);
  const key = `work_handins/lesson1/qset1/${bob.id}`;
  assert.deepEqual(store.data.get(key).text, { answers: { q1: 'First go.' } });
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'Second go.' } });
  await workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' });
  assert.equal(store.data.get(key).text.answers.q1, 'Second go.');
  store.data.set(`piece_feedback/class1/${bob.id}/w:lesson1:qset1`, { status: 'returned' });
  await assert.rejects(workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' }), /already been returned/);
});

test('hand in is refused for a block this class does not mark', async () => {
  const { store } = await setup();
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await assert.rejects(workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' }), /isn’t set to be handed in/);
});
