import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleRelationalSearchHandler } from '../../netlify/functions/people-relational-search.mjs';
import { makeLink, makeObservation, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

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

function baseDeps(store, professionalStore, overrides = {}) {
  return {
    env,
    now: () => new Date('2026-09-17T00:00:00.000Z'),
    getContentStore: async () => store,
    getProfessionalStore: async () => professionalStore,
    resolveEntity: makeResolveEntity(store),
    ...overrides
  };
}

const URL_BASE = 'https://api.adam-russell.com/api/people/relational-search';

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ cookie: false, url: `${URL_BASE}?role=mentor` }));
  assert.equal(response.status, 401);
});

test('CORS preflight returns 204', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE, method: 'OPTIONS' }));
  assert.equal(response.status, 204);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: `${URL_BASE}?role=mentor`, method: 'POST' }));
  assert.equal(response.status, 405);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: `${URL_BASE}?role=mentor`, origin: 'https://evil.example.com' }));
  assert.equal(response.status, 403);
});

test('missing every filter returns a 400', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: URL_BASE }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'missing_filter');
});

test('successful end-to-end query: organisation + text filters return the matching person with reasons', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeObservation(professionalStore, { aboutRef: alice.ref, text: 'Passionate about gifted education initiatives.' });

  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(
    request({ url: `${URL_BASE}?organisation_ref=${encodeURIComponent(org.ref)}&text=${encodeURIComponent('gifted education')}` })
  );
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].person_ref, alice.ref);
  assert.equal(body.results[0].display_name, 'Alice');
  assert.deepEqual(
    body.results[0].matched_reasons.sort(),
    ['Employed at UNSW', "Observation mentions 'gifted education'"].sort()
  );
});
