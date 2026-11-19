import test from 'node:test';
import assert from 'node:assert/strict';
import { labAction, labTeacherAction } from '../../netlify/functions/_shared/lab.mjs';
import { labKeys } from '../../netlify/functions/_shared/lab-keys.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { ROSTER, SUPPLIED, device, labStore } from './helpers/lab-store.js';

const teacher = (store, action, extra = {}) => labTeacherAction(store, 'lab1', { action, ...extra });
const student = (store, i, action, extra = {}) => labAction(store, 'lab1', { ...device(i), action, ...extra });
const claim = (store, i) => student(store, i, 'claim', { initials: ROSTER[i].initials });
const code = (promise, expected) => assert.rejects(promise, (e) => e.code === expected, `expected ${expected}`);

/** A started round with the first `n` students joined. */
async function started(n = 17, settings = SUPPLIED) {
  const store = labStore(settings);
  const board = await teacher(store, 'start');
  for (let i = 0; i < n; i += 1) await claim(store, i);
  return { store, session: board.round.session };
}
const next = (store, step) => teacher(store, 'next', { step });
const versionCounts = (store, session) => {
  const lists = store.data.get(labKeys('lab1').deal(session)).lists;
  const counts = [0, 0];
  for (const items of Object.values(lists)) counts[items[0].version] += 1;
  return counts;
};

test('the student route is public and the teacher route is not', () => {
  assert.equal(isPublicStudentApi('POST', '/api/published/lab/lab1'), true);
  assert.equal(isPublicStudentApi('GET', '/api/published/lab/lab1'), false);
  assert.equal(isPublicStudentApi('POST', '/api/lessons/lab1/lab'), false);
});

test('before the teacher starts there is no round, and a student is asked for initials', async () => {
  const store = labStore();
  assert.equal((await teacher(store, 'board')).round, null);
  const first = await student(store, 0, 'status');
  assert.deepEqual(first.identity, { need: 'initials', initials: null });
  const claimed = await claim(store, 0);
  assert.deepEqual(claimed.identity, { need: null, initials: 'KT' });
  assert.equal(claimed.round, null);
  await code(student(store, 0, 'predict', { pred: 0 }), 'no_round');
});

test('a student from another class is told the lab is for someone else', async () => {
  const store = labStore();
  await teacher(store, 'start');
  const other = await labAction(store, 'lab1', { ...device(40, 'class2'), action: 'claim', initials: 'UW' });
  assert.equal(other.not_for_you, true);
  assert.equal(other.round, null);
});

test('start opens the Question step, and Next walks the steps in order to the finish', async () => {
  const { store } = await started(2);
  let board = await teacher(store, 'board');
  assert.deepEqual(board.round.steps, ['Question', 'Predict', 'Test', 'Result', 'Explain']);
  assert.equal(board.round.step_name, 'Question');
  assert.deepEqual(board.counts, { here: 2, done: 2, total: 17 });
  // A step that isn't next is refused; the same step twice moves once.
  await code(next(store, 2), 'bad_step');
  board = await next(store, 1);
  assert.equal(board.round.step_name, 'Predict');
  board = await next(store, 1);
  assert.equal(board.round.step, 1);
  for (const [step, name] of [[2, 'Test'], [3, 'Result'], [4, 'Explain']]) assert.equal((await next(store, step)).round.step_name, name);
  board = await next(store, 5);
  assert.equal(board.round.finished, true);
  assert.equal(board.round.step_name, null);
  await code(next(store, 6), 'bad_step');
});

test('a student action for the wrong step is refused', async () => {
  const { store } = await started(1);
  await code(student(store, 0, 'predict', { pred: 0 }), 'wrong_step');
  await code(student(store, 0, 'rate', { item: 0, value: 5 }), 'wrong_step');
  await code(student(store, 0, 'explain'), 'wrong_step');
  await next(store, 1);
  await code(student(store, 0, 'rate', { item: 0, value: 5 }), 'wrong_step');
  // A note is for the current step or an earlier one.
  await code(student(store, 0, 'note', { step: 'Test', text: 'early' }), 'wrong_step');
  const noted = await student(store, 0, 'note', { step: 'Question', text: '  The company is the subject.  ' });
  assert.equal(noted.me.notes.Question, 'The company is the subject.');
});

test('a prediction locks, and stays hidden from the board until the teacher reveals it', async () => {
  const { store } = await started(3);
  await next(store, 1);
  await code(student(store, 0, 'predict', { pred: 5 }), 'bad_pred');
  const locked = await student(store, 0, 'predict', { pred: 0, reason: 'the company does the dumping' });
  assert.equal(locked.me.pred, 0);
  assert.equal(locked.me.reason, 'the company does the dumping');
  assert.equal(locked.me.done.Predict, true);
  await code(student(store, 0, 'predict', { pred: 1 }), 'locked');
  await student(store, 1, 'predict', { pred: 1 });
  let board = await teacher(store, 'board');
  assert.deepEqual(board.counts, { here: 3, done: 2, total: 17 });
  assert.equal(board.predictions, null);
  board = await teacher(store, 'reveal');
  assert.equal(board.round.revealed, true);
  assert.deepEqual(board.predictions, [1, 1]);
  board = await teacher(store, 'reveal', { on: false });
  assert.equal(board.predictions, null);
});

test('moving to Test deals once: the class is split so the versions differ by at most one reader', async () => {
  const { store, session } = await started(17);
  await next(store, 1);
  await next(store, 2);
  const key = labKeys('lab1').deal(session);
  const dealt = structuredClone(store.data.get(key));
  assert.equal(Object.keys(dealt.lists).length, 17);
  const counts = versionCounts(store, session);
  assert.equal(counts[0] + counts[1], 17);
  assert.ok(Math.abs(counts[0] - counts[1]) <= 1, `split ${counts}`);
  // Asking again, or pressing Next again, leaves the deal as it was.
  await next(store, 2);
  await student(store, 0, 'status');
  assert.deepEqual(store.data.get(key), dealt);
  assert.equal(store.writes.filter((k) => k === key).length, 1);
});

test('a reader sees their one text and never which version it is', async () => {
  const { store, session } = await started(4);
  await next(store, 1);
  await next(store, 2);
  const lists = store.data.get(labKeys('lab1').deal(session)).lists;
  const status = await student(store, 0, 'status');
  assert.equal(status.reading.total, 1);
  assert.equal(status.reading.index, 0);
  assert.deepEqual(status.reading.item, { kind: 'text', text: SUPPLIED.texts[lists.st_01[0].version] });
  assert.ok(!JSON.stringify(status).includes('"version"'));
  // The same text every time they look.
  assert.deepEqual((await student(store, 0, 'status')).reading, status.reading);
  await code(student(store, 0, 'rate', { item: 0, value: 11 }), 'bad_value');
  await code(student(store, 0, 'rate', { item: 3, value: 5 }), 'bad_item');
  await code(student(store, 0, 'pick', { item: 0, choice: 0 }), 'bad_item');
  const sent = await student(store, 0, 'rate', { item: 0, value: 8 });
  assert.equal(sent.me.done.Test, true);
  assert.deepEqual(sent.reading, { index: 1, total: 1, item: null });
  await code(student(store, 0, 'rate', { item: 0, value: 2 }), 'locked');
  assert.deepEqual((await teacher(store, 'board')).counts, { here: 4, done: 1, total: 17 });
});

test('a student who joins after the deal gets a list that keeps the split even', async () => {
  const { store, session } = await started(4);
  await next(store, 1);
  await next(store, 2);
  await claim(store, 4);
  const late = await student(store, 4, 'status');
  assert.equal(late.reading.item.kind, 'text');
  assert.deepEqual((await student(store, 4, 'status')).reading, late.reading);
  await student(store, 4, 'rate', { item: 0, value: 6 });
  const k = labKeys('lab1');
  assert.equal(store.data.get(k.deal(session)).lists.st_05, undefined);
  const lateKeys = [...store.data.keys()].filter((key) => key.startsWith(k.lates(session)));
  assert.equal(lateKeys.length, 1);
  assert.equal(store.data.get(lateKeys[0]).student_id, 'st_05');
});

test('no results reach a student or the board before the Result step', async () => {
  const { store, session } = await started(6);
  const noResults = async () => {
    const board = await teacher(store, 'board');
    assert.equal(board.results, null);
    assert.equal(board.texts, null);
    assert.equal(board.debrief, null);
    for (const i of [0, 5]) {
      const status = await student(store, i, 'status');
      assert.equal(status.results, null);
      assert.equal(status.me.read, undefined);
    }
  };
  await noResults();
  await next(store, 1);
  for (let i = 0; i < 6; i += 1) await student(store, i, 'predict', { pred: i < 4 ? 1 : 0 });
  await teacher(store, 'reveal');
  await noResults();
  await next(store, 2);
  const lists = store.data.get(labKeys('lab1').deal(session)).lists;
  // Readers of the active version rate it 8; readers of the passive version rate it 5.
  for (let i = 0; i < 6; i += 1) await student(store, i, 'rate', { item: 0, value: lists[ROSTER[i].id][0].version === 0 ? 8 : 5 });
  await noResults();

  const board = await next(store, 3);
  assert.deepEqual(board.results.values, [8, 5]);
  assert.deepEqual(board.results.n, [3, 3]);
  assert.deepEqual(board.results.predictions, [2, 4]);
  assert.deepEqual({ top: board.results.top, lead: board.results.lead, win: board.results.win, readers: board.results.readers }, { top: 0, lead: 3, win: true, readers: 6 });
  assert.deepEqual(board.predictions, [2, 4]);
  assert.deepEqual(board.texts, SUPPLIED.texts);
  assert.equal(board.debrief, null);
  const status = await student(store, 0, 'status');
  assert.deepEqual(status.results, board.results);
  assert.deepEqual(status.me.read, [{ version: lists.st_01[0].version, value: lists.st_01[0].version === 0 ? 8 : 5 }]);
  assert.equal(status.reading, null);
  // Students never get the debrief notes or the texts as a labelled set.
  assert.ok(!JSON.stringify(status).includes('Ask who is missing'));
});

test('the Explain step counts hand-ins and shows the teacher the debrief notes', async () => {
  const { store } = await started(2);
  for (const step of [1, 2, 3, 4]) await next(store, step);
  const done = await student(store, 0, 'explain');
  assert.equal(done.me.done.Explain, true);
  const board = await teacher(store, 'board');
  assert.deepEqual(board.counts, { here: 2, done: 1, total: 17 });
  assert.equal(board.explained, 1);
  assert.equal(board.debrief, SUPPLIED.debrief);
});

test('a device on an old round gets 409, and so does a board a round behind', async () => {
  const { store, session } = await started(1);
  const again = await teacher(store, 'start');
  assert.notEqual(again.round.session, session);
  await code(student(store, 0, 'status', { session }), 'new_session');
  await code(teacher(store, 'next', { step: 1, session }), 'new_session');
  // Without the old session the student simply joins the new round.
  const fresh = await student(store, 0, 'status');
  assert.equal(fresh.round.session, again.round.session);
  assert.equal(fresh.me.pred, null);
});

test('past rounds are listed and one can be brought back as it was left', async () => {
  const { store, session } = await started(3);
  await next(store, 1);
  await student(store, 0, 'predict', { pred: 1 });
  await teacher(store, 'start');
  const { rounds } = await teacher(store, 'rounds');
  assert.equal(rounds.length, 2);
  assert.equal(rounds.filter((r) => r.live).length, 1);
  const past = rounds.find((r) => r.session === session);
  assert.equal(past.students, 3);
  const back = await teacher(store, 'resume', { session });
  assert.equal(back.round.session, session);
  assert.equal(back.round.step_name, 'Predict');
  assert.deepEqual(back.counts, { here: 3, done: 1, total: 17 });
  assert.equal((await student(store, 0, 'status')).me.pred, 1);
  await code(teacher(store, 'resume', { session: 'f'.repeat(32) }), 'no_round');
});

test('ending the round sends students back to waiting', async () => {
  const { store } = await started(1);
  const ended = await teacher(store, 'end');
  assert.equal(ended.round, null);
  assert.equal((await student(store, 0, 'status')).round, null);
  await code(next(store, 1), 'no_round');
});

test('the teacher can read one student’s record for marking', async () => {
  const { store } = await started(2);
  await next(store, 1);
  await student(store, 0, 'predict', { pred: 0, reason: 'active names the doer' });
  await next(store, 2);
  const one = await teacher(store, 'student', { student_id: 'st_01' });
  assert.equal(one.record.pred, 0);
  assert.equal(one.record.reason, 'active names the doer');
  assert.equal(one.items.length, 1);
});

test('supplied and picked: every reader gets all the versions in a dealt order and sends a position', async () => {
  const { store, session } = await started(3, { ...SUPPLIED, judge: 'pick', threshold: 2, ends: undefined });
  await next(store, 1);
  await next(store, 2);
  const lists = store.data.get(labKeys('lab1').deal(session)).lists;
  const status = await student(store, 0, 'status');
  assert.equal(status.reading.item.kind, 'set');
  assert.deepEqual(status.reading.item.pieces, lists.st_01[0].order.map((i) => SUPPLIED.texts[i]));
  assert.ok(!JSON.stringify(status).includes('order'));
  // Everyone taps whichever position holds the active version.
  for (let i = 0; i < 3; i += 1) await student(store, i, 'pick', { item: 0, choice: lists[ROSTER[i].id][0].order.indexOf(0) });
  await code(student(store, 0, 'pick', { item: 0, choice: 0 }), 'locked');
  const board = await next(store, 3);
  assert.deepEqual(board.results.values, [3, 0]);
  assert.equal(board.results.win, true);
});

test('the other two levels list their steps and move through them', async () => {
  const { STUDENTS, PAIRS_LAB } = await import('./helpers/lab-store.js');
  for (const [settings, steps] of [[STUDENTS, ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain']], [PAIRS_LAB, ['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain']]]) {
    const { store } = await started(2, settings);
    assert.deepEqual((await teacher(store, 'board')).round.steps, steps);
    for (let step = 1; step <= steps.length; step += 1) await next(store, step);
    assert.equal((await teacher(store, 'board')).round.finished, true);
    assert.equal((await student(store, 0, 'status')).round.finished, true);
  }
});
