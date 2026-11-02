import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { toMarkAction } from '../../netlify/functions/_shared/to-mark-flow.mjs';
import { returnedFor } from '../../netlify/functions/_shared/profile-feedback.mjs';
import { pieceKey } from '../../netlify/functions/_shared/piece-feedback.mjs';

/* Invented class and answers only: this repository is public. */

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

const words = 'The town forgets its grief.';

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '8 English', students: [{ name: 'Pip Quill' }] }],
    ['feedback_codes/library', { codes: [{ id: 'ev', code: 'E', label: 'Evidence', group: 'composition', criterion: 1, colour: 'blue', descriptor: 'Quote it.' }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  return { store, roster, pip: roster.students[0] };
}

const saveBody = (pip, over = {}) => ({
  action: 'answer_save', class_id: 'class1', student_id: pip.id, piece: 'q:quiz1:qb', lesson_id: 'quiz1', title: 'Week 5 check',
  text: { answers: { qb: words } },
  tags: [{ code_id: 'ev', positive: false, part: 'answers', field: 'qb', start: 9, end: 16 }],
  comment: ' Name the grief. ',
  ...over
});

test('tags on a written answer save with a frozen copy of the words, and the student sees them returned', async () => {
  const { store, roster, pip } = await setup();
  const { feedback } = await toMarkAction(store, saveBody(pip));
  assert.equal(feedback.kind, 'answer');
  assert.equal(feedback.status, 'returned');
  assert.equal(feedback.column_id, null);
  assert.equal(feedback.comment, 'Name the grief.');
  assert.deepEqual(store.data.get(pieceKey('class1', pip.id, 'q:quiz1:qb')).text, { answers: { qb: words } });
  assert.equal(feedback.tags.length, 1);
  const back = await returnedFor(store, roster, pip);
  assert.ok(JSON.stringify(back).includes('Week 5 check'));
  const loaded = await toMarkAction(store, { action: 'answer_load', class_id: 'class1', student_id: pip.id, piece: 'q:quiz1:qb' });
  assert.equal(loaded.feedback.tags.length, 1);
  assert.deepEqual(loaded.codes.map((c) => c.id), ['ev']);
});

test('a code that does not exist, or words past the end of the answer, are dropped', async () => {
  const { store, pip } = await setup();
  const { feedback } = await toMarkAction(store, saveBody(pip, { tags: [
    { code_id: 'nope', positive: false, part: 'answers', field: 'qb', start: 0, end: 3 },
    { code_id: 'ev', positive: false, part: 'answers', field: 'qb', start: 0, end: 999 }
  ] }));
  assert.deepEqual(feedback.tags, []);
});

test('other students, odd piece ids and unknown actions are refused', async () => {
  const { store, pip } = await setup();
  await assert.rejects(toMarkAction(store, saveBody({ id: 'someone_else' })), /isn’t on this class list/);
  await assert.rejects(toMarkAction(store, saveBody(pip, { piece: '../other' })), /can’t be found/);
  await assert.rejects(toMarkAction(store, { action: 'wipe', class_id: 'class1' }), /Unknown action/);
});

test('a sprint reflection reads the student’s own judgement beside the levels, and refuses work not handed in', async () => {
  const { store, pip } = await setup();
  const { ownerOf } = await import('../../netlify/functions/_shared/sprint.mjs');
  store.data.set('sprint/sprint1/config', { class_id: 'class1', groups: [] });
  store.data.set('lessons/sprint1', { id: 'sprint1', title: 'Bridge sprint', sprint: { columns: { reflection: 'refl0001' }, reflection_criteria: [{ id: 'c1', text: 'Tested it' }] } });
  store.data.set('markbook/class1', { columns: [], marks: { refl0001: { [pip.id]: { steps: { c1: 2 } } } }, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] });
  const body = { action: 'sprint', class_id: 'class1', student_id: pip.id, lesson_id: 'sprint1' };
  await assert.rejects(toMarkAction(store, body), /hasn’t handed this in/);
  store.data.set(`sprint/sprint1/subs/${ownerOf('class1', pip.id)}/test`, { submitted_at: '2026-11-02T00:00:00Z', payload: { reflection: ['It held.'], self: { c1: 3 }, self_why: { c1: 'It held weight.' } } });
  const out = await toMarkAction(store, body);
  assert.equal(out.column_id, 'refl0001');
  assert.deepEqual(out.criteria, [{ id: 'c1', text: 'Tested it', self: 3, self_why: 'It held weight.' }]);
  assert.deepEqual(out.mark, { steps: { c1: 2 } });
});
