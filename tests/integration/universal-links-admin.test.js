import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createUniversalLinksAdminHandler } from '../../netlify/functions/universal-links-admin.mjs';
import { createUniversalLinksHandler } from '../../netlify/functions/universal-links.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';

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
    async get(key, options = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

const TASK_REF = 'tasks:task:task_email_seth';
const PERSON_REF = 'shared:person:person_seth';

async function fakeResolveEntity(refInput) {
  const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
  if (ref === TASK_REF) return { ref, kind: 'task', display_label: 'x', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' };
  if (ref === PERSON_REF) return { ref, kind: 'person', display_label: 'y', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' };
  throw endpointNotFoundError();
}

function baseDeps(overrides = {}) {
  return {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore(),
    resolveEntity: fakeResolveEntity,
    repositoryNow: () => '2026-09-11T00:00:00.000Z',
    ...overrides
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/universal-links/admin',
  method = 'POST',
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

test('rejects an unauthenticated request with 401', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ cookie: false, body: { action: 'rebuild_indexes' } }));
  assert.equal(response.status, 401);
});

test('rejects a disallowed origin', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ origin: 'https://evil.example.com', body: { action: 'rebuild_indexes' } }));
  assert.equal(response.status, 403);
});

test('is POST only', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ method: 'GET' }));
  assert.equal(response.status, 405);
});

test('rejects an unsupported action', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ body: { action: 'delete_everything' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_action');
});

test('rejects a request body containing a forbidden access field', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ body: { action: 'rebuild_indexes', actor: 'attacker' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'access_field_not_accepted');
});

test('every response uses cache-control: no-store', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ body: { action: 'dry_run_rebuild' } }));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('repair_operation validates the operation id before storage access', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ body: { action: 'repair_operation', operation_id: '../../etc/passwd' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_operation_id');
});

test('repair_operation on an unknown (but valid-shaped) operation id returns a non-disclosing not found response', async () => {
  const handler = createUniversalLinksAdminHandler(baseDeps());
  const response = await handler(request({ body: { action: 'repair_operation', operation_id: `op_${'0'.repeat(32)}` } }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'operation_not_found');
});

test('dry_run_rebuild reports counts and writes nothing; rebuild_indexes then repairs the same gap', async () => {
  const store = memoryStore();
  const deps = baseDeps({ getContentStore: async () => store });
  const linksHandler = createUniversalLinksHandler(deps);
  const adminHandler = createUniversalLinksAdminHandler(deps);

  const created = await (await linksHandler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/universal-links',
    body: { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'collaborator' }
  }))).json();
  assert.equal(created.data.created, true);

  // Simulate a broken index by dropping this test's own view of the store
  // down to only the authoritative link, mirroring the repository unit
  // suite's "broken store" fixture.
  const brokenStore = memoryStore();
  await brokenStore.setJSON(`universal-links/links/${created.data.link.id}`, created.data.link);
  const brokenDeps = baseDeps({ getContentStore: async () => brokenStore });
  const brokenAdmin = createUniversalLinksAdminHandler(brokenDeps);

  const dry = await brokenAdmin(request({ body: { action: 'dry_run_rebuild' } }));
  assert.equal(dry.status, 200);
  const dryBody = (await dry.json()).data;
  assert.equal(dryBody.dry_run, true);
  assert.equal(dryBody.missing, 3);
  assert.equal(dryBody.repaired, 0);
  assert.equal('link_payload' in dryBody, false);

  const live = await brokenAdmin(request({ body: { action: 'rebuild_indexes' } }));
  const liveBody = (await live.json()).data;
  assert.equal(liveBody.dry_run, false);
  assert.equal(liveBody.repaired, 3);
});

test('admin responses never include endpoint labels or journal payloads', async () => {
  const store = memoryStore();
  const deps = baseDeps({ getContentStore: async () => store });
  const linksHandler = createUniversalLinksHandler(deps);
  const adminHandler = createUniversalLinksAdminHandler(deps);

  let failed = false;
  const failingStore = {
    ...store,
    async get(key, options = {}) { return store.get(key, options); },
    async setJSON(key, value) {
      if (!failed && key.startsWith('universal-links/by-source/')) {
        failed = true;
        throw new Error('simulated');
      }
      return store.setJSON(key, value);
    },
    async list(opts) { return store.list(opts); }
  };
  const failingDeps = baseDeps({ getContentStore: async () => failingStore });
  const failingHandler = createUniversalLinksHandler(failingDeps);
  const failResponse = await failingHandler(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/universal-links',
    body: { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'collaborator' }
  }));
  const failBody = await failResponse.json();
  const operationId = failBody.data.operation_id;

  const repaired = await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));
  assert.equal(repaired.status, 200);
  const repairedBody = await repaired.json();
  const serialized = JSON.stringify(repairedBody);
  assert.doesNotMatch(serialized, /link_payload|display_label|Seth/i);

  void linksHandler;
});
