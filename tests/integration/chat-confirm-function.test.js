import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

const candidate = { type: 'meal', date: '2026-08-01', fields: { meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 } };

function request(body, headers = {}) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function githubFetchStub({ status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options?.method === 'PUT') {
      return status === 200
        ? Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } })
        : Response.json({ message: 'conflict' }, { status });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  return { calls, fetchImpl };
}

test('validates, writes, and returns the canonical path for a new record', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  // NOTE: the session fixture above is issued at 2026-08-01T00:00:00Z with an 8h TTL
  // (SESSION_MS in auth-security.mjs), i.e. valid only through 2026-08-01T08:00:00Z
  // (2026-08-01T18:00:00+10:00 Sydney time). The plan's reference value of
  // 2026-08-01T20:00:00+10:00 (10:00Z) falls outside that TTL and would make this
  // request 401 before ever reaching the write path, so it's moved earlier within
  // the session's valid window while keeping the +10:00 Sydney offset.
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T16:00:00+10:00') });

  const response = await handler(request({ candidate, slug: 'breakfast' }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.path, 'data/nutrition/2026/08/2026-08-01-breakfast.md');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).sha, undefined);
});

test('reports a validation failure without contacting GitHub', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  // NOTE: `now` must be mocked here too. The fixed `session` token above was issued at
  // 2026-08-01T00:00:00Z with an 8h TTL (see auth-security.mjs SESSION_MS). Without a
  // `now` override this handler falls back to the real Date.now(), which is well past
  // that expiry on any real run date, so the session check would fail first and the
  // response would be 401 instead of the intended 400. Mocking `now` inside the
  // session's TTL window keeps this test isolated to the validation branch, same fix
  // Task 10 applied to its own fixtures.
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T06:00:00Z') });
  const invalid = { type: 'meal', date: '2026-08-01', fields: { meal: 'brunch', calories: 1, protein_g: 1, fat_g: 1 } };

  const response = await handler(request({ candidate: invalid, slug: 'breakfast' }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('maps a write conflict to 409 for the client to prompt an overwrite', async () => {
  const { fetchImpl } = githubFetchStub({ status: 422 });
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T06:00:00Z') });
  const response = await handler(request({ candidate, slug: 'breakfast' }));
  assert.equal(response.status, 409);
});

test('rejects an unauthenticated request', async () => {
  const handler = createChatConfirmHandler({ env: validEnv });
  const response = await handler(new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidate, slug: 'breakfast' })
  }));
  assert.equal(response.status, 401);
});
