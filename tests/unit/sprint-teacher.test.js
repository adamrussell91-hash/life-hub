// tests/unit/sprint-teacher.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, sprintTeacherAction, setSprintClock, storeSprintConfig, ownerOf } from '../../netlify/functions/_shared/sprint.mjs';
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
  const s = await teach(store, 'end_class', { phase: 'understand', lock_hours: 2 });
  assert.equal(s.class_parts.understand, 'ended');
  assert.equal(s.lock.until, '2026-11-01T02:00:00.000Z');
  assert.deepEqual(s.ended.understand.present, ['st_ann']);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: { notes: ['x'] } }), { code: 'locked' });
  await teach(store, 'unlock', { student_id: 'st_ann' });
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: { notes: ['x'] } }), { code: 'frozen' });
  await assert.rejects(teach(store, 'end_class', { phase: 'sketch' }), { code: 'not_class' });
});

test('End class part locks only for the hours chosen: none unless asked, whatever the Kit says', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  const s = await teach(store, 'end_class', { phase: 'understand' });
  assert.equal(s.class_parts.understand, 'ended');
  assert.equal(s.lock, null);
  assert.deepEqual(s.groups[0].open, ['understand', 'sketch']);
  await assert.rejects(teach(store, 'end_class', { phase: 'decide', lock_hours: 25 }), { code: 'bad_lock' });
});

test('a class part that ends at its set time doesn’t lock', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const config = CONFIG();
  config.phases[0] = { ...config.phases[0], ends_at: '2026-11-01T09:00' };
  const s = await teach(storeFor(config), 'summary');
  assert.equal(s.class_parts.understand, 'ended');
  assert.equal(s.lock, null);
});

test('Undo end reopens the class part: no lock, no freeze, auto-submitted work back to draft, handed-in work stays', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'open', { phase: 'understand' });
  await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  await teach(store, 'end_class', { phase: 'understand', lock_hours: 2 });
  const s = await teach(store, 'reopen_class', { phase: 'understand' });
  assert.equal(s.lock, null);
  assert.equal(s.class_parts.understand, 'open');
  assert.equal(s.ended.understand, undefined);
  assert.equal(s.groups[0].students.find((x) => x.initials === 'AB').phases.understand, 'draft');
  assert.deepEqual(s.groups[0].open, ['understand']);
  assert.equal(s.groups[0].question ?? null, null);
  const me = await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we b?'], star: '', stretch: '' } });
  assert.equal(me.lock, null);
  const again = await teach(store, 'end_class', { phase: 'understand', lock_hours: 1 });
  assert.equal(again.class_parts.understand, 'ended');
  assert.ok(again.lock);
  await assert.rejects(teach(store, 'reopen_class', { phase: 'sketch' }), { code: 'not_class' });
});

test('a reopened class part stays open past its set end time until a new time is published', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const config = CONFIG();
  config.phases[0] = { ...config.phases[0], ends_at: '2026-11-01T09:00' };
  const store = storeFor(config);
  setSprintClock(() => Date.parse('2026-11-01T00:30:00Z'));
  const ended = await teach(store, 'summary');
  assert.equal(ended.class_parts.understand, 'ended');
  const open = await teach(store, 'reopen_class', { phase: 'understand' });
  assert.equal(open.class_parts.understand, 'open');
  assert.equal((await teach(store, 'summary')).class_parts.understand, 'open');
  const next = CONFIG();
  next.phases[0] = { ...next.phases[0], ends_at: '2026-11-01T10:00' };
  await storeSprintConfig(store, 'sp1', next);
  setSprintClock(() => Date.parse('2026-11-01T00:30:00Z'));
  assert.equal((await teach(store, 'summary')).class_parts.understand, 'ended');
});

test('Open the sprint now ends the lock, keeps the part ended and opens the next phase', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'open', { phase: 'understand' });
  await teach(store, 'end_class', { phase: 'understand', lock_hours: 2 });
  const s = await teach(store, 'lift_lock');
  assert.equal(s.lock, null);
  assert.equal(s.class_parts.understand, 'ended');
  assert.deepEqual(s.groups[0].open, ['understand', 'sketch']);
  const me = await act(store, 1, 'open', { phase: 'understand' });
  assert.equal(me.lock, null);
  assert.equal(me.phases.find((p) => p.key === 'understand').frozen, true);
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

test('republishing a new Kit date drops that phase’s extensions and keeps the rest', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await teach(store, 'extend', { scope: 'class', phase: 'understand', due_date: '2026-11-03', due_time: '15:00' });
  await teach(store, 'extend', { scope: 'group', id: 'g1', phase: 'understand', due_date: '2026-11-03', due_time: '16:00' });
  await teach(store, 'extend', { scope: 'student', id: 'st_ann', phase: 'decide', due_date: '2026-11-07', due_time: '15:00' });
  const next = CONFIG();
  next.phases[0] = { ...next.phases[0], due_date: '2026-11-03', due_time: '09:00' };
  await storeSprintConfig(store, 'sp1', next);
  const extend = store.data.get(sprintKeys('sp1').extend);
  assert.deepEqual(extend.class, {});
  assert.deepEqual(extend.group, {});
  assert.deepEqual(extend.student, { st_ann: { decide: { due_date: '2026-11-07', due_time: '15:00' } } });
  const s = await teach(store, 'summary');
  assert.deepEqual(s.phases[0], { key: 'understand', where: 'class', due_date: '2026-11-03', due_time: '09:00', ends_at: '' });
});

test('republishing the same dates leaves extensions alone', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await teach(store, 'extend', { scope: 'class', phase: 'understand', due_date: '2026-11-03', due_time: '15:00' });
  await storeSprintConfig(store, 'sp1', CONFIG());
  assert.deepEqual(store.data.get(sprintKeys('sp1').extend).class, { understand: { due_date: '2026-11-03', due_time: '15:00' } });
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
  assert.equal(board.progress.open.at(-1), 'sketch');
  assert.equal(board.progress.students.find((x) => x.name === 'Ann Bell').phases.understand, 'in');
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

test('a student taken off the class list leaves their group: no dash on the map, no wait on them', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const config = CONFIG();
  config.groups[0].students.push('st_gone');
  const store = storeFor(config);
  const s = await teach(store, 'summary');
  assert.deepEqual(s.groups[0].students.map((x) => x.initials), ['AB', INITIALS[2]]);
  const me = await act(store, 1, 'claim', { initials: INITIALS[1] });
  assert.equal(me.group.size, 2);
  assert.ok(!me.group.mates.includes('–'));
});

const SKETCH = (title) => ({ inspiration: [], rapid: [title], rapid_started_at: '', cards: [{ id: 'k1', seed: title, title, idea: `${title} idea`, answers: 'a', evidence: 'e', criteria: {}, requirements: {}, value_answer: '' }], strongest: 'k1', strongest_why: 'why' });

test('Give another go: the work is set aside, the phase is blank and open again, and the group stops counting them in', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  const before = await act(store, 1, 'submit', { phase: 'sketch', payload: SKETCH('Old') });
  assert.equal(before.phases.find((p) => p.key === 'sketch').state, 'in');
  const s = await teach(store, 'another_go', { student_id: 'st_ann', phase: 'sketch' });
  assert.equal(s.groups[0].students[0].phases.sketch, 'none');
  const me = await act(store, 1, 'status');
  const row = me.phases.find((p) => p.key === 'sketch');
  assert.equal(row.state, 'none');
  assert.equal(row.go, 1);
  assert.equal(row.count_in, 0);
  assert.equal(me.mine.sketch, undefined);
  const k = sprintKeys('sp1');
  const set = [...store.data.keys()].find((key) => key.startsWith('sprint/sp1/goes/'));
  assert.equal(store.data.get(set).sketch.earlier[0].payload.cards[0].title, 'Old');
});

test('an open tab from before Give another go can’t save the old work back; a fresh page can', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'save', { phase: 'sketch', payload: SKETCH('Old') });
  await teach(store, 'another_go', { student_id: 'st_ann', phase: 'sketch' });
  await assert.rejects(act(store, 1, 'save', { phase: 'sketch', payload: SKETCH('Old') }), { code: 'another_go' });
  await assert.rejects(act(store, 1, 'save', { phase: 'sketch', go: 0, payload: SKETCH('Old') }), { code: 'another_go' });
  const me = await act(store, 1, 'save', { phase: 'sketch', go: 1, payload: SKETCH('New') });
  assert.equal(me.mine.sketch.cards[0].title, 'New');
});

test('Give another go works after the class part ended and during its lock', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'open', { phase: 'understand' });
  await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['Old'], star: '', stretch: '' } });
  await teach(store, 'end_class', { phase: 'understand', lock_hours: 2 });
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: { notes: ['x'], star: '', stretch: '' } }), { code: 'locked' });
  await teach(store, 'another_go', { student_id: 'st_ann', phase: 'understand' });
  const me = await act(store, 1, 'save', { phase: 'understand', go: 1, payload: { notes: ['New'], star: '', stretch: '' } });
  const row = me.phases.find((p) => p.key === 'understand');
  assert.equal(row.frozen, false);
  assert.equal(row.state, 'draft');
  const other = await act(store, 2, 'claim', { initials: INITIALS[2] });
  assert.ok(other.lock, 'the rest of the class stays locked');
});

test('after a phase has closed a student on another go can still write, and handing in counts as late', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'submit', { phase: 'sketch', payload: SKETCH('Old') });
  setSprintClock(() => Date.parse('2026-11-05T00:00:00Z'));
  await assert.rejects(act(store, 1, 'save', { phase: 'sketch', payload: SKETCH('x') }), { code: 'closed' });
  await teach(store, 'another_go', { student_id: 'st_ann', phase: 'sketch' });
  const me = await act(store, 1, 'submit', { phase: 'sketch', go: 1, payload: SKETCH('New') });
  const row = me.phases.find((p) => p.key === 'sketch');
  assert.equal(row.state, 'in');
  assert.equal(row.late, true);
});

test('Bring back returns the earlier work and sets aside anything newer, so going back and forth loses nothing', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'submit', { phase: 'sketch', payload: SKETCH('Old') });
  await teach(store, 'another_go', { student_id: 'st_ann', phase: 'sketch' });
  await act(store, 1, 'save', { phase: 'sketch', go: 1, payload: SKETCH('New') });
  await teach(store, 'bring_back', { student_id: 'st_ann', phase: 'sketch' });
  let me = await act(store, 1, 'status');
  assert.equal(me.mine.sketch.cards[0].title, 'Old');
  assert.equal(me.phases.find((p) => p.key === 'sketch').state, 'in');
  assert.equal(me.phases.find((p) => p.key === 'sketch').count_in, 1);
  await assert.rejects(act(store, 1, 'save', { phase: 'sketch', go: 1, payload: SKETCH('New') }), { code: 'another_go' });
  await teach(store, 'bring_back', { student_id: 'st_ann', phase: 'sketch' });
  me = await act(store, 1, 'status');
  assert.equal(me.mine.sketch.cards[0].title, 'New');
  assert.equal(me.phases.find((p) => p.key === 'sketch').state, 'draft');
  const board = await teach(store, 'board', { group_id: 'g1' });
  assert.equal(board.progress.students.find((x) => x.id === 'st_ann').earlier.sketch, 1);
});

test('Give another go needs work to set aside, and leaves a Sketch the group is building on', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await assert.rejects(teach(store, 'another_go', { student_id: 'st_ann', phase: 'sketch' }), { code: 'nothing_here' });
  await assert.rejects(teach(store, 'bring_back', { student_id: 'st_ann', phase: 'sketch' }), { code: 'nothing_here' });
  await assert.rejects(teach(store, 'another_go', { student_id: 'st_nobody', phase: 'sketch' }), { code: 'not_found' });
  await assert.rejects(teach(store, 'another_go', { student_id: 'st_ann', phase: 'nope' }), { code: 'bad_phase' });
  const me = await act(store, 1, 'submit', { phase: 'sketch', payload: SKETCH('Old') });
  assert.equal(me.phases.find((p) => p.key === 'sketch').state, 'in');
  const k = sprintKeys('sp1');
  const board = await teach(store, 'board', { group_id: 'g1' });
  const chosen = board.gallery[0].ideas[0].id;
  await teach(store, 'confirm', { group_id: 'g1', kind: 'idea', id: chosen });
  assert.equal(store.data.get(k.group('g1')).chosen, chosen);
  await assert.rejects(teach(store, 'another_go', { student_id: 'st_ann', phase: 'sketch' }), { code: 'chosen_idea' });
});

test('another go at Decide takes them off the finished list so voting waits for them', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  const k = sprintKeys('sp1');
  const state = store.data.get(k.group('g1')) ?? {};
  store.data.set(k.group('g1'), { ...state, in: { ...(state.in ?? {}), decide: ['st_ann'] }, voted: ['st_ann'] });
  store.data.set(k.sub(ownerOf('class1', 'st_ann'), 'decide'), { payload: { votes: {}, reasons: {}, dots: [], duels: [] }, saved_at: '2026-11-03T00:00:00Z', submitted_at: '2026-11-03T00:00:00Z' });
  await teach(store, 'another_go', { student_id: 'st_ann', phase: 'decide' });
  const after = store.data.get(k.group('g1'));
  assert.deepEqual(after.voted, []);
  assert.deepEqual(after.in.decide, []);
});

test('the teacher ticks a student off for Prototype or Test by hand; their work and what opens next stay as they are', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  let s = await teach(store, 'tick', { student_id: 'st_ann', phase: 'prototype', on: true });
  const ann = () => s.groups[0].students.find((x) => x.id === 'st_ann');
  assert.equal(ann().ticked.prototype, '2026-11-01T00:00:00.000Z');
  assert.equal(ann().phases.prototype, 'none');
  assert.deepEqual(s.groups[0].open, ['understand']);
  const b = await teach(store, 'board', { group_id: s.groups[0].id });
  assert.ok(b.progress.students.find((x) => x.id === 'st_ann').ticked.prototype);
  s = await teach(store, 'tick', { student_id: 'st_ann', phase: 'prototype', on: false });
  assert.deepEqual(ann().ticked, {});
  await assert.rejects(teach(store, 'tick', { student_id: 'st_ann', phase: 'sketch', on: true }), { code: 'bad_phase' });
  await assert.rejects(teach(store, 'tick', { student_id: 'st_nobody', phase: 'test', on: true }), { code: 'not_found' });
});
