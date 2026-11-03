import test from 'node:test';
import assert from 'node:assert/strict';
import { redraftAction } from '../../netlify/functions/_shared/redraft.mjs';
import { piecesAction, pieceKey } from '../../netlify/functions/_shared/piece-feedback.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

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

const DEVICE = 'a'.repeat(48);
const TEXT = 'The cranes lean over the water. This is effective because it is good. The water stays.';
const column = { id: 'column001', kind: 'assessment', title: 'Harbour paragraph', date: '2026-10-27', weight: 0, criteria: [{ id: 'crit0001', label: 'Analysis', max: 10, outcomes: ['out_a'], concepts: [] }], piece: { lesson_id: 'lesson1', block_id: 'qset1' } };
const tag = { code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 10 };
const SECTION = { part: 'answers', field: 'q1', start: 32, end: 69 };

async function setup(scope = 'whole') {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '11 English', active_unit_ids: [], students: [{ name: 'Mina Okafor' }] }],
    ['markbook/class1', { columns: [column], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open with the claim.' }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [mina] = roster.students;
  await claimInitials(store, roster, DEVICE, mina.initials);
  store.data.set(`work_handins/lesson1/qset1/${mina.id}`, { class_id: 'class1', student_id: mina.id, text: { answers: { q1: TEXT } }, handed_in_at: '2026-10-28T00:00:00Z' });
  const teacher = (action, extra = {}) => piecesAction(store, 'class1', { action, column_id: 'column001', student_id: mina.id, ...extra });
  await teacher('save', { tags: [tag], comment: 'Name the effect.' });
  await teacher('return', { redraft: { scope } });
  const call = (action, extra = {}) => redraftAction(store, 'lesson1', { action, class_id: 'class1', class_token: DEVICE, block_id: 'qset1', ...extra });
  return { store, mina, teacher, call, key: pieceKey('class1', mina.id, 'w:lesson1:qset1'), handin: `work_handins/lesson1/qset1/${mina.id}` };
}

test('a section redraft splices the new words and nothing else changes', async () => {
  const { store, call, handin, key, mina } = await setup(SECTION);
  const loaded = await call('redraft_load');
  assert.deepEqual(loaded.scope, SECTION);
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'The word lean makes them seem to wait.' });
  await call('redraft_send');
  assert.equal(store.data.get(handin).text.answers.q1, 'The cranes lean over the water. The word lean makes them seem to wait. The water stays.');
  assert.equal(store.data.get(handin).draft, 2);
  const archived = store.data.get(`work_drafts/lesson1/qset1/${mina.id}/1`);
  assert.equal(archived.text.answers.q1, TEXT);
  assert.equal(archived.comment, 'Name the effect.');
  assert.equal(archived.tags.length, 1);
  const row = store.data.get(key);
  assert.equal(row.draft, 2);
  assert.equal(row.status, 'draft');
  assert.deepEqual(row.tags, []);
  assert.equal(row.comment, '');
  assert.equal(row.redraft, undefined);
  assert.equal(row.earlier_tags.length, 1);
  assert.deepEqual(row.sent_scope, SECTION);
  assert.equal(store.data.has(`work_redraft/lesson1/qset1/${mina.id}`), false);
});

test('a save outside the section is refused', async () => {
  const { call } = await setup(SECTION);
  await assert.rejects(call('redraft_save', { part: 'answers', field: 'q2', text: 'x' }), /isn’t part of this redraft/);
});

test('a whole redraft replaces the field', async () => {
  const { store, call, handin } = await setup('whole');
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'All new words.' });
  await call('redraft_send');
  assert.equal(store.data.get(handin).text.answers.q1, 'All new words.');
});

test('take back and a double send both get not_asked', async () => {
  const { call, teacher } = await setup('whole');
  await call('redraft_send');
  await assert.rejects(call('redraft_send'), /changed this/);
  await teacher('return', { redraft: { scope: 'whole' } });
  await teacher('take_back');
  await assert.rejects(call('redraft_load'), /changed this/);
});

test('blank and over-long redrafts are refused', async () => {
  const { call } = await setup(SECTION);
  await call('redraft_save', { part: 'answers', field: 'q1', text: '   ' });
  await assert.rejects(call('redraft_send'), /Write something/);
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'x'.repeat(3990) });
  await assert.rejects(call('redraft_send'), /too long/);
});

test('sending with no edits is allowed and keeps the text', async () => {
  const { store, call, handin } = await setup(SECTION);
  await call('redraft_send');
  assert.equal(store.data.get(handin).text.answers.q1, TEXT);
});

test('working words resume for the same scope and restart for another', async () => {
  const { call, teacher } = await setup(SECTION);
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'Kept words.' });
  await teacher('take_back');
  await teacher('return', { redraft: { scope: SECTION } });
  assert.equal((await call('redraft_load')).working.answers.q1, 'Kept words.');
  await teacher('take_back');
  await teacher('return', { redraft: { scope: 'whole' } });
  assert.deepEqual((await call('redraft_load')).working, {});
});

test('an unlinked task says so', async () => {
  const { store, call } = await setup('whole');
  const book = store.data.get('markbook/class1');
  store.data.set('markbook/class1', { ...book, columns: [] });
  await assert.rejects(call('redraft_load'), /task has changed/);
});

test('load gives the student only their words, the scope and the prompts', async () => {
  const { call } = await setup('whole');
  assert.deepEqual(Object.keys(await call('redraft_load')).sort(), ['prompts', 'scope', 'text', 'working']);
});

test('a next-step pick survives on an untouched answer and drops on a changed one', async () => {
  const { store, call, handin, mina } = await setup('whole');
  store.data.set(publishedLessonKey('lesson1'), { blocks: [{ id: 'qset1', block_type: 'question_set', content: { questions: [{ id: 'q1', prompt: 'One' }, { id: 'q2', prompt: 'Two' }] } }] });
  const row = store.data.get(handin);
  store.data.set(handin, { ...row, text: { answers: { q1: TEXT, q2: 'Same.' }, 'step.0': { pick: '{}' }, 'step.1': { pick: '{}' } } });
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'Changed.' });
  await call('redraft_send');
  const text = store.data.get(`work_handins/lesson1/qset1/${mina.id}`).text;
  assert.equal(text['step.0'], undefined);
  assert.deepEqual(text['step.1'], { pick: '{}' });
});

test('a carried rubric saves with nothing blocked, so a one-tap return goes through', async () => {
  const { call, teacher, store, key } = await setup('whole');
  const held = { skills: {}, pieces: {}, steps: {}, next_step: '' };
  store.data.set(key, { ...store.data.get(key), rubric: held });
  await call('redraft_send');
  const saved = await teacher('save', { tags: [], comment: '', rubric: store.data.get(key).rubric });
  assert.deepEqual(saved.blocked ?? [], []);
  const back = await teacher('return');
  assert.equal(back.feedback.status, 'returned');
  assert.equal(back.feedback.draft, 2);
});
