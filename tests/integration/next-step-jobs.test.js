import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { AI_USAGE_LOG_KEY, runStoredNextStepJob } from '../../netlify/functions/_shared/teaching-ai-job-run.mjs';
import { aiJobKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com', ANTHROPIC_API_KEY: 'test-key' };
const session = createSessionToken({ now: Date.parse('2026-10-31T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
const NOW = '2026-10-31T01:00:00.000Z';
const now = () => Date.parse(NOW);

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(structuredClone(entries)));
  return {
    map,
    async get(key) { return structuredClone(map.get(key) ?? null); },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async delete(key) { map.delete(key); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const post = body => new Request('https://api.adam-russell.com/api/ai/jobs', {
  method: 'POST',
  headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com', 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

const LADDER = ['Add one sentence that answers the question.', 'Name your idea in the first sentence.', 'Make a claim a reader could argue with.', 'Shape your claim to set up each step.', 'Add a fresh angle to your claim.'];
const lesson = {
  id: 'lesson_1', type: 'lesson', title: 'The town', slug: 'town', status: 'active', unit_id: 'unit_1', sequence: 0, created_at: NOW, updated_at: NOW, schema_version: 1,
  blocks: [{ id: 'qs1', type: 'block', block_type: 'question_set', visibility: 'student_teacher', content: { questions: [{ id: 'q1', prompt: 'How does the town change?', kind: 'short_answer', skills: ['arguing.thesis'] }] } }]
};
const seed = () => ({
  'lessons/lesson_1': lesson,
  'feedback_codes/library': { codes: [{ id: 'comp_ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Open with a claim.', skill: 'arguing.thesis', ladder: LADDER }] }
});

test('a dry run gives the A$ estimate and starts nothing; a real one queues a fill job beside the chat', async () => {
  const store = memoryStore(seed());
  const kicks = [];
  const handler = createAiJobsHandler({ env, now, getContentStore: async () => store, kickLessonJobRun: async (_req, id) => (kicks.push(id), true) });
  const body = { kind: 'next_steps_fill', lesson_id: 'lesson_1', targets: [{ block_id: 'qs1', index: 0 }, { block_id: 'bad id!', index: 0 }] };
  const dry = await (await handler(post({ ...body, dry_run: true }))).json();
  assert.equal(dry.data.estimate.codes, 1);
  assert.ok(dry.data.estimate.cost_aud > 0);
  assert.equal(kicks.length, 0);
  const made = await (await handler(post(body))).json();
  assert.equal(made.data.status, 'working');
  const job = store.map.get(aiJobKey(made.data.id));
  assert.deepEqual([job.kind, job.lesson_id, job.targets], ['next_steps_fill', 'lesson_1', [{ block_id: 'qs1', index: 0 }]]);
  // Ann's chat on the same lesson is not held up by it.
  const chat = await handler(post({ lesson_id: 'lesson_1', agent: 'ann', message: 'Hello' }));
  assert.equal(chat.status, 202);
  assert.equal((await handler(post(body))).status, 409, 'a second fill for the lesson waits for the first');
});

test('the runner writes banks to the draft and logs the cost', async () => {
  const store = memoryStore({ ...seed(), [aiJobKey('ai_job_ns')]: { id: 'ai_job_ns', kind: 'next_steps_fill', lesson_id: 'lesson_1', targets: [{ block_id: 'qs1', index: 0 }], status: 'working', created_at: NOW } });
  const lines = ['Add one sentence on how the town changes.', 'Name the town’s change first.', 'Make a claim about the town to argue with.', 'Shape your town claim to set up each step.', 'Add a fresh angle on the town.'];
  const complete = async () => ({ content: [{ type: 'text', text: JSON.stringify({ boxes: [{ box: 1, codes: { comp_ts: lines } }] }) }], usage: { input_tokens: 900, output_tokens: 150 } });
  const done = await runStoredNextStepJob({ store, jobId: 'ai_job_ns', env, complete, nowIso: () => NOW });
  assert.equal(done.status, 'done');
  assert.equal(done.applied, 1);
  const bank = store.map.get('lessons/lesson_1').blocks[0].content.questions[0].next_steps;
  assert.deepEqual(bank.comp_ts.lines, lines);
  assert.equal(store.map.get(AI_USAGE_LOG_KEY).entries.at(-1).action, 'next_steps_fill');
});

test('ladders_draft returns drafts on the job and saves nothing', async () => {
  const store = memoryStore({ ...seed(), [aiJobKey('ai_job_ld')]: { id: 'ai_job_ld', kind: 'ladders_draft', status: 'working', created_at: NOW } });
  const before = JSON.stringify(store.map.get('feedback_codes/library'));
  const complete = async () => ({ content: [{ type: 'text', text: JSON.stringify({ codes: { comp_ts: { ladder: LADDER, descriptor: 'Open with a claim about the question.' } } }) }], usage: { input_tokens: 900, output_tokens: 150 } });
  const done = await runStoredNextStepJob({ store, jobId: 'ai_job_ld', env, complete, nowIso: () => NOW });
  assert.equal(done.status, 'done');
  assert.deepEqual(done.ladders[0].ladder, LADDER);
  assert.equal(JSON.stringify(store.map.get('feedback_codes/library')), before);
});
