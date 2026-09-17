import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createPeopleRelationalSearchHandler } from '../../netlify/functions/people-relational-search.mjs';
import { makeLink, makeObservation, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';
import { buildIdentityIndexRecord } from '../../netlify/functions/_shared/identity-schema.mjs';
import { organisationIndexKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';

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

function request({ cookie = true, origin = 'https://life-hub.adam-russell.com', url, method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

/** Writes the identity-index projection `makeOrganisation` does not write
 * (see `tests/support/people-fixtures.mjs`'s own comment about
 * `personIndexKey` — organisations never got the equivalent) — the NL
 * plan endpoint's organisation-name resolution (`resolveOrganisationByName`,
 * reusing `entity-search.mjs`'s real `searchIdentityKind`) reads candidates
 * from this index, not the authoritative-record prefix, so a fixture
 * organisation without it is invisible to name resolution. */
async function indexOrganisation(store, org) {
  await store.setJSON(
    organisationIndexKey(org.id),
    buildIdentityIndexRecord({
      id: org.id,
      kind: 'organisation',
      displayLabel: org.display_name,
      sortName: null,
      lifecycleStatus: org.lifecycle_status,
      isSelf: false,
      updatedAt: org.updated_at
    })
  );
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

test('rejects an unsupported method (PATCH)', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: `${URL_BASE}?role=mentor`, method: 'PATCH' }));
  assert.equal(response.status, 405);
});

// POST is now supported (Phase 5, `?action=plan`, see below) — a POST
// without that action is a 400 invalid_action, not a blanket 405.
test('rejects a POST without action=plan', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: `${URL_BASE}?role=mentor`, method: 'POST' }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'invalid_action');
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

// --- POST ?action=plan (Phase 5, Layer 2: natural-language search) ------

const PLAN_URL = `${URL_BASE}?action=plan`;

function throwingFetch() {
  throw new Error('the NL plan route must never call the real network in tests.');
}

test('POST ?action=plan returns 503 when ANTHROPIC_API_KEY is unbound', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const handler = createPeopleRelationalSearchHandler(baseDeps(store, professionalStore));
  const response = await handler(request({ url: PLAN_URL, method: 'POST', body: { question: 'Who do I know at UNSW?' } }));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'people_relational_search_nl_unbound');
});

test('POST ?action=plan: success path with an injected complete() — plans, resolves the org, executes, and returns results plus the resolved filter for transparency', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });
  await indexOrganisation(store, org);
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeObservation(professionalStore, { aboutRef: alice.ref, text: 'Passionate about gifted education initiatives.' });

  const complete = async () =>
    JSON.stringify({
      organisation_name: 'UNSW',
      role: null,
      text: 'gifted education',
      unsupported: false,
      unsupported_reason: null
    });

  const handler = createPeopleRelationalSearchHandler(
    baseDeps(store, professionalStore, { env: { ...env, ANTHROPIC_API_KEY: 'test-key' }, complete, fetchImpl: throwingFetch })
  );
  const response = await handler(
    request({ url: PLAN_URL, method: 'POST', body: { question: 'Who do I know at UNSW connected to gifted education?' } })
  );
  assert.equal(response.status, 200);
  const body = (await response.json()).data;

  assert.equal(body.organisation_ref, org.ref);
  assert.equal(body.organisation_name, 'UNSW');
  assert.equal(body.organisation_matched, true);
  assert.equal(body.text, 'gifted education');
  assert.equal(body.role, '');
  assert.equal(body.unsupported, false);
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].person_ref, alice.ref);
});

test('POST ?action=plan: malformed (non-JSON) model output is handled cleanly, not a crash', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const complete = async () => 'Sure! Here is your answer, no JSON here.';

  const handler = createPeopleRelationalSearchHandler(
    baseDeps(store, professionalStore, { env: { ...env, ANTHROPIC_API_KEY: 'test-key' }, complete, fetchImpl: throwingFetch })
  );
  const response = await handler(request({ url: PLAN_URL, method: 'POST', body: { question: 'Who do I know at UNSW?' } }));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.code, 'relational_search_nl_plan_failed');
});

test('POST ?action=plan: a hallucinated role is dropped and never reaches runRelationalSearch as invalid_role', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const complete = async () =>
    JSON.stringify({ organisation_name: null, role: 'best_friend_forever', text: 'gifted education', unsupported: false, unsupported_reason: null });

  const handler = createPeopleRelationalSearchHandler(
    baseDeps(store, professionalStore, { env: { ...env, ANTHROPIC_API_KEY: 'test-key' }, complete, fetchImpl: throwingFetch })
  );
  const response = await handler(request({ url: PLAN_URL, method: 'POST', body: { question: 'Who is my best friend forever?' } }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.equal(body.role, '');
  assert.deepEqual(body.results, []);
});

test('POST ?action=plan: an honestly-unsupported question returns zero results without erroring', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const complete = async () =>
    JSON.stringify({
      organisation_name: null,
      role: null,
      text: null,
      unsupported: true,
      unsupported_reason: 'This needs multi-hop reasoning the structured filters cannot express.'
    });

  const handler = createPeopleRelationalSearchHandler(
    baseDeps(store, professionalStore, { env: { ...env, ANTHROPIC_API_KEY: 'test-key' }, complete, fetchImpl: throwingFetch })
  );
  const response = await handler(
    request({ url: PLAN_URL, method: 'POST', body: { question: 'Who should introduce me to someone at UNSW?' } })
  );
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.equal(body.unsupported, true);
  assert.match(body.unsupported_reason, /multi-hop/);
  assert.deepEqual(body.results, []);
});
