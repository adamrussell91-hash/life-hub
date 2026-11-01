import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { AI_USAGE_LOG_KEY, runStoredAnswerMarkingJob } from '../../netlify/functions/_shared/teaching-ai-job-run.mjs';
import { aiJobKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { prepareQuizPublish, quizAction, quizTeacherAction, storeQuizKey } from '../../netlify/functions/_shared/quiz.mjs';

/* Invented class and answers only: this repository is public. */

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com', ANTHROPIC_API_KEY: 'test-key' };
const session = createSessionToken({ now: Date.parse('2026-11-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
const NOW = '2026-11-01T01:00:00.000Z';

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(structuredClone(entries)));
  return {
    map,
    data: map,
    async get(key) { return structuredClone(map.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { map.delete(key); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const post = body => new Request('https://api.adam-russell.com/api/ai/jobs', {
  method: 'POST',
  headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com', 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

const stamp = { created_at: NOW, updated_at: NOW, schema_version: 1 };
const qBlock = (id, question) => ({ id, type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'student_teacher', content: { question: { id, ...question } }, ...stamp });
const token = n => n.toString(16).repeat(48).slice(0, 48);
const STUDENTS = [{ name: 'Pip Quill' }, { name: 'Wren Ashby' }, { name: 'Ash Moreno' }];

async function quizWithAnswers() {
  const quiz = {
    id: 'quiz1', title: 'Week 5 check', unit_id: 'unit1', pedagogical_mode: 'quiz', quiz: {},
    blocks: [qBlock('qa', { kind: 'short_answer', prompt: 'Name the speaker.', marks: 1, accepted: ['Romeo'] })]
  };
  const store = memoryStore({ 'lessons/quiz1': quiz, 'classes/class1': { id: 'class1', type: 'class', title: '8 English', students: STUDENTS } });
  const prepared = prepareQuizPublish(quiz, quiz.blocks);
  await storeQuizKey(store, 'quiz1', prepared.quiz);
  await store.setJSON('published/lessons/quiz1', { blocks: prepared.blocks, pedagogical_mode: 'quiz', quiz: prepared.quiz.snapshot });
  const answers = [['PQ', 'the young lover'], ['WA', 'Juliet'], ['AM', 'romeo montague']];
  for (const [i, [initials, text]] of answers.entries()) {
    const who = { token: token(i + 1), class_id: 'class1', class_token: token(i + 5) };
    await quizAction(store, 'quiz1', { ...who, action: 'claim', initials });
    await quizAction(store, 'quiz1', { ...who, action: 'start' });
    await quizAction(store, 'quiz1', { ...who, action: 'submit', responses: { qa: { text } } });
  }
  const results = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  return { store, attemptOf: initials => results.attempts.find(a => a.student?.initials === initials).id };
}

test('a dry run gives the count and A$ figure and starts nothing; pressing it queues one job', async () => {
  const { store } = await quizWithAnswers();
  const kicks = [];
  const handler = createAiJobsHandler({ env, getContentStore: async () => store, kickLessonJobRun: async (_req, id) => (kicks.push(id), true) });
  const dry = await (await handler(post({ kind: 'quiz_ai_mark', lesson_id: 'quiz1', dry_run: true }))).json();
  assert.equal(dry.data.estimate.answers, 3);
  assert.ok(dry.data.estimate.cost_aud > 0 && dry.data.estimate.cost_aud < 0.05);
  assert.equal(kicks.length, 0);
  const made = await (await handler(post({ kind: 'quiz_ai_mark', lesson_id: 'quiz1' }))).json();
  assert.equal(made.data.status, 'working');
  assert.deepEqual([store.map.get(aiJobKey(made.data.id)).kind, kicks.length], ['quiz_ai_mark', 1]);
  assert.equal((await handler(post({ kind: 'quiz_ai_mark', lesson_id: 'quiz1' }))).status, 409, 'one marking job per quiz at a time');
  // Ann's chat on the same lesson is not held up by it.
  assert.equal((await handler(post({ lesson_id: 'quiz1', agent: 'ann', message: 'Hello' }))).status, 202);
});

test('the runner marks waiting answers, skips teacher marks, keeps names out of the prompt and logs the cost', async () => {
  const { store, attemptOf } = await quizWithAnswers();
  // The teacher already marked one; it never goes to the model.
  await quizTeacherAction(store, 'quiz1', { action: 'mark', attempt_id: attemptOf('AM'), question_id: 'qa', score: 1 });
  store.map.set(aiJobKey('ai_job_m1'), { id: 'ai_job_m1', kind: 'quiz_ai_mark', lesson_id: 'quiz1', status: 'working', created_at: NOW });
  const requests = [];
  const complete = async (request) => {
    requests.push(request);
    const ids = [...String(request.messages[0].content).matchAll(/"id":"(a\d+)","text":"([^"]*)"/g)].map(([, id, text]) => ({ id, text }));
    const marks = ids.map(({ id, text }) => (text === 'Juliet' ? { id, verdict: 'wrong', reason: 'Names the other lover.' } : { id, verdict: 'unsure', reason: 'Describes him; names nobody.' }));
    return { content: [{ type: 'text', text: JSON.stringify({ marks }) }], usage: { input_tokens: 600, output_tokens: 80 } };
  };
  const done = await runStoredAnswerMarkingJob({ store, jobId: 'ai_job_m1', env, complete, nowIso: () => NOW });
  assert.equal(done.status, 'done');
  assert.equal(done.response, 'Marked 1 · 1 for you to check');
  assert.ok(done.cost_usd > 0);
  assert.equal(requests.length, 1);
  const prompt = JSON.stringify(requests[0]);
  for (const leak of ['Pip', 'Wren', 'Ash', 'PQ', 'WA', 'AM', 'class1', 'romeo montague']) assert.ok(!prompt.includes(leak), `${leak} must not reach the model`);
  const wa = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: attemptOf('WA') })).attempt;
  assert.deepEqual([wa.score, wa.pending, wa.rows[0].by], [0, 0, 'ai']);
  const pq = (await quizTeacherAction(store, 'quiz1', { action: 'attempt', attempt_id: attemptOf('PQ') })).attempt;
  assert.equal(pq.pending, 1, 'unsure waits for the teacher');
  assert.equal(store.map.get(AI_USAGE_LOG_KEY).entries.at(-1).action, 'quiz_ai_mark');
  assert.equal((await quizTeacherAction(store, 'quiz1', { action: 'results' })).ai_waiting, 0, 'nothing left for the AI');
});
