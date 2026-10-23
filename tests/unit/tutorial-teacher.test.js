// Teacher actions for a tutorial: summary, board, sit, show, hide, done, unlock, move, reply. Invented names only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialAction, tutorialTeacherAction } from '../../netlify/functions/_shared/tutorial.mjs';
import { tutorialKeys } from '../../netlify/functions/_shared/tutorial-status.mjs';
import { draftLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { deviceHash } from '../../netlify/functions/_shared/question-drop.mjs';
import { block, storeFor } from './helpers/tutorial-store.js';

const tok = (n) => String(n).repeat(48).slice(0, 48);
const who = (n) => ({ class_id: 'class1', class_token: tok(n) });
const ownerOf = (id) => deviceHash(`student:class1:${id}`);
function withDraft(extra = {}) {
  const store = storeFor();
  store.data.set(draftLessonKey('tut1'), { id: 'tut1', title: 'Structure', pedagogical_mode: 'tutorial', tutorial: { class_id: 'class1', groups: [
    { id: 'ga', name: 'Re-tells', why: 'x', goal: 'g', gap_type: 'knowledge', students: ['st_ann'], evidence: [] },
    { id: 'gb', name: 'Mix-up', why: 'y', goal: 'g', gap_type: 'mix_up', students: ['st_cy'], evidence: [] },
    ...(extra.groups ?? [])
  ] }, blocks: extra.blocks ?? [] });
  return store;
}

test('summary lists groups with students, stages and status', async () => {
  const store = withDraft();
  await tutorialAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'waiting' });
  const s = await tutorialTeacherAction(store, 'tut1', { action: 'summary' });
  assert.deepEqual(s.groups.map((g) => [g.id, g.name, g.status]), [['ga', 'Re-tells', 'waiting'], ['gb', 'Mix-up', 'not_started']]);
  assert.deepEqual(s.groups[0].students, [{ id: 'st_ann', initials: 'AB', name: 'Ann Bell', stage: 'waiting', unlocked: false }]);
  assert.deepEqual({ seen: s.seen, total: s.total }, { seen: 0, total: 2 });
});

test('sit, board, show, done', async () => {
  const store = withDraft();
  await tutorialAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'f1', parts: { 0: 'It repeats' }, rating: 'wrong' });
  await tutorialTeacherAction(store, 'tut1', { action: 'sit', group_id: 'ga' });
  const board = await tutorialTeacherAction(store, 'tut1', { action: 'board', group_id: 'ga' });
  assert.equal(board.sitting, true);
  assert.deepEqual(board.students[0].answers.f1, { parts: { 0: 'It repeats' }, rating: 'wrong', at: board.students[0].answers.f1.at });
  await tutorialTeacherAction(store, 'tut1', { action: 'show', group_id: 'ga', student_id: 'st_ann', block_id: 'f1', part: '0' });
  const seenByAnn = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.deepEqual(seenByAnn.shown, { text: 'It repeats', label: 'One answer from your group' });
  assert.equal(JSON.stringify(seenByAnn.shown).includes('Ann'), false);
  const done = await tutorialTeacherAction(store, 'tut1', { action: 'done', group_id: 'ga', students: ['st_ann'] });
  assert.equal(done.groups[0].status, 'seen');
  const state = store.data.get(tutorialKeys('tut1').group('ga'));
  assert.deepEqual({ sitting: state.sitting, done: state.done_students, shown: state.shown }, { sitting: false, done: ['st_ann'], shown: null });
  assert.equal((await tutorialAction(store, 'tut1', { action: 'status', ...who(1) })).unlocked, true);
});

test('show takes an answer from a Common block; hide clears it', async () => {
  const store = withDraft();
  await tutorialAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'h1', parts: { 1: 'In the demo' }, rating: 'right' });
  await tutorialTeacherAction(store, 'tut1', { action: 'show', group_id: 'ga', student_id: 'st_ann', block_id: 'h1', part: '1' });
  assert.equal(store.data.get(tutorialKeys('tut1').group('ga')).shown.text, 'In the demo');
  await tutorialTeacherAction(store, 'tut1', { action: 'hide', group_id: 'ga' });
  assert.equal(store.data.get(tutorialKeys('tut1').group('ga')).shown, null);
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'show', group_id: 'ga', student_id: 'st_ann', block_id: 'h1', part: '2' }), { code: 'not_found' });
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'show', group_id: 'gb', student_id: 'st_ann', block_id: 'h1', part: '1' }), { code: 'bad_student' });
});

test('unlock one student later; refuses a student outside the group', async () => {
  const store = withDraft();
  await tutorialTeacherAction(store, 'tut1', { action: 'unlock', group_id: 'gb', student_id: 'st_cy' });
  assert.deepEqual(store.data.get(tutorialKeys('tut1').group('gb')).done_students, ['st_cy']);
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'unlock', group_id: 'gb', student_id: 'st_ann' }), { code: 'bad_student' });
});

test('refuses a lesson that is not a tutorial, an unknown action and an unknown group', async () => {
  const store = withDraft();
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'explode' }), { code: 'bad_action' });
  await assert.rejects(tutorialTeacherAction(store, 'nope', { action: 'summary' }), { code: 'not_found' });
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'sit', group_id: 'gz' }), { code: 'not_found' });
});

test('moving a student keeps them in one group in the draft', async () => {
  const store = withDraft();
  await tutorialTeacherAction(store, 'tut1', { action: 'move', student_id: 'st_ann', group_id: 'gb' });
  const groups = store.data.get(draftLessonKey('tut1')).tutorial.groups;
  assert.deepEqual(groups.map((g) => g.students), [[], ['st_cy', 'st_ann']]);
  const tabs = store.data.get(tutorialKeys('tut1').tabs);
  assert.deepEqual(tabs.groups.map((g) => g.students), [[], ['st_cy', 'st_ann']]);
  // Moving again into the same group adds no duplicate.
  await tutorialTeacherAction(store, 'tut1', { action: 'move', student_id: 'st_ann', group_id: 'gb' });
  assert.deepEqual(store.data.get(draftLessonKey('tut1')).tutorial.groups.map((g) => g.students), [[], ['st_cy', 'st_ann']]);
  assert.deepEqual(store.data.get(tutorialKeys('tut1').tabs).groups.map((g) => g.students), [[], ['st_cy', 'st_ann']]);
});

test('move refuses an unknown group and a student off the class list', async () => {
  const store = withDraft();
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'move', student_id: 'st_ann', group_id: 'gz' }), { code: 'not_found' });
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'move', student_id: 'st_ghost', group_id: 'gb' }), { code: 'bad_student' });
});

const exitSection = (id, group, questions) => block(id, 'section', { tutorial_group: group, tutorial_exit: true, blocks: questions.map((q) => block(q, 'quiz_question', {})) });
function withQuiz(store, groups) {
  store.data.set('quiz/tut1/current', { version: 'v1' });
  store.data.set('quiz/tut1/keys/v1', { version: 'v1', order: ['q1', 'q2', 'q3'], questions: { q1: {}, q2: {}, q3: {} }, groups, settings: { for_students: Object.keys(groups) } });
}

test('move carries the exit questions: from a member of the new group', async () => {
  const store = withDraft();
  withQuiz(store, { st_ann: ['q1'], st_cy: ['q2'] });
  await tutorialTeacherAction(store, 'tut1', { action: 'move', student_id: 'st_ann', group_id: 'gb' });
  assert.deepEqual(store.data.get('quiz/tut1/keys/v1').groups, { st_ann: ['q2'], st_cy: ['q2'] });
});

test('move carries the exit questions: from the draft exit section when the group is empty', async () => {
  const store = withDraft({
    groups: [{ id: 'gc', name: 'Empty', why: 'z', goal: 'g', gap_type: 'knowledge', students: [], evidence: [] }],
    blocks: [exitSection('xa', 'ga', ['q1']), exitSection('xb', 'gb', ['q2']), exitSection('xc', 'gc', ['q3', 'q_new'])]
  });
  withQuiz(store, { st_ann: ['q1'], st_cy: ['q2'] });
  await tutorialTeacherAction(store, 'tut1', { action: 'move', student_id: 'st_ed', group_id: 'gc' });
  const record = store.data.get('quiz/tut1/keys/v1');
  assert.deepEqual(record.groups.st_ed, ['q3']);
  assert.deepEqual(record.settings.for_students, ['st_ann', 'st_cy', 'st_ed']);
});

test('hand-ups count per group, the board lists its own, and reply answers one', async () => {
  const store = withDraft();
  await tutorialAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await tutorialAction(store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  await tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'f1', scene_label: 'Step 1', text: 'Stuck' });
  await tutorialAction(store, 'tut1', { action: 'handup', ...who(1), scene_id: 'h1', scene_label: 'Demo', text: 'Why?' });
  await tutorialAction(store, 'tut1', { action: 'handup', ...who(2), scene_id: 'w2', scene_label: 'Teacher', text: 'Hi' });
  const s = await tutorialTeacherAction(store, 'tut1', { action: 'summary' });
  assert.deepEqual(s.groups.map((g) => [g.id, g.handups, g.open]), [['ga', 2, 2], ['gb', 1, 1]]);
  const board = await tutorialTeacherAction(store, 'tut1', { action: 'board', group_id: 'ga' });
  assert.equal(board.handups.length, 2);
  assert.deepEqual(Object.keys(board.handups[0]).sort(), ['at', 'id', 'label', 'reply', 'status', 'student_id', 'text']);
  assert.ok(board.handups.every((h) => h.student_id === 'st_ann' && h.id.startsWith(`${ownerOf('st_ann')}~`)));
  const after = await tutorialTeacherAction(store, 'tut1', { action: 'reply', id: board.handups[0].id, reply: 'Look at step 2' });
  assert.deepEqual(after.groups.map((g) => [g.id, g.handups, g.open]), [['ga', 2, 1], ['gb', 1, 1]]);
  const mine = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.deepEqual(mine.handups.filter((h) => h.status === 'answered').map((h) => h.reply), ['Look at step 2']);
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'reply', id: 'nope', reply: 'x' }), { code: 'bad_id' });
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'reply', id: `${ownerOf('st_ann')}~abcdef123`, reply: 'x' }), { code: 'not_found' });
});
