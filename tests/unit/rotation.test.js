// tests/unit/rotation.test.js
// Station Rotation server: publish split, student actions and teacher actions, on an invented lesson.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRotationPublish, rotationAction, rotationTeacherAction, storeRotationConfig, rotationPublishProblems, rotationKeys } from '../../netlify/functions/_shared/rotation.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';
import { classKey, draftLessonKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { deviceHash } from '../../netlify/functions/_shared/question-drop.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';
import { rotationLesson, ROTATION_ROSTER } from './helpers/rotation-fixture.mjs';

async function setup(over = {}) {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '8 Science', students: ROTATION_ROSTER });
  const draft = rotationLesson(over);
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
