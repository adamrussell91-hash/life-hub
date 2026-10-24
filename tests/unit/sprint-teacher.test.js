// tests/unit/sprint-teacher.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, sprintTeacherAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { draftLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { sprintKeys } from '../../netlify/functions/_shared/sprint-keys.mjs';
import { storeFor, who, INITIALS, CONFIG } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const teach = (store, action, extra = {}) => sprintTeacherAction(store, 'sp1', { action, ...extra });

test('the summary shows each group, each phase and each student by name', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  const s = await teach(store, 'summary');
  assert.deepEqual(s.groups.map((g) => g.name), ['Kestrel', 'Heron']);
  const ann = s.groups[0].students.find((x) => x.initials === 'AB');
  assert.equal(ann.name, 'Ann Bell');
  assert.equal(ann.phases.understand, 'draft');
  assert.equal(s.groups[0].open.at(-1), 'understand');
  assert.equal(s.class_parts.understand, 'open');
});

test('End class part freezes, locks and reports who was there; unlock frees one student', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'open', { phase: 'understand' });
  const s = await teach(store, 'end_class', { phase: 'understand' });
  assert.equal(s.class_parts.understand, 'ended');
  assert.equal(s.lock.until, '2026-11-01T02:00:00.000Z');
  assert.deepEqual(s.ended.understand.present, ['st_ann']);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: { notes: ['x'] } }), { code: 'locked' });
  await teach(store, 'unlock', { student_id: 'st_ann' });
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: { notes: ['x'] } }), { code: 'frozen' });
  await assert.rejects(teach(store, 'end_class', { phase: 'sketch' }), { code: 'not_class' });
});

test('extend moves a deadline for one group only', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await teach(store, 'extend', { scope: 'group', id: 'g1', phase: 'understand', due_date: '2026-11-05', due_time: '15:00' });
  const s = await teach(store, 'summary');
  assert.deepEqual(s.groups.find((g) => g.id === 'g1').open, ['understand']);
  assert.deepEqual(s.groups.find((g) => g.id === 'g2').open, ['understand', 'sketch']);
  await assert.rejects(teach(store, 'extend', { scope: 'group', id: 'g9', phase: 'understand', due_date: '2026-11-05' }), { code: 'not_found' });
});

test('confirm sets the group question or idea and clears the wait', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor({ ...CONFIG(), decider: 'teacher' });
  for (const n of [1, 2]) await act(store, n, 'claim', { initials: INITIALS[n] });
  const s = await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  for (const n of [1, 2]) await act(store, n, 'submit', { phase: 'understand', payload: { notes: [`How might we ${n}?`], star: s.notes[0].id, stretch: '' } });
  const board = await teach(store, 'board', { group_id: 'g1' });
  assert.equal(board.awaiting.kind, 'question');
  assert.equal(board.notes[0].name, 'Ann Bell');
  await teach(store, 'confirm', { group_id: 'g1', kind: 'question', id: board.notes[1].id });
  const after = await act(store, 2, 'status');
  assert.equal(after.question.text, board.notes[1].text);
  assert.equal(after.awaiting, null);
});

test('spotlight puts one answer up with no name; clear takes it down', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we make ash talk?'], star: '', stretch: '' } });
  await teach(store, 'spotlight', { student_id: 'st_ann', phase: 'understand', field: 'notes.0' });
  const s = await act(store, 1, 'status');
  assert.deepEqual(s.spotlight, { text: 'How might we make ash talk?', label: 'One idea from the class' });
  await teach(store, 'spotlight', { clear: true });
  assert.equal((await act(store, 1, 'status')).spotlight, null);
});

test('move takes a student to another group in the config and the draft', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await teach(store, 'move', { student_id: 'st_ann', group_id: 'g2' });
  assert.deepEqual(store.data.get(sprintKeys('sp1').config).groups.map((g) => g.students), [['st_cy'], ['st_ed', 'st_gus', 'st_ann']]);
  assert.deepEqual(store.data.get(draftLessonKey('sp1')).sprint.groups.map((g) => g.students), [['st_cy'], ['st_ed', 'st_gus', 'st_ann']]);
});
