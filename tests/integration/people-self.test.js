import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleSelfHandler } from '../../netlify/functions/people-self.mjs';
import { makePerson, memoryStore } from '../support/people-fixtures.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-09-17T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request({ cookie = true, origin = 'https://life-hub.adam-russell.com', url, method = 'GET' } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {})
    }
  });
}

function baseDeps(store, overrides = {}) {
  return {
    env,
    now: () => new Date('2026-09-17T00:00:00.000Z'),
    getContentStore: async () => store,
    ...overrides
  };
}

const URL_BASE = 'https://api.adam-russell.com/api/people/self';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createPeopleSelfHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: URL_BASE }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const handler = createPeopleSelfHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createPeopleSelfHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createPeopleSelfHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('returns self: null when no active self Person exists', async () => {
  const store = memoryStore();
  const handler = createPeopleSelfHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, { self: null });
});

test('returns the active self Person ref and display name', async () => {
  const store = memoryStore();
  const self = await makePerson(store, { display_name: 'Adam Russell', is_self: true });
  const handler = createPeopleSelfHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.self.ref, self.ref);
  assert.equal(body.data.self.display_name, 'Adam Russell');
});

test('falls back to the GitHub-imported self Person when Blobs have none', async () => {
  const store = memoryStore();
  const { derivePersonId, resetProfessionalDataCache } = await import(
    '../../netlify/functions/_shared/github-professional-data.mjs'
  );
  resetProfessionalDataCache();
  const fetchImpl = async (url) => {
    const href = String(url);
    const body = (data) => ({
      ok: true,
      status: 200,
      json: async () => ({ content: Buffer.from(JSON.stringify(data)).toString('base64') })
    });
    if (href.endsWith('/data/professional/people.json')) {
      return body([{ legacy_id: 'leg-self', display_name: 'Adam Russell', is_self: true }]);
    }
    if (href.endsWith('/data/professional/organisations.json')) return body([]);
    if (href.endsWith('/data/professional/relationships.json')) return body([]);
    return { ok: false, status: 404 };
  };
  const handler = createPeopleSelfHandler(baseDeps(store, { fetchImpl, env: { ...env, GITHUB_TOKEN: 'token' } }));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.self.display_name, 'Adam Russell');
  assert.equal(body.data.self.ref, `shared:person:${derivePersonId('leg-self')}`);
});

test('ignores an archived self-flagged Person', async () => {
  const store = memoryStore();
  await makePerson(store, { display_name: 'Old Self', is_self: true, lifecycle_status: 'archived' });
  const handler = createPeopleSelfHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  const body = await response.json();
  assert.deepEqual(body.data, { self: null });
});
