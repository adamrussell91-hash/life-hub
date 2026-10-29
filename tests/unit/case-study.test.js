// tests/unit/case-study.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { caseAction, caseTeacherAction, casePublishProblems, prepareCasePublish, storeCaseConfig } from '../../netlify/functions/_shared/case-study.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';
import { publishedLessonKey, draftLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const doc = (id, title) => ({ id, kind: 'memo', title, source: 'Source', text: `Text of ${title}.` });
const SETTINGS = (over = {}) => ({
  purpose: 'Weigh evidence on a case they have not seen.', pace: 'own', support: 'standard', release: 'layered', flow: 'A', outcomes: [],
  parts: [{ id: 'p1', title: 'Part one', docs: [doc('d1', 'Memo A'), doc('d2', 'Memo B')], question: 'What stands out?' }, { id: 'p2', title: 'Part two', docs: [doc('d3', 'Memo C')], question: 'And now?' }],
  decision: { prompt: 'What do you do?', options: [{ id: 'a', label: 'Act' }, { id: 'b', label: 'Wait' }] },
  outcome: { text: 'SECRET-OUTCOME they acted.', source: 'Gazette' },
  objections: ['SECRET-OBJECTION but cost?'],
  transfer: { title: 'Other case', docs: [doc('t1', 'SECRET-TRANSFER-DOC')], question: 'Which rule helped?' },
  class_id: 'class1', ...over
});
function setup(over = {}) {
  const store = storeFor();
  const settings = SETTINGS(over);
  store.data.set(publishedLessonKey('cs1'), { lesson_id: 'cs1', pedagogical_mode: 'case_study', blocks: [] });
  store.data.set(draftLessonKey('cs1'), { id: 'cs1', pedagogical_mode: 'case_study', case: settings });
  return storeCaseConfig(store, 'cs1', settings).then(() => store);
}
const act = (store, n, action, extra = {}) => caseAction(store, 'cs1', { action, ...who(n), ...extra });
const claim = (store, n) => act(store, n, 'claim', { initials: INITIALS[n] });
const save = (store, n, kind, extra) => act(store, n, 'save', { kind, ...extra });
const teach = (store, action, extra = {}) => caseTeacherAction(store, 'cs1', { action, ...extra });
const rejects = (p, code) => assert.rejects(p, (e) => (code ? e.code === code : true));

async function toDecision(store, n = 1, pick = 'a') {
  await claim(store, n);
  await save(store, n, 'first_take', { option_id: pick, why: 'gut' });
  await act(store, n, 'advance');
  await save(store, n, 'answer', { part_id: 'p1', text: 'x' });
  await act(store, n, 'next_part');
  await save(store, n, 'answer', { part_id: 'p2', text: 'y' });
  await act(store, n, 'advance');
}

test('publish problems list every missing piece, and a finished case splits cleanly', () => {
  const draft = { case: SETTINGS() };
  assert.deepEqual(casePublishProblems(draft), []);
  assert.ok(casePublishProblems({ case: SETTINGS({ purpose: '' }) }).length);
  assert.ok(casePublishProblems({ case: SETTINGS({ parts: [] }) }).length);
  assert.ok(casePublishProblems({ case: SETTINGS({ decision: { prompt: 'Q', options: [{ id: 'a', label: 'A' }] } }) }).length);
  assert.ok(casePublishProblems({ case: SETTINGS({ outcome: { text: 't', source: ' ' } }) }).length);
  assert.ok(casePublishProblems({ case: SETTINGS({ transfer: undefined }) }).length);
  assert.deepEqual(casePublishProblems({ case: SETTINGS({ objections: [] }) }), []);
  assert.deepEqual(casePublishProblems({ case: SETTINGS({ rules_off: true, transfer: undefined }) }), []);
  assert.deepEqual(prepareCasePublish({ case: SETTINGS({ objections: ['Fair?', ' '] }) }).config.objections, ['Fair?']);
  assert.deepEqual(casePublishProblems({ case: SETTINGS({ pace: 'teacher', objections: [] }) }), []);
  const { snapshot, config } = prepareCasePublish(draft);
  const text = JSON.stringify(snapshot);
  for (const secret of ['SECRET', 'Memo A', 'Gazette']) assert.equal(text.includes(secret), false);
  assert.deepEqual(snapshot.part_titles, ['Part one', 'Part two']);
  assert.equal(snapshot.has_objections, true);
  assert.equal(config.outcome.source, 'Gazette');
});

test('identity gating: initials first, then not_for_you for another class', async () => {
  const store = await setup({ class_id: 'other' });
  assert.equal((await act(store, 1, 'status')).identity.need, 'initials');
  await rejects(save(store, 1, 'first_take', {}), 'need_initials');
  const s = await claim(store, 1);
  assert.equal(s.not_for_you, true);
});

test('Outcome and transfer never appear before their gates, even after a lock', async () => {
  const store = await setup();
  const fresh = JSON.stringify(await claim(store, 1));
  assert.equal(fresh.includes('SECRET'), false);
  await toDecision(store);
  // Station 2 open, not yet locked: no outcome, no objection, no transfer.
  let s = JSON.stringify(await act(store, 1, 'status'));
  assert.equal(s.includes('SECRET'), false);
  await act(store, 1, 'lock', { option_id: 'a', because: 'evidence', confidence: 70 });
  // Locked but station 3 not advanced to yet.
  s = JSON.stringify(await act(store, 1, 'status'));
  assert.equal(s.includes('SECRET'), false);
  // A student who never locked stays clean while another progresses.
  await claim(store, 2);
  assert.equal(JSON.stringify(await act(store, 2, 'status')).includes('SECRET'), false);
  await act(store, 1, 'advance');
  s = await act(store, 1, 'status');
  assert.equal(s.outcome.text.includes('SECRET-OUTCOME'), true);
  assert.deepEqual(s.objections, ['SECRET-OBJECTION but cost?']);
  assert.equal(s.transfer, null);
  assert.equal(s.work.first_take.option_id, 'a');
});

test('own pace: advance needs the step done; layered next_part needs the answer', async () => {
  const store = await setup({ release: 'layered' });
  await claim(store, 1);
  await rejects(act(store, 1, 'advance'), 'not_done');
  await save(store, 1, 'first_take', { option_id: 'a', why: 'x' });
  assert.equal((await act(store, 1, 'advance')).open_to, 1);
  let s = await act(store, 1, 'status');
  assert.equal(s.parts.length, 1);
  await rejects(act(store, 1, 'next_part'), 'answer_first');
  await save(store, 1, 'answer', { part_id: 'p1', text: 'a' });
  s = await act(store, 1, 'next_part');
  assert.equal(s.parts.length, 2);
  await rejects(act(store, 1, 'advance'), 'not_done');
  s = await save(store, 1, 'answer', { part_id: 'p2', text: 'b' });
  assert.deepEqual(s.done, ['brief', 'case']);
});

test('saves are refused for stations not reached, and evidence is validated and deduped', async () => {
  const store = await setup();
  await claim(store, 1);
  await rejects(save(store, 1, 'evidence', { doc_id: 'd1', quote: 'q' }), 'not_open');
  await rejects(act(store, 1, 'lock', { option_id: 'a', because: 'b', confidence: 50 }), 'not_open');
  await save(store, 1, 'first_take', { option_id: 'a', why: 'x' });
  await act(store, 1, 'advance');
  await rejects(save(store, 1, 'evidence', { doc_id: 'nope', quote: 'q' }), 'bad_doc');
  await save(store, 1, 'evidence', { doc_id: 'd1', quote: '  q  ' });
  const s = await save(store, 1, 'evidence', { doc_id: 'd1', quote: 'q' });
  assert.equal(s.work.evidence.length, 1);
  assert.equal(s.work.evidence[0].quote, 'q');
  const removed = await save(store, 1, 'evidence_remove', { id: s.work.evidence[0].id });
  assert.equal(removed.work.evidence.length, 0);
});

test('lock validates, is final, and freezes the first take', async () => {
  const store = await setup();
  await toDecision(store);
  await rejects(act(store, 1, 'lock', { option_id: 'zz', because: 'b', confidence: 50 }), 'bad_option');
  await rejects(act(store, 1, 'lock', { option_id: 'a', because: ' ', confidence: 50 }), 'empty');
  await rejects(act(store, 1, 'lock', { option_id: 'a', because: 'b', confidence: 150 }), 'bad_confidence');
  const s = await act(store, 1, 'lock', { option_id: 'b', because: 'cost', confidence: 40 });
  assert.equal(s.work.decision.option_id, 'b');
  assert.ok(s.work.decision.locked_at);
  await rejects(act(store, 1, 'lock', { option_id: 'a', because: 'c', confidence: 90 }), 'already_locked');
  await rejects(save(store, 1, 'first_take', { option_id: 'b', why: 'again' }), 'already_locked');
});

test('outcome done needs objection and reflection, then rules open the transfer', async () => {
  const store = await setup();
  await toDecision(store);
  await act(store, 1, 'lock', { option_id: 'a', because: 'ev', confidence: 80 });
  await act(store, 1, 'advance');
  await save(store, 1, 'reflection', { text: 'I was close' });
  await rejects(act(store, 1, 'advance'), 'not_done');
  await save(store, 1, 'objection', { index: 0, answer: 'It still holds' });
  const s = await act(store, 1, 'advance');
  assert.equal(s.open_to, 4);
  assert.equal(s.transfer.title, 'Other case');
  assert.equal(s.transfer.docs[0].id, 't1');
  await save(store, 1, 'rule', { when: 'w', then: 't', unless: 'u' });
  const done = await save(store, 1, 'transfer', { answer: 'ans' });
  assert.deepEqual(done.done, ['brief', 'case', 'decide', 'outcome', 'rules']);
});

test('with Rules and the reflection off, the case ends at the Outcome once the objection is answered', async () => {
  const store = await setup({ rules_off: true, reflection: { question: '', off: true }, transfer: undefined });
  await toDecision(store);
  await act(store, 1, 'lock', { option_id: 'a', because: 'ev', confidence: 80 });
  await act(store, 1, 'advance');
  await rejects(save(store, 1, 'reflection', { text: 'x' }), 'not_open');
  await save(store, 1, 'objection', { index: 0, answer: 'It still holds' });
  const s = await act(store, 1, 'advance');
  assert.equal(s.open_to, 3);
  assert.equal(s.transfer, null);
  assert.ok(s.done.includes('outcome'));
  await rejects(save(store, 1, 'rule', { when: 'w', then: 't', unless: 'u' }), 'not_open');
  await rejects(teach(store, 'open', { station: 4 }), 'bad_station');
  assert.equal((await teach(store, 'board')).last, 3);
});

test('spread is aggregate and early under five; not_used lists uncited docs', async () => {
  const store = await setup();
  for (const [n, pick, conf] of [[1, 'a', 60], [2, 'b', 80]]) {
    await toDecision(store, n, pick);
    await act(store, n, 'lock', { option_id: pick, because: 'b', confidence: conf });
  }
  await save(store, 1, 'evidence', { doc_id: 'd1', quote: 'q' });
  await act(store, 1, 'advance');
  const s = await act(store, 1, 'status');
  assert.deepEqual(s.spread, { options: { a: 1, b: 1 }, confidence_avg: 70, total: 2, early: true });
  assert.deepEqual(s.not_used, ['d2', 'd3']);
  assert.equal(JSON.stringify(s).includes('st_cy'), false);
});

test('own pace Outcome is held until its date', async () => {
  const store = await setup({ outcome: { text: 'SECRET-OUTCOME', source: 'Gazette', hold_until: '2999-01-01' } });
  await toDecision(store);
  await act(store, 1, 'lock', { option_id: 'a', because: 'b', confidence: 50 });
  const s = await act(store, 1, 'advance');
  assert.equal(s.outcome, null);
  assert.equal(s.held_until, '2999-01-01');
  assert.equal(JSON.stringify(s).includes('SECRET-OUTCOME'), false);
});

test('teacher pace: students cannot advance; open_to and reveal gate the Outcome', async () => {
  const store = await setup({ pace: 'teacher', release: 'layered' });
  await claim(store, 1);
  await rejects(act(store, 1, 'advance'), 'teacher_pace');
  assert.equal((await act(store, 1, 'status')).parts.length, 0);
  await rejects(teach(store, 'reveal'), 'not_open');
  await teach(store, 'open', { station: 1 });
  assert.equal((await act(store, 1, 'status')).parts.length, 1);
  await teach(store, 'release_part');
  assert.equal((await act(store, 1, 'status')).parts.length, 2);
  await rejects(teach(store, 'release_part'), 'all_open');
  await teach(store, 'open', { station: 2 });
  await rejects(teach(store, 'open', { station: 1 }), 'cannot_close');
  await act(store, 1, 'lock', { option_id: 'a', because: 'b', confidence: 50 });
  await teach(store, 'open', { station: 3 });
  assert.equal((await act(store, 1, 'status')).outcome, null);
  await teach(store, 'reveal');
  const s = await act(store, 1, 'status');
  assert.ok(s.outcome);
  assert.equal(s.objections, null);
});

test('board lists every student and every doc, flags changed minds', async () => {
  const store = await setup();
  await toDecision(store, 1, 'a');
  await act(store, 1, 'lock', { option_id: 'b', because: 'new info', confidence: 55 });
  await save(store, 1, 'evidence', { doc_id: 'd1', quote: 'q' });
  const b = await teach(store, 'board');
  assert.equal(b.students.length, 4);
  const ann = b.students.find((s) => s.initials === 'AB');
  assert.deepEqual(ann.locked, { option_id: 'b', confidence: 55, changed: true });
  assert.equal(ann.cited, 1);
  assert.equal(b.students.find((s) => s.initials === 'CD').locked, null);
  assert.deepEqual(b.heat.map((h) => [h.doc_id, h.cited]), [['d1', 1], ['d2', 0], ['d3', 0]]);
  assert.deepEqual(b.spread, { b: 1 });
  assert.equal(b.pace, 'own');
});

test('clear_student deletes one student’s work and leaves the others', async () => {
  const store = await setup();
  await toDecision(store, 1, 'a');
  await toDecision(store, 2, 'b');
  let b = await teach(store, 'board');
  assert.equal(b.students.find((s) => s.initials === 'AB').started, true);
  assert.equal(b.students.find((s) => s.initials === 'EF').started, false);
  b = await teach(store, 'clear_student', { student_id: 'st_ann' });
  const ann = b.students.find((s) => s.initials === 'AB');
  assert.equal(ann.started, false);
  assert.equal(ann.at, 0);
  assert.equal(b.students.find((s) => s.initials === 'CD').started, true);
  const again = await claim(store, 1);
  assert.deepEqual(again.work, {});
  await rejects(teach(store, 'clear_student', { student_id: 'st_ann' }), 'not_found');
  await rejects(teach(store, 'clear_student', { student_id: '../x' }), 'bad_request');
});
