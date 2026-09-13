import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { config as writeConfig, createStudentReferencesHandler } from '../../netlify/functions/student-references.mjs';
import { config as searchConfig, createStudentReferenceSearchHandler } from '../../netlify/functions/student-reference-search.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';
import { resolveEntity } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';

const SECRET = 's'.repeat(32);
const NOW = '2026-09-13T00:00:00.000Z';
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse(NOW),
  randomBytes: () => Buffer.alloc(16, 8)
}, SECRET).token;

function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async delete(key) { map.delete(key); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

function request(path, { body, cookie = true, origin = env.SITE_ORIGIN, method = 'POST' } = {}) {
  return new Request(`https://api.adam-russell.com${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

function deps(store, ids = []) {
  return {
    env,
    now: () => Date.parse('2026-09-13T01:00:00.000Z'),
    repositoryNow: () => NOW,
    getContentStore: async () => store,
    generateStudentReferenceId: () => ids.shift()
  };
}

async function post(handler, body) {
  return handler(request('/api/teaching/student-references', { body }));
}

test('declares platform rate limits for protected writes and search', () => {
  assert.equal(writeConfig.rateLimit.action, 'rate_limit');
  assert.equal(searchConfig.rateLimit.action, 'rate_limit');
  assert.deepEqual(writeConfig.rateLimit.aggregateBy, ['ip', 'domain']);
  assert.deepEqual(searchConfig.rateLimit.aggregateBy, ['ip', 'domain']);
});

test('requires an authenticated allowed-origin Teaching session and never permits GET', async () => {
  const store = memoryStore();
  const handler = createStudentReferencesHandler(deps(store));
  assert.equal((await handler(request('/api/teaching/student-references', { body: { action: 'create', initials: 'AR' }, cookie: false }))).status, 401);
  assert.equal((await handler(request('/api/teaching/student-references', { body: { action: 'create', initials: 'AR' }, origin: 'https://evil.example' }))).status, 403);
  const get = await handler(request('/api/teaching/student-references', { method: 'GET' }));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('cache-control'), 'no-store');
});

test('creates duplicate initials with neutral suffixes and stores no full identity', async () => {
  const store = memoryStore();
  const ids = [
    'student_ref_00000000-0000-4000-8000-000000000001',
    'student_ref_00000000-0000-4000-8000-000000000002'
  ];
  const handler = createStudentReferencesHandler(deps(store, ids));
  const first = await (await post(handler, { action: 'create', initials: 'AR' })).json();
  const second = await (await post(handler, { action: 'create', initials: 'AR' })).json();
  assert.equal(first.data.display_code, 'AR');
  assert.equal(second.data.display_code, 'AR2');
  assert.doesNotMatch(JSON.stringify([...store.map.values()]), /full_name|email|student_number|date_of_birth/i);
});

test('supports approved context membership and status-only permission tracking', async () => {
  const store = memoryStore();
  const id = 'student_ref_00000000-0000-4000-8000-000000000003';
  const handler = createStudentReferencesHandler(deps(store, [id]));
  await post(handler, { action: 'create', initials: 'ST' });
  assert.equal((await post(handler, {
    action: 'assign',
    student_ref_id: id,
    context_type: 'excursion',
    context_id: 'EXCURSION_SYNTHETIC_1',
    permission_status: 'pending'
  })).status, 200);
  const permission = await post(handler, {
    action: 'set_permission',
    student_ref_id: id,
    context_type: 'excursion',
    context_id: 'EXCURSION_SYNTHETIC_1',
    permission_status: 'approved'
  });
  assert.equal((await permission.json()).data.permission_status, 'approved');
  const forbidden = await post(handler, {
    action: 'set_permission',
    student_ref_id: id,
    context_type: 'excursion',
    context_id: 'EXCURSION_SYNTHETIC_1',
    permission_status: 'approved',
    permission_form: 'payload'
  });
  assert.equal(forbidden.status, 400);
  assert.equal((await forbidden.json()).error.code, 'field_not_permitted');
});

test('protected search requires server-derived context, remains POST-only and hides archived references', async () => {
  const store = memoryStore();
  const id = 'student_ref_00000000-0000-4000-8000-000000000004';
  const write = createStudentReferencesHandler(deps(store, [id]));
  const search = createStudentReferenceSearchHandler(deps(store));
  await post(write, { action: 'create', initials: 'SA' });
  await post(write, { action: 'assign', student_ref_id: id, context_type: 'class', context_id: 'CLASS_SYNTHETIC_1' });

  const found = await search(request('/api/teaching/student-references/search', {
    body: { context_type: 'class', context_id: 'CLASS_SYNTHETIC_1', query: 'S' }
  }));
  assert.equal(found.status, 200);
  assert.equal(found.headers.get('cache-control'), 'no-store');
  assert.equal((await found.json()).data.results[0].display_code, 'SA');

  await post(write, { action: 'archive', student_ref_id: id });
  const hidden = await search(request('/api/teaching/student-references/search', {
    body: { context_type: 'class', context_id: 'CLASS_SYNTHETIC_1', query: '' }
  }));
  assert.deepEqual((await hidden.json()).data.results, []);
  assert.equal((await search(request('/api/teaching/student-references/search', { method: 'GET' }))).status, 405);
});

test('deletion removes the record and memberships and leaves a non-identifying tombstone', async () => {
  const store = memoryStore();
  const id = 'student_ref_00000000-0000-4000-8000-000000000005';
  const handler = createStudentReferencesHandler(deps(store, [id]));
  await post(handler, { action: 'create', initials: 'DE' });
  await post(handler, { action: 'assign', student_ref_id: id, context_type: 'coaching', context_id: 'COACHING_SYNTHETIC_1' });
  const premature = await post(handler, { action: 'delete', student_ref_id: id });
  assert.equal(premature.status, 409);
  await post(handler, { action: 'archive', student_ref_id: id });
  const response = await post(handler, { action: 'delete', student_ref_id: id });
  assert.equal(response.status, 200);
  const serialised = JSON.stringify([...store.map.values()]);
  assert.doesNotMatch(serialised, /"display_code":"DE"/);
  assert.match(serialised, /student_reference_tombstone/);
});

test('generic search and the generic resolver do not expose StudentReference', async () => {
  const teaching = createAccessContext({ workflow: 'teaching', allowedEntityKinds: ['student_reference'] });
  await assert.rejects(
    resolveEntity('teaching:student_reference:student_ref_00000000-0000-4000-8000-000000000006', teaching),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );

  const genericStore = memoryStore();
  const handler = createEntitySearchHandler({
    env,
    now: () => Date.parse('2026-09-13T01:00:00.000Z'),
    getContentStore: async () => genericStore,
    getTasksStore: async () => memoryStore()
  });
  const response = await handler(request('/api/entities/search?q=ST&kinds=student_reference', { method: 'GET' }));
  assert.equal(response.status, 400);
  assert.doesNotMatch(JSON.stringify(await response.json()), /STUDENT_A1/);
});
