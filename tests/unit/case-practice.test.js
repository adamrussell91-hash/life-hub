// tests/unit/case-practice.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { casePracticeAction } from '../../netlify/functions/_shared/case-practice.mjs';
import { caseTeacherAction, storeCaseConfig } from '../../netlify/functions/_shared/case-study.mjs';
import { storeFor } from './helpers/sprint-store.js';
import { publishedLessonKey, draftLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const doc = (id, title) => ({ id, kind: 'memo', title, source: 'Source', text: `Text of ${title}.` });
const CASE = (over = {}) => ({
  purpose: 'Weigh evidence on a case they have not seen.', pace: 'teacher', support: 'standard', release: 'layered', flow: 'A', outcomes: [],
  parts: [{ id: 'p1', title: 'Part one', docs: [doc('d1', 'Memo A')], question: 'What stands out?' }, { id: 'p2', title: 'Part two', docs: [doc('d2', 'Memo B')], question: 'And now?' }],
  decision: { prompt: 'What do you do?', options: [{ id: 'a', label: 'Act' }, { id: 'b', label: 'Wait' }] },
  outcome: { text: 'They acted.', source: 'Gazette', hold_until: '2999-01-01' },
  objections: [],
  transfer: { title: 'Other case', docs: [doc('t1', 'Transfer doc')], question: 'Which rule helped?' },
  class_id: 'class1', ...over
});
const DRAFT = (over = {}) => ({ title: 'A case', unit_id: 'u1', pedagogical_mode: 'case_study', blocks: [], case: CASE(over) });

/** A published case with real class state, and a real student's work. */
async function realCase() {
  const store = storeFor();
  const settings = CASE();
  store.data.set(publishedLessonKey('cs1'), { lesson_id: 'cs1', pedagogical_mode: 'case_study', blocks: [] });
  store.data.set(draftLessonKey('cs1'), { id: 'cs1', pedagogical_mode: 'case_study', case: settings });
  await storeCaseConfig(store, 'cs1', settings);
  store.data.set('case/cs1/state', { open_to: 1, parts_open: 1, outcome_revealed: false });
  store.data.set('case/cs1/work/real-owner', { first_take: { option_id: 'a', why: 'gut' }, student_id: 's1' });
  return store;
}
const realKeys = (store) => JSON.stringify([...store.data.entries()].filter(([k]) => !k.includes('~practice')));
const op = (store, name, extra = {}) => casePracticeAction(store, 'cs1', { op: name, ...extra });
const as = (store, action, extra = {}) => op(store, 'student', { body: { action, ...extra } });
const teach = (store, action, extra = {}) => op(store, 'teacher', { body: { action, ...extra } });

test('a whole teacher-paced run, start to finish, leaves the real case untouched', async () => {
  const store = await realCase();
  const before = realKeys(store);
  let s = await op(store, 'open', { draft: DRAFT() });
  assert.equal(s.lesson.lesson_id, 'cs1~practice');
  assert.equal(s.class.pace, 'teacher');
  assert.equal(s.status.open_to, 0);
  assert.equal(s.status.identity.need, null);
  await as(store, 'save', { kind: 'first_take', option_id: 'a', why: 'gut' });
  s = await teach(store, 'open', { station: 1 });
  assert.equal(s.status.parts.length, 1);
  await as(store, 'save', { kind: 'answer', part_id: 'p1', text: 'x' });
  s = await teach(store, 'release_part');
  assert.equal(s.class.parts_open, 2);
  await as(store, 'save', { kind: 'answer', part_id: 'p2', text: 'y' });
  await teach(store, 'open', { station: 2 });
  await as(store, 'lock', { option_id: 'b', because: 'evidence', confidence: 60 });
  await teach(store, 'open', { station: 3 });
  s = await teach(store, 'reveal');
  // A held Outcome is shown in practice, so the teacher can read it now.
  assert.equal(s.status.outcome.text, 'They acted.');
  await as(store, 'save', { kind: 'reflection', text: 'hm' });
  s = await teach(store, 'open', { station: 4 });
  assert.equal(s.status.transfer.title, 'Other case');
  await as(store, 'save', { kind: 'rule', when: 'w', then: 't', unless: 'u' });
  s = await as(store, 'save', { kind: 'transfer', answer: 'rule one' });
  assert.ok(s.done.includes('rules'));
  assert.equal(realKeys(store), before);
  const board = await caseTeacherAction(store, 'cs1', { action: 'board' });
  assert.equal(board.open_to, 1);
  assert.equal(board.outcome_revealed, false);
  assert.deepEqual(board.spread, {});
});

test('open carries on an unchanged case and starts again when the case changed', async () => {
  const store = await realCase();
  await op(store, 'open', { draft: DRAFT() });
  await as(store, 'save', { kind: 'first_take', option_id: 'a', why: 'gut' });
  let s = await op(store, 'open', { draft: DRAFT() });
  assert.equal(s.status.work.first_take.option_id, 'a');
  s = await op(store, 'open', { draft: DRAFT({ purpose: 'Something else entirely.' }) });
  assert.equal(s.status.work.first_take, undefined);
  await as(store, 'save', { kind: 'first_take', option_id: 'b', why: 'gut' });
  s = await op(store, 'start', { draft: DRAFT({ purpose: 'Something else entirely.' }) });
  assert.equal(s.status.work.first_take, undefined);
});

test('own pace moves on by itself and refuses class moves; an unfinished case says what is missing', async () => {
  const store = await realCase();
  await op(store, 'open', { draft: DRAFT({ pace: 'own' }) });
  await as(store, 'save', { kind: 'first_take', option_id: 'a', why: 'gut' });
  const s = await as(store, 'advance');
  assert.equal(s.open_to, 1);
  await assert.rejects(teach(store, 'open', { station: 2 }), (e) => e.code === 'own_pace');
  await assert.rejects(op(store, 'start', { draft: DRAFT({ outcome: { text: '', source: '' } }) }), (e) => e.code === 'not_ready' && /outcome/.test(e.message));
  await assert.rejects(op(fresh(), 'state'), (e) => e.code === 'not_started');
});

function fresh() {
  return storeFor();
}
