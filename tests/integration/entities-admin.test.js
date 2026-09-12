import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitiesHandler } from '../../netlify/functions/entities.mjs';
import { createEntitiesAdminHandler } from '../../netlify/functions/entities-admin.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';
import { SELF_POINTER_KEY } from '../../netlify/functions/_shared/identity-repository.mjs';

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

function tasksMemoryStore() {
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

// Mirrors universal-links-admin.test.js's own "failingStore" fixture:
// a plain memory store with an injectable write failure, so a create's
// exact failure boundary can be simulated the same way the repository
// unit suite does.
function memoryStore() {
  const map = new Map();
  let failWhen = null;
  return {
    async get(key, options = {}) {
      void options;
      return map.has(key) ? map.get(key) : null;
    },
    async setJSON(key, value) {
      if (failWhen && failWhen(key)) {
        throw new Error('simulated write failure');
      }
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
    _failNextMatching(predicate) {
      failWhen = predicate;
    },
    _clearFailure() {
      failWhen = null;
    },
    _raw(key) {
      return map.get(key) ?? null;
    },
    _keys(prefix) {
      return [...map.keys()].filter(key => key.startsWith(prefix));
    }
  };
}

function baseDeps(store, overrides = {}) {
  return {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    identityNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => store,
    getTasksStore: async () => tasksMemoryStore(),
    ...overrides
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/entities/admin',
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

function entitiesRequest({ method = 'POST', url = 'https://api.adam-russell.com/api/entities', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

// --- Safety gate: same as every other operator-gated route ---

test('rejects an unauthenticated request with 401', async () => {
  const handler = createEntitiesAdminHandler(baseDeps(memoryStore()));
  const response = await handler(request({ cookie: false, body: { action: 'reconcile_self_identity' } }));
  assert.equal(response.status, 401);
});

test('rejects a disallowed origin', async () => {
  const handler = createEntitiesAdminHandler(baseDeps(memoryStore()));
  const response = await handler(request({ origin: 'https://evil.example.com', body: { action: 'reconcile_self_identity' } }));
  assert.equal(response.status, 403);
});

test('is POST only', async () => {
  const handler = createEntitiesAdminHandler(baseDeps(memoryStore()));
  const response = await handler(request({ method: 'GET' }));
  assert.equal(response.status, 405);
});

test('rejects an unsupported action', async () => {
  const handler = createEntitiesAdminHandler(baseDeps(memoryStore()));
  const response = await handler(request({ body: { action: 'delete_everything' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_action');
});

test('rejects a request body containing a forbidden access field (no client-supplied workflow/actor)', async () => {
  const handler = createEntitiesAdminHandler(baseDeps(memoryStore()));
  const response = await handler(request({ body: { action: 'reconcile_self_identity', workflow: 'life' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'access_field_not_accepted');
});

test('every response uses cache-control: no-store', async () => {
  const handler = createEntitiesAdminHandler(baseDeps(memoryStore()));
  const response = await handler(request({ body: { action: 'reconcile_self_identity' } }));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('repair_operation returns a non-disclosing 404, not 400, for a path-unsafe operation id (correction Job 4)', async () => {
  const store = memoryStore();
  const handler = createEntitiesAdminHandler(baseDeps(store));
  const response = await handler(request({ body: { action: 'repair_operation', operation_id: '../../etc/passwd' } }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'operation_not_found');
  assert.equal(store._keys('').length, 0, 'no storage access happened for a path-unsafe id');
});

test('repair_operation on an unknown (but valid-shaped) operation id returns a non-disclosing not found response', async () => {
  const handler = createEntitiesAdminHandler(baseDeps(memoryStore()));
  const response = await handler(request({ body: { action: 'repair_operation', operation_id: `op_${'0'.repeat(32)}` } }));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'operation_not_found');
});

test('the route is never reachable through the ordinary entities.mjs API (no new UI, no ordinary-workflow exposure)', async () => {
  const handler = createEntitiesHandler(baseDeps(memoryStore()));
  const response = await handler(entitiesRequest({ url: 'https://api.adam-russell.com/api/entities?ref=shared:person:x&action=repair_operation', method: 'PATCH', body: {} }));
  // entities.mjs's own action map has no "repair_operation" — it 400s the
  // same as any other unsupported action, proving the repair capability is
  // only reachable via this dedicated administration route.
  assert.equal(response.status, 400);
});

// --- Job 3 required integration tests ---

test('Job3 #1: create fails after the entity write; repair via HTTP returns the original entity id and no second identity exists', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const adminHandler = createEntitiesAdminHandler(deps);

  let failed = false;
  store._failNextMatching(key => {
    if (failed) return false;
    if (key.startsWith('entities/index/person/')) {
      failed = true;
      return true;
    }
    return false;
  });

  const createResponse = await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Seth Example' } }));
  assert.equal(createResponse.status, 503);
  const createBody = await createResponse.json();
  assert.equal(createBody.error.code, 'identity_write_incomplete');
  const { operation_id: operationId, entity_id: entityId } = createBody.data;
  store._clearFailure();

  const repairResponse = await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));
  assert.equal(repairResponse.status, 200);
  const repairBody = (await repairResponse.json()).data;
  assert.equal(repairBody.entity_id, entityId);
  assert.equal(repairBody.status, 'committed');
  assert.equal(repairBody.repaired, true);

  const getResponse = await entitiesHandler(entitiesRequest({ method: 'GET', url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(repairBody.ref)}` }));
  assert.equal(getResponse.status, 200);
  assert.equal((await getResponse.json()).data.display_name, 'Seth Example');

  const personKeys = store._keys('entities/person/');
  assert.equal(personKeys.length, 1, 'no second identity was created');
});

test('Job3 #2: create fails after the index write; repair via HTTP, then search finds the original identity', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const adminHandler = createEntitiesAdminHandler(deps);
  const searchHandler = createEntitySearchHandler(deps);

  store._failNextMatching(key => key.startsWith('entities/index/person/'));
  const createResponse = await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Seth Example' } }));
  const { operation_id: operationId, entity_id: entityId } = (await createResponse.json()).data;
  store._clearFailure();

  await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));

  const searchResponse = await searchHandler(new Request('https://api.adam-russell.com/api/entities/search?q=Seth', {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  }));
  assert.equal(searchResponse.status, 200);
  const searchBody = (await searchResponse.json()).data;
  assert.ok(searchBody.groups.person.some(result => result.ref.endsWith(entityId)), 'search finds the repaired identity');
});

test('Job3 #3: a lifecycle event write fails; repair via HTTP, then exactly one event exists', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const adminHandler = createEntitiesAdminHandler(deps);

  const created = (await (await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Seth Example' } }))).json()).data;

  store._failNextMatching(key => key.startsWith('entities/events/'));
  const archiveResponse = await entitiesHandler(entitiesRequest({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.ref)}&action=archive`,
    body: {}
  }));
  assert.equal(archiveResponse.status, 503);
  const operationId = (await archiveResponse.json()).data.operation_id;
  store._clearFailure();

  const repairResponse = await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));
  assert.equal(repairResponse.status, 200);
  assert.equal((await repairResponse.json()).data.status, 'committed');

  const eventKeys = store._keys('entities/events/');
  assert.equal(eventKeys.length, 1, 'exactly one lifecycle event was ever written');
});

test('Job3 #4: a deidentification index write fails; repair via HTTP, then the former label never appears', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const adminHandler = createEntitiesAdminHandler(deps);

  const created = (await (await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Seth Example', aliases: ['Sethy'] } }))).json()).data;

  store._failNextMatching(key => key.startsWith('entities/index/person/'));
  const deidentifyResponse = await entitiesHandler(entitiesRequest({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.ref)}&action=deidentify`,
    body: {}
  }));
  assert.equal(deidentifyResponse.status, 503);
  const operationId = (await deidentifyResponse.json()).data.operation_id;
  store._clearFailure();

  const repairResponse = await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));
  assert.equal(repairResponse.status, 200);
  const serializedRepair = JSON.stringify(await repairResponse.json());
  assert.doesNotMatch(serializedRepair, /Seth Example|Sethy/);

  const getResponse = await entitiesHandler(entitiesRequest({ method: 'GET', url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.ref)}` }));
  const serializedGet = JSON.stringify(await getResponse.json());
  assert.doesNotMatch(serializedGet, /Seth Example|Sethy/);
});

test('Job3 #5: unauthenticated, wrong origin, malformed id, unknown operation, and normal-workflow requests all fail safely', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const adminHandler = createEntitiesAdminHandler(deps);

  const unauth = await adminHandler(request({ cookie: false, body: { action: 'repair_operation', operation_id: `op_${'1'.repeat(32)}` } }));
  assert.equal(unauth.status, 401);

  const wrongOrigin = await adminHandler(request({ origin: 'https://evil.example.com', body: { action: 'repair_operation', operation_id: `op_${'1'.repeat(32)}` } }));
  assert.equal(wrongOrigin.status, 403);

  const malformed = await adminHandler(request({ body: { action: 'repair_operation', operation_id: 'not-an-operation-id' } }));
  assert.equal(malformed.status, 404);
  assert.equal((await malformed.json()).error.code, 'operation_not_found');

  const unknown = await adminHandler(request({ body: { action: 'repair_operation', operation_id: `op_${'2'.repeat(32)}` } }));
  assert.equal(unknown.status, 404);

  // "Normal workflow" — the ordinary entities.mjs PATCH surface has no
  // repair action at all, so a caller attempting the same repair through
  // the normal Life API path (rather than this administration route) is
  // rejected as an unsupported action, never silently repairing anything.
  const created = (await (await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Normal Workflow Person' } }))).json()).data;
  const normalWorkflowAttempt = await entitiesHandler(entitiesRequest({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.ref)}&action=repair_operation`,
    body: { operation_id: `op_${'1'.repeat(32)}` }
  }));
  assert.equal(normalWorkflowAttempt.status, 400);
  assert.equal((await normalWorkflowAttempt.json()).error.code, 'invalid_action');
});

test('Job3 #6: repeating a successful repair returns the same committed result (idempotent)', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const adminHandler = createEntitiesAdminHandler(deps);

  store._failNextMatching(key => key.startsWith('entities/index/person/'));
  const createResponse = await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Seth Example' } }));
  const { operation_id: operationId, entity_id: entityId } = (await createResponse.json()).data;
  store._clearFailure();

  const first = await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));
  const firstBody = (await first.json()).data;
  assert.equal(firstBody.repaired, true);
  assert.equal(firstBody.entity_id, entityId);

  const second = await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));
  const secondBody = (await second.json()).data;
  assert.equal(second.status, 200);
  assert.equal(secondBody.repaired, false);
  assert.equal(secondBody.status, 'committed');
  assert.equal(secondBody.entity_id, entityId);
});

test('reconcile_self_identity is reachable through the administration route and reports a consistent single self', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const adminHandler = createEntitiesAdminHandler(deps);

  const created = (await (await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Adam Russell', is_self: true } }))).json()).data;

  const response = await adminHandler(request({ body: { action: 'reconcile_self_identity' } }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.equal(body.status, 'consistent');
  assert.equal(body.person_id, created.id);
});

// --- Job 1 (round 4 correction): the confirmed defect — a malformed
// stored self-pointer made `inspectSelfPointer` pass unsafe content
// straight to `personKey`/`identityOperationKey`, which threw a 400
// before `reconcileSelfIdentity` could ever return a normal response,
// leaving the administration reconciliation route unable to repair the
// exact state it exists to repair ---

test('reconcile_self_identity returns 200 (not 400) for a stored pointer with a path-unsafe person_id, and clears it', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const adminHandler = createEntitiesAdminHandler(deps);

  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: '../../escape',
    operation_id: 'op_11111111111111111111111111111111'
  });

  const response = await adminHandler(request({ body: { action: 'reconcile_self_identity' } }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.equal(body.status, 'reconciled');
  assert.equal(body.person_id, null);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

test('reconcile_self_identity returns 200 (not 400) for a stored pointer with a valid person_id and a path-unsafe operation_id', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const adminHandler = createEntitiesAdminHandler(deps);

  await store.setJSON(SELF_POINTER_KEY, {
    schema_version: 2,
    person_id: 'person_00000000-0000-4000-8000-000000000000',
    operation_id: '../../escape'
  });

  const response = await adminHandler(request({ body: { action: 'reconcile_self_identity' } }));
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.equal(body.status, 'reconciled');
  assert.equal(body.person_id, null);
  assert.equal(store._raw(SELF_POINTER_KEY).person_id, null);
});

// --- Job 3 (round 3 correction): the route must build and pass a
// server-derived administration AccessContext into both repository calls,
// and the repository must itself require and enforce it ---

test('Job3 #7: the HTTP handler passes a server-derived administration access context into both repository calls', async () => {
  const store = memoryStore();
  const calls = [];
  const fakeRepo = {
    async repairIdentityOperation(operationId, accessContext) {
      calls.push({ method: 'repairIdentityOperation', operationId, accessContext });
      return { operation_id: operationId, entity_id: 'person_x', status: 'committed', repaired: false };
    },
    async reconcileSelfIdentity(accessContext) {
      calls.push({ method: 'reconcileSelfIdentity', accessContext });
      return { status: 'consistent', person_id: null };
    }
  };
  const deps = baseDeps(store, { createIdentityRepository: () => fakeRepo });
  const adminHandler = createEntitiesAdminHandler(deps);

  const operationId = `op_${'3'.repeat(32)}`;
  await adminHandler(request({ body: { action: 'repair_operation', operation_id: operationId } }));
  await adminHandler(request({ body: { action: 'reconcile_self_identity' } }));

  const expectedContext = { actor: 'operator', workflow: 'administration', allowed_visibility: ['operator'], allowed_entity_kinds: [] };
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'repairIdentityOperation');
  assert.equal(calls[0].operationId, operationId);
  assert.deepEqual(calls[0].accessContext, expectedContext);
  assert.equal(calls[1].method, 'reconcileSelfIdentity');
  assert.deepEqual(calls[1].accessContext, expectedContext);
});

test('Job3 #8: the ordinary entities.mjs route rejects reconcile_self_identity too, not only repair_operation', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entitiesHandler = createEntitiesHandler(deps);
  const created = (await (await entitiesHandler(entitiesRequest({ body: { kind: 'person', display_name: 'Normal Workflow Person' } }))).json()).data;

  const response = await entitiesHandler(entitiesRequest({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(created.ref)}&action=reconcile_self_identity`,
    body: {}
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_action');
});

test('Job3: a repository call that somehow reached without an administration context (e.g. a future caller bug) is rejected with 403, never treated as authorised by the route name alone', async () => {
  // This exercises the real (non-fake) repository directly through the
  // route's own dependency-injection seam, confirming the enforcement
  // lives in identity-repository.mjs itself — not something the route
  // could accidentally bypass by, say, forgetting to build the context.
  const store = memoryStore();
  const deps = baseDeps(store);
  const repo = deps.createIdentityRepository
    ? deps.createIdentityRepository({ store })
    : (await import('../../netlify/functions/_shared/identity-repository.mjs')).createIdentityRepository({ store });
  await assert.rejects(
    repo.reconcileSelfIdentity(),
    error => error.status === 403 && error.code === 'administration_required'
  );
  await assert.rejects(
    repo.repairIdentityOperation(`op_${'4'.repeat(32)}`, { workflow: 'life' }),
    error => error.status === 403 && error.code === 'administration_required'
  );
});
