import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';

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

function request(body, headers = {}) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function githubFetchStub() {
  return async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

async function* mockedStream(events) {
  for (const event of events) yield event;
}

async function readSse(response) {
  const text = await response.text();
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

test('streams an agent event, text, and a validated record proposal for a routed message', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => mockedStream([
        { type: 'text', delta: 'Logging it now.' },
        { type: 'tool_call', id: 'call_1', name: 'log_entry', input: {
          type: 'workout', date: '2026-08-01', fields: {
            day_type: 'workout_30', status: 'completed', duration_min: 30,
            exercises: [{ name: 'Squat', sets: [{ reps: 10, weight_kg: 40 }] }]
          }
        } },
        { type: 'done' }
      ])
    })
  });

  const response = await handler(request({ message: 'Chadwick, log a 30 minute workout' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');

  const events = await readSse(response);
  assert.deepEqual(events[0], { type: 'agent', slug: 'chadwick' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Logging it now.' });
  assert.equal(events[2].type, 'record_proposal');
  assert.equal(events[2].record.type, 'workout');
  assert.equal(events[2].path, 'data/fitness/2026/08/2026-08-01-workout.md');
  assert.deepEqual(events[3], { type: 'done' });
});

test('rejects an unauthenticated request', async () => {
  const handler = createChatHandler({ env: validEnv });
  const response = await handler(new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hi' })
  }));
  assert.equal(response.status, 401);
});

test('rejects an empty or oversized message', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T06:00:00Z'),
    fetchImpl: githubFetchStub()
  });
  assert.equal((await handler(request({ message: '' }))).status, 400);
  assert.equal((await handler(request({ message: 'x'.repeat(5000) }))).status, 400);
});

test('reports misconfiguration when ANTHROPIC_API_KEY is absent', async () => {
  const { ANTHROPIC_API_KEY, ...withoutKey } = validEnv;
  const handler = createChatHandler({ env: withoutKey });
  const response = await handler(request({ message: 'hi' }));
  assert.equal(response.status, 503);
});
