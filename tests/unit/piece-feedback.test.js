import test from 'node:test';
import assert from 'node:assert/strict';
import { piecesAction, pieceKey } from '../../netlify/functions/_shared/piece-feedback.mjs';
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

const column = { id: 'column001', kind: 'assessment', title: 'Imagery paragraph', date: '2026-10-27', weight: 0, piece: { lesson_id: 'lesson1', block_id: 'qset1', short: 'Imagery' }, criteria: [{ id: 'crit0001', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [] }] };

async function setup() {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '12 English', active_unit_ids: [], students: [{ name: 'Ava Nguyen' }, { name: 'Noah Patel' }] }],
    ['markbook/class1', { columns: [column], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open with your argument.' }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [ava] = roster.students;
  store.data.set(`work_handins/lesson1/qset1/${ava.id}`, { class_id: 'class1', student_id: ava.id, text: { answers: { q1: 'In the poem the poet uses imagery.' } }, handed_in_at: '2026-10-28T00:00:00Z' });
  return { store, ava };
}

const tag = { code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 34, quote: 'In the poem the poet uses imagery.' };

test('list shows who handed in and where each piece is up to', async () => {
  const { store, ava } = await setup();
  const out = await piecesAction(store, 'class1', { action: 'list', column_id: 'column001' });
  assert.equal(out.students.find((s) => s.id === ava.id).handed_in_at, '2026-10-28T00:00:00Z');
  assert.equal(out.students.find((s) => s.id === ava.id).status, 'waiting');
  assert.equal(out.students.find((s) => s.id !== ava.id).status, 'not_in');
});

test('save keeps tags inside the frozen text and writes steps to the Markbook', async () => {
  const { store, ava } = await setup();
  await piecesAction(store, 'class1', { action: 'save', column_id: 'column001', student_id: ava.id, tags: [tag, { ...tag, end: 999 }], comment: 'Sharp evidence.', steps: { crit0001: 'building' } });
  const saved = store.data.get(pieceKey('class1', ava.id, 'w:lesson1:qset1'));
  assert.equal(saved.status, 'draft');
  assert.equal(saved.tags.length, 1, 'a tag past the end of the text is dropped');
  assert.equal(store.data.get('markbook/class1').marks.column001[ava.id].steps.crit0001, 'building');
});

test('return, then take back', async () => {
  const { store, ava } = await setup();
  await piecesAction(store, 'class1', { action: 'save', column_id: 'column001', student_id: ava.id, tags: [tag], comment: 'Sharp.', steps: { crit0001: 'secure' } });
  await piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: ava.id });
  assert.equal(store.data.get(pieceKey('class1', ava.id, 'w:lesson1:qset1')).status, 'returned');
  await piecesAction(store, 'class1', { action: 'take_back', column_id: 'column001', student_id: ava.id });
  const back = store.data.get(pieceKey('class1', ava.id, 'w:lesson1:qset1'));
  assert.equal(back.status, 'draft');
  assert.equal(back.returned_at, undefined);
});

test('load leaves step picks out of the text and places them on their answers', async () => {
  const { store, ava } = await setup();
  const pick = { code_id: 'ts', line: 'Open with a claim a reader could argue with.', start: 0, end: 11 };
  store.data.set('published/lessons/lesson1', { lesson_id: 'lesson1', blocks: [{ id: 'qset1', block_type: 'question_set', content: { questions: [{ id: 'q1', prompt: 'How is imagery used?' }] } }] });
  const key = `work_handins/lesson1/qset1/${ava.id}`;
  store.data.set(key, { ...store.data.get(key), text: { answers: { q1: 'In the poem the poet uses imagery.' }, 'step.0': { pick: JSON.stringify(pick) } } });
  const out = await piecesAction(store, 'class1', { action: 'load', column_id: 'column001', student_id: ava.id });
  assert.deepEqual(Object.keys(out.text), ['answers']);
  assert.deepEqual(out.steps, [{ part: 'answers', field: 'q1', pick }]);
});

test('nothing returns without a hand-in', async () => {
  const { store } = await setup();
  const roster = await loadRoster(store, 'class1');
  await assert.rejects(piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: roster.students[1].id }), /hasn’t handed this in/);
});
