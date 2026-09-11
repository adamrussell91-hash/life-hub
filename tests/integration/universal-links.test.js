import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
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
  url = 'https://api.adam-russell.com/api/universal-links',
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

test('rejects an unauthenticated request with 401', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/universal-links?id=ul_x' }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

test('rejects a disallowed origin', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/universal-links?id=ul_x' }));
  assert.equal(response.status, 403);
});

test('every response uses cache-control: no-store', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/universal-links?id=ul_x' }));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects an unsupported method', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ method: 'PUT', url: 'https://api.adam-russell.com/api/universal-links?id=ul_x' }));
  assert.equal(response.status, 405);
});

test('DELETE is not exposed: returns the standard method-not-allowed response', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ method: 'DELETE', url: 'https://api.adam-russell.com/api/universal-links?id=ul_x' }));
  assert.equal(response.status, 405);
  const body = await response.json();
  assert.equal(body.error.code, 'method_not_allowed');
});

test('GET with no selector is rejected', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/universal-links' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'missing_selector');
});

test('GET with more than one selector is rejected as ambiguous', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/universal-links?id=ul_x&source_ref=tasks:task:task_1' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'ambiguous_selector');
});

test('POST creates a link and a repeat POST reports created: false', async () => {
  const store = memoryStore();
  const deps = baseDeps({ getContentStore: async () => store });
  const handler = createUniversalLinksHandler(deps);
  const body = { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'collaborator' };

  const first = await handler(request({ method: 'POST', body }));
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.data.created, true);
  const linkId = firstBody.data.link.id;

  const second = await handler(request({ method: 'POST', body }));
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.data.created, false);
  assert.equal(secondBody.data.link.id, linkId);
});

test('POST rejects a request body containing a forbidden access field', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const body = { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'collaborator', workflow: 'administration' };
  const response = await handler(request({ method: 'POST', body }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'access_field_not_accepted');
});

test('POST rejects an unknown relationship type with a structured error', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const body = { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'made_up' };
  const response = await handler(request({ method: 'POST', body }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'unknown_relationship_key');
});

test('GET by id, source_ref, target_ref, and entity_ref all resolve through the created link', async () => {
  const store = memoryStore();
  const deps = baseDeps({ getContentStore: async () => store });
  const handler = createUniversalLinksHandler(deps);
  const body = { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'collaborator' };
  const created = await (await handler(request({ method: 'POST', body }))).json();
  const linkId = created.data.link.id;

  const byId = await handler(request({ url: `https://api.adam-russell.com/api/universal-links?id=${linkId}` }));
  assert.equal(byId.status, 200);
  assert.equal((await byId.json()).data.link.id, linkId);

  const bySource = await handler(request({ url: `https://api.adam-russell.com/api/universal-links?source_ref=${encodeURIComponent(TASK_REF)}` }));
  assert.equal((await bySource.json()).data.links.length, 1);

  const byTarget = await handler(request({ url: `https://api.adam-russell.com/api/universal-links?target_ref=${encodeURIComponent(PERSON_REF)}` }));
  assert.equal((await byTarget.json()).data.links.length, 1);

  const byEntity = await handler(request({ url: `https://api.adam-russell.com/api/universal-links?entity_ref=${encodeURIComponent(TASK_REF)}` }));
  const entityBody = (await byEntity.json()).data;
  assert.equal(entityBody.outgoing.length, 1);
  assert.equal(entityBody.incoming.length, 0);
});

test('PATCH action=end ends a period link', async () => {
  const store = memoryStore();
  const deps = baseDeps({ getContentStore: async () => store });
  const handler = createUniversalLinksHandler(deps);
  const body = { source_ref: PERSON_REF, target_ref: 'shared:organisation:organisation_unsw', relationship_type: 'employee_at', valid_from: '2025-01-01T00:00:00.000Z' };
  const orgResolver = async refInput => {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    if (ref === 'shared:organisation:organisation_unsw') return { ref, kind: 'organisation', display_label: 'UNSW', supporting_label: null, href: null, lifecycle_status: 'active', visibility: 'operator' };
    return fakeResolveEntity(refInput);
  };
  const orgHandler = createUniversalLinksHandler(baseDeps({ getContentStore: async () => store, resolveEntity: orgResolver }));
  const created = await (await orgHandler(request({ method: 'POST', body }))).json();
  const linkId = created.data.link.id;

  const ended = await orgHandler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/universal-links?id=${linkId}&action=end`,
    body: { valid_to: '2026-06-01T00:00:00.000Z' }
  }));
  assert.equal(ended.status, 200);
  assert.equal((await ended.json()).data.link.status, 'ended');
});

test('PATCH action=suppress requires the administration workflow, applied server-side regardless of the caller', async () => {
  const store = memoryStore();
  const deps = baseDeps({ getContentStore: async () => store });
  const handler = createUniversalLinksHandler(deps);
  const body = { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'collaborator' };
  const created = await (await handler(request({ method: 'POST', body }))).json();
  const linkId = created.data.link.id;

  const suppressed = await handler(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/universal-links?id=${linkId}&action=suppress`,
    body: { reason: 'operator_requested' }
  }));
  assert.equal(suppressed.status, 200);
  assert.equal((await suppressed.json()).data.link.status, 'suppressed');

  // Now hidden from ordinary reads.
  const afterSuppress = await handler(request({ url: `https://api.adam-russell.com/api/universal-links?id=${linkId}` }));
  assert.equal(afterSuppress.status, 404);
});

test('PATCH with a missing id is rejected', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ method: 'PATCH', url: 'https://api.adam-russell.com/api/universal-links?action=end', body: { valid_to: '2026-01-01T00:00:00.000Z' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'missing_id');
});

test('PATCH with an unsupported action is rejected', async () => {
  const handler = createUniversalLinksHandler(baseDeps());
  const response = await handler(request({ method: 'PATCH', url: 'https://api.adam-russell.com/api/universal-links?id=ul_x&action=delete', body: {} }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_action');
});

test('a failure injected at the source membership write returns link_write_incomplete over HTTP with safe identifiers only', async () => {
  const map = new Map();
  let failed = false;
  const store = {
    async get(key, options = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      if (!failed && key.startsWith('universal-links/by-source/')) {
        failed = true;
        throw new Error('simulated');
      }
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
  const handler = createUniversalLinksHandler(baseDeps({ getContentStore: async () => store }));
  const body = { source_ref: TASK_REF, target_ref: PERSON_REF, relationship_type: 'collaborator' };
  const response = await handler(request({ method: 'POST', body }));
  assert.equal(response.status, 503);
  const parsed = await response.json();
  assert.equal(parsed.error.code, 'link_write_incomplete');
  assert.equal(typeof parsed.data.operation_id, 'string');
  assert.equal(typeof parsed.data.link_id, 'string');
  const serialized = JSON.stringify(parsed);
  assert.doesNotMatch(serialized, /Seth|display_label/i);
});
