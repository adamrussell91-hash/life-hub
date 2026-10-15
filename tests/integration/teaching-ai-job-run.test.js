import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAiJobHandler } from '../../netlify/functions/ai-job.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { createAiJobRunHandler } from '../../netlify/functions/ai-job-run.mjs';
import { kickLessonJobRun } from '../../netlify/functions/_shared/teaching-ai-job-kick.mjs';
import { aiJobKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import {
  AI_USAGE_LOG_KEY,
  createAnthropicComplete,
  loadTeachingProtocol,
  runStoredLessonJob
} from '../../netlify/functions/_shared/teaching-ai-job-run.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  ANTHROPIC_API_KEY: 'sk-ant-test'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const now = () => Date.parse('2026-08-01T01:00:00Z');
const nowIso = () => '2026-08-01T01:00:00.000Z';

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    async get(key) {
      return map.get(key) ?? null;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    }
  };
}

function request(url, { method = 'GET', body, cookie = true, headers = {} } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
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

const lesson = {
  id: 'lesson_1',
  title: 'The Remedy of Butterflies',
  slug: 'remedy',
  unit_id: 'unit_1',
  sequence: 1,
  status: 'active',
  blocks: [],
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  schema_version: 1
};

function flashcardsBlock(count) {
  const ts = '2026-08-01T00:00:00.000Z';
  return {
    id: 'fc_1',
    type: 'block',
    block_type: 'flashcards',
    variant: 'medium',
    visibility: 'student_teacher',
    content: {
      cards: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, front: `Term ${i}`, back: `Meaning ${i}` })),
      shuffle: false
    },
    layout: {},
    print: {},
    settings: {},
    created_at: ts,
    updated_at: ts,
    schema_version: 1
  };
}

function workingJob(overrides = {}) {
  return {
    id: 'ai_job_abc_123',
    lesson_id: 'lesson_1',
    agent: 'ann',
    status: 'working',
    snapshot_at: lesson.updated_at,
    message: 'Turn this glossary into flashcards: Vermin | pests',
    scope: 'lesson',
    phase: 'queued',
    created_at: '2026-08-01T00:59:00.000Z',
    ...overrides
  };
}

test('creating a lesson job kicks the background runner with the session', async () => {
  const store = memoryStore({ 'lessons/lesson_1': lesson });
  const kicks = [];
  const handler = createAiJobsHandler({
    env,
    now,
    getContentStore: async () => store,
    kickLessonJobRun: (req, id) => {
      kicks.push({ cookie: req.headers.get('cookie'), id });
      return Promise.resolve(true);
    }
  });
  const created = await read(await handler(request('https://api.adam-russell.com/api/ai/jobs', {
    method: 'POST',
    body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Make flashcards' }
  })));
  assert.equal(created.status, 202);
  assert.equal(created.body.data.status, 'working');
  assert.equal(kicks.length, 1);
  assert.equal(kicks[0].id, created.body.data.id);
  assert.match(kicks[0].cookie, /life_hub_session=/);
});

test('a failed kick marks the job as an error instead of leaving it queued', async () => {
  const store = memoryStore({ 'lessons/lesson_1': lesson });
  const handler = createAiJobsHandler({
    env, now, getContentStore: async () => store, kickLessonJobRun: async () => false
  });
  const created = await read(await handler(request('https://api.adam-russell.com/api/ai/jobs', {
    method: 'POST',
    body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Make flashcards' }
  })));
  assert.equal(created.body.data.status, 'error');
  const job = store.map.get(aiJobKey(created.body.data.id));
  assert.equal(job.status, 'error');
});

test('a stale stuck job no longer locks the lesson chat', async () => {
  const stuck = workingJob({ id: 'ai_job_old_1', created_at: '2026-08-01T00:30:00.000Z' });
  const store = memoryStore({
    'lessons/lesson_1': lesson,
    'meta/ai_jobs_inbox': { jobs: [stuck] }
  });
  const handler = createAiJobsHandler({
    env, now, getContentStore: async () => store, kickLessonJobRun: async () => true
  });
  const created = await read(await handler(request('https://api.adam-russell.com/api/ai/jobs', {
    method: 'POST',
    body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Try again' }
  })));
  assert.equal(created.status, 202);
  const inbox = store.map.get('meta/ai_jobs_inbox');
  assert.equal(inbox.jobs.find(j => j.id === 'ai_job_old_1').status, 'error');
});

test('polling a stale job reports the timeout', async () => {
  const stuck = workingJob({ created_at: '2026-08-01T00:30:00.000Z' });
  const store = memoryStore({ [aiJobKey(stuck.id)]: stuck });
  const polled = await read(await createAiJobHandler({ env, now, getContentStore: async () => store })(
    request(`https://api.adam-russell.com/api/ai/jobs/${stuck.id}`)
  ));
  assert.equal(polled.body.data.status, 'error');
});

test('runStoredLessonJob writes the proposal, cost, and a usage log row', async () => {
  const job = workingJob();
  const store = memoryStore({ 'lessons/lesson_1': lesson, [aiJobKey(job.id)]: job });
  const seen = [];
  const done = await runStoredLessonJob({
    store,
    jobId: job.id,
    env,
    nowIso,
    complete: async (req) => {
      seen.push(req);
      return {
        model: req.model,
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Twenty-card blocks, as asked.' },
          { type: 'tool_use', name: 'propose_insert_blocks', input: { position: 'below', blocks: [flashcardsBlock(3)] } }
        ],
        usage: { input_tokens: 800, output_tokens: 400, cache_read_input_tokens: 12000, cache_creation_input_tokens: 0 }
      };
    }
  });
  assert.equal(done.status, 'done');
  assert.equal(done.proposal.kind, 'insert_blocks');
  assert.equal(done.model, 'claude-haiku-5-5');
  assert.ok(done.cost_usd > 0);
  assert.equal(done.phase, undefined);
  assert.match(seen[0].system[0].text, /Ann O'Tation/);
  assert.match(seen[0].system[0].text, /Limits: say so before you build/);
  const log = store.map.get(AI_USAGE_LOG_KEY);
  assert.equal(log.entries.length, 1);
  assert.equal(log.entries[0].status, 'done');
});

test('runStoredLessonJob reports a missing API key as an error', async () => {
  const job = workingJob();
  const store = memoryStore({ 'lessons/lesson_1': lesson, [aiJobKey(job.id)]: job });
  const out = await runStoredLessonJob({ store, jobId: job.id, env: { ...env, ANTHROPIC_API_KEY: '' }, nowIso });
  assert.equal(out.status, 'error');
  assert.match(out.error, /ANTHROPIC_API_KEY/);
});

test('a job dismissed mid-run is not overwritten', async () => {
  const job = workingJob();
  const store = memoryStore({ 'lessons/lesson_1': lesson, [aiJobKey(job.id)]: job });
  await runStoredLessonJob({
    store,
    jobId: job.id,
    env,
    nowIso,
    complete: async () => {
      store.map.set(aiJobKey(job.id), { ...job, status: 'done', resolution: 'dismissed' });
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'late' }] };
    }
  });
  assert.equal(store.map.get(aiJobKey(job.id)).resolution, 'dismissed');
  assert.equal(store.map.get(aiJobKey(job.id)).response, undefined);
});

test('the run endpoint needs a session and a valid job id', async () => {
  const store = memoryStore({});
  const handler = createAiJobRunHandler({ env, now, getContentStore: async () => store, runDeps: { complete: async () => ({ content: [] }) } });
  const anon = await handler(request('https://api.adam-russell.com/api/ai/job-run', { method: 'POST', cookie: false, headers: { 'x-ai-job-id': 'ai_job_x' } }));
  assert.equal(anon.status, 401);
  const bad = await handler(request('https://api.adam-russell.com/api/ai/job-run', { method: 'POST', headers: { 'x-ai-job-id': '../etc' } }));
  assert.equal(bad.status, 400);
  const ok = await handler(request('https://api.adam-russell.com/api/ai/job-run', { method: 'POST', headers: { 'x-ai-job-id': 'ai_job_missing_1' } }));
  assert.equal(ok.status, 202);
});

test('kickLessonJobRun posts to the same host with cookie and origin', async () => {
  const calls = [];
  const ok = await kickLessonJobRun(
    request('https://api.adam-russell.com/api/ai/jobs', { method: 'POST', body: {} }),
    'ai_job_1',
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 202 });
    }
  );
  assert.equal(ok, true);
  assert.equal(calls[0].url, 'https://api.adam-russell.com/api/ai/job-run');
  assert.equal(calls[0].init.headers['x-ai-job-id'], 'ai_job_1');
  assert.match(calls[0].init.headers.cookie, /life_hub_session/);
  assert.equal(await kickLessonJobRun(request('https://api.adam-russell.com/x'), 'a', async () => { throw new Error('down'); }), false);
});

test('createAnthropicComplete caches, streams, and only adds fallbacks on Sonnet', async () => {
  const calls = [];
  const fakeStream = (kind) => (params) => {
    calls.push({ kind, params });
    return { finalMessage: async () => ({ content: [], stop_reason: 'end_turn' }) };
  };
  const client = {
    messages: { stream: fakeStream('ga') },
    beta: { messages: { stream: fakeStream('beta') } }
  };
  const complete = createAnthropicComplete({ client });
  const base = {
    model: 'm', max_tokens: 10, effort: 'low', messages: [{ role: 'user', content: 'hi' }],
    system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 'review_only', description: 'd', input_schema: { type: 'object', properties: {} } }]
  };
  await complete({ ...base, tier: 'fast' });
  await complete({ ...base, tier: 'standard' });
  assert.equal(calls[0].kind, 'ga');
  assert.equal(calls[0].params.fallbacks, undefined);
  assert.equal(calls[0].params.tools[0].eager_input_streaming, true);
  assert.deepEqual(calls[0].params.cache_control, { type: 'ephemeral' });
  assert.deepEqual(calls[0].params.output_config, { effort: 'low' });
  assert.equal(calls[1].kind, 'beta');
  assert.equal(calls[1].params.fallbacks, 'default');
  assert.deepEqual(calls[1].params.betas, ['server-side-fallback-2026-07-01']);
});

test('every Teaching agent has a protocol file the runner can load', () => {
  for (const slug of ['ann', 'clementine', 'hammond', 'clare']) {
    assert.ok(loadTeachingProtocol(slug).length > 100, slug);
  }
  assert.equal(loadTeachingProtocol('../secrets'), '');
});

test('API failures become messages the teacher can act on', async () => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { friendlyApiError } = await import('../../netlify/functions/_shared/teaching-ai-job-run.mjs');
  assert.match(friendlyApiError(new Anthropic.APIConnectionError({ message: 'x' })), /Could not reach Claude/);
  assert.match(friendlyApiError(new Error('plain')), /plain/);
});
