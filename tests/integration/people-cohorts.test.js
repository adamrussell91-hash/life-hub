import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleCohortsHandler } from '../../netlify/functions/people-cohorts.mjs';
import { makeLink, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

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

const URL_BASE = 'https://api.adam-russell.com/api/people/cohorts';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createPeopleCohortsHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: URL_BASE }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const handler = createPeopleCohortsHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createPeopleCohortsHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, method: 'DELETE' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createPeopleCohortsHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('successful response returns cohorts for people sharing a current organisation', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: org.ref, relationshipType: 'member_of', validFrom: '2025-01-01T00:00:00.000Z' });

  const handler = createPeopleCohortsHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.ok(Array.isArray(body.cohorts));
  assert.equal(body.cohorts.length, 1);
  assert.equal(body.cohorts[0].label, 'UNSW');
  assert.equal(body.cohorts[0].members.length, 2);
});

test('empty response shape when no cohorts exist', async () => {
  const store = memoryStore();
  await makePerson(store, { display_name: 'Solo' });
  const handler = createPeopleCohortsHandler(baseDeps(store));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.deepEqual(body.cohorts, []);
});
