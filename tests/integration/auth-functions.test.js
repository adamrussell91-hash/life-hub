import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthHandler } from '../../netlify/functions/auth.mjs';
import { createSessionHandler } from '../../netlify/functions/session.mjs';
import { createLogoutHandler } from '../../netlify/functions/logout.mjs';

const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'injected-verifier',
  SESSION_SECRET: 's'.repeat(32)
};

const authRequest = passphrase => new Request('https://life.example/api/auth', {
  method: 'POST',
  headers: { origin: 'https://life.example', 'content-type': 'application/json' },
  body: JSON.stringify({ passphrase })
});

const requestWithCookie = cookie => new Request('https://life.example/api/session', {
  headers: { cookie: cookie.split(';', 1)[0] }
});

test('auth rejects wrong-origin and invalid credentials without detail', async () => {
  const handler = createAuthHandler({
    env: validEnv,
    verifyPassphrase: async value => value === 'accepted',
    now: () => 1_754_009_600_000,
    randomBytes: () => Buffer.alloc(16, 1)
  });
  const crossOrigin = await handler(new Request('https://life.example/api/auth', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'accepted' })
  }));
  assert.equal(crossOrigin.status, 403);

  const rejected = await handler(authRequest('wrong'));
  assert.equal(rejected.status, 401);
  assert.deepEqual((await rejected.json()).error, {
    code: 'invalid_credentials', message: 'That passphrase was not accepted.', retryable: true
  });
});

test('auth issues a protected cookie and session validates it', async () => {
  const auth = createAuthHandler({
    env: validEnv,
    verifyPassphrase: async value => value === 'accepted',
    now: () => 1_754_009_600_000,
    randomBytes: () => Buffer.alloc(16, 1)
  });
  const sessionHandler = createSessionHandler({ env: validEnv, now: () => 1_754_009_600_001 });
  const response = await auth(authRequest('accepted'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  const session = await sessionHandler(requestWithCookie(response.headers.get('set-cookie')));
  const body = await session.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.authenticated, true);
  assert.equal(body.data.expiresAt, new Date(1_754_009_600_000 + 8 * 60 * 60 * 1_000).toISOString());
});

test('handlers reject unsupported methods with their Allow contract', async () => {
  const auth = await createAuthHandler({ env: validEnv })(new Request('https://life.example/api/auth'));
  const session = await createSessionHandler({ env: validEnv })(new Request('https://life.example/api/session', { method: 'POST' }));
  const logout = await createLogoutHandler({ env: validEnv })(new Request('https://life.example/api/logout'));

  for (const response of [auth, session, logout]) {
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), response === session ? 'GET' : 'POST');
    assert.equal((await response.json()).ok, false);
  }
});

test('auth accepts only bounded well-formed JSON', async () => {
  const handler = createAuthHandler({ env: validEnv });
  const unsupported = await handler(new Request('https://life.example/api/auth', { method: 'POST' }));
  const malformed = await handler(new Request('https://life.example/api/auth', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
  }));
  const oversized = await handler(new Request('https://life.example/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'x'.repeat(1_024) })
  }));

  assert.equal(unsupported.status, 415);
  assert.equal(malformed.status, 400);
  assert.equal(oversized.status, 413);
  for (const response of [unsupported, malformed, oversized]) {
    assert.equal((await response.json()).ok, false);
  }
});

test('auth reports absent required environment as misconfigured', async () => {
  const response = await createAuthHandler({ env: {} })(authRequest('accepted'));
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).error.code, 'misconfigured');
});

test('session clears invalid and expired cookies', async () => {
  const invalid = await createSessionHandler({ env: validEnv })(requestWithCookie('life_hub_session=invalid'));
  const expiredToken = createAuthHandler({
    env: validEnv,
    verifyPassphrase: async () => true,
    now: () => 1_754_009_600_000,
    randomBytes: () => Buffer.alloc(16, 2)
  });
  const signed = await expiredToken(authRequest('accepted'));
  const expired = await createSessionHandler({ env: validEnv, now: () => 1_754_038_400_001 })(
    requestWithCookie(signed.headers.get('set-cookie'))
  );

  for (const response of [invalid, expired]) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await response.json()).ok, false);
  }
});

test('logout requires same origin and expires the session cookie', async () => {
  const handler = createLogoutHandler({ env: validEnv });
  const rejected = await handler(new Request('https://life.example/api/logout', {
    method: 'POST', headers: { origin: 'https://evil.example' }
  }));
  const response = await handler(new Request('https://life.example/api/logout', {
    method: 'POST', headers: { origin: 'https://life.example' }
  }));

  assert.equal(rejected.status, 403);
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
