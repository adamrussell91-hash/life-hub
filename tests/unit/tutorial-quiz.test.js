import test from 'node:test';
import assert from 'node:assert/strict';
import { quizAction, quizTeacherAction, prepareQuizPublish, storeQuizKey, classQuizScores } from '../../netlify/functions/_shared/quiz.mjs';
import { tutorialKeys } from '../../netlify/functions/_shared/tutorial-status.mjs';
import { classKey, draftLessonKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
const mc = (id) => block(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: `Q ${id}`, marks: 1, hint: `Hint ${id}`, options: [{ id: 'a', text: 'Right' }, { id: 'b', text: 'Wrong' }], correct: ['a'] } });
const ROSTER = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }, { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }];

function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

async function setup({ quiz: settings = {} } = {}) {
  const store = memoryStore();
  const draft = { id: 'tut1', title: 'Structure', unit_id: 'u1', pedagogical_mode: 'tutorial', tutorial: { class_id: 'class1', groups: [] } };
  const prepared = prepareQuizPublish({ ...draft, pedagogical_mode: 'quiz', quiz: settings }, [mc('qa1'), mc('qa2'), mc('qb1')]);
  assert.deepEqual(prepared.problems, []);
  const quiz = prepared.quiz;
  quiz.record.groups = { st_ann: ['qa1', 'qa2'], st_cy: ['qb1'] };
  await storeQuizKey(store, 'tut1', quiz);
  store.data.set(draftLessonKey('tut1'), draft);
  store.data.set(publishedLessonKey('tut1'), { lesson_id: 'tut1', title: 'Structure', unit_id: 'u1', pedagogical_mode: 'tutorial', blocks: [], quiz: quiz.snapshot });
  store.data.set(classKey('class1'), { id: 'class1', type: 'class', status: 'active', title: '7B', students: ROSTER });
  store.data.set(tutorialKeys('tut1').tabs, { version: 'v', class_id: 'class1', groups: [{ id: 'ga', students: ['st_ann'] }, { id: 'gb', students: ['st_cy'] }] });
  return { store, record: quiz.record };
}
const tok = (n) => String(n).repeat(48).slice(0, 48);
const who = (n) => ({ class_id: 'class1', class_token: tok(n), token: tok(n + 5) });
const rightOption = (record, id) => record.questions[id].question.options.find((o) => o.text === 'Right').id;

test('each student sees only their group’s exit questions', async () => {
  const { store } = await setup();
  const before = await quizAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.deepEqual(before.questions, [], 'no questions before the student is known');
  await quizAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  const ann = await quizAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.deepEqual(ann.questions.map((q) => q.id), ['qa1', 'qa2']);
  assert.equal(ann.settings.question_count, 2);
  await quizAction(store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  const cy = await quizAction(store, 'tut1', { action: 'status', ...who(2) });
  assert.deepEqual(cy.questions.map((q) => q.id), ['qb1']);
});

test('the exit check opens only after the teacher’s Done', async () => {
  const { store } = await setup();
  await quizAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await assert.rejects(quizAction(store, 'tut1', { action: 'start', ...who(1) }), { code: 'not_yet' });
  store.data.set(tutorialKeys('tut1').group('ga'), { sitting: false, seen_at: '2026-10-23T01:00:00.000Z', done_students: ['st_ann'], shown: null });
  const started = await quizAction(store, 'tut1', { action: 'start', ...who(1) });
  assert.deepEqual(started.current.questions.map((q) => q.id), ['qa1', 'qa2']);
});

test('a student can’t check another group’s question', async () => {
  const { store, record } = await setup({ quiz: { feedback: 'instant' } });
  store.data.set(tutorialKeys('tut1').group('gb'), { sitting: false, seen_at: 'x', done_students: ['st_cy'], shown: null });
  await quizAction(store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  await quizAction(store, 'tut1', { action: 'start', ...who(2) });
  const own = await quizAction(store, 'tut1', { action: 'check', ...who(2), question_id: 'qb1', response: { selected: [rightOption(record, 'qb1')] } });
  assert.equal(own.mark.score, 1);
  await assert.rejects(
    quizAction(store, 'tut1', { action: 'check', ...who(2), question_id: 'qa1', response: { selected: [rightOption(record, 'qa1')] } }),
    { code: 'not_found' }
  );
});

test('scores count only the student’s own questions', async () => {
  const { store, record } = await setup();
  store.data.set(tutorialKeys('tut1').group('gb'), { sitting: false, seen_at: 'x', done_students: ['st_cy'], shown: null });
  await quizAction(store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  await quizAction(store, 'tut1', { action: 'start', ...who(2) });
  const done = await quizAction(store, 'tut1', { action: 'submit', ...who(2), responses: { qb1: { selected: [rightOption(record, 'qb1')] } } });
  assert.equal(done.results[0].max, 1);
  assert.equal(done.results[0].score, 1);
  const scores = await classQuizScores(store, 'tut1', 'class1', ['st_ann', 'st_cy']);
  assert.equal(scores.scores.st_cy.max, 1);
  assert.equal(scores.scores.st_cy.score, 1);
  assert.deepEqual(scores.scores.st_cy.rows.map((r) => r.id), ['qb1']);
  const results = await quizTeacherAction(store, 'tut1', { action: 'results' });
  assert.equal(results.attempts[0].max, 1);
  const detail = await quizTeacherAction(store, 'tut1', { action: 'attempt', attempt_id: results.attempts[0].id });
  assert.deepEqual(detail.attempt.rows.map((r) => r.id), ['qb1']);
});

test('a tutorial’s exit check can’t run live', async () => {
  const { store } = await setup();
  await assert.rejects(quizTeacherAction(store, 'tut1', { action: 'live_start' }), { code: 'not_live' });
});

async function cyStarted(opts) {
  const set = await setup(opts);
  set.store.data.set(tutorialKeys('tut1').group('gb'), { sitting: false, seen_at: 'x', done_students: ['st_cy'], shown: null });
  await quizAction(set.store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  await quizAction(set.store, 'tut1', { action: 'start', ...who(2) });
  return set;
}

test('a foreign question in a hand-in is ignored', async () => {
  const { store, record } = await cyStarted();
  const done = await quizAction(store, 'tut1', { action: 'submit', ...who(2), responses: { qa1: { selected: [rightOption(record, 'qa1')] } } });
  assert.equal(done.results[0].max, 1);
  assert.equal(done.results[0].score, 0);
  assert.deepEqual(done.results[0].rows.map((r) => r.id), ['qb1']);
});

test('a hint on another group’s question is refused', async () => {
  const { store } = await cyStarted();
  const own = await quizAction(store, 'tut1', { action: 'hint', ...who(2), question_id: 'qb1' });
  assert.equal(own.hint, 'Hint qb1');
  await assert.rejects(quizAction(store, 'tut1', { action: 'hint', ...who(2), question_id: 'qa1' }), { code: 'no_hint' });
});

test('Done for one group doesn’t unlock another', async () => {
  const { store } = await setup();
  store.data.set(tutorialKeys('tut1').group('ga'), { sitting: false, seen_at: 'x', done_students: ['st_ann'], shown: null });
  await quizAction(store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  await assert.rejects(quizAction(store, 'tut1', { action: 'start', ...who(2) }), { code: 'not_yet' });
});

test('a student in no group has nothing to answer', async () => {
  const { store } = await setup();
  await quizAction(store, 'tut1', { action: 'claim', ...who(3), initials: 'EF' });
  const ed = await quizAction(store, 'tut1', { action: 'status', ...who(3) });
  assert.deepEqual(ed.questions, []);
  await assert.rejects(quizAction(store, 'tut1', { action: 'start', ...who(3) }), { code: 'empty' });
});

test('live status and end on a tutorial just say there’s no round', async () => {
  const { store } = await setup();
  assert.deepEqual(await quizTeacherAction(store, 'tut1', { action: 'live_status' }), { live: null });
  assert.deepEqual(await quizTeacherAction(store, 'tut1', { action: 'live_end' }), { live: null });
  await quizAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  assert.deepEqual(await quizAction(store, 'tut1', { action: 'live_status', ...who(1) }), { live: null });
});

test('the markbook column knows each student’s group', async () => {
  const { store, record } = await setup();
  store.data.get(draftLessonKey('tut1')).tutorial.groups = [{ id: 'ga', name: 'Re-tells the plot', students: ['st_ann'] }, { id: 'gb', name: 'Names it wrong', students: ['st_cy'] }];
  store.data.set(tutorialKeys('tut1').group('ga'), { done_students: ['st_ann'] });
  await quizAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await quizAction(store, 'tut1', { action: 'start', ...who(1) });
  await quizAction(store, 'tut1', { action: 'submit', ...who(1), responses: { qa1: { selected: [rightOption(record, 'qa1')] }, qa2: { selected: ['b'] } } });
  const scores = await classQuizScores(store, 'tut1', 'class1', ['st_ann']);
  assert.deepEqual(scores.groups, { st_ann: 'Re-tells the plot' });
});

test('a plain quiz column carries no groups', async () => {
  const { store } = await setup();
  const draft = store.data.get(draftLessonKey('tut1'));
  draft.pedagogical_mode = 'quiz';
  draft.tutorial.groups = [{ id: 'ga', name: 'Re-tells the plot', students: ['st_ann'] }];
  const scores = await classQuizScores(store, 'tut1', 'class1', ['st_ann']);
  assert.equal(scores?.groups, undefined);
});
