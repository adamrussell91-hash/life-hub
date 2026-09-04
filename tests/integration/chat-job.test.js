import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatStartHandler } from '../../netlify/functions/chat.mjs';
import { createChatEventsHandler } from '../../netlify/functions/chat-events.mjs';
import { createChatRunHandler } from '../../netlify/functions/chat-run.mjs';
import { createMemoryChatJobStore } from '../../netlify/functions/_shared/chat-job-store.mjs';
import { runStoredChatJob } from '../../netlify/functions/_shared/chat-job-run.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01',
  ANTHROPIC_API_KEY: 'anthropic-secret-key'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function startRequest(body) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('POST /api/chat returns a job id and the turn is polled from /api/chat/events', async () => {
  const store = createMemoryChatJobStore();
  const start = createChatStartHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    getStore: async () => store,
    invokeBackground: async (_request, jobId) => {
      await runStoredChatJob({
        jobId,
        store,
        createHandler: () => async () => {
          const encoder = new TextEncoder();
          const body = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"type":"agent","slug":"penelope"}\n\n'));
              controller.enqueue(encoder.encode('data: {"type":"text","delta":"Writing it now."}\n\n'));
              controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
              controller.close();
            }
          });
          return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
        }
      });
      return true;
    }
  });
  const events = createChatEventsHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    getStore: async () => store
  });

  const started = await start(startRequest({ message: 'yep go for it' }));
  assert.equal(started.status, 202);
  const { data } = await started.json();
  assert.match(data.jobId, /^[0-9a-f-]{36}$/i);

  const polled = await events(new Request(
    `https://life.example/api/chat/events?job=${data.jobId}&after=0`,
    { headers: { cookie: `life_hub_session=${session}` } }
  ));
  assert.equal(polled.status, 200);
  const payload = await polled.json();
  assert.equal(payload.data.status, 'done');
  assert.deepEqual(payload.data.events.map(event => event.type), ['agent', 'text', 'done']);
});

test('POST /api/chat streams live when the background job cannot start', async () => {
  const start = createChatStartHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    getStore: async () => { throw new Error('blobs down'); },
    invokeBackground: async () => false,
    fetchImpl: async url => {
      if (String(url).includes('/commits/') || String(url).includes('/git/trees/')) {
        return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } }, tree: [] });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
    createAnthropicClient: () => ({
      streamMessage: async function* () {
        yield { type: 'text', delta: 'Still here.' };
        yield { type: 'done' };
      }
    })
  });

  const response = await start(startRequest({ message: 'hello' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /event-stream/);
  assert.match(await response.text(), /Still here/);
});

test('chat-run refuses a missing job id', async () => {
  const handler = createChatRunHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    getStore: async () => createMemoryChatJobStore()
  });
  const response = await handler(new Request('https://life.example/api/chat-run', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jobId: 'nope' })
  }));
  assert.equal(response.status, 400);
});

test('chatRunUrl always targets the API host from the request, never SITE_ORIGIN', async () => {
  const { chatRunUrl } = await import('../../netlify/functions/_shared/chat-job-run.mjs');
  const request = new Request('https://api.adam-russell.com/api/chat', { method: 'POST' });
  const url = chatRunUrl(request, {
    URL: 'https://wrong.netlify.app',
    SITE_ORIGIN: 'https://life-hub.adam-russell.com'
  });
  assert.equal(url.href, 'https://api.adam-russell.com/api/chat-run');
});

test('runStoredChatJob publishes the full event list via put (no append RMW)', async () => {
  const store = createMemoryChatJobStore();
  const jobId = '11111111-1111-4111-8111-111111111111';
  await store.create(jobId, {
    owner: 'owner',
    body: '{"message":"hi"}',
    url: 'https://api.example/api/chat'
  });
  const puts = [];
  const originalPut = store.put.bind(store);
  store.put = async (id, record) => {
    puts.push(record.events.map(e => e.type));
    return originalPut(id, record);
  };
  store.append = async () => {
    throw new Error('append must not be used on the hot path');
  };

  await runStoredChatJob({
    jobId,
    store,
    createHandler: () => async () => {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"agent","slug":"brisket"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"text","delta":"Mostly"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"text","delta":" from skim"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
        }
      }), { headers: { 'content-type': 'text/event-stream' } });
    }
  });

  const job = await store.get(jobId);
  assert.equal(job.status, 'done');
  assert.deepEqual(job.events.map(e => e.type), ['agent', 'text', 'text', 'done']);
  assert.ok(puts.length >= 1);
  assert.deepEqual(puts.at(-1), ['agent', 'text', 'text', 'done']);
});

test('events endpoint hides another session\'s job', async () => {
  const store = createMemoryChatJobStore();
  await store.create('11111111-1111-4111-8111-111111111111', {
    owner: 'someone-else',
    body: '{"message":"hi"}',
    url: 'https://life.example/api/chat'
  });
  const events = createChatEventsHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    getStore: async () => store
  });
  const response = await events(new Request(
    'https://life.example/api/chat/events?job=11111111-1111-4111-8111-111111111111',
    { headers: { cookie: `life_hub_session=${session}` } }
  ));
  assert.equal(response.status, 404);
});
