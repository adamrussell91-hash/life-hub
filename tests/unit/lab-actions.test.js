import test from 'node:test';
import assert from 'node:assert/strict';
import { labAction, labTeacherAction } from '../../netlify/functions/_shared/lab.mjs';
import { labKeys } from '../../netlify/functions/_shared/lab-keys.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { PAIRS, PAIRS_LAB, PAIRS_NOTED, ROSTER, STUDENTS, SUPPLIED, device, labStore } from './helpers/lab-store.js';

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

// ---------------------------------------------------------------------------
// Students write it
// ---------------------------------------------------------------------------

const SENSES = ['sight', 'sound', 'touch'];
/** Invented writing: each version says whose it is and which sense, so a test can tell them apart. */
const piece = (i, option) => `${ROSTER[i].initials} storm by ${SENSES[option]}`;
const writeAll = async (store, i, rude = -1) => {
  for (let option = 0; option < 3; option += 1) await student(store, i, 'write', { option, text: option === rude ? `${piece(i, option)}, you idiot` : piece(i, option) });
};
/** A round at Make with `n` students joined and predicted. */
async function atMake(n = 17) {
  const { store, session } = await started(n, STUDENTS);
  await next(store, 1);
  await next(store, 2);
  return { store, session };
}
const dealOf = (store, session) => store.data.get(labKeys('lab1').deal(session));

test('Make: a student writes one version per option, can write over it, and is done when every option has words', async () => {
  const { store } = await atMake(2);
  await code(student(store, 0, 'write', { option: 3, text: 'x' }), 'bad_option');
  await code(student(store, 0, 'write', { option: 0, text: '   ' }), 'empty');
  let status = await student(store, 0, 'write', { option: 0, text: 'First go' });
  assert.deepEqual(status.me.writing, ['First go', '', '']);
  assert.equal(status.me.done.Make, false);
  status = await student(store, 0, 'write', { option: 0, text: piece(0, 0) });
  await student(store, 0, 'write', { option: 1, text: piece(0, 1) });
  status = await student(store, 0, 'write', { option: 2, text: piece(0, 2) });
  assert.deepEqual(status.me.writing, [0, 1, 2].map((o) => piece(0, o)));
  assert.equal(status.me.done.Make, true);
  assert.equal((await teacher(store, 'board')).counts.done, 1);
  // Writing closes with the step, and belongs to this level only.
  await next(store, 3);
  await code(student(store, 0, 'write', { option: 0, text: 'late' }), 'wrong_step');
  const supplied = await started(1);
  await code(student(supplied.store, 0, 'write', { option: 0, text: 'x' }), 'bad_action');
});

test('Test, pick one: six writers each, never the reader’s own, a writer’s versions together and unlabelled', async () => {
  const { store, session } = await atMake(17);
  for (let i = 0; i < 17; i += 1) await writeAll(store, i);
  await next(store, 3);
  const lists = dealOf(store, session).lists;
  const read = new Map();
  for (const s of ROSTER) {
    const items = lists[s.id];
    assert.equal(items.length, 6);
    assert.ok(items.every((item) => item.kind === 'writer' && item.writer !== s.id), 'never their own writing');
    assert.equal(new Set(items.map((item) => item.writer)).size, 6);
    for (const item of items) {
      assert.deepEqual([...item.order].sort(), [0, 1, 2]);
      read.set(item.writer, (read.get(item.writer) ?? 0) + 1);
    }
  }
  const counts = ROSTER.map((s) => read.get(s.id) ?? 0);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `readers per writer: ${counts}`);

  // A reader sees one writer's three versions together, in the dealt order, with no option names and no writer.
  const status = await student(store, 0, 'status');
  const first = lists[ROSTER[0].id][0];
  const writer = ROSTER.findIndex((s) => s.id === first.writer);
  assert.equal(status.reading.total, 6);
  assert.deepEqual(status.reading.item, { kind: 'set', pieces: first.order.map((o) => piece(writer, o)) });
  const sent = JSON.stringify({ ...status, me: null });
  for (const label of STUDENTS.options) assert.equal(sent.includes(label), false, `no option name: ${label}`);
  assert.equal(sent.includes(first.writer), false, 'no writer id');
  assert.equal(status.results, null);

  // Tapping a position stores the option that sat there.
  const after = await student(store, 0, 'pick', { item: 0, choice: 2 });
  assert.equal(after.reading.index, 1);
  const record = store.data.get(labKeys('lab1').student(session, Object.keys(Object.fromEntries([...store.data].filter(([key, v]) => key.includes('/students/') && v.student_id === ROSTER[0].id).map(([key]) => [key.split('/').pop(), 1])))[0]));
  assert.equal(record.picks[0], first.order[2]);
});

test('flagged writing is held: out of the deal until the teacher releases it, and listed on the board with initials', async () => {
  const { store, session } = await atMake(8);
  for (let i = 0; i < 8; i += 1) await writeAll(store, i, i === 2 || i === 3 ? 1 : -1);
  // The writer is not told; their writing saved and their step is done.
  assert.equal((await student(store, 2, 'status')).me.done.Make, true);
  let board = await teacher(store, 'board');
  assert.deepEqual(board.held.map((h) => h.initials), ['AS', 'JM']);
  const held = Object.fromEntries(board.held.map((h) => [h.initials, h]));
  assert.deepEqual(held.JM.pieces.map((p) => [p.label, p.flagged]), [['Sight', false], ['Sound', true], ['Touch', false]]);
  assert.match(held.JM.pieces[1].text, /idiot/);
  await code(teacher(store, 'release', { session, owner: 'nope' }), 'bad_id');
  // JM is released; AS is removed.
  board = await teacher(store, 'release', { session, owner: held.JM.owner });
  assert.deepEqual(board.held.map((h) => h.initials), ['AS']);
  board = await teacher(store, 'remove', { session, owner: held.AS.owner });
  assert.deepEqual(board.held, []);
  await next(store, 3);
  const dealt = dealOf(store, session);
  assert.equal(dealt.pool.writers.includes(ROSTER[2].id), true, 'released writing is read');
  assert.equal(dealt.pool.writers.includes(ROSTER[3].id), false, 'removed writing is left out');
  assert.equal(Object.values(dealt.lists).flat().some((item) => item.writer === ROSTER[3].id), false);
  // The removed writer still reads: all six other writers, as nobody's own is among them.
  assert.equal(dealt.lists[ROSTER[3].id].length, 6);
});

test('writing still held when the teacher moves on is left out, and so is unfinished writing', async () => {
  const { store, session } = await atMake(6);
  for (let i = 0; i < 4; i += 1) await writeAll(store, i, i === 1 ? 0 : -1);
  await student(store, 4, 'write', { option: 0, text: piece(4, 0) });
  await next(store, 3);
  assert.deepEqual(dealOf(store, session).pool.writers, [ROSTER[0].id, ROSTER[2].id, ROSTER[3].id]);
  // A release changes the writing only when the writer changes it: writing over flagged words asks the teacher again.
  const again = await atMake(2);
  await writeAll(again.store, 0, 1);
  const first = (await teacher(again.store, 'board')).held[0];
  await teacher(again.store, 'release', { session: again.session, owner: first.owner });
  await new Promise((r) => setTimeout(r, 5));
  await student(again.store, 0, 'write', { option: 2, text: 'A new line, you loser' });
  assert.equal((await teacher(again.store, 'board')).held.length, 1);
});

test('Result, students write it: choices by option, each writer’s own counts, and the most chosen piece with no name', async () => {
  const { store, session } = await atMake(8);
  for (let i = 0; i < 8; i += 1) await student(store, i, 'status');
  for (let i = 0; i < 8; i += 1) await writeAll(store, i);
  await next(store, 3);
  const lists = dealOf(store, session).lists;
  // Every reader chooses the sound version (option 1) of every writer.
  for (let i = 0; i < 8; i += 1) {
    const items = lists[ROSTER[i].id];
    for (let item = 0; item < items.length; item += 1) {
      const before = await teacher(store, 'board');
      assert.equal(before.results, null);
      assert.equal(before.best, null);
      await student(store, i, 'pick', { item, choice: items[item].order.indexOf(1) });
    }
  }
  assert.equal((await student(store, 0, 'status')).me.own, undefined, 'own counts wait for Result');
  const board = await next(store, 4);
  assert.deepEqual(board.results.values, [0, 48, 0]);
  assert.equal(board.results.win, true);
  assert.equal(board.best.option, 1);
  assert.equal(board.best.chosen, board.best.readers);
  assert.match(board.best.text, /storm by sound$/);
  assert.deepEqual(Object.keys(board.best).sort(), ['chosen', 'option', 'readers', 'text']);
  const mine = await student(store, 0, 'status');
  assert.deepEqual(mine.me.own, { chosen: [0, 6, 0], readers: 6 });
  assert.deepEqual(mine.results.values, [0, 48, 0]);
});

// ---------------------------------------------------------------------------
// Pairs design it
// ---------------------------------------------------------------------------

// The fixture's control, by word: 0 I, 1 meant, 2 to, 3 tell, 4 you / 5 but, 6 the, 7 words, 8 I, 9 think, / 10 were, 11 somewhere, 12 else.
const EDITS = [{ cut: [8, 9] }, { join: [4] }, { rep: { 1: 'wanted' } }, { cut: [5] }, { brk: [6] }, { cut: [12] }, { join: [9] }];
/** The first student of pair `p` (0-based) and their partner. */
const first = (p) => p * 2;
const pairIdOf = (i) => PAIRS.find((pair) => pair.students.includes(ROSTER[i].id)).id;

/** A round at Design with all 17 joined. */
async function atDesign() {
  const { store, session } = await started(17, PAIRS_LAB);
  await next(store, 1);
  return { store, session };
}
/** Pairs 1 to 7 each put a different change on the bench; pair 8 changes nothing. */
async function benched(store) {
  for (let p = 0; p < 7; p += 1) {
    await student(store, first(p), 'bench', { edit: EDITS[p] });
    await student(store, first(p) + 1, 'ready');
  }
}

test('Design: either partner saves the pair’s edit, the last save wins, and the bench needs a change', async () => {
  const { store } = await atDesign();
  let status = await student(store, 0, 'status');
  assert.equal(status.control, PAIRS_LAB.control);
  assert.deepEqual(status.pair, { edit: {}, ready: false, pred: null, feature: null, trial: false });
  await code(student(store, 0, 'ready'), 'no_change');
  // KT cuts two words; the partner RV sees it, then saves a different edit over it.
  await student(store, 0, 'bench', { edit: { cut: [8, 9, 99, -1, 'x'], rep: { 1: '  meant ' }, join: [3] } });
  status = await student(store, 1, 'status');
  assert.deepEqual(status.pair.edit, { cut: [8, 9] }, 'out-of-range indexes, a same-word replacement and a join where no break is are dropped');
  assert.equal(status.pair.trial, true);
  status = await student(store, 1, 'bench', { edit: { join: [4] } });
  assert.deepEqual((await student(store, 0, 'status')).pair.edit, { join: [4] });
  // Another pair's bench is their own.
  assert.deepEqual((await student(store, 2, 'status')).pair.edit, {});
  // Either partner puts it on the bench; then it is locked until one takes it off.
  status = await student(store, 0, 'ready');
  assert.equal(status.pair.ready, true);
  await code(student(store, 1, 'bench', { edit: {} }), 'locked');
  const board = await teacher(store, 'board');
  assert.deepEqual(board.pairs, { total: 8, changed: 1, ready: 1, predicted: 0, named: 0 });
  status = await student(store, 1, 'ready', { on: false });
  assert.equal(status.pair.ready, false);
  await student(store, 1, 'bench', { edit: { cut: [5] } });
  // The bench belongs to this level and this step.
  await next(store, 2);
  await code(student(store, 0, 'bench', { edit: {} }), 'wrong_step');
  const other = await started(1);
  await code(student(other.store, 0, 'bench', { edit: {} }), 'bad_action');
});

test('Predict: the pair predicts once for its own change, and a pair with no change has nothing to predict', async () => {
  const { store } = await atDesign();
  await benched(store);
  await next(store, 2);
  await code(student(store, 0, 'predict', { pred: 0 }), 'bad_action');
  await code(student(store, 0, 'pair_predict', { pred: 2 }), 'bad_pred');
  let status = await student(store, 1, 'pair_predict', { pred: -1 });
  assert.equal(status.pair.pred, -1);
  assert.equal((await student(store, 0, 'status')).pair.pred, -1, 'the partner sees it locked');
  await code(student(store, 0, 'pair_predict', { pred: 1 }), 'locked');
  await code(student(store, 14, 'pair_predict', { pred: 0 }), 'no_trial');
  await student(store, 2, 'pair_predict', { pred: 1 });
  // Predictions stay off the board until the teacher reveals them.
  let board = await teacher(store, 'board');
  assert.equal(board.predictions, null);
  assert.equal(board.pairs.predicted, 2);
  board = await teacher(store, 'reveal', { session: board.round.session, on: true });
  assert.deepEqual(board.predictions, [1, 0, 1]);
});

test('Test, pairs: two controls mixed in with four other pairs’ versions, never a reader’s own pair, counts within one', async () => {
  const { store, session } = await atDesign();
  await benched(store);
  await next(store, 2);
  await next(store, 3);
  const dealt = dealOf(store, session);
  assert.deepEqual(dealt.pool.versions, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  const readers = new Map();
  for (let i = 0; i < 17; i += 1) {
    const items = dealt.lists[ROSTER[i].id];
    assert.equal(items.length, 6);
    assert.equal(items.filter((item) => item.kind === 'control').length, 2);
    const versions = items.filter((item) => item.kind === 'version').map((item) => item.pair);
    assert.equal(new Set(versions).size, 4);
    assert.equal(versions.includes(pairIdOf(i)), false, 'never their own pair’s version');
    for (const v of versions) readers.set(v, (readers.get(v) ?? 0) + 1);
  }
  const counts = dealt.pool.versions.map((v) => readers.get(v) ?? 0);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `readers per version: ${counts}`);
  // The controls are not always first: across the class they turn up in different places.
  assert.ok(new Set(Object.values(dealt.lists).map((items) => items.findIndex((item) => item.kind === 'control'))).size > 1);

  // A reader gets lines to rate, with nothing to say whether they are the control or whose version they are.
  const items = dealt.lists[ROSTER[0].id];
  let status = await student(store, 0, 'status');
  assert.equal(status.reading.total, 6);
  for (let item = 0; item < 6; item += 1) {
    const it = items[item];
    const expected = it.kind === 'control' ? PAIRS_LAB.control.split('\n')
      : it.pair === 'p2' ? ['I meant to tell you but the words, I think,', 'were somewhere else.']
        : it.pair === 'p3' ? ['I wanted to tell you', 'but the words, I think,', 'were somewhere else.'] : null;
    assert.deepEqual(Object.keys(status.reading.item).sort(), ['kind', 'lines']);
    assert.equal(status.reading.item.kind, 'lines');
    if (expected) assert.deepEqual(status.reading.item.lines, expected);
    assert.equal(status.findings, null);
    await code(student(store, 0, 'pick', { item, choice: 0 }), 'bad_item');
    status = await student(store, 0, 'rate', { item, value: 5 });
  }
  assert.equal(status.reading.item, null);
  assert.equal(status.me.done.Test, true);
  await code(student(store, 0, 'rate', { item: 0, value: 5 }), 'locked');
});

test('Result, pairs: findings wait for the Result step; a student gets changes with no pair on them, the teacher gets initials', async () => {
  const { store, session } = await atDesign();
  await benched(store);
  await next(store, 2);
  await student(store, 0, 'pair_predict', { pred: -1 });
  await student(store, 2, 'pair_predict', { pred: 1 });
  await next(store, 3);
  const lists = dealOf(store, session).lists;
  // Every reader gives the control 6, pair 1's version 3 and every other version 6.
  for (let i = 0; i < 17; i += 1) {
    const items = lists[ROSTER[i].id];
    for (let item = 0; item < items.length; item += 1) {
      const before = await student(store, i, 'rate', { item, value: items[item].kind === 'version' && items[item].pair === 'p1' ? 3 : 6 });
      assert.equal(before.findings, null);
      assert.equal(before.results, null);
    }
  }
  let board = await teacher(store, 'board');
  assert.equal(board.findings, null);
  assert.equal(board.predictions, null);
  board = await next(store, 4);
  assert.deepEqual(board.findings.control, { mean: 6, n: 34, ratings: Array.from({ length: 34 }, () => 6) });
  assert.equal(board.findings.trials.length, 7);
  const p1 = board.findings.trials.find((t) => t.pair === 'p1');
  assert.deepEqual({ desc: p1.desc, shift: p1.shift, verdict: p1.verdict, pred: p1.pred, held: p1.held, thin: p1.thin, number: p1.number, initials: p1.initials, edit: p1.edit },
    { desc: ['cut "I think,"'], shift: -3, verdict: -1, pred: -1, held: true, thin: false, number: 1, initials: ['KT', 'RV'], edit: { cut: [8, 9] } });
  assert.equal(p1.ratings.length, p1.n);
  const p2 = board.findings.trials.find((t) => t.pair === 'p2');
  assert.deepEqual([p2.shift, p2.verdict, p2.pred, p2.held], [0, 0, 1, false]);
  assert.deepEqual(board.predictions, [1, 0, 1]);

  // KT, in pair 1: their own trial in full, everyone else's by its change alone.
  const mine = (await student(store, 0, 'status')).findings;
  assert.deepEqual(mine.mine, { desc: ['cut "I think,"'], shift: -3, n: p1.n, verdict: -1, thin: false, mine: true, edit: { cut: [8, 9] }, ratings: p1.ratings, mean: 3, pred: -1, held: true });
  assert.equal(mine.trials.length, 7);
  assert.equal(mine.trials.filter((t) => t.mine).length, 1);
  for (const t of mine.trials) assert.deepEqual(Object.keys(t).sort(), ['desc', 'mine', 'n', 'shift', 'thin', 'verdict']);
  const sent = JSON.stringify(mine);
  for (const s of ROSTER) assert.equal(sent.includes(s.id) || sent.includes(`"${s.initials}"`), false);
  assert.equal(/"p[1-8]"/.test(sent), false, 'no pair ids');

  // Pair 8 changed nothing: no trial, they read as normal, and they get the class findings.
  assert.equal(lists[ROSTER[16].id].filter((item) => item.kind === 'version').length, 4);
  const none = await student(store, 16, 'status');
  assert.equal(none.pair.trial, false);
  assert.equal(none.findings.mine, null);
  assert.equal(none.findings.trials.length, 7);

  // For marking: one student's record with their pair's version and trial.
  const record = await teacher(store, 'student', { student_id: ROSTER[1].id });
  assert.equal(record.pair.id, 'p1');
  assert.deepEqual(record.pair.change, ['cut "I think,"']);
  assert.equal(record.trial.shift, -3);
  assert.equal(record.items.length, 6);
});

test('a flagged replacement word holds the pair’s version: out of the reading until the teacher releases it', async () => {
  const run = async (decide) => {
    const { store, session } = await atDesign();
    await benched(store);
    const status = await student(store, 4, 'bench').catch(() => null);
    assert.equal(status, null, 'pair 3 is on the bench, so it takes its version off to change it');
    await student(store, 4, 'ready', { on: false });
    await student(store, 5, 'bench', { edit: { rep: { 11: 'stupid' } } });
    await student(store, 5, 'ready');
    // The pair is not told; to them the version is on the bench.
    assert.equal((await student(store, 4, 'status')).pair.trial, true);
    const board = await teacher(store, 'board');
    assert.deepEqual(board.held, [{ owner: 'pair.p3', initials: 'BN, CD', pieces: [{ label: 'Their change', text: 'Changed "somewhere" to "stupid"', flagged: true }] }]);
    if (decide) assert.deepEqual((await teacher(store, decide, { session, owner: 'pair.p3' })).held, []);
    await next(store, 2);
    await next(store, 3);
    return dealOf(store, session).pool.versions.includes('p3');
  };
  assert.equal(await run(null), false);
  assert.equal(await run('release'), true);
  assert.equal(await run('remove'), false);
});

test('a small class: fewer than four other versions means all of them plus two controls, and a thin trial is marked', async () => {
  const { store, session } = await started(4, PAIRS_LAB);
  await next(store, 1);
  await student(store, 0, 'bench', { edit: EDITS[0] });
  await student(store, 2, 'bench', { edit: EDITS[1] });
  await next(store, 2);
  await next(store, 3);
  const lists = dealOf(store, session).lists;
  // A change left unsent when the teacher moved on still counts as the pair's version.
  for (let i = 0; i < 4; i += 1) {
    assert.deepEqual(lists[ROSTER[i].id].map((item) => item.kind).sort(), ['control', 'control', 'version']);
    assert.equal(lists[ROSTER[i].id].find((item) => item.kind === 'version').pair, i < 2 ? 'p2' : 'p1');
    for (let item = 0; item < 3; item += 1) await student(store, i, 'rate', { item, value: 4 });
  }
  const board = await next(store, 4);
  assert.deepEqual(board.findings.trials.map((t) => [t.pair, t.n, t.thin]), [['p1', 2, true], ['p2', 2, true]]);
});

// ---------------------------------------------------------------------------
// Lab notes and Name it
// ---------------------------------------------------------------------------

/** A pairs round with lab notes on, at Design, all 17 joined. */
async function notedAtDesign() {
  const { store, session } = await started(17, PAIRS_NOTED);
  await next(store, 1);
  return { store, session };
}

test('lab notes on: a pair’s completing action waits for the sender’s note, which can ride with the action', async () => {
  const { store } = await notedAtDesign();
  await student(store, 0, 'bench', { edit: EDITS[0] });
  await code(student(store, 0, 'ready'), 'need_note');
  await code(student(store, 0, 'ready', { note: '   ' }), 'need_note');
  assert.equal((await student(store, 0, 'status')).pair.ready, false);
  let status = await student(store, 0, 'ready', { note: 'The hedge is where the doubt sits.' });
  assert.equal(status.pair.ready, true);
  assert.equal(status.me.notes.Design, 'The hedge is where the doubt sits.');
  // The partner's note is their own: saved by itself, and an empty one is refused.
  await code(student(store, 1, 'note', { step: 'Design', text: '' }), 'need_note');
  status = await student(store, 1, 'note', { step: 'Design', text: 'It slows the line.' });
  assert.equal(status.me.notes.Design, 'It slows the line.');
  // A note saved first lets the action through with no note attached.
  await student(store, 2, 'bench', { edit: EDITS[1] });
  await student(store, 2, 'note', { step: 'Design', text: 'The break holds the thought back.' });
  assert.equal((await student(store, 2, 'ready')).pair.ready, true);

  await next(store, 2);
  await code(student(store, 0, 'pair_predict', { pred: -1 }), 'need_note');
  assert.equal((await student(store, 0, 'status')).pair.pred, null);
  status = await student(store, 0, 'pair_predict', { pred: -1, note: 'Because the doubt goes with the words.' });
  assert.equal(status.pair.pred, -1);
  assert.equal(status.me.notes.Predict, 'Because the doubt goes with the words.');
});

test('lab notes on: at Question, Test and Result the note is what finishes the step', async () => {
  const { store } = await started(2, PAIRS_NOTED);
  await code(student(store, 0, 'note', { step: 'Question', text: ' ' }), 'need_note');
  let status = await student(store, 0, 'note', { step: 'Question', text: '"I think," in line 2.' });
  assert.equal(status.me.done.Question, true);
  await next(store, 1);
  await student(store, 0, 'bench', { edit: EDITS[0] });
  await next(store, 2);
  await next(store, 3);
  status = await student(store, 1, 'status');
  for (let item = 0; item < status.reading.total; item += 1) status = await student(store, 1, 'rate', { item, value: 5 });
  // Every text is rated, and the step is still open until the note is in.
  assert.equal(status.reading.item, null);
  assert.equal(status.me.done.Test, undefined);
  assert.equal((await teacher(store, 'board')).counts.done, 0);
  status = await student(store, 1, 'note', { step: 'Test', text: 'One version had no hedge.' });
  assert.equal(status.me.done.Test, true);
  assert.equal((await teacher(store, 'board')).counts.done, 1);
  await next(store, 4);
  status = await student(store, 1, 'note', { step: 'Result', text: 'The dots sit lower.' });
  assert.equal(status.me.done.Result, true);
});

test('lab notes on, the supplied levels: a prediction and the last version wait for their notes', async () => {
  const noted = await started(2, { ...SUPPLIED, notes_on: true });
  await next(noted.store, 1);
  await code(student(noted.store, 0, 'predict', { pred: 0 }), 'need_note');
  const locked = await student(noted.store, 0, 'predict', { pred: 0, note: 'Because the doer is named.' });
  assert.equal(locked.me.pred, 0);
  assert.equal(locked.me.notes.Predict, 'Because the doer is named.');

  const writing = await started(2, { ...STUDENTS, notes_on: true });
  await next(writing.store, 1);
  await next(writing.store, 2);
  // The first versions save as they are written; the one that finishes the set is the completing action.
  await student(writing.store, 0, 'write', { option: 0, text: piece(0, 0) });
  await student(writing.store, 0, 'write', { option: 1, text: piece(0, 1) });
  await code(student(writing.store, 0, 'write', { option: 2, text: piece(0, 2) }), 'need_note');
  assert.deepEqual((await student(writing.store, 0, 'status')).me.writing[2], '');
  const done = await student(writing.store, 0, 'write', { option: 2, text: piece(0, 2), note: 'Touch took the longest.' });
  assert.equal(done.me.done.Make, true);
  assert.equal(done.me.notes.Make, 'Touch took the longest.');
});

test('lab notes off: every completing action goes through with no note', async () => {
  const { store } = await atDesign();
  assert.equal((await student(store, 0, 'note', { step: 'Question', text: '' })).me.notes.Question, '');
  await student(store, 0, 'bench', { edit: EDITS[0] });
  assert.equal((await student(store, 0, 'ready')).pair.ready, true);
  await next(store, 2);
  assert.equal((await student(store, 0, 'pair_predict', { pred: -1 })).pair.pred, -1);
  await next(store, 3);
  await next(store, 4);
  await next(store, 5);
  assert.equal((await student(store, 0, 'feature', { feature: 1 })).pair.feature, 1);
});

test('Name it: the pair names its feature from the list, and the board regroups the trials by level of language', async () => {
  const { store, session } = await notedAtDesign();
  for (let p = 0; p < 7; p += 1) {
    await student(store, first(p), 'bench', { edit: EDITS[p] });
    await student(store, first(p), 'ready', { note: 'Why this change.' });
  }
  await next(store, 2);
  await next(store, 3);
  const lists = dealOf(store, session).lists;
  // Every reader gives the control 6, pair 1's version 3, pair 2's 5 and every other version 6.
  const value = (item) => (item.kind !== 'version' ? 6 : item.pair === 'p1' ? 3 : item.pair === 'p2' ? 5 : 6);
  for (let i = 0; i < 17; i += 1) {
    const items = lists[ROSTER[i].id];
    for (let item = 0; item < items.length; item += 1) await student(store, i, 'rate', { item, value: value(items[item]) });
  }
  let board = await next(store, 4);
  assert.equal(board.levels, null, 'no level comparison before Name it');
  await code(student(store, 0, 'feature', { feature: 1 }), 'wrong_step');
  board = await next(store, 5);
  assert.equal(board.round.step_name, 'Name it');
  assert.deepEqual(board.levels.map((g) => [g.level, g.trials]), [['Form', 0], ['Sentence', 0], ['Word', 0]]);

  await code(student(store, 0, 'feature', { feature: 9, note: 'x' }), 'bad_feature');
  await code(student(store, 0, 'feature', { feature: 1 }), 'need_note');
  // Pair 8 kept the original: it has no trial to name.
  await code(student(store, 14, 'feature', { feature: 0, note: 'x' }), 'no_trial');
  let status = await student(store, 0, 'feature', { feature: 1, note: 'The hedge lets the speaker back away.' });
  assert.equal(status.pair.feature, 1);
  assert.equal(status.me.notes['Name it'], 'The hedge lets the speaker back away.');
  // The partner sees the pair's feature, and still owes their own note.
  status = await student(store, 1, 'status');
  assert.equal(status.pair.feature, 1);
  assert.equal(status.me.notes['Name it'], undefined);
  await student(store, 2, 'feature', { feature: 0, note: 'The break makes the reader wait.' });

  board = await teacher(store, 'board');
  assert.equal(board.pairs.named, 2);
  // Hedging is a sentence-level feature (shift −3); the line break is form (shift −1). Unnamed trials are left out.
  assert.deepEqual(board.levels, [{ level: 'Sentence', trials: 1, meanAbsShift: 3 }, { level: 'Form', trials: 1, meanAbsShift: 1 }, { level: 'Word', trials: 0, meanAbsShift: 0 }]);
  assert.equal(board.findings.trials.find((t) => t.pair === 'p1').feature, 1);
  // A student is sent the feature as their own pair's choice, never anyone else's.
  const sent = await student(store, 4, 'status');
  assert.equal(sent.pair.feature, null);
  assert.equal(JSON.stringify(sent.findings).includes('feature'), false);
});

test('a trial with fewer than four readers is left out of the level comparison', async () => {
  const { store } = await started(4, PAIRS_LAB);
  await next(store, 1);
  await student(store, 0, 'bench', { edit: EDITS[0] });
  await student(store, 2, 'bench', { edit: EDITS[1] });
  await next(store, 2);
  await next(store, 3);
  for (let i = 0; i < 4; i += 1) for (let item = 0; item < 3; item += 1) await student(store, i, 'rate', { item, value: item === 0 ? 2 : 7 });
  await next(store, 4);
  await next(store, 5);
  await student(store, 0, 'feature', { feature: 1 });
  await student(store, 2, 'feature', { feature: 0 });
  const board = await teacher(store, 'board');
  assert.equal(board.pairs.named, 2);
  assert.deepEqual(board.findings.trials.map((t) => t.thin), [true, true]);
  assert.deepEqual(board.levels.map((g) => g.trials), [0, 0, 0]);
});

test('the marking view can read a student’s record after the round has ended, with what it needs to word it', async () => {
  const { store, session } = await notedAtDesign();
  await student(store, 0, 'bench', { edit: EDITS[0] });
  await student(store, 0, 'ready', { note: 'The hedge is where the doubt sits.' });
  await teacher(store, 'end', { session });
  assert.equal((await teacher(store, 'board')).round, null);
  const one = await teacher(store, 'student', { student_id: ROSTER[0].id });
  assert.equal(one.record.notes.Design, 'The hedge is where the doubt sits.');
  assert.deepEqual(one.pair.change, ['cut "I think,"']);
  assert.deepEqual({ level: one.lab.level, notes_on: one.lab.notes_on, trait: one.lab.trait, steps: one.lab.steps.length }, { level: 'pairs', notes_on: true, trait: 'hesitant', steps: 7 });
  // A lab that has never run has nothing to show.
  const fresh = await teacher(labStore(PAIRS_NOTED), 'student', { student_id: ROSTER[0].id });
  assert.equal(fresh.record, null);
});

// ---------------------------------------------------------------------------
// After class
// ---------------------------------------------------------------------------

test('After class lists everyone who took part with their prediction, their pair and their note count', async () => {
  const { store, session } = await notedAtDesign();
  await student(store, 0, 'bench', { edit: EDITS[0] });
  await student(store, 0, 'ready', { note: 'The hedge is where the doubt sits.' });
  await next(store, 2);
  await student(store, 0, 'pair_predict', { pred: -1, note: 'Because the doubt goes with it.' });
  for (let step = 3; step <= 7; step += 1) await next(store, step);
  const board = await teacher(store, 'board');
  assert.equal(board.round.finished, true);
  const after = await teacher(store, 'after', { session });
  assert.equal(after.students.length, 17);
  assert.deepEqual(after.students.map((s) => s.initials), [...after.students.map((s) => s.initials)].sort());
  const kt = after.students.find((s) => s.student_id === ROSTER[0].id);
  // The prediction is the pair's, so the partner's row carries it too.
  assert.deepEqual(kt, { student_id: ROSTER[0].id, initials: 'KT', pred: -1, pair: 1, notes: 2, handed_in_at: null, explanation: '' });
  assert.deepEqual([after.students.find((s) => s.student_id === ROSTER[1].id).pred, after.students.find((s) => s.student_id === ROSTER[1].id).notes], [-1, 0]);
  assert.equal(after.students.find((s) => s.student_id === ROSTER[16].id).pair, 8);
  // A long answer is cut to its opening for the list; marking shows it whole.
  store.data.set(`work_handins/lab1/lab_explain/${ROSTER[0].id}`, { class_id: 'class1', student_id: ROSTER[0].id, text: { answers: { lab_explain_q: 'word '.repeat(100) } }, handed_in_at: '2026-11-19T02:00:00.000Z' });
  const long = (await teacher(store, 'after', { session })).students.find((s) => s.student_id === ROSTER[0].id);
  assert.equal(long.handed_in_at, '2026-11-19T02:00:00.000Z');
  assert.ok(long.explanation.length <= 281 && long.explanation.endsWith('…'));
  // It is the teacher's page: a round that has gone, or another round's board, gets nothing.
  await code(teacher(store, 'after', { session: 'f'.repeat(32) }), 'new_session');
  await teacher(store, 'end', { session });
  await code(teacher(store, 'after', { session }), 'no_round');
});
