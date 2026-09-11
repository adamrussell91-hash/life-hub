import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitiesHandler } from '../../netlify/functions/entities.mjs';
import { TOMBSTONE_LABEL } from '../../netlify/functions/_shared/identity-schema.mjs';

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

function baseDeps(overrides = {}) {
  return {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    identityNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => memoryStore(),
    ...overrides
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/entities',
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

async function createPerson(handler, overrides = {}) {
  const response = await handler(request({ method: 'POST', body: { kind: 'person', display_name: 'Seth Example', ...overrides } }));
  return response.json();
}

test('rejects an unauthenticated request with 401', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/entities?ref=shared:person:x' }));
  assert.equal(response.status, 401);
});

test('rejects a disallowed origin', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/entities?ref=shared:person:x' }));
  assert.equal(response.status, 403);
});

test('every response uses cache-control: no-store', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const { headers } = await handler(request({ method: 'POST', body: { kind: 'person', display_name: 'Seth' } }));
  assert.equal(headers.get('cache-control'), 'no-store');
});

test('DELETE is not exposed (no hard delete in this slice)', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ method: 'DELETE', url: 'https://api.adam-russell.com/api/entities?ref=shared:person:x' }));
  assert.equal(response.status, 405);
});

test('POST creates a Person with server-derived id/lifecycle_status/timestamps', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler);
  assert.equal(created.data.kind, 'person');
  assert.equal(created.data.lifecycle_status, 'active');
  assert.match(created.data.id, /^person_[0-9a-f-]{36}$/);
  assert.equal(created.data.created_at, '2026-08-01T01:00:00.000Z');
});

test('POST rejects Person creation without display_name', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ method: 'POST', body: { kind: 'person' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'display_name_required');
});

test('POST rejects a body containing a forbidden access field', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ method: 'POST', body: { kind: 'person', display_name: 'Seth', workflow: 'administration' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'access_field_not_accepted');
});

test('POST creates an Organisation', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ method: 'POST', body: { kind: 'organisation', display_name: 'Example University' } }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.data.kind, 'organisation');
  assert.match(body.data.id, /^organisation_[0-9a-f-]{36}$/);
});

test('exactly one active self identity is enforced at creation', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const first = await createPerson(handler, { display_name: 'Adam Russell', is_self: true });
  assert.equal(first.data.is_self, true);

  const second = await handler(request({ method: 'POST', body: { kind: 'person', display_name: 'Someone Else', is_self: true } }));
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error.code, 'self_identity_exists');
});

test('GET returns the created entity by ref', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler);
  const response = await handler(request({ url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.data.ref)}` }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.display_name, 'Seth Example');
});

test('GET 404s a well-formed but nonexistent ref', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities?ref=shared:person:person_11111111-1111-1111-1111-111111111111' }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'entity_not_found');
});

test('PATCH action=update changes ordinary fields but never id, kind, lifecycle_status, or is_self', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler);
  const response = await handler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.data.ref)}&action=update`,
    body: { display_name: 'Seth Updated', is_self: true, lifecycle_status: 'archived' }
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.display_name, 'Seth Updated');
  assert.equal(body.data.is_self, false, 'is_self is immutable after creation');
  assert.equal(body.data.lifecycle_status, 'active', 'lifecycle_status only changes through a lifecycle action');
});

test('PATCH lifecycle actions transition status and are visible on a subsequent GET', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler);
  const ref = created.data.ref;

  const archived = await handler(request({ method: 'PATCH', url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(ref)}&action=archive`, body: {} }));
  assert.equal((await archived.json()).data.lifecycle_status, 'archived');

  const reactivated = await handler(request({ method: 'PATCH', url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(ref)}&action=activate`, body: {} }));
  assert.equal((await reactivated.json()).data.lifecycle_status, 'active');
});

test('PATCH action=retain requires retention_reason and retention_review_at', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler);
  const response = await handler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.data.ref)}&action=retain`,
    body: {}
  }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'retention_reason_required');
});

test('delete is only reachable via retained or deidentified, never directly from active', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler);
  const response = await handler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.data.ref)}&action=delete`,
    body: {}
  }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'invalid_lifecycle_transition');
});

test('PATCH action=delete (via deidentify first) soft-deletes: response never returns the former name or aliases', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler, { aliases: ['Sethy'] });
  const ref = created.data.ref;

  await handler(request({ method: 'PATCH', url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(ref)}&action=deidentify`, body: {} }));
  const response = await handler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(ref)}&action=delete`,
    body: {}
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.lifecycle_status, 'deleted');
  assert.equal(body.data.display_name, TOMBSTONE_LABEL);
  assert.doesNotMatch(JSON.stringify(body), /Seth/);

  // A subsequent GET also never discloses the former name.
  const getResponse = await handler(request({ url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(ref)}` }));
  assert.doesNotMatch(JSON.stringify(await getResponse.json()), /Seth/);
});

test('the self identity rejects an archive/retain/deidentify/delete transition via the API', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler, { is_self: true });
  const response = await handler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.data.ref)}&action=archive`,
    body: {}
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'self_identity_protected');
});

test('PATCH rejects an unsupported action', async () => {
  const store = memoryStore();
  const handler = createEntitiesHandler(baseDeps({ getContentStore: async () => store }));
  const created = await createPerson(handler);
  const response = await handler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.data.ref)}&action=made_up`,
    body: {}
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_action');
});

test('rejects a ref for an unsupported kind', async () => {
  const handler = createEntitiesHandler(baseDeps());
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities?ref=tasks:task:task_1' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'unsupported_entity_kind');
});
