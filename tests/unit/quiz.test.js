import test from 'node:test';
import assert from 'node:assert/strict';
import { questionDropAction, listSubmissions, reviewSubmission } from '../../netlify/functions/_shared/question-drop.mjs';
import { prepareQuizPublish, storeQuizKey, quizAction as rawQuizAction, quizTeacherAction } from '../../netlify/functions/_shared/quiz.mjs';
import { BlockSchema } from '../../netlify/functions/_shared/teaching-block-schema.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { createPublishedQuizHandler } from '../../netlify/functions/published-quiz.mjs';

// Students take quizzes from a class page. `class0` has no list, so it stays anonymous.
const quizAction = (store, lessonId, body) => rawQuizAction(store, lessonId, { class_id: 'class0', ...body });

const stamp = { created_at: '2026-10-17T00:00:00.000Z', updated_at: '2026-10-17T00:00:00.000Z', schema_version: 1 };
const drop = (content = {}) => ({
  id: 'drop1', type: 'block', block_type: 'question_drop', variant: 'medium', visibility: 'student_teacher',
  content: { target_quiz_id: 'quiz1', prompt: 'Write a question about the poem.', kinds: [], marks_min: 1, marks_max: 3, per_student: 2, accepting: true, ...content },
  ...stamp
});
const image = { id: 'img1', type: 'block', block_type: 'image', visibility: 'student_teacher', content: { url: 'https://example.com/heart.png', alt_text: 'Heart' }, ...stamp };
const qBlock = (id, question) => ({ id, type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'student_teacher', content: { question: { id, ...question } }, ...stamp });

const mc = { kind: 'multiple_choice', prompt: 'Which technique?', marks: 2, hint: 'Think comparison.', explanation: 'No like or as.', options: [{ id: 'a', text: 'Simile' }, { id: 'b', text: 'Metaphor' }, { id: 'c', text: 'Rhyme' }], correct: ['b'] };
const sa = { kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'] };
const essay = { kind: 'extended_response', prompt: 'Explain the ending.', marks: 4, model_answer: 'Tragic.' };

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  if (!data.has('classes/class0')) data.set('classes/class0', { id: 'class0', type: 'class', title: 'Open class', students: [] });
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

function baseStore({ dropContent, quizSettings, quizBlocks = [qBlock('qa', mc), qBlock('qb', sa), qBlock('qc', essay)] } = {}) {
  const lesson = { id: 'lesson1', title: 'Monday', unit_id: 'unit1', blocks: [image, drop(dropContent)] };
  const quiz = { id: 'quiz1', title: 'Week 4 review', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: quizSettings ?? {}, blocks: quizBlocks };
  return storeFixture([
    ['lessons/lesson1', lesson],
    ['published/lessons/lesson1', { blocks: lesson.blocks }],
    ['lessons/quiz1', quiz]
  ]);
}

async function publishQuiz(store) {
  const draft = await store.get('lessons/quiz1');
  const prepared = prepareQuizPublish(draft, draft.blocks);
  assert.deepEqual(prepared.problems, []);
  await storeQuizKey(store, 'quiz1', prepared.quiz);
  await store.setJSON('published/lessons/quiz1', { blocks: prepared.blocks, pedagogical_mode: 'quiz', quiz: prepared.quiz.snapshot });
  return prepared;
}

const token = n => n.toString(16).repeat(48).slice(0, 48);

test('new blocks parse, and the public routes are open to students', () => {
  assert.equal(BlockSchema.parse(drop()).content.per_student, 2);
  assert.equal(BlockSchema.parse(qBlock('qa', mc)).content.question.kind, 'multiple_choice');
  assert.equal(BlockSchema.parse({ ...qBlock('qz', { kind: 'matching', prompt: '' }) }).block_type, 'quiz_question', 'half-written drafts still save');
  assert.ok(isPublicStudentApi('POST', '/api/published/question-drop/lesson1/drop1'));
  assert.ok(isPublicStudentApi('POST', '/api/published/quiz/quiz1'));
  assert.ok(isPublicStudentApi('POST', '/api/published/lecture/lesson1'));
  assert.ok(!isPublicStudentApi('POST', '/api/lessons/quiz1/quiz'));
});

test('question drop: students send questions to the target quiz, capped per device, checked and flagged', async () => {
  const store = baseStore();
  const call = body => questionDropAction(store, 'lesson1', 'drop1', body);
  const status = await call({});
  assert.equal(status.open, true);
  assert.equal(status.quiz_title, 'Week 4 review');
  assert.equal(status.per_student, 2);

  await assert.rejects(call({ action: 'submit', token: token(1), question: { ...mc, correct: ['zzz'] } }), /Tick the right answer/);
  await assert.rejects(call({ action: 'submit', token: token(1), question: { ...mc, marks: 9 } }), /between 1 and 3/);
  await assert.rejects(call({ action: 'submit', token: token(1), question: { ...mc, image: { url: 'https://evil.example/x.png', alt: '' } } }), /this lesson’s images/);
  const sent = await call({ action: 'submit', token: token(1), question: { ...mc, image: { url: 'https://example.com/heart.png', alt: 'Heart' } } });
  assert.equal(sent.sent.length, 1);
  await call({ action: 'submit', token: token(1), question: { ...sa, accepted: ['shit'] } });
  await assert.rejects(call({ action: 'submit', token: token(1), question: sa }), /already sent 2/);
  await call({ action: 'submit', token: token(2), question: sa });

  const subs = await listSubmissions(store, 'quiz1');
  assert.equal(subs.length, 3);
  assert.equal(subs.filter(s => s.flagged).length, 1, 'rude words are flagged');
  assert.equal(new Set(subs.map(s => s.device)).size, 2, 'the teacher can tell two devices apart');
  assert.ok(subs.every(s => s.source_title === 'Monday' && s.status === 'pending'));
  assert.ok(subs.every(s => !JSON.stringify(s).includes(token(1))), 'raw device tokens are never stored');

  await reviewSubmission(store, 'quiz1', { submission_id: subs[0].id, status: 'approved', quiz_block_id: 'qnew' });
  const after = await listSubmissions(store, 'quiz1');
  assert.equal(after.find(s => s.id === subs[0].id).status, 'approved');
  await assert.rejects(reviewSubmission(store, 'quiz1', { submission_id: '../x', status: 'approved' }), /Unknown question/);
});

test('question drop: a student cannot tag outcomes on their question', async () => {
  const store = baseStore();
  await questionDropAction(store, 'lesson1', 'drop1', { action: 'submit', token: token(1), question: { ...mc, outcomes: ['o1', 'o2'] } });
  const subs = await listSubmissions(store, 'quiz1');
  assert.equal(subs.length, 1);
  assert.equal('outcomes' in subs[0].question, false, 'outcomes are the teacher’s to set');
});

test('question drop refuses targets that are not a quiz in the same unit, paused boxes and closed quizzes', async () => {
  const kinds = baseStore({ dropContent: { kinds: ['true_false'] } });
  await assert.rejects(questionDropAction(kinds, 'lesson1', 'drop1', { action: 'submit', token: token(1), question: mc }), /hasn’t turned on that question type/);

  const paused = baseStore({ dropContent: { accepting: false } });
  assert.equal((await questionDropAction(paused, 'lesson1', 'drop1', {})).reason, 'paused');
  await assert.rejects(questionDropAction(paused, 'lesson1', 'drop1', { action: 'submit', token: token(1), question: mc }), /isn’t taking questions/);

  const closed = baseStore({ quizSettings: { closes_at: '2020-01-01T00:00:00.000Z' } });
  assert.equal((await questionDropAction(closed, 'lesson1', 'drop1', {})).reason, 'closed');

  const other = baseStore();
  const q = await other.get('lessons/quiz1');
  await other.setJSON('lessons/quiz1', { ...q, unit_id: 'unit2' });
  assert.equal((await questionDropAction(other, 'lesson1', 'drop1', {})).reason, 'no_quiz');
  await other.setJSON('lessons/quiz1', { ...q, pedagogical_mode: 'lesson' });
  assert.equal((await questionDropAction(other, 'lesson1', 'drop1', {})).reason, 'no_quiz');

  const unpublished = baseStore();
  unpublished.data.delete('published/lessons/lesson1');
  await assert.rejects(questionDropAction(unpublished, 'lesson1', 'drop1', {}), /isn’t published/);
});

test('publish splits answers off, drops quiz questions from ordinary lessons, and blocks unfinished ones', () => {
  const draft = { pedagogical_mode: 'quiz', quiz: { attempts: 2, timer_minutes: 10 }, blocks: [qBlock('qa', mc), { id: 'col', block_type: 'columns', content: { columns: [{ width: 6, blocks: [qBlock('qb', sa)] }] } }] };
  const prepared = prepareQuizPublish(draft, draft.blocks);
  const text = JSON.stringify(prepared.blocks);
  assert.ok(!text.includes('correct') && !text.includes('Romeo') && !text.includes('Think comparison') && !text.includes('No like or as'));
  assert.deepEqual(prepared.quiz.record.order, ['qa', 'qb']);
  assert.equal(prepared.quiz.snapshot.total_marks, 3);
  assert.equal(prepared.quiz.snapshot.attempts, 2);
  assert.equal(prepared.quiz.snapshot.timer_minutes, 10);
  assert.equal(prepared.blocks[0].content.question.has_hint, true);

  const ordinary = prepareQuizPublish({ pedagogical_mode: 'lesson', blocks: [] }, [qBlock('qa', mc), image]);
  assert.equal(ordinary.quiz, null);
  assert.deepEqual(ordinary.blocks.map(b => b.id), ['img1']);

  const broken = prepareQuizPublish({ pedagogical_mode: 'quiz', blocks: [] }, [qBlock('qa', { ...mc, correct: [] })]);
  assert.deepEqual(broken.problems, ['Tick the right answer.']);
});

test('taking a quiz: start, hint, submit, server marking, attempts, teacher marking and results', async () => {
  const store = baseStore({ quizSettings: { attempts: 1, hint_cost: 0.5, confidence: true } });
  const prepared = await publishQuiz(store);
  const pub = prepared.quiz.record.questions;
  const call = body => quizAction(store, 'quiz1', body);
  const me = { token: token(3) };

  assert.equal((await call({})).attempts_allowed, 1);
  await assert.rejects(call({ ...me, action: 'submit', responses: {} }), /Start the quiz first/);
  const started = await call({ ...me, action: 'start' });
  assert.equal(started.current.n, 0);
  assert.equal((await call({ ...me, action: 'start' })).current.n, 0, 'starting twice resumes');
  assert.equal((await call({ ...me, action: 'hint', question_id: 'qa' })).hint, 'Think comparison.');
  await assert.rejects(call({ ...me, action: 'check', question_id: 'qa', response: {} }), /marked at the end/);

  const right = pub.qa.question.options.find(o => o.text === 'Metaphor').id;
  const done = await call({ ...me, action: 'submit', responses: { qa: { selected: [right] }, qb: { text: 'romeo.' }, qc: { text: 'Because fate.' } }, confidence: { qa: 3, qb: 9 } });
  const result = done.results[0];
  assert.equal(result.max, 7);
  assert.equal(result.score, 2, 'a 2-mark question with a half-cost hint earns 1, plus 1 for the short answer');
  assert.equal(result.pending, 1, 'the written answer waits for the teacher');
  assert.equal(result.rows.find(r => r.id === 'qa').key.explanation, 'No like or as.');
  await assert.rejects(call({ ...me, action: 'start' }), /already done this quiz/);

  const teacher = body => quizTeacherAction(store, 'quiz1', body);
  const results = await teacher({ action: 'results' });
  assert.equal(results.attempts.length, 1);
  const qaStats = results.questions.find(q => q.id === 'qa');
  assert.equal(qaStats.hinted, 1);
  assert.equal(qaStats.picks[right], 1);
  assert.deepEqual(qaStats.confidence[3], [1, 0], 'sure, but a hinted half mark is not full marks');
  assert.equal(results.questions.find(q => q.id === 'qb').confidence[1][0], 0, 'bad confidence values are ignored');
  const attemptId = results.attempts[0].id;
  await assert.rejects(teacher({ action: 'mark', attempt_id: attemptId, question_id: 'qc', score: 9 }), /between 0 and 4/);
  const marked = await teacher({ action: 'mark', attempt_id: attemptId, question_id: 'qc', score: 3 });
  assert.equal(marked.attempt.score, 5);
  assert.equal(marked.attempt.pending, 0);
  assert.equal((await call(me)).results[0].score, 5, 'the student sees the teacher’s mark');
  await assert.rejects(teacher({ action: 'attempt', attempt_id: 'nope' }), /Unknown attempt/);
});

test('instant feedback marks each answer once; held feedback waits for release; a republish lets students start again', async () => {
  const store = baseStore({ quizSettings: { feedback: 'instant', attempts: 1 } });
  const prepared = await publishQuiz(store);
  const call = body => quizAction(store, 'quiz1', body);
  const me = { token: token(4) };
  await call({ ...me, action: 'start' });
  const wrong = prepared.quiz.record.questions.qa.question.options.find(o => o.text === 'Rhyme').id;
  const checked = await call({ ...me, action: 'check', question_id: 'qa', response: { selected: [wrong] } });
  assert.equal(checked.mark.correct, false);
  assert.equal(checked.key.answer.type, 'choice');
  await assert.rejects(call({ ...me, action: 'check', question_id: 'qa', response: { selected: [wrong] } }), /already answered/);
  const right = prepared.quiz.record.questions.qa.question.options.find(o => o.text === 'Metaphor').id;
  const done = await call({ ...me, action: 'submit', responses: { qa: { selected: [right] } } });
  assert.equal(done.results[0].rows[0].awarded, 0, 'the checked answer stands, not a later change');

  const held = baseStore({ quizSettings: { feedback: 'released', attempts: 1 } });
  await publishQuiz(held);
  const you = { token: token(5) };
  await quizAction(held, 'quiz1', { ...you, action: 'start' });
  const sent = await quizAction(held, 'quiz1', { ...you, action: 'submit', responses: {} });
  assert.deepEqual(Object.keys(sent.results[0]).sort(), ['n', 'released', 'submitted_at']);
  await quizTeacherAction(held, 'quiz1', { action: 'release', released: true });
  assert.equal((await quizAction(held, 'quiz1', you)).results[0].max, 7);

  const again = baseStore({ quizSettings: { attempts: 2 } });
  const first = await publishQuiz(again);
  const them = { token: token(6) };
  await quizAction(again, 'quiz1', { ...them, action: 'start' });
  await publishQuiz(again);
  const resumed = await quizAction(again, 'quiz1', them);
  assert.equal(resumed.current.n, 0, 'an open attempt survives a republish');
  assert.equal(resumed.current.version, first.quiz.version, 'and keeps the version it started on');
  const oldRight = first.quiz.record.questions.qa.question.options.find(o => o.text === 'Metaphor').id;
  assert.ok(resumed.current.questions.find(q => q.id === 'qa').options.some(o => o.id === oldRight), 'the student is served the questions their attempt was started on');
  const handed = await quizAction(again, 'quiz1', { ...them, action: 'submit', responses: { qa: { selected: [oldRight] } } });
  assert.equal(handed.results[0].rows.find(r => r.id === 'qa').awarded, 2, 'marked against its own version');
  assert.equal(handed.results[0].rows[0].key, null, 'right answers wait while a go is left');
  assert.equal(handed.results[0].rows[0].question.id, 'qa');
  const second = await quizAction(again, 'quiz1', { ...them, action: 'start' });
  assert.equal(second.current.n, 1);
  assert.notEqual(second.current.version, first.quiz.version, 'a new attempt uses the new version');
  const last = await quizAction(again, 'quiz1', { ...them, action: 'submit', responses: {} });
  assert.ok(last.results[1].rows[0].key, 'right answers show once no goes are left');
});

test('timers and closing: deadlines are set, late work is flagged, closed quizzes refuse to start', async () => {
  const store = baseStore({ quizSettings: { timer_minutes: 5 } });
  await publishQuiz(store);
  const me = { token: token(7) };
  const started = await quizAction(store, 'quiz1', { ...me, action: 'start' });
  assert.equal(Date.parse(started.current.deadline) - Date.parse(started.current.started_at), 5 * 60_000);
  const key = [...store.data.keys()].find(k => k.startsWith('quiz/quiz1/attempts/'));
  const attempt = store.data.get(key);
  store.data.set(key, { ...attempt, deadline: new Date(Date.now() - 5 * 60_000).toISOString() });
  await quizAction(store, 'quiz1', { ...me, action: 'submit', responses: {} });
  assert.equal((await quizTeacherAction(store, 'quiz1', { action: 'results' })).attempts[0].overtime, true);

  const closed = baseStore({ quizSettings: { closes_at: '2020-01-01T00:00:00.000Z' } });
  await publishQuiz(closed);
  await assert.rejects(quizAction(closed, 'quiz1', { token: token(8), action: 'start' }), /closed/);
});

test('live mode: join with the code, answer once, the teacher sees the spread, then the reveal', async () => {
  const store = baseStore();
  const prepared = await publishQuiz(store);
  const teacher = body => quizTeacherAction(store, 'quiz1', body);
  const student = body => quizAction(store, 'quiz1', body);
  const started = (await teacher({ action: 'live_start' })).live;
  assert.equal(started.phase, 'lobby');
  // Focus view's checkpoint mark: the teacher's, defaulting to 80, and never sent to students.
  assert.equal(started.move_on, 80);
  assert.equal((await student({ action: 'status' })).live, true);
  const a = { token: token(9) };
  const b = { token: token(10) };
  await assert.rejects(student({ ...a, action: 'live_join', code: '000000' }), /didn’t match/);
  await student({ ...a, action: 'live_join', code: started.code });
  await student({ ...b, action: 'live_join', code: started.code });
  assert.equal((await teacher({ action: 'live_status' })).live.joined, 2);

  const q1 = (await teacher({ action: 'live_next' })).live;
  assert.equal(q1.index, 0);
  const view = (await student({ ...a, action: 'live_status' })).live;
  assert.ok(!('move_on' in view));
  assert.equal(view.question.id, 'qa');
  assert.equal(view.key, undefined, 'no answer before the reveal');
  const right = prepared.quiz.record.questions.qa.question.options.find(o => o.text === 'Metaphor').id;
  await student({ ...a, action: 'live_answer', index: 0, response: { selected: [right] } });
  await student({ ...a, action: 'live_answer', index: 0, response: { selected: ['other'] } });
  await assert.rejects(student({ ...b, action: 'live_answer', index: 3, response: { selected: [right] } }), /moved on/);
  const spread = (await teacher({ action: 'live_status' })).live;
  assert.equal(spread.answered, 1);
  assert.equal(spread.right, 1);
  assert.equal(spread.picks[right], 1, 'the first answer stands');

  await teacher({ action: 'live_reveal' });
  const revealed = (await student({ ...a, action: 'live_status' })).live;
  assert.equal(revealed.mark.correct, true);
  assert.equal(revealed.key.answer.ids[0], right);
  await assert.rejects(student({ ...b, action: 'live_answer', index: 0, response: { selected: [right] } }), /closed/);

  await teacher({ action: 'live_next' });
  await teacher({ action: 'live_next' });
  assert.equal((await teacher({ action: 'live_next' })).live.phase, 'done');
  assert.equal((await student({ ...a, action: 'live_status' })).live, null);
});

test('the public quiz endpoint answers JSON errors without leaking stack traces', async () => {
  const store = baseStore();
  await publishQuiz(store);
  const handler = createPublishedQuizHandler({ env: {}, getContentStore: async () => store });
  const res = await handler(new Request('https://example.com/api/published/quiz/quiz1', { method: 'POST', body: '{"action":"submit","class_id":"class0"}', headers: { 'content-type': 'application/json' } }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error?.code ?? 'no_device', 'no_device');
  const unpublished = await handler(new Request('https://example.com/api/published/quiz/nope', { method: 'POST', body: '{}' }));
  assert.equal(unpublished.status, 404);
});

test('every other student surface drops quiz questions and their answers', async () => {
  const { filterBlocksForStudent } = await import('../../netlify/functions/_shared/teaching-student.mjs');
  const nested = [{ id: 'sec', block_type: 'section', visibility: 'student_teacher', content: { blocks: [qBlock('qa', mc), image] } }];
  assert.ok(!JSON.stringify(filterBlocksForStudent(nested)).includes('Metaphor'));
  assert.ok(JSON.stringify(filterBlocksForStudent(nested, { keepQuizQuestions: true })).includes('Metaphor'));
});

test('hard timers and closing stop hints and checks; odd question ids are refused', async () => {
  const store = baseStore({ quizSettings: { timer_minutes: 5, timer_hard: true, feedback: 'instant' } });
  await publishQuiz(store);
  const me = { token: token(11) };
  await quizAction(store, 'quiz1', { ...me, action: 'start' });
  await assert.rejects(quizAction(store, 'quiz1', { ...me, action: 'hint', question_id: '__proto__' }), /no hint/);
  await assert.rejects(quizAction(store, 'quiz1', { ...me, action: 'check', question_id: 'constructor', response: {} }), /Unknown question/);
  const key = [...store.data.keys()].find(k => k.startsWith('quiz/quiz1/attempts/'));
  store.data.set(key, { ...store.data.get(key), deadline: new Date(Date.now() - 5 * 60_000).toISOString() });
  await assert.rejects(quizAction(store, 'quiz1', { ...me, action: 'hint', question_id: 'qa' }), /Time’s up/);
  await assert.rejects(quizAction(store, 'quiz1', { ...me, action: 'check', question_id: 'qa', response: { selected: ['x'] } }), /Time’s up/);
  const late = await quizAction(store, 'quiz1', { ...me, action: 'submit', responses: {} });
  assert.equal(late.results.length, 1, 'late work is still handed in, and flagged');
});

test('two checks at once can never undo each other', async () => {
  const store = baseStore({ quizSettings: { feedback: 'instant', attempts: 2 } });
  await publishQuiz(store);
  const me = { token: token(12) };
  await quizAction(store, 'quiz1', { ...me, action: 'start' });
  const [a, b] = await Promise.all([
    quizAction(store, 'quiz1', { ...me, action: 'check', question_id: 'qa', response: { selected: ['x'] } }),
    quizAction(store, 'quiz1', { ...me, action: 'check', question_id: 'qb', response: { text: 'nope' } })
  ]);
  assert.equal(a.key, null, 'no right answer while another go is left');
  assert.equal(b.mark.correct, false);
  await assert.rejects(quizAction(store, 'quiz1', { ...me, action: 'check', question_id: 'qa', response: { selected: ['y'] } }), /already answered/);
  const status = await quizAction(store, 'quiz1', me);
  assert.deepEqual(Object.keys(status.current.answers).sort(), ['qa', 'qb']);
});

test('a just-started attempt opens even while the blob listing lags behind', async () => {
  const store = baseStore();
  await publishQuiz(store);
  // Netlify Blobs listings are eventually consistent: a key written moments ago can be missing.
  const list = store.list.bind(store);
  const hidden = new Set();
  const set = store.setJSON.bind(store);
  store.setJSON = async (key, value, options) => {
    if (key.includes('/attempts/')) hidden.add(key);
    return set(key, value, options);
  };
  store.list = async opts => {
    const out = await list(opts);
    return { blobs: out.blobs.filter(b => !hidden.has(b.key)) };
  };
  const me = { token: token(13) };
  const started = await quizAction(store, 'quiz1', { ...me, action: 'start' });
  assert.equal(started.current?.n, 0, 'the start reply carries the open attempt');
  assert.equal((await quizAction(store, 'quiz1', { ...me, action: 'hint', question_id: 'qa' })).hint, 'Think comparison.');
  assert.equal((await quizAction(store, 'quiz1', { ...me, action: 'start' })).current.n, 0, 'a second tap resumes rather than starting another go');
});

const withClass = (store) => {
  store.data.set('classes/class1', { id: 'class1', type: 'class', title: '9 English', students: [{ name: 'Bob Brown' }, { name: 'Tom Tills' }] });
  return store;
};
const bobDevice = { token: token(1), class_id: 'class1', class_token: token(3) };
const tomDevice = { token: token(2), class_id: 'class1', class_token: token(4) };

test('a quiz only takes answers from a class page', async () => {
  const store = baseStore();
  await publishQuiz(store);
  const plain = await rawQuizAction(store, 'quiz1', { token: token(1) });
  assert.deepEqual(plain.identity, { need: 'class', initials: null, classes: [] });
  await assert.rejects(rawQuizAction(store, 'quiz1', { token: token(1), action: 'start' }), /Open this quiz from your class page/);
  await assert.rejects(rawQuizAction(store, 'quiz1', { token: token(1), class_id: 'gone', action: 'status' }), /Open this quiz from your class page/);
});

test('a plain lesson link offers the lesson’s classes; the teacher gets the same list', async () => {
  const store = baseStore();
  await publishQuiz(store);
  const cls = (id, extra) => ({ id, type: 'class', code: id.toUpperCase(), status: 'active', active_unit_ids: [], students: [], ...extra });
  await store.setJSON('classes/b', cls('b', { display_name: 'Year 12 English B', current_unit_id: 'unit1' }));
  await store.setJSON('classes/a', cls('a', { display_name: 'Year 12 English A', active_unit_ids: ['unit1'] }));
  await store.setJSON('classes/sched', cls('sched'));
  await store.setJSON('scheduled_lessons/r1', { id: 'r1', class_id: 'sched', lesson_id: 'quiz1' });
  await store.setJSON('classes/other', cls('other', { current_unit_id: 'unit9' }));
  await store.setJSON('classes/old', cls('old', { status: 'archived', current_unit_id: 'unit1' }));
  const want = [{ id: 'sched', title: 'SCHED' }, { id: 'a', title: 'Year 12 English A' }, { id: 'b', title: 'Year 12 English B' }];
  const plain = await rawQuizAction(store, 'quiz1', { token: token(1) });
  assert.deepEqual(plain.identity.classes, want);
  assert.deepEqual((await quizTeacherAction(store, 'quiz1', { action: 'classes' })).classes, want);
  const viaClass = await rawQuizAction(store, 'quiz1', { token: token(1), class_id: 'a' });
  assert.equal(viaClass.identity.classes, undefined, 'a named class needs no list');
  await assert.rejects(rawQuizAction(store, 'quiz1', { token: token(1), action: 'start' }), /Open this quiz from your class page/);
});

test('initials: claim once, then start; someone else’s initials are refused', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  const before = await rawQuizAction(store, 'quiz1', bobDevice);
  assert.deepEqual(before.identity, { need: 'initials', initials: null });
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' }), /Type your initials first/);

  const claimed = await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'bb' });
  assert.deepEqual(claimed.identity, { need: null, initials: 'BB' });
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'BB' }), /BB is already taken/);

  const started = await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  assert.ok(started.current);
  const startKey = [...store.data.keys()].find(k => k.startsWith('quiz/quiz1/attempts/'));
  const start = store.data.get(startKey);
  assert.equal(start.class_id, 'class1');
  assert.match(start.student_id, /^st_/);
});

test('attempts follow the student to a new device after a release', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });

  const { releaseClaim, loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const roster = await loadRoster(store, 'class1');
  await releaseClaim(store, 'class1', roster.students[0].id);

  const newDevice = { token: token(5), class_id: 'class1', class_token: token(6) };
  const moved = await rawQuizAction(store, 'quiz1', { ...newDevice, action: 'claim', initials: 'BB' });
  assert.equal(moved.attempts_used, 1, 'the earlier go still counts');
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...newDevice, action: 'start' }), /already done this quiz/);
});

test('teacher results label attempts with initials and name', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });
  await quizAction(store, 'quiz1', { token: token(7), action: 'start' });
  await quizAction(store, 'quiz1', { token: token(7), action: 'submit', responses: {} });

  const results = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  const labels = results.attempts.map(a => a.student);
  assert.deepEqual(labels.filter(Boolean), [{ initials: 'BB', name: 'Bob Brown' }]);
  assert.equal(labels.filter(l => l === null).length, 1, 'the anonymous attempt has no label');

  const bobs = results.attempts.find(a => a.student);
  const detail = await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: bobs.id });
  assert.deepEqual(detail.attempt.student, { initials: 'BB', name: 'Bob Brown' });

  const cls = store.data.get('classes/class1');
  store.data.set('classes/class1', { ...cls, students: [{ name: 'Tom Tills' }] });
  const removed = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  assert.deepEqual(removed.attempts.find(a => a.student).student, { initials: null, name: null });
});

test('live mode needs claimed initials to join', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  const live = await quizTeacherAction(store, 'quiz1', { action: 'live_start' });
  const code = live.live.code;
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'live_join', code }), /Type your initials first/);
  await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'TT' });
  const joined = await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'live_join', code });
  assert.equal(joined.live.joined, true);
  const player = [...store.data.entries()].find(([k]) => k.includes('/players/'))[1];
  assert.match(player.student_id, /^st_/);
});

test('an unclaimed device sees no history from the anonymous quiz', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  await quizAction(store, 'quiz1', { token: token(1), action: 'start' });
  await quizAction(store, 'quiz1', { token: token(1), action: 'submit', responses: {} });
  const seen = await rawQuizAction(store, 'quiz1', bobDevice);
  assert.equal(seen.attempts_used, 0);
  assert.deepEqual(seen.results, []);
});

test('an unclaimed device is refused hints, checks and hand-ins', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  for (const action of ['hint', 'check', 'submit']) {
    await assert.rejects(rawQuizAction(store, 'quiz1', { ...bobDevice, action, question_id: 'qa', responses: {} }), /Type your initials first/);
  }
});

test('live answers need a class page', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  await quizTeacherAction(store, 'quiz1', { action: 'live_start' });
  await assert.rejects(rawQuizAction(store, 'quiz1', { token: token(1), action: 'live_answer', index: 0, response: {} }), /Open this quiz from your class page/);
});

test('a claimed device needs no device token', async () => {
  const store = withClass(baseStore());
  await publishQuiz(store);
  const me = { class_id: 'class1', class_token: token(3) };
  await rawQuizAction(store, 'quiz1', { ...me, action: 'claim', initials: 'BB' });
  const started = await rawQuizAction(store, 'quiz1', { ...me, action: 'start' });
  assert.ok(started.current);
  const done = await rawQuizAction(store, 'quiz1', { ...me, action: 'submit', responses: {} });
  assert.equal(done.attempts_used, 1);
});

test('markbook: each student’s first handed-in attempt, scored like Results', async () => {
  const { classQuizScores } = await import('../../netlify/functions/_shared/quiz.mjs');
  const { loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = withClass(baseStore({ quizSettings: { attempts: 3, confidence: true } }));
  const draft = store.data.get('lessons/quiz1');
  store.data.set('lessons/quiz1', { ...draft, outcome_ids: ['oLesson'], blocks: draft.blocks.map(b => b.id === 'qb' ? { ...b, content: { question: { ...b.content.question, outcomes: ['oShort'] } } } : b) });
  await publishQuiz(store);
  const roster = await loadRoster(store, 'class1');
  const [bob, tom] = roster.students;

  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: { qb: { text: 'Romeo' }, qc: { text: 'Because fate.' } }, confidence: { qb: 3 } });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });
  await quizAction(store, 'quiz1', { token: token(7), action: 'start' });
  await quizAction(store, 'quiz1', { token: token(7), action: 'submit', responses: {} });

  const found = await classQuizScores(store, 'quiz1', 'class1', [bob.id, tom.id]);
  assert.equal(found.title, 'Week 4 review');
  assert.equal(found.confidence, true);
  assert.deepEqual(Object.keys(found.scores), [bob.id], 'Tom never handed in; the anonymous go is not on the list');
  const first = found.scores[bob.id];
  assert.match(first.attempt_id, /~0$/, 'the first go counts, not the later one');
  assert.equal(first.score, 1);
  assert.equal(first.max, 7);
  assert.equal(first.pending, 1);
  const qb = first.rows.find(r => r.id === 'qb');
  const { items, codes, ...plain } = qb;
  assert.deepEqual(plain, { id: 'qb', awarded: 1, max: 1, confidence: 3, outcomes: ['oShort'] });
  assert.deepEqual(codes, []);
  assert.deepEqual(items.map((i) => i.share), [1]);
  assert.deepEqual(first.rows.find(r => r.id === 'qa').outcomes, ['oLesson'], 'no outcomes of its own: the lesson’s');
  assert.deepEqual(found.questions.map(q => q.id), ['qa', 'qb', 'qc']);
  assert.ok(found.first_at);
  assert.equal(found.unit_id, 'unit1');

  await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: first.attempt_id, question_id: 'qc', score: 3 });
  const marked = (await classQuizScores(store, 'quiz1', 'class1', [bob.id])).scores[bob.id];
  assert.equal(marked.score, 4, 'the teacher’s mark counts');
  assert.equal(marked.pending, 0);

  const owner = first.attempt_id.split('~')[0];
  store.data.set(`quiz/quiz1/cleared/${owner}`, { from: 1 });
  assert.match((await classQuizScores(store, 'quiz1', 'class1', [bob.id])).scores[bob.id].attempt_id, /~1$/, 'cleared goes are skipped');

  assert.equal(await classQuizScores(store, 'lesson1', 'class1', [bob.id]), null, 'an ordinary lesson is not a quiz');
});

test('markbook: a student’s cleared record and first attempt are read in one round trip', async () => {
  const { classQuizScores } = await import('../../netlify/functions/_shared/quiz.mjs');
  const { loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = withClass(baseStore({ quizSettings: { attempts: 3 } }));
  await publishQuiz(store);
  const [bob] = (await loadRoster(store, 'class1')).students;
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: { qb: { text: 'Romeo' } } });
  const owner = (await classQuizScores(store, 'quiz1', 'class1', [bob.id])).scores[bob.id].attempt_id.split('~')[0];

  // Each read notes how many reads had finished when it started; reads sent together share a number.
  const started = new Map();
  let finished = 0;
  const get = store.get.bind(store);
  store.get = async (key) => {
    started.set(key, finished);
    await new Promise((r) => setTimeout(r, 1));
    finished += 1;
    return get(key);
  };
  await classQuizScores(store, 'quiz1', 'class1', [bob.id]);
  const waves = [`quiz/quiz1/cleared/${owner}`, `quiz/quiz1/attempts/${owner}/0`, `quiz/quiz1/results/${owner}/0`, `quiz/quiz1/marks/${owner}~0`].map((key) => started.get(key));
  assert.ok(waves.every((w) => w !== undefined), 'all four are read');
  assert.equal(new Set(waves).size, 1, 'cleared, start, result and marks go out together');
});

test('give another go clears one student’s attempts; numbering carries on', async () => {
  const store = withClass(baseStore({ quizSettings: { attempts: 1 } }));
  await publishQuiz(store);
  for (const device of [bobDevice, tomDevice]) {
    await rawQuizAction(store, 'quiz1', { ...device, action: 'claim', initials: device === bobDevice ? 'BB' : 'TT' });
    await rawQuizAction(store, 'quiz1', { ...device, action: 'start' });
    await rawQuizAction(store, 'quiz1', { ...device, action: 'hint', question_id: 'qa' });
    await rawQuizAction(store, 'quiz1', { ...device, action: 'submit', responses: {} });
  }
  const teacher = body => quizTeacherAction(store, 'quiz1', body);
  const before = await teacher({ action: 'results' });
  const bobs = before.attempts.find(a => a.student.initials === 'BB');
  await teacher({ action: 'mark', attempt_id: bobs.id, question_id: 'qc', score: 2 });
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' }), /already done this quiz/);

  const after = await teacher({ action: 'reset', attempt_id: bobs.id });
  assert.deepEqual(after.attempts.map(a => a.student.initials), ['TT'], 'only Bob’s go is cleared');
  const owner = bobs.id.split('~')[0];
  assert.ok(![...store.data.keys()].some(key => key.includes(owner) && !key.includes('/cleared/')), 'Bob’s goes, hints and marks are deleted');

  const fresh = await rawQuizAction(store, 'quiz1', bobDevice);
  assert.equal(fresh.attempts_used, 0);
  assert.deepEqual(fresh.results, []);
  const again = await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  assert.equal(again.current.n, 1, 'a new go never reuses an old number');
  assert.deepEqual(again.current.hints, {}, 'no hint carries over');
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });
  const relisted = await teacher({ action: 'results' });
  assert.equal(relisted.attempts.find(a => a.student.initials === 'BB').go, 0, 'the teacher sees it as a first go');
  await assert.rejects(teacher({ action: 'reset', attempt_id: 'nope' }), /Unknown attempt/);
});

test('clear all attempts empties the results and lets everyone start again', async () => {
  const store = withClass(baseStore({ quizSettings: { attempts: 1 } }));
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });
  await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'TT' });
  await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'start' });

  const cleared = await quizTeacherAction(store, 'quiz1', { action: 'clear_all' });
  assert.deepEqual(cleared.attempts, []);
  assert.ok(![...store.data.keys()].some(key => /^quiz\/quiz1\/(attempts|results|hints|checked|marks)\//.test(key)));
  assert.equal((await rawQuizAction(store, 'quiz1', tomDevice)).current, null, 'an unfinished go is cleared too');
  assert.ok((await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' })).current);
  assert.equal((await rawQuizAction(store, 'quiz1', bobDevice)).identity.initials, 'BB', 'claimed initials stay');
});

/** Moves the last-change stamp two minutes back, so a closed quiz may save its copy. */
const ageStamp = (store) => store.data.set('quiz/quiz1/evidence-stamp', { at: new Date(Date.now() - 120_000).toISOString() });

test('insight: evidence per answer; a closed, fully marked quiz is saved until something changes', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc), qBlock('qb', sa)] }));
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: { qb: { text: 'Juliet' } } });

  const open = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.equal(open.closed, false);
  assert.equal(open.saved, false);
  assert.equal(open.attempts.length, 1);
  assert.ok(open.students.length >= 2, 'the whole class list comes back');
  assert.equal(open.attempts[0].rows.find((r) => r.id === 'qb').items[0].share, 0);
  assert.equal(store.data.has('quiz/quiz1/evidence/class1'), false, 'open quizzes are not saved');

  ageStamp(store);
  const closed = await quizTeacherAction(store, 'quiz1', { action: 'close', class_id: 'class1' });
  assert.equal(closed.closed, true);
  assert.equal(closed.closed_by, 'button');
  assert.ok(store.data.has('quiz/quiz1/evidence/class1'));
  assert.equal((await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).saved, true);
  await rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'TT' });
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'start' }), /closed/);

  await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: open.attempts[0].attempt_id, question_id: 'qb', score: 0, codes: ['code-e', 'code-e'] });
  assert.ok(store.data.has('quiz/quiz1/evidence/class1'), 'the old copy is still there');
  const after = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.equal(after.saved, false, 'marking changes the stamp, so the old copy no longer matches');
  const qb = after.attempts[0].rows.find((r) => r.id === 'qb');
  assert.deepEqual(qb.codes, ['code-e']);
  assert.deepEqual(qb.items[0].why, [{ type: 'code', id: 'code-e' }]);

  await quizTeacherAction(store, 'quiz1', { action: 'reopen', class_id: 'class1' });
  assert.equal((await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).closed, false);
});

test('old numeric teacher marks still read', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc), qBlock('qb', sa)] }));
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: {} });
  const [attempt] = (await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).attempts;
  const [owner, n] = attempt.attempt_id.split('~');
  store.data.set(`quiz/quiz1/marks/${owner}~${n}`, { qb: 1 });
  const row = (await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).attempts[0].rows.find((r) => r.id === 'qb');
  assert.equal(row.awarded, 1);
  assert.deepEqual(row.codes, []);
});

test('a follow-up quiz only lets its listed students in', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  const { loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const [bob] = (await loadRoster(store, 'class1')).students;
  const draft = store.data.get('lessons/quiz1');
  store.data.set('lessons/quiz1', { ...draft, quiz: { ...(draft.quiz ?? {}), for_students: [bob.id] } });
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  assert.ok((await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' })).current);
  await assert.rejects(rawQuizAction(store, 'quiz1', { ...tomDevice, action: 'claim', initials: 'TT' }), /small group/);
});

test('dismissed flags are kept and come back with the insight', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  await publishQuiz(store);
  assert.deepEqual((await quizTeacherAction(store, 'quiz1', { action: 'dismiss_flag', flag_id: 'thin:tech:motif' })).dismissed, ['thin:tech:motif']);
  assert.deepEqual((await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' })).dismissed, ['thin:tech:motif']);
  assert.deepEqual((await quizTeacherAction(store, 'quiz1', { action: 'dismiss_flag', flag_id: 'thin:tech:motif', undo: true })).dismissed, []);
});

test('insight lists the unit’s other quizzes and this quiz’s follow-ups', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  store.data.set('units/unit1', { id: 'unit1', type: 'unit', lesson_ids: ['lesson1', 'quiz1', 'quiz2'] });
  store.data.set('lessons/quiz2', { id: 'quiz2', title: 'Follow-up: Simile', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: { follow_up_of: 'quiz1', follow_up_flag: 'sure_wrong:tech:simile' }, blocks: [] });
  await publishQuiz(store);
  const insight = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.deepEqual(insight.siblings, [{ lesson_id: 'quiz2', title: 'Follow-up: Simile' }]);
  assert.deepEqual(insight.follow_ups, [{ lesson_id: 'quiz2', title: 'Follow-up: Simile', flag: 'sure_wrong:tech:simile' }]);
});

test('insight names come from the live class list, even from a saved copy', async () => {
  const { loadRoster } = await import('../../netlify/functions/_shared/class-claims.mjs');
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  const pinned = (await loadRoster(store, 'class1')).students.map(({ id, name, initials }) => ({ id, name, initials }));
  store.data.set('classes/class1', { ...store.data.get('classes/class1'), students: pinned });
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: { qa: { selected: ['b'] } } });
  ageStamp(store);
  await quizTeacherAction(store, 'quiz1', { action: 'close', class_id: 'class1' });
  assert.ok(store.data.has('quiz/quiz1/evidence/class1'));

  store.data.set('classes/class1', { ...store.data.get('classes/class1'), students: pinned.map((p) => (p.initials === 'BB' ? { ...p, name: 'Bob Browning' } : p)) });
  const renamed = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.equal(renamed.saved, true);
  assert.ok(renamed.students.some((st) => st.name === 'Bob Browning'));
  assert.equal(renamed.attempts.length, 1);

  store.data.set('classes/class1', { ...store.data.get('classes/class1'), students: pinned.filter((p) => p.initials !== 'BB') });
  const without = await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.deepEqual(without.attempts, [], 'someone taken off the list drops out of the saved copy too');
});

test('no copy is saved while the last change is under a minute old, or for an unknown class', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  await publishQuiz(store);
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'start' });
  await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'submit', responses: { qa: { selected: ['b'] } } });
  const closed = await quizTeacherAction(store, 'quiz1', { action: 'close', class_id: 'class1' });
  assert.equal(closed.closed, true);
  assert.equal(store.data.has('quiz/quiz1/evidence/class1'), false, 'the hand-in was moments ago');
  ageStamp(store);
  await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'nosuchclass' });
  assert.equal([...store.data.keys()].some((key) => key.startsWith('quiz/quiz1/evidence/')), false, 'no copy for a class that does not exist');
  await quizTeacherAction(store, 'quiz1', { action: 'insight', class_id: 'class1' });
  assert.ok(store.data.has('quiz/quiz1/evidence/class1'), 'once settled, it saves');
});

test('markbook: asking for no students reads nothing', async () => {
  const { classQuizScores } = await import('../../netlify/functions/_shared/quiz.mjs');
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  await publishQuiz(store);
  assert.equal(await classQuizScores(store, 'quiz1', 'class1', []), null);
});

test('teacher-only quiz settings never reach students', async () => {
  const store = withClass(baseStore({ quizBlocks: [qBlock('qa', mc)] }));
  const draft = store.data.get('lessons/quiz1');
  store.data.set('lessons/quiz1', { ...draft, quiz: { for_students: ['bob_brown'], follow_up_of: 'quiz0', follow_up_flag: 'sure_wrong:tech:simile', compare_with: 'quiz0' } });
  await publishQuiz(store);
  const secret = ['for_students', 'follow_up_of', 'follow_up_flag', 'compare_with'];
  const snapshot = store.data.get('published/lessons/quiz1').quiz;
  for (const key of secret) assert.equal(Object.hasOwn(snapshot, key), false, `${key} is not in the published snapshot`);
  const status = await rawQuizAction(store, 'quiz1', { ...bobDevice, action: 'status' });
  for (const key of secret) assert.equal(Object.hasOwn(status.settings, key), false, `${key} is not in the student status`);
  assert.equal(JSON.stringify(status).includes('bob_brown'), false);
});
