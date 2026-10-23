import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAiJobHandler } from '../../netlify/functions/ai-job.mjs';
import { createAiJobsHandler } from '../../netlify/functions/ai-jobs.mjs';
import { createAiJobRunHandler } from '../../netlify/functions/ai-job-run.mjs';
import {
  AI_USAGE_LOG_KEY,
  NOTE_TOOLS,
  TEACHING_TOOLS,
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

test('an inbox row still saying working does not refuse the next message once the job is done', async () => {
  // Live, 21 Oct: the inbox lagged the finished job record and the next send got a 409.
  const store = memoryStore(seed(workingJob({ created_at: NOW })));
  store.map.set(aiJobKey('ai_job_abc'), { ...workingJob({ created_at: NOW }), status: 'done', response: 'Done.' });
  const reads = [];
  const get = store.get;
  store.get = async (key, options) => { reads.push({ key, consistency: options?.consistency }); return get(key, options); };
  const kicks = [];
  const deps = { env, now, getContentStore: async () => store, kickLessonJobRun: async (_req, id) => { kicks.push(id); return true; } };
  const created = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', { method: 'POST', body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Next question' } })
  ));
  assert.equal(created.status, 202);
  assert.equal(created.body.data.status, 'working');
  assert.equal(kicks.length, 1);
  const inboxRow = store.map.get(aiJobsInboxKey()).jobs.find(row => row.id === 'ai_job_abc');
  assert.equal(inboxRow.status, 'done');
  assert.ok(reads.filter(r => r.key === aiJobsInboxKey() || r.key === aiJobKey('ai_job_abc')).every(r => r.consistency === 'strong'));
});

test('a job that is really still working still refuses a second one', async () => {
  const store = memoryStore(seed(workingJob({ created_at: NOW })));
  const deps = { env, now, getContentStore: async () => store, kickLessonJobRun: async () => true };
  const res = await read(await createAiJobsHandler(deps)(
    request('https://api.adam-russell.com/api/ai/jobs', { method: 'POST', body: { lesson_id: 'lesson_1', agent: 'ann', message: 'Too soon' } })
  ));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.details.id, 'ai_job_abc');
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
  for (const tool of TEACHING_TOOLS) assert.ok(names.includes(tool.name));
  assert.ok(names.includes('list_lessons') && names.includes('read_lesson'));
  assert.ok(names.includes('web_search'));
});

test('Ann lists the unit\'s lessons with their dates and reads an earlier one in full', async () => {
  const earlier = {
    ...lesson, id: 'lesson_0', title: 'Samuel Wagan Watson', sequence: 0,
    blocks: [{ ...heading, id: 'b_poet', content: { text: 'Who is Samuel Wagan Watson?' } },
      { ...heading, id: 'b_def', block_type: 'rich_text', content: { html: '<p>Defamiliarisation makes the <strong>familiar</strong> strange.</p>' } }]
  };
  const store = memoryStore({
    ...seed(),
    'lessons/lesson_0': earlier,
    'lessons/lesson_gone': { ...lesson, id: 'lesson_gone', status: 'trashed' },
    'units/unit_1': { id: 'unit_1', type: 'unit', title: 'Poetry', status: 'active', year_id: 'y10', lesson_ids: ['lesson_0', 'lesson_gone', 'lesson_1'] },
    'units/unit_2': { id: 'unit_2', type: 'unit', title: 'Novel study', status: 'active', year_id: 'y10', lesson_ids: [] },
    'units/unit_9': { id: 'unit_9', type: 'unit', title: 'Year 7 unit', status: 'active', year_id: 'y7', lesson_ids: [] },
    'scheduled_lessons/s1': { id: 's1', lesson_id: 'lesson_0', unit_id: 'unit_1', date: '2026-10-13', delivery_status: 'delivered' },
    'scheduled_lessons/s2': { id: 's2', lesson_id: 'lesson_0', unit_id: 'unit_1', date: '2026-10-12', delivery_status: 'delivered' },
    'scheduled_lessons/s3': { id: 's3', lesson_id: 'lesson_1', unit_id: 'unit_1', date: '2026-10-20', delivery_status: 'skipped' }
  });
  const results = [];
  const replies = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'list_lessons', input: {} }] },
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'read_lesson', input: { id: 'lesson_0' } }] },
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't3', name: 'read_lesson', input: { id: 'lesson_gone' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Plan to confirm' }] }
  ];
  const complete = async req => {
    const last = req.messages[req.messages.length - 1];
    if (Array.isArray(last.content)) results.push(...last.content.filter(block => block.type === 'tool_result'));
    return replies.shift();
  };
  const job = await runStoredLessonJob({ store, jobId: 'ai_job_abc', env, complete, readFileSyncImpl: () => '', nowIso: () => NOW });
  assert.equal(job.status, 'done');

  const listing = JSON.parse(results[0].content);
  assert.equal(listing.unit.title, 'Poetry');
  assert.deepEqual(listing.lessons.map(row => row.id), ['lesson_0', 'lesson_1']);
  assert.deepEqual(listing.lessons[0].dates, ['2026-10-12', '2026-10-13']);
  assert.deepEqual(listing.lessons[1].dates, [], 'a skipped day is not a teaching date');
  assert.equal(listing.lessons[1].this_lesson, true);
  assert.deepEqual(listing.other_units.map(unit => unit.id), ['unit_2'], 'only units from the same year');

  const reading = JSON.parse(results[1].content);
  assert.equal(reading.title, 'Samuel Wagan Watson');
  assert.equal(reading.unit, 'Poetry');
  assert.match(reading.text, /\[heading\] Who is Samuel Wagan Watson\?/);
  assert.match(reading.text, /\[rich_text\] Defamiliarisation makes the familiar strange\./);

  assert.equal(results[2].is_error, true);
  assert.match(results[2].content, /unavailable/);
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
