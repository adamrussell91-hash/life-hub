// tests/unit/rotation.test.js
// Station Rotation server: publish split, student actions and teacher actions, on an invented lesson.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRotationPublish, rotationAction, rotationTeacherAction, storeRotationConfig, rotationPublishProblems, rotationKeys } from '../../netlify/functions/_shared/rotation.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';
import { classKey, draftLessonKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { deviceHash } from '../../netlify/functions/_shared/question-drop.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';
import { rotationLesson, ROTATION_ROSTER, rushRightResponse, rushWrongResponse } from './helpers/rotation-fixture.mjs';

async function setup(over = {}, opts = {}) {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '8 Science', students: ROTATION_ROSTER });
  const draft = rotationLesson(over, opts);
  const pub = prepareRotationPublish(draft, filterBlocksForStudent(draft.blocks, { keepQuizQuestions: true }));
  assert.deepEqual(pub.problems, []);
  store.data.set(draftLessonKey('rot1'), draft);
  store.data.set(publishedLessonKey('rot1'), { lesson_id: 'rot1', pedagogical_mode: 'station_rotation', blocks: pub.snapshot.blocks, rotation: pub.snapshot.rotation });
  await storeRotationConfig(store, 'rot1', pub.config);
  return { store, pub, config: pub.config };
}
const act = (store, n, action, extra = {}, deps) => rotationAction(store, 'rot1', { action, ...who(n), ...extra }, deps);
const claim = (store, n) => act(store, n, 'claim', { initials: INITIALS[n] });
const teach = (store, action, extra = {}) => rotationTeacherAction(store, 'rot1', { action, ...extra });
const rejects = (p, code) => assert.rejects(p, (e) => (code ? e.code === code : true));
/** The public id of option `i` of a published question, matched by its text against the fixture. */
const optionId = (question, text) => question.options.find((o) => o.text === text).id;
const exitBlock = (pub, station) => pub.snapshot.blocks.find((b) => b.content?.rotation_station === station).content.blocks.find((b) => b.settings.rotation_role === 'exit');

/** Ann has collected these stations (set straight on the store). */
async function giveCollected(store, ids) {
  const key = rotationKeys('rot1').work(deviceHash('student:class1:st_ann'));
  await store.setJSON(key, { ...(await store.get(key)), collected: ids, done: ids });
}

async function pretestAll(store, n, wrongAt = []) {
  let status = await claim(store, n);
  for (const item of status.pretest.items) {
    const text = wrongAt.includes(item.id) ? 'Wrong' : 'Right';
    status = await act(store, n, 'pretest_answer', { item_id: item.id, response: { selected: [optionId(item.question, text)] } });
  }
  return status;
}

test('publish keeps answers off the public snapshot', async () => {
  const { pub } = await setup();
  const text = JSON.stringify(pub.snapshot);
  assert.ok(!text.includes('MODEL-ANSWER-SECRET'), 'model answer');
  assert.ok(!text.includes('"correct"'), 'quiz answers');
  assert.ok(!text.includes('correct_id'), 'hinge and lock answers');
  assert.ok(!text.includes('Thinks algae need fish'), 'misconception notes');
  assert.ok(!text.includes('nothing, nothing, nothing"'), 'written gate answer key');
  assert.ok(!text.includes('Pretest s1 question'), 'pretest questions stay on the server');
  assert.equal(pub.snapshot.rotation.pretest_count, 9);
  assert.equal(pub.snapshot.rotation.stations.find((s) => s.id === 's3').written_gate.passage.length > 0, true);
  assert.equal(pub.snapshot.rotation.finale.lock.options.length, 2);
  // Every key, hinge answer and the lock answer are in the stored config.
  assert.ok(pub.config.keys.s1exit && pub.config.hinges.s2gate.correct_id === 'b' && pub.config.finale.lock.correct_id === 'l2');
});

test('publish problems in the teacher’s words', () => {
  assert.match(rotationPublishProblems({ rotation: null }).join(), /Set up the rotation/);
  const d = rotationLesson({ class_id: '' });
  assert.match(rotationPublishProblems(d).join(), /class/);
  const e = rotationLesson();
  e.rotation.pretest = e.rotation.pretest.slice(1);
  assert.match(rotationPublishProblems(e).join(), /exactly 3 pretest/);
});

test('pretest: one at a time, right answer straight after, levels fill in', async () => {
  const { store } = await setup();
  let status = await claim(store, 1);
  assert.equal(status.pretest.items.length, 9);
  assert.ok(status.pretest.items.every((i) => !('correct' in i.question)));
  const [first] = status.pretest.items;
  status = await act(store, 1, 'pretest_answer', { item_id: first.id, response: { selected: [optionId(first.question, 'Wrong')] } });
  assert.equal(status.result.mark.correct, false);
  assert.ok(status.result.key, 'key comes back to show the right answer');
  assert.equal(status.levels.s1.source, 'default');
  status = await pretestAll(store, 1, ['s1p1', 's2p1', 's2p2']);
  assert.deepEqual([status.levels.s1.level, status.levels.s2.level, status.levels.s3.level], ['core', 'support', 'extend']);
  // Answering again changes nothing.
  const again = await act(store, 1, 'pretest_answer', { item_id: first.id, response: { selected: [optionId(first.question, 'Right')] } });
  assert.equal(again.result.mark.correct, false);
});

test('station flow: open, level, hints, recall, exit check, collect', async () => {
  const { store, pub } = await setup();
  await pretestAll(store, 1);
  let s = await act(store, 1, 'open_station', { station: 's1' });
  assert.equal(s.work.current, 's1');
  assert.equal(s.seats.s1, 1);
  s = await act(store, 1, 'level', { station: 's1', level: 'support' });
  assert.equal(s.levels.s1.level, 'support');
  assert.equal(s.levels.s1.source, 'own');
  await act(store, 1, 'hint', { station: 's1' });
  await act(store, 1, 'hint', { station: 's1' });
  s = await act(store, 1, 'hint', { station: 's1' });
  assert.equal(s.work.hints.s1, 2, 'only as many hints as the station has');
  await rejects(act(store, 1, 'collect', { station: 's1' }), 'exit');
  const exit = exitBlock(pub, 's1');
  s = await act(store, 1, 'exit_answer', { station: 's1', block_id: exit.id, response: { selected: [optionId(exit.content.question, 'Coral turning white as it loses its algae')] } });
  assert.equal(s.work.exits.s1.correct, true);
  assert.ok(s.work.results.s1[exit.id].key);
  s = await act(store, 1, 'collect', { station: 's1' });
  assert.deepEqual(s.work.collected, ['s1']);
  assert.equal(s.work.current, null);
  assert.equal(s.seats.s1, undefined);
  // Arrival recall at the next station.
  await act(store, 1, 'open_station', { station: 's2' });
  const recall = pub.snapshot.blocks.find((b) => b.content?.rotation_station === 's2').content.blocks.find((b) => b.settings.rotation_role === 'recall');
  s = await act(store, 1, 'recall_answer', { station: 's2', block_id: recall.id, response: { selected: [optionId(recall.content.question, 'Its algae')] } });
  assert.equal(s.work.recall.s2.mark.correct, true);
});

test('guided dial keeps the pretest level', async () => {
  const { store } = await setup({ dial: 'guided' });
  await pretestAll(store, 1);
  await rejects(act(store, 1, 'level', { station: 's1', level: 'support' }), 'guided');
});

test('a full station still opens; recommendations route round it', async () => {
  const { store } = await setup();
  for (const n of [2, 3]) { await claim(store, n); await act(store, n, 'open_station', { station: 's2' }); }
  const s = await claim(store, 1);
  assert.equal(s.seats.s2, 2);
  assert.notEqual(s.recommend, 's2');
  const opened = await act(store, 1, 'open_station', { station: 's2' });
  assert.equal(opened.work.current, 's2');
});

test('fixed path locks stations out of order', async () => {
  const { store } = await setup({ path: 'fixed' });
  await claim(store, 1);
  await rejects(act(store, 1, 'open_station', { station: 's2' }), 'locked');
});

test('hinge gate: miss shows the misconception and back-up; miss again flags; teacher opens', async () => {
  const { store, pub } = await setup();
  await claim(store, 1);
  await act(store, 1, 'open_station', { station: 's2' });
  const exit = exitBlock(pub, 's2');
  await rejects(act(store, 1, 'exit_answer', { station: 's2', block_id: exit.id, response: { selected: ['x'] } }), 'gate');
  await rejects(act(store, 1, 'gate_answer', { station: 's2', choice: 'a', reason: 'too short' }), 'reason');
  let s = await act(store, 1, 'gate_answer', { station: 's2', choice: 'a', reason: 'the fish eat it all up' });
  assert.equal(s.gates.s2.state, 'backup');
  assert.equal(s.gates.s2.reteach, 'Thinks algae need fish');
  assert.equal(s.gates.s2.backup.prompt, 'If no one eats the algae, it will…');
  assert.ok(!JSON.stringify(s.gates).includes('correct_id'));
  s = await act(store, 1, 'gate_answer', { station: 's2', choice: 'y', reason: 'it would get smaller' });
  assert.equal(s.gates.s2.state, 'flagged');
  await rejects(act(store, 1, 'gate_answer', { station: 's2', choice: 'x', reason: 'it would grow more' }), 'flagged');
  // Other stations still open while flagged.
  s = await act(store, 1, 'open_station', { station: 's1' });
  assert.equal(s.work.current, 's1');
  let board = await teach(store, 'board');
  assert.ok(board.groups.find((g) => g.id === 'reteach:s2').members.some((m) => m.flagged && m.name === 'Ann Bell'));
  board = await teach(store, 'open_gate', { student_id: 'st_ann', station: 's2' });
  s = await claim(store, 1);
  assert.equal(s.gates.s2.state, 'unlocked');
});

test('hinge gate passes on the back-up question', async () => {
  const { store } = await setup();
  await claim(store, 2);
  await act(store, 2, 'gate_answer', { station: 's2', choice: 'c', reason: 'nothing would change much' });
  const s = await act(store, 2, 'gate_answer', { station: 's2', choice: 'x', reason: 'it grows with no grazers' });
  assert.equal(s.gates.s2.state, 'passed');
});

test('board: moves and links are saved apart; links need collected pieces and a teacher word', async () => {
  const { store } = await setup();
  await claim(store, 1);
  await rejects(act(store, 1, 'board_link', { from: 's1', to: 's2', word: 'causes' }), 'not_collected');
  await giveCollected(store, ['s1', 's2']);
  let s = await act(store, 1, 'board_link', { from: 's1', to: 's2', word: 'causes' });
  assert.deepEqual(s.board.links, [{ from: 's1', to: 's2', word: 'causes' }]);
  assert.equal(s.saved, 'board');
  await rejects(act(store, 1, 'board_link', { from: 's1', to: 's2', word: 'invented word' }), 'bad_word');
  s = await act(store, 1, 'board_move', { station: 's1', x: 40, y: 60 });
  assert.deepEqual(s.board.pos.s1, { x: 40, y: 60 });
  assert.equal(s.board.links.length, 1, 'a move never wipes a link');
  s = await act(store, 1, 'board_unlink', { from: 's2', to: 's1' });
  assert.deepEqual(s.board.links, []);
});

test('finale: pieces first, then the lock, then the build', async () => {
  const { store } = await setup();
  await claim(store, 1);
  await rejects(act(store, 1, 'finale_lock', { option_id: 'l2' }), 'pieces');
  await giveCollected(store, ['s1', 's2', 's3']);
  await rejects(act(store, 1, 'finale_save', { build: 'x' }), 'lock');
  let s = await act(store, 1, 'finale_lock', { option_id: 'l1' });
  assert.equal(s.lock.right, false);
  s = await act(store, 1, 'finale_lock', { option_id: 'l2' });
  assert.equal(s.work.finale.lock_passed, true);
  s = await act(store, 1, 'finale_save', { build: 'Cool the water.', format: 'One-page brief', debrief: { 0: 'Easy ones first.' } });
  assert.equal(s.work.finale.build, 'Cool the water.');
  assert.equal(s.work.finale.debrief[0], 'Easy ones first.');
});

test('fallback drops a station from what the finale needs', async () => {
  const { store } = await setup();
  await claim(store, 1);
  await giveCollected(store, ['s1', 's2']);
  assert.equal((await claim(store, 1)).pieces_left, 1);
  await teach(store, 'fallback', { on: true });
  assert.equal((await claim(store, 1)).pieces_left, 0);
});

test('teacher: groups from the pretest, call group, ticks, help queue, names not ids', async () => {
  const { store } = await setup();
  await pretestAll(store, 1, ['s1p1']);
  await pretestAll(store, 2);
  await act(store, 2, 'hand_up');
  let board = await teach(store, 'board');
  assert.ok(board.students.every((s) => s.name && !/^st_/.test(s.name)));
  const g = board.groups.find((x) => x.id === 'reteach:s1');
  assert.deepEqual(g.members.map((m) => m.name), ['Ann Bell']);
  assert.deepEqual(g.members[0].missed, [1]);
  assert.equal(board.queue[0].name, 'Cy Dale');
  assert.ok(board.students.find((s) => s.name === 'Cy Dale').stuck, 'a hand up is stuck');
  board = await teach(store, 'call_group', { group: 'reteach:s1' });
  assert.ok(board.groups.find((x) => x.id === 'reteach:s1').called_at);
  const s = await claim(store, 1);
  assert.ok(s.called, 'the student is told');
  board = await teach(store, 'group_tick', { group: 'reteach:s1', student_id: 'st_ann', result: 'got_it' });
  assert.equal(board.groups.find((x) => x.id === 'reteach:s1').ticks.st_ann, 'got_it');
  board = await teach(store, 'going', { student_id: 'st_cy' });
  assert.equal(board.queue.length, 0);
  board = await teach(store, 'group_done', { group: 'reteach:s1' });
  assert.equal((await claim(store, 1)).called, null);
});

test('a republish keeps state for stations that still exist', async () => {
  const { store } = await setup();
  await pretestAll(store, 1);
  await act(store, 1, 'open_station', { station: 's3' });
  const draft = rotationLesson();
  draft.rotation.stations = draft.rotation.stations.filter((s) => s.id !== 's3');
  draft.rotation.pretest = draft.rotation.pretest.filter((p) => p.station !== 's3');
  draft.rotation.stations.forEach((s) => delete s.token);
  delete draft.rotation.finale.lock;
  const pub = prepareRotationPublish(draft, filterBlocksForStudent(draft.blocks, { keepQuizQuestions: true }));
  assert.deepEqual(pub.problems, []);
  await storeRotationConfig(store, 'rot1', pub.config);
  const s = await claim(store, 1);
  assert.equal(s.work.current, null);
  assert.ok(s.levels.s1 && !s.levels.s3);
});

test('a written gate with no checker goes to the teacher and doesn’t count', async () => {
  const { store } = await setup();
  await claim(store, 1);
  const s = await act(store, 1, 'check_writing', { station: 's3', text: 'Repetition in "nothing, nothing, nothing" shows isolation.' });
  assert.equal(s.gates.s3.state, 'flagged');
  assert.equal(s.gates.s3.checks_left, 3);
  const board = await teach(store, 'board');
  assert.equal(board.writing[0].name, 'Ann Bell');
  await teach(store, 'writing_decision', { student_id: 'st_ann', station: 's3', decision: 'pass' });
  assert.equal((await claim(store, 1)).gates.s3.state, 'passed');
});

test('students outside the class are turned away', async () => {
  const { store } = await setup({ class_id: 'other' });
  const s = await claim(store, 1);
  assert.equal(s.not_for_you, true);
});

test('the student endpoint is on the public route list', async () => {
  const { isPublicStudentApi } = await import('../../netlify/functions/_shared/public-student-routes.mjs');
  assert.equal(isPublicStudentApi('POST', '/api/published/rotation/rot1'), true);
  assert.equal(isPublicStudentApi('GET', '/api/published/rotation/rot1'), false);
});

test('written gate through the student endpoint: not yet, appeal, then pass; the teacher sees each check', async () => {
  const { createWritingChecker } = await import('../../netlify/functions/_shared/rotation-writing.mjs');
  const { store } = await setup();
  let verdict = 'fail';
  const complete = async (request) => {
    const ids = [...request.messages[0].content.matchAll(/<point id="([^"]+)"/g)].map((m) => m[1]);
    const verdicts = ids.flatMap((id) => ['technique_fits', 'effect_linked'].map((check) => ({ id, check, verdict, ...(verdict === 'fail' ? { reason: 'Say how it shows the idea.' } : {}) })));
    return { content: [{ type: 'text', text: JSON.stringify({ verdicts }) }], usage: { input_tokens: 10, output_tokens: 10 } };
  };
  let t = Date.parse('2026-11-09T10:00:00Z');
  const deps = { checkWriting: createWritingChecker({ complete, names: ['Repetition', 'Personification'], now: () => t }) };
  await claim(store, 1);
  const text = 'Repetition in "nothing, nothing, nothing" shows isolation.\n\nPersonification in "Its single eye turned" shows isolation.';
  let s = await act(store, 1, 'check_writing', { station: 's3', text }, deps);
  assert.equal(s.gates.s3.state, 'open');
  assert.equal(s.gates.s3.checks_left, 2);
  assert.equal(s.gates.s3.last.outcome, 'not_yet');
  s = await act(store, 1, 'appeal', { station: 's3' }, deps);
  assert.ok(s.gates.s3.appeal_at);
  let board = await teach(store, 'board');
  assert.equal(board.writing[0].appeal, true);
  assert.equal(board.writing[0].attempts[0].text, text);
  verdict = 'pass';
  t += 60_000;
  s = await act(store, 1, 'check_writing', { station: 's3', text: `${text} It is lonely.` }, deps);
  assert.equal(s.gates.s3.state, 'passed');
  // Gates never write a mark: nothing under quiz/ or a markbook key.
  assert.ok(![...store.data.keys()].some((k) => k.startsWith('quiz/') || k.includes('markbook')));
});

// ---------------------------------------------------------------- station locks (s4: rush k1, AI k2, rush k3)

const lockSetup = (over = {}) => setup(over, { locks: true });
const chain = (status) => status.station_locks.s4;
const lockOfStatus = (status, id) => chain(status).find((l) => l.id === id);
/** A clock the test moves by hand. */
function clockAt(iso = '2026-11-09T10:00:00Z') {
  let t = Date.parse(iso);
  return { now: () => t, tick: (ms) => { t += ms; } };
}
/** Answers the rush lock's next item, right or wrong, 1 s apart. */
async function rushAnswer(store, clock, lock, right) {
  const status = await claim(store, 1);
  const l = lockOfStatus(status, lock);
  const item = l.check.items.find((q) => q.id === l.rush.next_item_id);
  clock.tick(1000);
  return act(store, 1, 'lock_rush', { station: 's4', lock, item_id: item.id, response: right ? rushRightResponse(item) : rushWrongResponse(item) }, { now: clock.now });
}
/** A stand-in model like the dev mock's: pass when every criterion's longest word is in the answer. */
const lockModel = async (request) => {
  const prompt = request.messages[0].content;
  const answer = (/<answer>([\s\S]*?)<\/answer>/.exec(prompt)?.[1] ?? '').toLowerCase();
  const criteria = [...prompt.matchAll(/<criterion>([\s\S]*?)<\/criterion>/g)].map((m) => m[1]);
  const missing = criteria.find((c) => !answer.includes(c.toLowerCase().split(/[^a-z0-9]+/).sort((a, b) => b.length - a.length)[0]));
  return { model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(missing ? { pass: false, fix: `Say more about this: ${missing}` } : { pass: true, fix: '' }) }], usage: { input_tokens: 400, output_tokens: 40 } };
};
async function passRush(store, clock, lock, n) {
  let s;
  for (let i = 0; i < n; i++) s = await rushAnswer(store, clock, lock, true);
  return s;
}

test('locks: publish keeps later locks’ blocks, rush keys, model answers and rewards off the snapshot', async () => {
  const { pub } = await lockSetup();
  const text = JSON.stringify(pub.snapshot);
  assert.ok(!text.includes('LOCKED-K2') && !text.includes('LOCKED-K3'), 'later locks’ blocks');
  assert.ok(!text.includes('MODEL-LOCK-SECRET'), 'AI model answer');
  assert.ok(!text.includes('Links warm water to bleaching'), 'AI criteria');
  assert.ok(!text.includes('The chain in one line') && !text.includes('Rescue order'), 'rewards');
  assert.ok(!text.includes('What lives inside healthy coral?'), 'rush items come from the status');
  const section = pub.snapshot.blocks.find((b) => b.content?.rotation_station === 's4');
  assert.deepEqual(section.content.blocks.map((b) => b.id), ['s4goal', 's4k1a', 's4k1b', 's4done']);
  const st = pub.snapshot.rotation.stations.find((s) => s.id === 's4');
  assert.deepEqual(st.locks, [{ id: 'k1', title: 'Which parts matter?', kind: 'rush' }, { id: 'k2', title: 'Explain the chain', kind: 'ai' }, { id: 'k3', title: 'Order the rescue', kind: 'rush' }]);
  // The server keeps them, questions split.
  assert.deepEqual(pub.config.lock_blocks.s4.k3.map((b) => b.id), ['s4k3a', 's4k3q', 's4exit']);
  assert.ok(!JSON.stringify(pub.config.lock_blocks).includes('"correct"'));
  assert.ok(pub.config.keys.s4exit && pub.config.keys.s4k3q.lock === 'k3');
  assert.equal(Object.keys(pub.config.rush_keys.s4.k1).length, 4);
  assert.ok(!JSON.stringify(pub.config.rush_public).includes('"correct"') && !JSON.stringify(pub.config.rush_public).includes('"answer"'));
});

test('locks: publish problems for unfinished locks', () => {
  const d = rotationLesson({}, { locks: true });
  const s4 = d.rotation.stations.find((s) => s.id === 's4');
  s4.locks[0].check.items = s4.locks[0].check.items.slice(0, 2);
  s4.locks[1].check.criteria = [];
  s4.locks[2].reward = { title: '', text: '' };
  d.blocks.find((b) => b.content?.rotation_station === 's4').content.blocks[1].settings.rotation_lock = 'gone';
  const problems = rotationPublishProblems(d).join(' | ');
  assert.match(problems, /at least 3 finished rush questions/);
  assert.match(problems, /AI check .* needs a question, a model answer/);
  assert.match(problems, /Viva Kit card/);
  assert.match(problems, /lock that is no longer there/);
});

test('locks: status shows the open lock, closes the rest, and holds rewards back', async () => {
  const { store } = await lockSetup();
  const s = await claim(store, 1);
  assert.deepEqual(chain(s).map((l) => l.state), ['open', 'locked', 'locked']);
  const [k1, k2, k3] = chain(s);
  assert.equal(k1.check.items.length, 4);
  assert.ok(k1.check.items.every((q) => !('correct' in q) && !('answer' in q)));
  assert.equal(k1.rush.next_item_id, k1.check.items[0].id);
  assert.equal(k1.blocks, undefined, 'the first lock’s blocks are in the snapshot');
  assert.ok(!k1.reward);
  assert.deepEqual(Object.keys(k2).sort(), ['id', 'kind', 'state', 'title']);
  assert.deepEqual(Object.keys(k3).sort(), ['id', 'kind', 'state', 'title']);
  assert.deepEqual(s.kit, []);
  assert.ok(!JSON.stringify(s).includes('LOCKED-K2'));
});

test('locks: a rush streak within time passes, unlocks the next lock’s blocks and earns the reward; answers never shown', async () => {
  const { store } = await lockSetup();
  const clock = clockAt();
  await claim(store, 1);
  let s = await rushAnswer(store, clock, 'k1', true);
  assert.deepEqual({ right: s.rush.right, streak: s.rush.streak, need: s.rush.need, passed: s.rush.passed }, { right: true, streak: 1, need: 3, passed: false });
  assert.ok(s.rush.ends_at);
  s = await rushAnswer(store, clock, 'k1', false);
  assert.equal(s.rush.right, false);
  assert.equal(s.rush.streak, 0, 'a wrong answer resets the streak');
  for (const reply of [s.rush, ...chain(s).map((l) => l.rush ?? {})]) {
    const t = JSON.stringify(reply);
    assert.ok(!t.includes('"key"') && !t.includes('"answer"') && !t.includes('"correct"'), 'no answer in a rush reply');
  }
  assert.ok(!('result' in s));
  s = await passRush(store, clock, 'k1', 3);
  assert.equal(s.rush.passed, true);
  assert.equal(s.rush.next_item_id, null);
  assert.deepEqual(chain(s).map((l) => l.state), ['passed', 'open', 'locked']);
  assert.deepEqual(lockOfStatus(s, 'k1').reward.title, 'The key parts');
  assert.deepEqual(lockOfStatus(s, 'k2').blocks.map((b) => b.id), ['s4k2a', 's4k2b']);
  assert.equal(lockOfStatus(s, 'k2').check.prompt, 'In one or two sentences, explain why warm water drives the fish away.');
  assert.ok(!JSON.stringify(s).includes('MODEL-LOCK-SECRET'));
  assert.deepEqual(s.kit.map((c) => [c.station, c.lock, c.title]), [['s4', 'k1', 'The key parts']]);
  assert.ok(!JSON.stringify(s).includes('LOCKED-K3'), 'lock 3 stays closed');
  // Another answer after passing changes nothing.
  const again = await act(store, 1, 'lock_rush', { station: 's4', lock: 'k1', item_id: 'x', response: { value: true } }, { now: clock.now });
  assert.equal(again.rush.passed, true);
});

test('locks: a missed item comes back later, and only the item on screen can be answered', async () => {
  const { store } = await lockSetup();
  const clock = clockAt();
  const first = lockOfStatus(await claim(store, 1), 'k1').rush.next_item_id;
  const s = await rushAnswer(store, clock, 'k1', false);
  assert.notEqual(s.rush.next_item_id, first);
  const items = lockOfStatus(s, 'k1').check.items;
  const other = items.find((q) => q.id !== s.rush.next_item_id);
  clock.tick(1000);
  await rejects(act(store, 1, 'lock_rush', { station: 's4', lock: 'k1', item_id: other.id, response: rushRightResponse(other) }, { now: clock.now }), 'not_next');
  // Round the queue: the missed item is the last of four.
  let t = s;
  for (let i = 0; i < 3; i++) t = await rushAnswer(store, clock, 'k1', false);
  assert.equal(t.rush.next_item_id, first);
});

test('locks: running out of time resets the round; answers too fast are refused', async () => {
  const { store } = await lockSetup();
  const clock = clockAt();
  await claim(store, 1);
  await rushAnswer(store, clock, 'k1', true);
  let s = await rushAnswer(store, clock, 'k1', true);
  assert.equal(s.rush.streak, 2);
  const next = lockOfStatus(s, 'k1').check.items.find((q) => q.id === s.rush.next_item_id);
  clock.tick(200);
  await rejects(act(store, 1, 'lock_rush', { station: 's4', lock: 'k1', item_id: next.id, response: rushRightResponse(next) }, { now: clock.now }), 'too_fast');
  clock.tick(91_000);
  s = await act(store, 1, 'lock_rush', { station: 's4', lock: 'k1', item_id: next.id, response: rushRightResponse(next) }, { now: clock.now });
  assert.deepEqual({ timed_out: s.rush.timed_out, right: s.rush.right, streak: s.rush.streak, passed: s.rush.passed, ends_at: s.rush.ends_at }, { timed_out: true, right: null, streak: 0, passed: false, ends_at: null });
  assert.equal(lockOfStatus(s, 'k1').rush.started_at, null);
  // A fresh round starts the clock on its first answer and can still pass.
  s = await passRush(store, clock, 'k1', 3);
  assert.equal(s.rush.passed, true);
});

test('locks: a later lock can’t be answered, and collect needs every lock', async () => {
  const { store, pub } = await lockSetup();
  const clock = clockAt();
  await claim(store, 1);
  await act(store, 1, 'open_station', { station: 's4' });
  await rejects(act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: 'Warm water causes bleaching.' }), 'lock_closed');
  await rejects(act(store, 1, 'lock_rush', { station: 's4', lock: 'k2', item_id: 'x', response: {} }), 'lock_closed');
  const exit = pub.config.keys.s4exit;
  assert.ok(exit);
  const exitQ = pub.config.lock_blocks.s4.k3.find((b) => b.id === 's4exit').content.question;
  await act(store, 1, 'exit_answer', { station: 's4', block_id: 's4exit', response: { selected: [optionId(exitQ, 'The algae can only return in cool water')] } });
  await rejects(act(store, 1, 'collect', { station: 's4' }), 'locks');
  await passRush(store, clock, 'k1', 3);
  await rejects(act(store, 1, 'lock_rush', { station: 's4', lock: 'k2', item_id: 'x', response: {} }), 'bad_lock');
  await teach(store, 'open_lock', { student_id: 'st_ann', station: 's4', lock: 'k2' });
  await rejects(act(store, 1, 'collect', { station: 's4' }), 'locks');
  clock.tick(5000);
  const s = await passRush(store, clock, 'k3', 3);
  assert.deepEqual(chain(s).map((l) => l.state), ['passed', 'passed', 'passed']);
  assert.deepEqual(s.kit.map((c) => c.lock), ['k1', 'k2', 'k3']);
  const done = await act(store, 1, 'collect', { station: 's4' });
  assert.deepEqual(done.work.collected, ['s4']);
});

test('locks: the AI check passes or gives one fix, through the injected checker', async () => {
  const { createLockChecker } = await import('../../netlify/functions/_shared/rotation-writing.mjs');
  const { store } = await lockSetup();
  const clock = clockAt();
  const requests = [];
  const checkLock = createLockChecker({ complete: async (r) => { requests.push(r); return lockModel(r); }, now: clock.now });
  await claim(store, 1);
  await passRush(store, clock, 'k1', 3);
  let s = await act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: 'Warm water causes bleaching.' }, { checkLock, now: clock.now });
  assert.deepEqual({ outcome: s.lock_check.outcome, pass: s.lock_check.pass, left: s.lock_check.checks_left }, { outcome: 'not_yet', pass: false, left: 5 });
  assert.match(s.lock_check.fix, /shelter/);
  assert.ok(s.lock_check.fix.length <= 160);
  assert.equal(requests[0].model, 'claude-haiku-5-5');
  assert.equal(requests[0].effort, 'low');
  assert.ok(requests[0].max_tokens <= 300);
  assert.ok(requests[0].messages[0].content.includes('<model_answer>'), 'judged against the model answer');
  assert.ok(!requests[0].messages[0].content.includes('Ann') && !requests[0].messages[0].content.includes('AB'), 'no names');
  await rejects(act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: 'Warm water causes  bleaching.' }, { checkLock, now: clock.now }), 'unchanged');
  await rejects(act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: 'Something else.' }, { checkLock, now: clock.now }), 'too_soon');
  clock.tick(21_000);
  s = await act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: 'Warm water causes bleaching, so the fish lose shelter.' }, { checkLock, now: clock.now });
  assert.equal(s.lock_check.pass, true);
  assert.deepEqual(chain(s).map((l) => l.state), ['passed', 'passed', 'open']);
  assert.equal(lockOfStatus(s, 'k2').reward.title, 'The chain in one line');
  // The spend is counted against the class’s daily cap.
  assert.ok([...store.data.keys()].some((k) => k.startsWith('rotation/rot1/spend/class1/')));
});

test('locks: out of AI checks goes to the teacher, who sees it and opens the lock', async () => {
  const { createLockChecker } = await import('../../netlify/functions/_shared/rotation-writing.mjs');
  const { store } = await lockSetup();
  const clock = clockAt();
  const checkLock = createLockChecker({ complete: lockModel, now: clock.now });
  await claim(store, 1);
  await passRush(store, clock, 'k1', 3);
  await act(store, 1, 'open_station', { station: 's4' });
  let s;
  for (let i = 0; i < 6; i++) {
    clock.tick(21_000);
    s = await act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: `Try number ${i + 1}: the reef changes.` }, { checkLock, now: clock.now });
  }
  assert.equal(s.lock_check.checks_left, 0);
  assert.match(s.lock_check.message, /teacher/);
  assert.equal(lockOfStatus(s, 'k2').flagged, true);
  clock.tick(21_000);
  await rejects(act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: 'Warm water causes bleaching, so the fish lose shelter.' }, { checkLock, now: clock.now }), 'flagged');
  let board = await teach(store, 'board');
  const ann = board.students.find((x) => x.name === 'Ann Bell');
  assert.deepEqual(ann.locks.s4.map((l) => [l.id, l.state, l.flagged]), [['k1', 'passed', false], ['k2', 'open', true], ['k3', 'locked', false]]);
  assert.equal(ann.stuck, true);
  assert.equal(board.lock_checks[0].name, 'Ann Bell');
  assert.equal(board.lock_checks[0].attempts.length, 6);
  board = await teach(store, 'open_lock', { student_id: 'st_ann', station: 's4', lock: 'k2' });
  assert.equal(board.lock_checks.length, 0);
  assert.equal(board.students.find((x) => x.name === 'Ann Bell').locks.s4[1].teacher, true);
  s = await claim(store, 1);
  assert.equal(lockOfStatus(s, 'k2').state, 'passed');
  assert.equal(lockOfStatus(s, 'k3').state, 'open');
  assert.deepEqual(lockOfStatus(s, 'k3').blocks.map((b) => b.id), ['s4k3a', 's4k3q', 's4exit']);
});

test('locks: with no checker (no key) the AI check goes to the teacher and doesn’t count', async () => {
  const { store } = await lockSetup();
  const clock = clockAt();
  await claim(store, 1);
  await passRush(store, clock, 'k1', 3);
  const s = await act(store, 1, 'lock_ai', { station: 's4', lock: 'k2', text: 'Warm water causes bleaching.' });
  assert.equal(s.lock_check.outcome, 'teacher');
  assert.equal(s.lock_check.checks_left, 6);
  assert.equal(lockOfStatus(s, 'k2').flagged, true);
});

test('locks: the teacher opening a later lock opens the ones before it', async () => {
  const { store } = await lockSetup();
  await claim(store, 1);
  await teach(store, 'open_lock', { student_id: 'st_ann', station: 's4', lock: 'k3' });
  const s = await claim(store, 1);
  assert.deepEqual(chain(s).map((l) => l.state), ['passed', 'passed', 'passed']);
  assert.equal(s.kit.length, 3);
  await rejects(teach(store, 'open_lock', { student_id: 'st_ann', station: 's4', lock: 'nope' }), 'bad_lock');
});
