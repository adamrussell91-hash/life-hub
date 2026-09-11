import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitiesHandler } from '../../netlify/functions/entities.mjs';
import { createEntityOverviewHandler } from '../../netlify/functions/entity-overview.mjs';
import { createUniversalLinksHandler } from '../../netlify/functions/universal-links.mjs';
import { resolveOrganisation, resolvePerson } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

// Person/Organisation share the same store as Universal Links — this
// wrapper reuses the injected test store for both kinds rather than
// letting the production resolvers connect to a real Netlify Blobs
// binding (which does not exist in this unit test process). Mirrors the
// pattern Slice 1/2's own suites use with a synthetic resolveEntity.
function makeResolveEntity(store) {
  return async function resolveEntity(refInput, accessContext, options = {}) {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (!ref) throw endpointNotFoundError();
    if (ref.namespace === 'shared' && ref.kind === 'person') {
      return resolvePerson(ref.id, accessContext, { ...options, getStore: async () => store });
    }
    if (ref.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, { ...options, getStore: async () => store });
    }
    throw endpointNotFoundError();
  };
}

function baseDeps(store, overrides = {}) {
  return {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    identityNow: () => '2026-08-01T01:00:00.000Z',
    repositoryNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => store,
    resolveEntity: makeResolveEntity(store),
    ...overrides
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url,
  method = 'GET',
  body
} = {}) {
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

async function createPerson(entities, overrides = {}) {
  const response = await entities(request({
    url: 'https://api.adam-russell.com/api/entities',
    method: 'POST',
    body: { kind: 'person', display_name: 'Seth Example', ...overrides }
  }));
  return (await response.json()).data;
}

async function createOrganisation(entities, displayName) {
  const response = await entities(request({
    url: 'https://api.adam-russell.com/api/entities',
    method: 'POST',
    body: { kind: 'organisation', display_name: displayName }
  }));
  return (await response.json()).data;
}

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createEntityOverviewHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/entities/overview?ref=shared:person:x' }));
  assert.equal(response.status, 401);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createEntityOverviewHandler(baseDeps(store));
  const response = await handler(request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/entities/overview?ref=shared:person:x' }));
  assert.equal(response.status, 403);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createEntityOverviewHandler(baseDeps(store));
  const response = await handler(request({ method: 'POST', url: 'https://api.adam-russell.com/api/entities/overview?ref=shared:person:x', body: {} }));
  assert.equal(response.status, 405);
});

test('rejects a missing ref', async () => {
  const store = memoryStore();
  const handler = createEntityOverviewHandler(baseDeps(store));
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/overview' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'missing_ref');
});

test('404s a well-formed but nonexistent ref', async () => {
  const store = memoryStore();
  const handler = createEntityOverviewHandler(baseDeps(store));
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/overview?ref=shared:person:person_11111111-1111-1111-1111-111111111111' }));
  assert.equal(response.status, 404);
});

test('shows two concurrent current relationships and one ended historical relationship', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const links = createUniversalLinksHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  const unsw = await createOrganisation(entities, 'Example University');
  const second = await createOrganisation(entities, 'Second Org');

  const link1 = await (await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: { source_ref: seth.ref, target_ref: unsw.ref, relationship_type: 'employee_at', valid_from: '2025-01-01T00:00:00.000Z' }
  }))).json();
  await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: { source_ref: seth.ref, target_ref: second.ref, relationship_type: 'member_of', valid_from: '2025-06-01T00:00:00.000Z' }
  }));

  await links(request({
    url: `https://api.adam-russell.com/api/universal-links?id=${link1.data.link.id}&action=end`,
    method: 'PATCH',
    body: { valid_to: '2026-01-01T00:00:00.000Z' }
  }));

  const response = await overview(request({ url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}` }));
  const body = (await response.json()).data;

  assert.equal(response.status, 200);
  assert.equal(body.entity.display_name, 'Seth Example');
  assert.equal(body.current_relationships.length, 1);
  assert.equal(body.historical_relationships.length, 1);
  assert.equal(body.historical_relationships[0].link.status, 'ended');
  assert.equal(body.timeline.length, 2);
  // Descending by effective date: the member_of role (2025-06) before the
  // ended employee_at role (2025-01).
  assert.equal(body.timeline[0].date, '2025-06-01T00:00:00.000Z');
  assert.equal(body.timeline[1].date, '2025-01-01T00:00:00.000Z');
  assert.equal(body.linked_records.organisations.length, 2);
  assert.equal(body.linked_records.tasks.length, 0);
  assert.equal(body.linked_records.communications.length, 0);
});

test('the entity field never discloses a deleted person\'s former name', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  await entities(request({ url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(seth.ref)}&action=deidentify`, method: 'PATCH', body: {} }));
  await entities(request({ url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(seth.ref)}&action=delete`, method: 'PATCH', body: {} }));

  const response = await overview(request({ url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}` }));
  const body = await response.json();
  assert.equal(response.status, 200, 'overview is a deliberate lookup: it still resolves a deleted entity by exact ref');
  assert.doesNotMatch(JSON.stringify(body), /Seth Example/);
});

test('an archived entity still resolves through overview (a deliberate workflow)', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  await entities(request({ url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(seth.ref)}&action=archive`, method: 'PATCH', body: {} }));

  const response = await overview(request({ url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}` }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.entity.lifecycle_status, 'archived');
});

test('rejects a ref for an unsupported kind', async () => {
  const store = memoryStore();
  const handler = createEntityOverviewHandler(baseDeps(store));
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/overview?ref=tasks:task:task_1' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'unsupported_entity_kind');
});
