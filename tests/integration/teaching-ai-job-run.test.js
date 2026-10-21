import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAiJobHandler } from '../../netlify/functions/ai-job.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { createAiJobRunHandler } from '../../netlify/functions/ai-job-run.mjs';
import {
  AI_USAGE_LOG_KEY,
  NOTE_TOOLS,
  createAnthropicComplete,
  runStoredLessonJob
} from '../../netlify/functions/_shared/teaching-ai-job-run.mjs';
import { aiJobKey, aiJobsInboxKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  ANTHROPIC_API_KEY: 'test-key'
};
const session = createSessionToken({
  now: Date.parse('2026-10-21T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const NOW = '2026-10-21T01:00:00.000Z';
const now = () => Date.parse(NOW);

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(structuredClone(entries)));
  return {
    map,
    async get(key) {
      return map.get(key) ?? null;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async set(key, value) {
      map.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

function request(url, { method = 'GET', body, headers = {} } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

const heading = {
  id: 'b_head', type: 'block', block_type: 'heading', variant: 'page', visibility: 'student_teacher',
  content: { text: 'Causes of WWI' }, layout: {}, print: {}, settings: {},
  created_at: NOW, updated_at: NOW, schema_version: 1
};
const lesson = {
  id: 'lesson_1', type: 'lesson', title: 'Causes of WWI', slug: 'causes', status: 'active',
  unit_id: 'unit_1', sequence: 0, blocks: [heading], created_at: NOW, updated_at: NOW, schema_version: 1
};
const question = {
  id: 'q1', type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'student_teacher',
  content: {
    question: {
      id: 'q1', kind: 'multiple_choice', marks: 1,
      prompt: 'Whose assassination in 1914 triggered the July Crisis?',
      options: [{ id: 'a', text: 'Archduke Franz Ferdinand' }, { id: 'b', text: 'Kaiser Wilhelm II' }],
      correct: ['a']
    }
  },
  layout: {}, print: {}, settings: {}, created_at: NOW, updated_at: NOW, schema_version: 1
};

function workingJob(extra = {}) {
  return {
    id: 'ai_job_abc', lesson_id: 'lesson_1', agent: 'ann', status: 'working', phase: 'queued',
    snapshot_at: NOW, message: 'Make a one-question quiz on the July Crisis', created_at: NOW, ...extra
  };
}

const seed = (job = workingJob()) => ({
  'lessons/lesson_1': lesson,
  [aiJobKey(job.id)]: job,
  [aiJobsInboxKey()]: { jobs: [{ id: job.id, lesson_id: job.lesson_id, agent: job.agent, status: job.status, created_at: job.created_at }] }
});

test('creating a lesson job kicks the background runner with the session', async () => {
  const store = memoryStore({ 'lessons/lesson_1': lesson });
  const kicks = [];
  const deps = {
    env, now, getContentStore: async () => store,
    kickLessonJobRun: async (req, id) => { kicks.push({ id, cookie: req.headers.get('cookie') }); return true; }
  };
  const created = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', { method: 'POST', body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Quiz' } })
  ));
  assert.equal(created.status, 202);
  assert.equal(created.body.data.status, 'working');
  assert.equal(kicks.length, 1);
  assert.equal(kicks[0].id, created.body.data.id);
  assert.match(kicks[0].cookie, /life_hub_session=/);
});

test('a failed kick errors the job instead of leaving it queued for ten minutes', async () => {
  const store = memoryStore({ 'lessons/lesson_1': lesson });
  const deps = { env, now, getContentStore: async () => store, kickLessonJobRun: async () => false };
  const created = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', { method: 'POST', body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Quiz' } })
  ));
  assert.equal(created.body.data.status, 'error');
  const job = store.map.get(aiJobKey(created.body.data.id));
  assert.equal(job.status, 'error');
  assert.match(job.error, /Could not start the AI runner/);
});

test('a stale working job no longer locks the lesson', async () => {
  const store = memoryStore(seed(workingJob({ created_at: '2026-10-21T00:40:00.000Z' })));
  const deps = { env, now, getContentStore: async () => store, kickLessonJobRun: async () => true };
  const created = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', { method: 'POST', body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Again' } })
  ));
  assert.equal(created.status, 202);
  assert.equal(store.map.get(aiJobKey('ai_job_abc')).status, 'error');
  assert.match(store.map.get(aiJobKey('ai_job_abc')).error, /Timed out/);
  assert.notEqual(created.body.data.id, 'ai_job_abc');
  // Polling the expired job reports the timeout.
  const polled = await read(await createAiJobHandler(deps)(request('https://api.adam-russell.com/api/ai/jobs/ai_job_abc')));
  assert.equal(polled.body.data.status, 'error');
});

test('the runner finishes a job with a checked quiz proposal, cost and a usage log', async () => {
  const store = memoryStore(seed());
  const calls = [];
  const complete = async req => {
    calls.push(req);
    return {
      model: 'claude-sonnet-5-5',
      stop_reason: 'tool_use',
      usage: { input_tokens: 2000, output_tokens: 800, server_tool_use: { web_search_requests: 2 } },
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'tool_use', id: 't1', name: 'propose_insert_blocks', input: { position: 'below', anchor_block_id: 'b_head', blocks: [question], set_mode: 'quiz', message: 'One question, ready to check.' } }
      ]
    };
  };
  const job = await runStoredLessonJob({ store, jobId: 'ai_job_abc', env, complete, readFileSyncImpl: () => 'Ann protocol', nowIso: () => NOW });
  assert.equal(job.status, 'done');
  assert.equal(job.phase, undefined);
  assert.equal(job.response, 'One question, ready to check.');
  assert.deepEqual(job.checks, []);
  assert.equal(store.map.get(AI_USAGE_LOG_KEY).entries[0].failed_checks, 0);
  assert.equal(job.proposal.set_mode, 'quiz');
  assert.equal(job.proposal.blocks[0].block_type, 'quiz_question');
  assert.ok(job.cost_usd > 0.02, 'two searches are counted');
  assert.equal(store.map.get(aiJobsInboxKey()).jobs[0].status, 'done');
  assert.equal(store.map.get(AI_USAGE_LOG_KEY).entries.length, 1);
  // The agent got the protocol, the notes tools and web search.
  assert.match(calls[0].system[0].text, /Ann protocol/);
  const names = calls[0].tools.map(tool => tool.name);
  for (const tool of NOTE_TOOLS) assert.ok(names.includes(tool.name));
  assert.ok(names.includes('web_search'));
});

test('the runner errors clearly without an API key', async () => {
  const store = memoryStore(seed());
  const job = await runStoredLessonJob({ store, jobId: 'ai_job_abc', env: { ...env, ANTHROPIC_API_KEY: '' }, nowIso: () => NOW });
  assert.equal(job.status, 'error');
  assert.match(job.error, /ANTHROPIC_API_KEY is missing/);
});

test('the runner leaves a job the teacher dismissed meanwhile', async () => {
  const store = memoryStore(seed());
  const complete = async () => {
    store.map.set(aiJobKey('ai_job_abc'), { ...workingJob(), status: 'done', resolution: 'dismissed' });
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Late answer' }] };
  };
  await runStoredLessonJob({ store, jobId: 'ai_job_abc', env, complete, readFileSyncImpl: () => '', nowIso: () => NOW });
  assert.equal(store.map.get(aiJobKey('ai_job_abc')).resolution, 'dismissed');
  assert.equal(store.map.get(aiJobKey('ai_job_abc')).response, undefined);
});

test('the notes tools refresh the index only when Ann first searches', async () => {
  const store = memoryStore(seed());
  let refreshes = 0;
  const noteIndex = async () => { refreshes += 1; return []; };
  const replies = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'search_notes', input: { query: 'July Crisis' } }] },
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'search_notes', input: { query: 'alliances' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Nothing in your notes on that.' }] }
  ];
  const complete = async () => replies.shift();
  const job = await runStoredLessonJob({ store, jobId: 'ai_job_abc', env, complete, noteIndex, readFileSyncImpl: () => '', nowIso: () => NOW });
  assert.equal(job.status, 'done');
  assert.equal(refreshes, 1);
});

test('the background function runs the stored job', async () => {
  const store = memoryStore(seed());
  const runs = [];
  const handler = createAiJobRunHandler({
    env, now, getContentStore: async () => store,
    runDeps: { complete: async () => { runs.push(1); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hi' }] }; }, readFileSyncImpl: () => '' }
  });
  const res = await handler(request('https://api.adam-russell.com/api/ai/job-run', { method: 'POST', headers: { 'x-ai-job-id': 'ai_job_abc' }, body: {} }));
  assert.equal(res.status, 202);
  assert.equal(runs.length, 1);
  assert.equal(store.map.get(aiJobKey('ai_job_abc')).status, 'done');
  const bad = await handler(request('https://api.adam-russell.com/api/ai/job-run', { method: 'POST', headers: { 'x-ai-job-id': '../x' }, body: {} }));
  assert.equal(bad.status, 400);
});

test('the Claude call streams, sends effort, caching and the Sonnet fallback, and words errors plainly', async () => {
  const sent = [];
  const message = { content: [], stop_reason: 'end_turn' };
  const client = {
    messages: { stream: (params, options) => { sent.push({ lane: 'fast', params, options }); return { finalMessage: async () => { throw new Error('Could not reach Claude. Try again.'); } }; } },
    beta: { messages: { stream: (params, options) => { sent.push({ lane: 'standard', params, options }); return { finalMessage: async () => message }; } } }
  };
  const complete = createAnthropicComplete({ client });
  const tools = [{ name: 'propose_insert_blocks', input_schema: {} }, { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }];
  assert.equal(await complete({ model: 'claude-sonnet-5-5', tier: 'standard', effort: 'medium', max_tokens: 48000, system: [], tools, messages: [] }), message);
  assert.deepEqual(sent[0].params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(sent[0].params.fallbacks, 'default');
  assert.equal(sent[0].params.max_tokens, 48000);
  assert.deepEqual(sent[0].params.output_config, { effort: 'medium' });
  assert.deepEqual(sent[0].params.cache_control, { type: 'ephemeral' });
  assert.equal(sent[0].params.thinking, undefined);
  assert.equal(sent[0].params.tools[0].eager_input_streaming, true);
  assert.equal(sent[0].params.tools[1].eager_input_streaming, undefined);
  await assert.rejects(
    complete({ model: 'claude-haiku-5-5', tier: 'fast', effort: 'low', max_tokens: 48000, system: [], tools: [], messages: [] }),
    /Could not reach Claude/
  );
  assert.equal(sent[1].lane, 'fast');
  assert.equal(sent[1].params.fallbacks, undefined);
});
