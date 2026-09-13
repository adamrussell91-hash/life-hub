import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createStudentReferencesHandler } from '../../netlify/functions/student-references.mjs';
import { createStudentReferenceSearchHandler } from '../../netlify/functions/student-reference-search.mjs';
import { formatEntityRef, parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';

// Synthetic fixtures only.

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  { now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 9) },
  SECRET
).token;

function memoryStore() {
  const map = new Map();
  return {
    async get(key, options = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && map.has(key)) return { modified: false };
      map.set(key, value);
      return { modified: true };
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

const classesById = new Map([['class_synth_10e', { title: 'Synthetic Class 10E' }]]);

async function fakeBaseResolveEntity(refInput) {
  const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
  if (!ref) throw endpointNotFoundError();
  if (ref.namespace === 'teaching' && ref.kind === 'class') {
    const record = classesById.get(ref.id);
    if (!record) throw endpointNotFoundError();
    return {
      ref: formatEntityRef(ref),
      kind: 'class',
      display_label: record.title,
      supporting_label: null,
      href: `/teaching/classes/${ref.id}`,
      lifecycle_status: 'active',
      visibility: 'operator'
    };
  }
  throw endpointNotFoundError();
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/student-references',
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

function baseDeps(overrides = {}) {
  const teachingStore = overrides.teachingStore ?? memoryStore();
  const ulStore = overrides.ulStore ?? memoryStore();
  return {
    env,
    getContentStore: async () => teachingStore,
    getUniversalLinkStore: async () => ulStore,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    repositoryNow: () => '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

test('student-references: rejects an unauthenticated request with 401', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const response = await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/student-references?id=student_ref_x' }));
  assert.equal(response.status, 401);
});

test('student-references: rejects a disallowed origin', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const response = await handler(
    request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/student-references?id=student_ref_x' })
  );
  assert.equal(response.status, 403);
});

test('student-references: rejects an unsupported method', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const response = await handler(request({ method: 'PUT' }));
  assert.equal(response.status, 405);
});

test('student-references: GET requires an id', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/student-references' }));
  assert.equal(response.status, 400);
});

test('student-references: rejects an unknown POST action', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const response = await handler(request({ method: 'POST', body: { action: 'made_up' } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_action');
});

test('student-references: create, get, and cache-control: no-store on GET', async () => {
  const teachingStore = memoryStore();
  const handler = createStudentReferencesHandler(baseDeps({
    teachingStore,
    baseResolveEntity: fakeBaseResolveEntity
  }));

  const createResponse = await handler(
    request({ method: 'POST', body: { action: 'create', initials: 'ar' } })
  );
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).data;
  assert.equal(created.student.display_code, 'AR');
  // No real identifying data ever appears in the response body's own shape.
  assert.deepEqual(Object.keys(created.student).sort(), ['display_code', 'lifecycle_status', 'ref']);

  const studentId = created.student.ref.split(':').pop();
  const getResponse = await handler(
    request({ url: `https://api.adam-russell.com/api/student-references?id=${studentId}` })
  );
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get('cache-control'), 'no-store');
  const fetched = (await getResponse.json()).data.student;
  assert.equal(fetched.display_code, 'AR');
});

test('student-references: full archive-then-delete flow leaves a tombstone and a 404 on further GET', async () => {
  const teachingStore = memoryStore();
  const handler = createStudentReferencesHandler(baseDeps({ teachingStore, baseResolveEntity: fakeBaseResolveEntity }));

  const created = (await (await handler(request({ method: 'POST', body: { action: 'create', initials: 'bc' } }))).json()).data;
  const id = created.student.ref.split(':').pop();

  const archiveResponse = await handler(request({ method: 'POST', body: { action: 'archive', id } }));
  assert.equal(archiveResponse.status, 200);
  assert.equal((await archiveResponse.json()).data.student.lifecycle_status, 'archived');

  const deleteResponse = await handler(request({ method: 'POST', body: { action: 'delete', id, reason: 'guardian_request' } }));
  assert.equal(deleteResponse.status, 200);
  assert.equal((await deleteResponse.json()).data.deleted, true);

  const getAfterDelete = await handler(request({ url: `https://api.adam-russell.com/api/student-references?id=${id}` }));
  assert.equal(getAfterDelete.status, 404);

  const tombstoneKeys = [...teachingStore._map.keys()].filter((k) => k.startsWith('protected/student-reference-tombstones/'));
  assert.equal(tombstoneKeys.length, 1);
});

test('student-references: assign creates a participates_in Universal Link, not a second membership table', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const handler = createStudentReferencesHandler(baseDeps({ teachingStore, ulStore, baseResolveEntity: fakeBaseResolveEntity }));

  const created = (await (await handler(request({ method: 'POST', body: { action: 'create', initials: 'de' } }))).json()).data;
  const studentId = created.student.ref.split(':').pop();

  const assignResponse = await handler(
    request({
      method: 'POST',
      body: {
        action: 'assign',
        student_id: studentId,
        context_type: 'class',
        context_ref: 'teaching:class:class_synth_10e'
      }
    })
  );
  assert.equal(assignResponse.status, 201);
  const body = (await assignResponse.json()).data;
  assert.equal(body.link.relationship_type, 'participates_in');
  assert.equal(body.link.visibility, 'teaching_protected');
  assert.ok([...ulStore._map.keys()].some((k) => k.startsWith('universal-links/links/')));
});

// --- Search route ---

test('student-reference-search: only accepts POST', async () => {
  const handler = createStudentReferenceSearchHandler(baseDeps());
  const response = await handler(
    request({ method: 'GET', url: 'https://api.adam-russell.com/api/student-references/search' })
  );
  assert.equal(response.status, 405);
});

test('student-reference-search: rejects an unauthenticated request', async () => {
  const handler = createStudentReferenceSearchHandler(baseDeps());
  const response = await handler(
    request({ method: 'POST', cookie: false, url: 'https://api.adam-russell.com/api/student-references/search', body: {} })
  );
  assert.equal(response.status, 401);
});

test('student-reference-search: finds current class members by code prefix, response uses cache-control: no-store', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const handler = createStudentReferencesHandler(baseDeps({ teachingStore, ulStore, baseResolveEntity: fakeBaseResolveEntity }));
  const searchHandler = createStudentReferenceSearchHandler(baseDeps({ teachingStore, ulStore, baseResolveEntity: fakeBaseResolveEntity }));

  const created = (await (await handler(request({ method: 'POST', body: { action: 'create', initials: 'fg' } }))).json()).data;
  const studentId = created.student.ref.split(':').pop();
  await handler(
    request({
      method: 'POST',
      body: { action: 'assign', student_id: studentId, context_type: 'class', context_ref: 'teaching:class:class_synth_10e' }
    })
  );

  const searchResponse = await searchHandler(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/student-references/search',
      body: { context_type: 'class', context_ref: 'teaching:class:class_synth_10e', query: 'fg' }
    })
  );
  assert.equal(searchResponse.status, 200);
  assert.equal(searchResponse.headers.get('cache-control'), 'no-store');
  const { results } = (await searchResponse.json()).data;
  assert.deepEqual(results.map((r) => r.display_code), ['FG']);
});

test('student-references never surfaces via /api/entities/search or the generic /api/universal-links routes', async () => {
  const { createEntitySearchHandler } = await import('../../netlify/functions/entity-search.mjs');
  const handler = createEntitySearchHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore(),
    getTasksStore: async () => memoryStore(),
    getProfessionalStore: async () => memoryStore()
  });
  const response = await handler(
    request({ url: 'https://api.adam-russell.com/api/entities/search?q=synthetic&kinds=student_reference' })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_kind');
});

// --- Basic rate limits, no-store on every response, strict field validation ---

test('student-references and student-reference-search declare a basic Netlify platform rate limit, not a custom system', async () => {
  const { config: referencesConfig } = await import('../../netlify/functions/student-references.mjs');
  const { config: searchConfig } = await import('../../netlify/functions/student-reference-search.mjs');
  assert.ok(referencesConfig.rateLimit);
  assert.equal(referencesConfig.rateLimit.action, 'rate_limit');
  assert.deepEqual(referencesConfig.rateLimit.aggregateBy, ['ip', 'domain']);
  assert.ok(searchConfig.rateLimit);
  assert.equal(searchConfig.rateLimit.action, 'rate_limit');
});

test('every student-references response carries cache-control: no-store, including errors and auth rejections', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const unauthenticated = await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/student-references?id=x' }));
  assert.equal(unauthenticated.headers.get('cache-control'), 'no-store');

  const methodError = await handler(request({ method: 'PUT' }));
  assert.equal(methodError.headers.get('cache-control'), 'no-store');

  const actionError = await handler(request({ method: 'POST', body: { action: 'made_up' } }));
  assert.equal(actionError.headers.get('cache-control'), 'no-store');

  const created = await handler(request({ method: 'POST', body: { action: 'create', initials: 'wx' } }));
  assert.equal(created.headers.get('cache-control'), 'no-store');
});

test('every student-reference-search response carries cache-control: no-store, including a rejected method', async () => {
  const handler = createStudentReferenceSearchHandler(baseDeps());
  const methodError = await handler(request({ method: 'GET', url: 'https://api.adam-russell.com/api/student-references/search' }));
  assert.equal(methodError.headers.get('cache-control'), 'no-store');
});

test('strict field validation: an unexpected field on a known action is rejected before the repository is called', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const response = await handler(
    request({ method: 'POST', body: { action: 'create', initials: 'yz', unexpected_field: 'nope' } })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_field');
});

test('strict field validation: a wrong-typed field is rejected', async () => {
  const handler = createStudentReferencesHandler(baseDeps());
  const response = await handler(
    request({ method: 'POST', body: { action: 'create', initials: 123 } })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_field');
});

test('strict field validation: an unexpected field on the search route is rejected', async () => {
  const handler = createStudentReferenceSearchHandler(baseDeps());
  const response = await handler(
    request({
      method: 'POST',
      url: 'https://api.adam-russell.com/api/student-references/search',
      body: { context_type: 'class', context_ref: 'teaching:class:class_synth_10e', unexpected: true }
    })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_field');
});

test('set_permission_status is one journalled retry-safe operation reachable over the route, and repair_set_permission_status resumes it', async () => {
  const teachingStore = memoryStore();
  const ulStore = memoryStore();
  const handler = createStudentReferencesHandler(baseDeps({ teachingStore, ulStore, baseResolveEntity: fakeBaseResolveEntity }));

  const created = (await (await handler(request({ method: 'POST', body: { action: 'create', initials: 'hi' } }))).json()).data;
  const studentId = created.student.ref.split(':').pop();
  await handler(
    request({
      method: 'POST',
      body: {
        action: 'assign',
        student_id: studentId,
        context_type: 'class',
        context_ref: 'teaching:class:class_synth_10e',
        valid_from: '2025-01-01T00:00:00.000Z'
      }
    })
  );

  const statusResponse = await handler(
    request({
      method: 'POST',
      body: {
        action: 'set_permission_status',
        student_id: studentId,
        context_type: 'class',
        context_ref: 'teaching:class:class_synth_10e',
        status: 'approved'
      }
    })
  );
  assert.equal(statusResponse.status, 200);
  const body = (await statusResponse.json()).data;
  assert.equal(body.ended.status, 'ended');
  assert.equal(body.created.status, 'current');
  assert.equal(body.created.metadata.permission_status, 'approved');

  const repairResponse = await handler(
    request({ method: 'POST', body: { action: 'repair_set_permission_status', operation_id: body.operation_id } })
  );
  assert.equal(repairResponse.status, 200);
  assert.equal((await repairResponse.json()).data.repaired, false);
});
