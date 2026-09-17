import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createNetworkEcologyIntroductionPathsHandler } from '../../netlify/functions/network-ecology-introduction-paths.mjs';
import { personKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { makeLink, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

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
    resolveEntity: makeResolveEntity(store),
    ...overrides
  };
}

const URL_BASE = 'https://api.adam-russell.com/api/network-ecology/introduction-paths';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: `${URL_BASE}?from=shared:person:a&to=shared:person:b` }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?from=shared:person:a&to=shared:person:b`, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?from=shared:person:a&to=shared:person:b`, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('missing from returns a 400', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?to=shared:person:b` }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'missing_from');
});

test('missing to returns a 400', async () => {
  const store = memoryStore();
  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(request({ url: `${URL_BASE}?from=shared:person:a` }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'missing_to');
});

test('successful end-to-end path with a real evidenced hop', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const nina = await makePerson(store, { display_name: 'Nina' });
  const james = await makePerson(store, { display_name: 'James Cho' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: nina.ref, relationshipType: 'professional_relationship', role: 'mentor' });
  await makeLink(store, { sourceRef: nina.ref, targetRef: james.ref, relationshipType: 'professional_relationship', role: 'colleague' });

  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(
    request({ url: `${URL_BASE}?from=${encodeURIComponent(alice.ref)}&to=${encodeURIComponent(james.ref)}` })
  );
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  assert.equal(body.paths.length, 1);
  assert.deepEqual(body.paths[0], [
    { ref: nina.ref, via: 'mentor', relationship_type: 'professional_relationship', role: 'mentor' },
    { ref: james.ref, via: 'colleague', relationship_type: 'professional_relationship', role: 'colleague' }
  ]);
});

test('no path found returns an empty paths array, not an error', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const disconnected = await makePerson(store, { display_name: 'Disconnected' });

  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(
    request({ url: `${URL_BASE}?from=${encodeURIComponent(alice.ref)}&to=${encodeURIComponent(disconnected.ref)}` })
  );
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.deepEqual(body.paths, []);
});

test('PRIVACY: no introduction path is ever returned through a hidden/archived intermediate person', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const hiddenBob = await makePerson(store, { display_name: 'Hidden Bob' });
  const carol = await makePerson(store, { display_name: 'Carol' });

  // The ONLY connecting path from Alice to Carol goes through Hidden Bob.
  await makeLink(store, { sourceRef: alice.ref, targetRef: hiddenBob.ref, relationshipType: 'professional_relationship', role: 'mentor' });
  await makeLink(store, { sourceRef: hiddenBob.ref, targetRef: carol.ref, relationshipType: 'professional_relationship', role: 'colleague' });

  const { ref: _hiddenBobRef, ...hiddenBobRecord } = hiddenBob;
  await store.setJSON(personKey(hiddenBob.id), { ...hiddenBobRecord, lifecycle_status: 'archived' });

  const handler = createNetworkEcologyIntroductionPathsHandler(baseDeps(store));
  const response = await handler(
    request({ url: `${URL_BASE}?from=${encodeURIComponent(alice.ref)}&to=${encodeURIComponent(carol.ref)}` })
  );
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.deepEqual(body.paths, []);
});
