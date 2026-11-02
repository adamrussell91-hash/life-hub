import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAiMarks, gatherAiMarking, prepareQuizPublish, quizAction, quizTeacherAction, storeQuizKey } from '../../netlify/functions/_shared/quiz.mjs';

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
const saAi = { kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'], looking_for: 'The young lover.' };
const essayAi = { kind: 'extended_response', prompt: 'Explain the ending.', marks: 4, guide: '2 for a claim, 2 for evidence.', ai_mark: true };
const token = n => n.toString(16).repeat(48).slice(0, 48);
const pip = { token: token(1), class_id: 'class1', class_token: token(3) };
const wren = { token: token(2), class_id: 'class1', class_token: token(4) };

async function setup() {
  const quiz = { id: 'quiz1', title: 'Week 5 check', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: {}, blocks: [qBlock('qa', saAi), qBlock('qb', essayAi)] };
  const store = storeFixture([
    ['lessons/quiz1', quiz],
    ['classes/class1', { id: 'class1', type: 'class', title: '8 English', students: [{ name: 'Pip Quill' }, { name: 'Wren Ashby' }] }]
  ]);
  const prepared = prepareQuizPublish(quiz, quiz.blocks);
  assert.deepEqual(prepared.problems, []);
  await storeQuizKey(store, 'quiz1', prepared.quiz);
  await store.setJSON('published/lessons/quiz1', { blocks: prepared.blocks, pedagogical_mode: 'quiz', quiz: prepared.quiz.snapshot });
  for (const [who, initials, responses] of [[pip, 'PQ', { qa: { text: 'romeo' }, qb: { text: 'The town forgets its grief.' } }], [wren, 'WA', { qa: { text: 'the lover boy' }, qb: { text: '   ' } }]]) {
    await quizAction(store, 'quiz1', { ...who, action: 'claim', initials });
    await quizAction(store, 'quiz1', { ...who, action: 'start' });
    await quizAction(store, 'quiz1', { ...who, action: 'submit', responses });
  }
  const results = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  const idOf = (initials) => results.attempts.find(a => a.student?.initials === initials).id;
  return { store, results, pipId: idOf('PQ'), wrenId: idOf('WA') };
}

test('typed answers that aren’t exact wait for the AI and are gathered with opaque ids only', async () => {
  const { store, results } = await setup();
  // Pip's exact short answer marks itself; Wren's wording and Pip's essay wait. Wren's blank essay is wrong.
  assert.equal(results.ai_waiting, 2);
  const gathered = await gatherAiMarking(store, 'quiz1');
  assert.deepEqual(gathered.answers.map(a => a.text).sort(), ['The town forgets its grief.', 'the lover boy']);
  assert.deepEqual(gathered.answers.map(a => a.id).sort(), ['a1', 'a2']);
  assert.deepEqual(gathered.questions.map(q => q.kind).sort(), ['extended_response', 'short_answer']);
  assert.equal(gathered.questions.find(q => q.kind === 'short_answer').looking_for, 'The young lover.');
  const sent = JSON.stringify([gathered.questions, gathered.answers]);
  for (const leak of ['Pip', 'Wren', 'PQ', 'WA', 'class1', ...Object.values(gathered.refs).map(r => r.device)]) assert.ok(!sent.includes(leak), `${leak} must not reach the model`);
});

test('scoring: the teacher beats the AI, the AI beats the automatic mark, unsure stays waiting', async () => {
  const { store, pipId, wrenId } = await setup();
  const gathered = await gatherAiMarking(store, 'quiz1');
  const idFor = (attempt, question) => Object.entries(gathered.refs).find(([, r]) => `${r.device}~${r.n}` === attempt && r.question_id === question)[0];
  const { written } = await applyAiMarks(store, 'quiz1', gathered.refs, [
    { id: idFor(wrenId, 'qa'), marks: 1, verdict: 'right', reason: 'Names the lover.', model: 'm' },
    { id: idFor(pipId, 'qb'), marks: null, suggested: 2, reason: 'Claim, no evidence; could be 1 or 2.', feedback: 'You make a clear claim. Add a quote from the ending.', model: 'm' }
  ], { job: 'ai_job_t1', at: '2026-11-01T02:00:00.000Z' });
  assert.equal(written, 2);
  assert.equal(store.data.get(`quiz/quiz1/ai-marks/${wrenId.replace('~', '/')}`).qa.reason, 'Names the lover.');

  let wren = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: wrenId })).attempt;
  assert.equal(wren.score, 1, 'the AI mark counts');
  assert.equal(wren.rows.find(r => r.id === 'qa').by, 'ai');
  let pip = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: pipId })).attempt;
  assert.equal(pip.pending, 1, 'unsure stays waiting');
  assert.equal(pip.rows.find(r => r.id === 'qb').ai.suggested, 2);
  assert.equal((await gatherAiMarking(store, 'quiz1')).answers.length, 0, 'AI-marked answers are never sent again');

  // The teacher overrides with a comment; the AI's mark no longer counts.
  wren = (await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: wrenId, question_id: 'qa', score: 0, comment: '  The speaker is named in line 2.  ' })).attempt;
  const row = wren.rows.find(r => r.id === 'qa');
  assert.deepEqual([wren.score, row.by, row.comment], [0, 'teacher', 'The speaker is named in line 2.']);
  // A code chip save sends no comment and keeps it.
  await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: wrenId, question_id: 'qa', score: 0, codes: ['code-x'] });
  assert.deepEqual(store.data.get(`quiz/quiz1/marks/${wrenId}`).qa, { marks: 0, codes: ['code-x'], comment: 'The speaker is named in line 2.' });
  pip = (await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: pipId, question_id: 'qb', score: 2, comment: 'You make a clear claim. Add a quote from the ending.' })).attempt;
  assert.deepEqual([pip.score, pip.pending], [3, 0]);

  // Insight reads the same marks.
  const insight = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.ok(insight.attempts.every(a => a.pending === 0));
});

test('students see the comment once released, never the AI’s reason', async () => {
  const { store, wrenId } = await setup();
  const gathered = await gatherAiMarking(store, 'quiz1');
  const id = Object.entries(gathered.refs).find(([, r]) => `${r.device}~${r.n}` === wrenId)[0];
  await applyAiMarks(store, 'quiz1', gathered.refs, [{ id, marks: 1, verdict: 'right', reason: 'REASON-FOR-TEACHER', model: 'm' }]);
  const essayId = Object.entries(gathered.refs).find(([, r]) => r.question_id === 'qb')[0];
  await applyAiMarks(store, 'quiz1', gathered.refs, [{ id: essayId, marks: 3, reason: 'ESSAY-REASON', feedback: 'You link the ending to the town. Add one more quote.', model: 'm' }]);
  const seen = await quizAction(store, 'quiz1', { ...pip });
  const text = JSON.stringify(seen);
  assert.ok(!text.includes('REASON'), 'the AI reason stays with the teacher');
  assert.equal(seen.results[0].rows.find(r => r.id === 'qb').comment, 'You link the ending to the town. Add one more quote.');
  const wrenView = await quizAction(store, 'quiz1', { ...wren });
  assert.equal(wrenView.results[0].rows.find(r => r.id === 'qa').awarded, 1);
  assert.equal(wrenView.results[0].rows.find(r => r.id === 'qa').comment, undefined, 'a short answer has no feedback to show');
});

test('deleting an attempt or giving another go clears its AI marks', async () => {
  const { store, pipId, wrenId } = await setup();
  const gathered = await gatherAiMarking(store, 'quiz1');
  await applyAiMarks(store, 'quiz1', gathered.refs, Object.keys(gathered.refs).map(id => ({ id, marks: 1, verdict: 'right', reason: 'ok', feedback: 'You add a clear point.', model: 'm' })));
  const aiKey = (attempt) => `quiz/quiz1/ai-marks/${attempt.replace('~', '/')}`;
  assert.ok(store.data.has(aiKey(pipId)) && store.data.has(aiKey(wrenId)));
  await quizTeacherAction(store, 'quiz1', { action: 'delete_attempt', attempt_id: pipId });
  assert.equal(store.data.has(aiKey(pipId)), false);
  await quizTeacherAction(store, 'quiz1', { action: 'reset', attempt_id: wrenId });
  assert.equal(store.data.has(aiKey(wrenId)), false);
});

test('an AI-marked answer still waits in To mark, with its tags for the teacher and none for the student', async () => {
  const { store, pipId } = await setup();
  const { quizAnswersToMark } = await import('../../netlify/functions/_shared/quiz.mjs');
  const { loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const gathered = await gatherAiMarking(store, 'quiz1');
  const id = Object.entries(gathered.refs).find(([, r]) => `${r.device}~${r.n}` === pipId && r.question_id === 'qb')[0];
  await applyAiMarks(store, 'quiz1', gathered.refs, [{ id, marks: 3, reason: 'ESSAY-REASON', feedback: 'Add one more quote.', model: 'm', tags: [{ code_id: 'ev', quote: 'forgets its grief', why: 'TAG-WHY' }] }]);
  const { students } = await loadRoster(store, 'class1');
  const found = await quizAnswersToMark(store, 'quiz1', 'class1', students);
  const answer = found.questions.find((q) => q.id === 'qb').answers.find((a) => a.initials === 'PQ');
  assert.equal(answer.by, 'ai');
  assert.equal(answer.ai.marks, 3);
  assert.deepEqual(answer.ai.tags, [{ code_id: 'ev', quote: 'forgets its grief', why: 'TAG-WHY' }]);
  const seen = JSON.stringify(await quizAction(store, 'quiz1', { ...pip }));
  for (const leak of ['TAG-WHY', 'ESSAY-REASON']) assert.ok(!seen.includes(leak), `${leak} stays with the teacher`);
});
