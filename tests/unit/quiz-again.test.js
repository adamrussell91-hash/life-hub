import test from 'node:test';
import assert from 'node:assert/strict';
import { gatherAiMarking, prepareQuizPublish, quizAction, quizTeacherAction, storeQuizKey } from '../../netlify/functions/_shared/quiz.mjs';
import { toMarkAction } from '../../netlify/functions/_shared/to-mark-flow.mjs';

/* Invented class and answers only: this repository is public. */

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const stamp = { created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', schema_version: 1 };
const qBlock = (id, question) => ({ id, type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'student_teacher', content: { question: { id, ...question } }, ...stamp });
const short = { kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'] };
const essay = { kind: 'extended_response', prompt: 'Explain the ending.', marks: 3, guide: '1 for a claim, 2 for evidence.', ai_mark: true };
const pick = { kind: 'multiple_choice', prompt: 'Which act?', marks: 1, options: [{ id: 'o1', text: 'One' }, { id: 'o2', text: 'Five' }], correct: ['o2'] };
const gaps = { kind: 'fill_gap', prompt: 'Fill the gaps.', marks: 2, passage: 'The [[feud]] ends in [[grief]] for both houses.' };
const token = n => n.toString(16).repeat(48).slice(0, 48);
const pip = { token: token(1), class_id: 'class1', class_token: token(3) };
const wren = { token: token(2), class_id: 'class1', class_token: token(4) };

async function setup() {
  const quiz = { id: 'quiz1', title: 'Week 5 check', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: {}, blocks: [qBlock('qa', short), qBlock('qb', essay), qBlock('qc', pick), qBlock('qd', gaps)] };
  const store = storeFixture([
    ['lessons/quiz1', quiz],
    ['classes/class1', { id: 'class1', type: 'class', title: '8 English', students: [{ name: 'Pip Quill' }, { name: 'Wren Ashby' }] }]
  ]);
  const prepared = prepareQuizPublish(quiz, quiz.blocks);
  assert.deepEqual(prepared.problems, []);
  await storeQuizKey(store, 'quiz1', prepared.quiz);
  await store.setJSON('published/lessons/quiz1', { blocks: prepared.blocks, pedagogical_mode: 'quiz', quiz: prepared.quiz.snapshot });
  for (const [who, initials, responses] of [[pip, 'PQ', { qa: { text: 'romeo' }, qb: { text: 'The town forgets its grief.' } }], [wren, 'WA', { qa: { text: 'Romeo' }, qb: { text: '  ' } }]]) {
    await quizAction(store, 'quiz1', { ...who, action: 'claim', initials });
    await quizAction(store, 'quiz1', { ...who, action: 'start' });
    await quizAction(store, 'quiz1', { ...who, action: 'submit', responses });
  }
  const results = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  const idOf = (initials) => results.attempts.find(a => a.student?.initials === initials).id;
  const { students } = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  const studentId = (initials) => students.find(x => x.initials === initials).id;
  return { store, pipId: idOf('PQ'), wrenId: idOf('WA'), wrenStudent: studentId('WA'), pipStudent: studentId('PQ') };
}

const row = (attempt, id) => attempt.rows.find(r => r.id === id);
const answerRow = (store, student, q) => store.data.get(`piece_feedback/class1/${student}/q:quiz1:${q}`);

test('a blank essay asked again keeps its 0, then the new answer replaces it and waits to be marked', async () => {
  const { store, wrenId, wrenStudent } = await setup();
  const before = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: wrenId })).attempt;
  assert.equal(row(before, 'qb').awarded, 0, 'a blank essay is wrong on its own');

  const asked = (await quizTeacherAction(store, 'quiz1', { action: 'again_ask', attempt_id: wrenId, question_id: 'qb', comment: 'Have a go: one claim and a quote.' })).attempt;
  assert.equal(row(asked, 'qb').again.state, 'asked');
  assert.equal(row(asked, 'qb').awarded, 0, 'the mark stands until the new answer is back');
  assert.equal(asked.score, before.score);

  const piece = answerRow(store, wrenStudent, 'qb');
  assert.equal(piece.redraft.attempt_id, wrenId);
  assert.equal(piece.comment, 'Have a go: one claim and a quote.');
  assert.equal(piece.title, 'Week 5 check: question 2');
  assert.equal(piece.kind, 'answer');

  const scores = (await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).attempts.find(a => a.student === wrenStudent);
  assert.deepEqual(scores.asked_again.map(q => q.id), ['qb'], 'the To mark queue can say who still has it');

  // The student rewrites only that question.
  const loaded = await quizAction(store, 'quiz1', { ...wren, action: 'again_load', question_id: 'qb' });
  assert.equal(loaded.scope, 'whole');
  assert.deepEqual(loaded.text, { answer: { text: '' } });
  assert.equal(loaded.prompts.text, 'Explain the ending.');
  await assert.rejects(quizAction(store, 'quiz1', { ...wren, action: 'again_save', question_id: 'qb', part: 'answer', field: 'other', text: 'x' }), { code: 'out_of_scope' });
  await assert.rejects(quizAction(store, 'quiz1', { ...pip, action: 'again_load', question_id: 'qb' }), { code: 'not_asked' }, 'only the student who was asked');
  await assert.rejects(quizAction(store, 'quiz1', { ...wren, action: 'again_send', question_id: 'qb' }), { code: 'empty' });
  await quizAction(store, 'quiz1', { ...wren, action: 'again_save', question_id: 'qb', part: 'answer', field: 'text', text: 'The feud ends because both families lose a child.' });
  assert.deepEqual((await quizAction(store, 'quiz1', { ...wren, action: 'again_load', question_id: 'qb' })).working, { answer: { text: 'The feud ends because both families lose a child.' } });
  const sent = await quizAction(store, 'quiz1', { ...wren, action: 'again_send', question_id: 'qb' });
  assert.equal(sent.sent, true);
  await assert.rejects(quizAction(store, 'quiz1', { ...wren, action: 'again_send', question_id: 'qb' }), { code: 'not_asked' }, 'sent once');

  const back = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: wrenId })).attempt;
  assert.equal(row(back, 'qb').awarded, null, 'the new answer waits for a mark');
  assert.equal(row(back, 'qb').response.text, 'The feud ends because both families lose a child.');
  assert.equal(row(back, 'qb').again.state, 'sent');
  assert.equal(row(back, 'qb').again.first?.text ?? '', '', 'the first answer stays with it');
  const after = answerRow(store, wrenStudent, 'qb');
  assert.equal(after.redraft, undefined);
  assert.equal(after.sent, true);

  // It reaches the AI job and To mark like any new typed answer.
  assert.ok((await gatherAiMarking(store, 'quiz1')).answers.some(a => a.text === 'The feud ends because both families lose a child.'));
  const toMark = await toMarkAction(store, { action: 'quiz', class_id: 'class1', lesson_id: 'quiz1' });
  const waiting = toMark.questions.find(q => q.id === 'qb').answers.find(a => a.student_id === wrenStudent);
  assert.equal(waiting.again.state, 'sent');

  // Marking it counts, and comes back to the student as new feedback.
  const marked = (await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: wrenId, question_id: 'qb', score: 2 })).attempt;
  assert.equal(row(marked, 'qb').awarded, 2);
  assert.equal(marked.score, before.score + 2);
  await toMarkAction(store, { action: 'answer_save', class_id: 'class1', student_id: wrenStudent, piece: 'q:quiz1:qb', lesson_id: 'quiz1', title: 'Week 5 check', text: { answer: { text: 'The feud ends because both families lose a child.' } }, tags: [], comment: 'A clear claim.' });
  const returned = answerRow(store, wrenStudent, 'qb');
  assert.equal(returned.sent, undefined);
  assert.equal(returned.seen_at, undefined, 'new feedback, unread');
});

test('taking an ask back leaves the answer as it was; picked answers can’t be asked again', async () => {
  const { store, pipId, pipStudent } = await setup();
  await quizTeacherAction(store, 'quiz1', { action: 'again_ask', attempt_id: pipId, question_id: 'qb', comment: 'Add a quote.' });
  const asked = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: pipId })).attempt;
  assert.equal(row(asked, 'qb').awarded, 0, 'an unmarked answer asked again gets 0 for now');
  const back = (await quizTeacherAction(store, 'quiz1', { action: 'again_cancel', attempt_id: pipId, question_id: 'qb' })).attempt;
  assert.equal(row(back, 'qb').again, undefined);
  assert.equal(answerRow(store, pipStudent, 'qb').redraft, undefined);
  await assert.rejects(quizTeacherAction(store, 'quiz1', { action: 'again_ask', attempt_id: pipId, question_id: 'qc' }), { code: 'not_typed' });
});

test('a gap question opens one box per gap and keeps the gaps left alone', async () => {
  const { store, wrenId } = await setup();
  await quizTeacherAction(store, 'quiz1', { action: 'again_ask', attempt_id: wrenId, question_id: 'qd', comment: '' });
  const loaded = await quizAction(store, 'quiz1', { ...wren, action: 'again_load', question_id: 'qd' });
  const ids = Object.keys(loaded.text.answer);
  assert.equal(ids.length, 2);
  assert.match(loaded.prompts[ids[0]], /^Fill the gaps\.\nGap 1: …The _____ ends in…$/);
  await quizAction(store, 'quiz1', { ...wren, action: 'again_save', question_id: 'qd', part: 'answer', field: ids[0], text: 'feud' });
  await quizAction(store, 'quiz1', { ...wren, action: 'again_save', question_id: 'qd', part: 'answer', field: ids[1], text: 'grief' });
  await quizAction(store, 'quiz1', { ...wren, action: 'again_send', question_id: 'qd' });
  const back = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: wrenId })).attempt;
  assert.equal(row(back, 'qd').awarded, 2, 'exact gaps mark themselves');
});

test('asking the blank ones again reaches only students who left it blank, once', async () => {
  const { store, wrenStudent, pipStudent } = await setup();
  const first = await quizTeacherAction(store, 'quiz1', { action: 'again_blank', question_id: 'qb', class_id: 'class1', comment: 'Everyone has a go at this one.' });
  assert.equal(first.asked, 1);
  assert.ok(answerRow(store, wrenStudent, 'qb').redraft);
  assert.equal(answerRow(store, pipStudent, 'qb'), undefined);
  assert.equal((await quizTeacherAction(store, 'quiz1', { action: 'again_blank', question_id: 'qb', comment: '' })).asked, 0);
});

test('a pasted written answer reaches To mark with its typing record, so it can be replayed where it is marked', async () => {
  const quiz = { id: 'quiz1', title: 'Week 5 check', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: {}, blocks: [qBlock('qa', short), qBlock('qb', essay)] };
  const store = storeFixture([
    ['lessons/quiz1', quiz],
    ['classes/class1', { id: 'class1', type: 'class', title: '8 English', students: [{ name: 'Pip Quill' }] }]
  ]);
  const prepared = prepareQuizPublish(quiz, quiz.blocks);
  await storeQuizKey(store, 'quiz1', prepared.quiz);
  await store.setJSON('published/lessons/quiz1', { blocks: prepared.blocks, pedagogical_mode: 'quiz', quiz: prepared.quiz.snapshot });
  const text = 'The town forgets its grief.';
  await quizAction(store, 'quiz1', { ...pip, action: 'claim', initials: 'PQ' });
  await quizAction(store, 'quiz1', { ...pip, action: 'start' });
  await quizAction(store, 'quiz1', { ...pip, action: 'save', responses: { qb: { text } }, writing: { qb: { start: Date.now(), base: '', ms: 9_000, pastes: 1, away: 0, jumps: 0, steps: [[0, 0, 0, text]] } } });
  await quizAction(store, 'quiz1', { ...pip, action: 'submit', responses: { qa: { text: 'Juliet' }, qb: { text } } });

  const toMark = await toMarkAction(store, { action: 'quiz', class_id: 'class1', lesson_id: 'quiz1' });
  const essayAnswer = toMark.questions.find(q => q.id === 'qb').answers[0];
  assert.deepEqual(essayAnswer.writing.flags, ['Pasted once']);
  assert.equal(essayAnswer.writing.log.steps.length, 1, 'the replay comes with it');
  const shortAnswer = toMark.questions.find(q => q.id === 'qa')?.answers[0];
  assert.equal(shortAnswer?.writing, undefined, 'short answers carry no typing record');
});
