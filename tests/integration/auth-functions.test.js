import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifySessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import {
  bumpSessionEpoch,
  checkLoginAllowed,
  clearLoginFailures,
  loadSessionEpoch,
  LOGIN_THROTTLE,
  recordLoginFailure,
  resetAuthStateCache
} from '../../netlify/functions/_shared/auth-state.mjs';
import { createKnowledgeAuthLoginHandler } from '../../netlify/functions/knowledge-auth-login.mjs';
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
  assert.equal(body.data.expiresAt, new Date(1_754_009_600_000 + 30 * 24 * 60 * 60 * 1_000).toISOString());
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

test('auth rejects all declared oversized bodies before reading or verifying them', async () => {
  let verifyCalls = 0;
  const handler = createAuthHandler({
    env: validEnv,
    verifyPassphrase: async () => {
      verifyCalls += 1;
      return true;
    }
  });
  for (const declaredLength of ['1025', '9007199254740992', '9'.repeat(100)]) {
    let pulls = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array([123]));
        controller.close();
      }
    });
    const response = await handler(new Request('https://life.example/api/auth', {
      method: 'POST',
      headers: {
        origin: 'https://life.example',
        'content-type': 'application/json',
        'content-length': declaredLength
      },
      body,
      duplex: 'half'
    }));

    assert.equal(response.status, 413, declaredLength);
    assert.equal(pulls, 0, declaredLength);
  }
  assert.equal(verifyCalls, 0);
});

test('auth cancels a streamed body as soon as it crosses 1,024 bytes', async () => {
  let pulls = 0;
  let cancelled = false;
  const chunks = [new Uint8Array(700), new Uint8Array(400), new Uint8Array(1024 * 1024)];
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(chunks[pulls]);
      pulls += 1;
    },
    cancel() {
      cancelled = true;
      throw new Error('transport cancellation failed');
    }
  });
  const response = await createAuthHandler({ env: validEnv })(new Request(
    'https://life.example/api/auth',
    {
      method: 'POST',
      headers: { origin: 'https://life.example', 'content-type': 'application/json' },
      body,
      duplex: 'half'
    }
  ));

  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.equal(pulls, 2);
});

test('auth reports absent required environment as misconfigured', async () => {
  const response = await createAuthHandler({ env: {} })(authRequest('accepted'));
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).error.code, 'misconfigured');
});

test('session refreshes cookies in the second half of the lifetime', async () => {
  const issuedAt = 1_754_009_600_000;
  const auth = createAuthHandler({
    env: validEnv,
    verifyPassphrase: async value => value === 'accepted',
    now: () => issuedAt,
    randomBytes: () => Buffer.alloc(16, 1)
  });
  const signed = await auth(authRequest('accepted'));
  const cookie = signed.headers.get('set-cookie');
  const refreshAt = issuedAt + 30 * 24 * 60 * 60 * 1_000 / 2;
  const sessionHandler = createSessionHandler({ env: validEnv, now: () => refreshAt });
  const response = await sessionHandler(requestWithCookie(cookie));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(response.headers.get('set-cookie'), /life_hub_session=/);
  assert.equal(body.data.expiresAt, new Date(refreshAt + 30 * 24 * 60 * 60 * 1_000).toISOString());
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
  const expired = await createSessionHandler({ env: validEnv, now: () => 1_754_009_600_000 + 30 * 24 * 60 * 60 * 1_000 + 1 })(
    requestWithCookie(signed.headers.get('set-cookie'))
  );
  const exactBoundary = await createSessionHandler({ env: validEnv, now: () => 1_754_009_600_000 + 30 * 24 * 60 * 60 * 1_000 })(
    requestWithCookie(signed.headers.get('set-cookie'))
  );

  for (const response of [invalid, exactBoundary, expired]) {
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

// In-memory stand-in for the `life-hub-auth` Blobs store.
function authStore() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async delete(key) { map.delete(key); }
  };
}

function authDeps(store) {
  const getStore = async () => store;
  return {
    loginThrottle: {
      check: options => checkLoginAllowed({ ...options, getStore }),
      fail: options => recordLoginFailure({ ...options, getStore }),
      succeed: options => clearLoginFailures({ ...options, getStore })
    },
    loadSessionEpoch: options => loadSessionEpoch({ ...options, getStore, useCache: false }),
    verifySessionToken: (token, secret, now) => verifySessionToken(token, secret, now, {
      loadEpoch: options => loadSessionEpoch({ ...options, getStore, useCache: false })
    }),
    bumpSessionEpoch: options => bumpSessionEpoch({ ...options, getStore })
  };
}

const T0 = 1_754_009_600_000;
const DAY = 24 * 60 * 60 * 1_000;

test('logout with a valid session signs out every session, including copies of the cookie', async () => {
  resetAuthStateCache();
  const store = authStore();
  const deps = authDeps(store);
  const auth = createAuthHandler({ env: validEnv, verifyPassphrase: async v => v === 'accepted', now: () => T0, ...deps });
  const phone = (await auth(authRequest('accepted'))).headers.get('set-cookie');
  const laptop = (await auth(authRequest('accepted'))).headers.get('set-cookie');
  const session = createSessionHandler({ env: validEnv, now: () => T0 + 1, ...deps });
  assert.equal((await session(requestWithCookie(phone))).status, 200);

  const logout = createLogoutHandler({ env: validEnv, now: () => T0 + 2, ...deps });
  const out = await logout(new Request('https://life.example/api/logout', {
    method: 'POST', headers: { origin: 'https://life.example', cookie: phone.split(';', 1)[0] }
  }));
  assert.equal(out.status, 204);
  assert.equal(out.headers.get('x-sessions-revoked'), 'all');
  assert.equal(store.map.get('session/epoch').epoch, 1);

  for (const cookie of [phone, laptop]) {
    const response = await session(requestWithCookie(cookie));
    assert.equal(response.status, 401);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  }
  // Signing in again issues a session under the new epoch.
  const fresh = (await auth(authRequest('accepted'))).headers.get('set-cookie');
  assert.equal((await session(requestWithCookie(fresh))).status, 200);
});

test('logout without a valid session only clears its own cookie; an anonymous caller cannot sign the owner out', async () => {
  const store = authStore();
  const deps = authDeps(store);
  const logout = createLogoutHandler({ env: validEnv, ...deps });
  const response = await logout(new Request('https://life.example/api/logout', {
    method: 'POST', headers: { origin: 'https://life.example', cookie: 'life_hub_session=forged' }
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-sessions-revoked'), 'none');
  assert.equal(store.map.has('session/epoch'), false);
});

test('sessions from before revocation existed (no epoch, no first sign-in time) keep working', async () => {
  const store = authStore();
  const deps = authDeps(store);
  const payload = { v: 1, iat: T0, exp: T0 + 30 * DAY, jti: Buffer.alloc(16, 9).toString('base64url') };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', validEnv.SESSION_SECRET).update(encoded).digest('base64url');
  const legacy = `life_hub_session=${encoded}.${signature}`;
  const response = await createSessionHandler({ env: validEnv, now: () => T0 + 20 * DAY, ...deps })(requestWithCookie(legacy));
  assert.equal(response.status, 200);
  const refreshed = response.headers.get('set-cookie');
  assert.match(refreshed, /life_hub_session=/);
  const next = JSON.parse(Buffer.from(refreshed.split('=')[1].split('.')[0], 'base64url').toString('utf8'));
  assert.equal(next.sep, 0);
  assert.equal(next.auth, T0, 'the legacy iat becomes the first sign-in time');
});

test('refresh never extends a session past 90 days from the first sign-in', async () => {
  const store = authStore();
  const deps = authDeps(store);
  const auth = createAuthHandler({ env: validEnv, verifyPassphrase: async () => true, now: () => T0, ...deps });
  let cookie = (await auth(authRequest('accepted'))).headers.get('set-cookie');
  let at = T0;
  // Refresh every 16 days for as long as the server keeps saying yes.
  for (let i = 0; i < 10; i += 1) {
    at += 16 * DAY;
    const response = await createSessionHandler({ env: validEnv, now: () => at, ...deps })(requestWithCookie(cookie));
    if (response.status !== 200) break;
    const body = await response.json();
    assert.ok(Date.parse(body.data.expiresAt) <= T0 + 90 * DAY);
    cookie = response.headers.get('set-cookie') ?? cookie;
  }
  assert.ok(at <= T0 + 96 * DAY, 'the chain stops by day 90');
  const late = await createSessionHandler({ env: validEnv, now: () => T0 + 90 * DAY, ...deps })(requestWithCookie(cookie));
  assert.equal(late.status, 401);
});

test('a session check answers 503, not sign-out, when the epoch cannot be read', async () => {
  const auth = createAuthHandler({ env: validEnv, verifyPassphrase: async () => true, now: () => T0, loadSessionEpoch: async () => 0 });
  const cookie = (await auth(authRequest('accepted'))).headers.get('set-cookie');
  const session = createSessionHandler({
    env: validEnv,
    now: () => T0 + 1,
    verifySessionToken: (token, secret, now) => verifySessionToken(token, secret, now, {
      loadEpoch: async () => { throw new Error('blobs down'); }
    })
  });
  const response = await session(requestWithCookie(cookie));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('failed sign-ins from any address share one backoff across /api/auth and the Knowledge login', async () => {
  const store = authStore();
  const deps = authDeps(store);
  let clock = T0;
  let verifyCalls = 0;
  const verify = async value => { verifyCalls += 1; return value === 'accepted'; };
  const life = createAuthHandler({ env: validEnv, verifyPassphrase: verify, now: () => clock, ...deps });
  const knowledge = createKnowledgeAuthLoginHandler({ env: validEnv, verifyPassphrase: verify, now: () => clock, ...deps });

  // Five free wrong guesses, alternating routes (as if from different IPs).
  for (let i = 0; i < 4; i += 1) {
    assert.equal((await (i % 2 ? knowledge : life)(authRequest(`wrong-${i}`))).status, 401);
  }
  const fifth = await knowledge(authRequest('wrong-5'));
  assert.equal(fifth.status, 429);
  assert.equal((await fifth.json()).error.code, 'sign_in_locked');
  assert.equal(fifth.headers.get('retry-after'), '30');

  // While locked: refused without checking the passphrase, even the right one, and the lock does not grow.
  const callsBefore = verifyCalls;
  const lockedRight = await life(authRequest('accepted'));
  assert.equal(lockedRight.status, 429);
  assert.equal(verifyCalls, callsBefore);
  assert.equal(store.map.get('login/failures').failures, 5);

  // After the lock the owner signs in, which clears the counter.
  clock += 30_000;
  assert.equal((await life(authRequest('accepted'))).status, 200);
  assert.equal(store.map.has('login/failures'), false);
});

test('backoff doubles per failure, caps at fifteen minutes, and forgets after a quiet half hour', async () => {
  const store = authStore();
  const getStore = async () => store;
  let at = T0;
  const locks = [];
  for (let i = 0; i < 12; i += 1) {
    const state = await recordLoginFailure({ getStore, now: at });
    locks.push(state.locked_until ? (state.locked_until - at) / 1000 : 0);
    at = Math.max(at, state.locked_until ?? at) + 1;
  }
  assert.deepEqual(locks, [0, 0, 0, 0, 30, 60, 120, 240, 480, 900, 900, 900]);
  assert.equal((await checkLoginAllowed({ getStore, now: at - 2 })).allowed, false);
  const later = at + LOGIN_THROTTLE.RESET_AFTER_MS + 1;
  assert.equal((await checkLoginAllowed({ getStore, now: later })).allowed, true);
  assert.equal((await recordLoginFailure({ getStore, now: later })).failures, 1);
});
