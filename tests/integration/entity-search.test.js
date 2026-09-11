import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitiesHandler } from '../../netlify/functions/entities.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';

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

function baseDeps(store, overrides = {}) {
  return {
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    identityNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => store,
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

async function seed(store) {
  const entities = createEntitiesHandler(baseDeps(store));
  const seth = await (await entities(request({
    url: 'https://api.adam-russell.com/api/entities',
    method: 'POST',
    body: { kind: 'person', display_name: 'Seth Example', sort_name: 'Example, Seth' }
  }))).json();
  const sarah = await (await entities(request({
    url: 'https://api.adam-russell.com/api/entities',
    method: 'POST',
    body: { kind: 'person', display_name: 'Sarah Example' }
  }))).json();
  const unsw = await (await entities(request({
    url: 'https://api.adam-russell.com/api/entities',
    method: 'POST',
    body: { kind: 'organisation', display_name: 'Example University' }
  }))).json();
  return { entities, seth: seth.data, sarah: sarah.data, unsw: unsw.data };
}

test('rejects an unauthenticated request with 401', async () => {
  const store = memoryStore();
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await handler(request({ cookie: false, url: 'https://api.adam-russell.com/api/entities/search?q=se' }));
  assert.equal(response.status, 401);
});

test('rejects a disallowed origin', async () => {
  const store = memoryStore();
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await handler(request({ origin: 'https://evil.example.com', url: 'https://api.adam-russell.com/api/entities/search?q=se' }));
  assert.equal(response.status, 403);
});

test('rejects an unsupported method', async () => {
  const store = memoryStore();
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await handler(request({ method: 'POST', url: 'https://api.adam-russell.com/api/entities/search?q=se', body: {} }));
  assert.equal(response.status, 405);
});

test('rejects a query shorter than 2 or longer than 100 characters', async () => {
  const store = memoryStore();
  const handler = createEntitySearchHandler(baseDeps(store));
  const short = await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=s' }));
  assert.equal(short.status, 400);
  const long = await handler(request({ url: `https://api.adam-russell.com/api/entities/search?q=${'a'.repeat(101)}` }));
  assert.equal(long.status, 400);
});

test('every response uses cache-control: no-store', async () => {
  const store = memoryStore();
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=se' }));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('groups results by kind and sorts exact prefix matches before token matches', async () => {
  const store = memoryStore();
  const { seth, sarah, unsw } = await seed(store);
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Ex' }));
  const body = (await response.json()).data;
  assert.ok(Array.isArray(body.groups.person));
  assert.ok(Array.isArray(body.groups.organisation));
  // Both "Example University" and "Seth/Sarah Example" have a token that
  // starts with "Ex" (the sort_name "Example, Seth" or the surname
  // "Example") — but only "Example University" has "Ex" as an exact
  // display-label PREFIX, so it must rank first among its own kind.
  assert.equal(body.groups.organisation[0].ref, unsw.ref);
  const personRefs = body.groups.person.map(r => r.ref).sort();
  assert.deepEqual(personRefs, [seth.ref, sarah.ref].sort());
});

test('matches against sort_name as well as display_name', async () => {
  const store = memoryStore();
  const { seth } = await seed(store);
  const handler = createEntitySearchHandler(baseDeps(store));
  // "Example, Seth" is Seth's sort_name — a prefix match on "Example".
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Example' }));
  const body = (await response.json()).data;
  assert.ok(body.groups.person.some(r => r.ref === seth.ref));
});

test('excludes archived entities by default and includes them with include_archived=true', async () => {
  const store = memoryStore();
  const { entities, seth } = await seed(store);
  await entities(request({
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(seth.ref)}&action=archive`,
    method: 'PATCH',
    body: {}
  }));

  const search = createEntitySearchHandler(baseDeps(store));
  const ordinary = await (await search(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Seth' }))).json();
  assert.equal(ordinary.data.groups.person.length, 0);

  const archiveSearch = await (await search(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Seth&include_archived=true' }))).json();
  assert.equal(archiveSearch.data.groups.person.length, 1);
  assert.equal(archiveSearch.data.groups.person[0].lifecycle_status, 'archived');
});

test('excludes inactive entities even with include_archived=true', async () => {
  const store = memoryStore();
  const { entities, seth } = await seed(store);
  await entities(request({
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(seth.ref)}&action=deactivate`,
    method: 'PATCH',
    body: {}
  }));
  const search = createEntitySearchHandler(baseDeps(store));
  const response = await (await search(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Seth&include_archived=true' }))).json();
  assert.equal(response.data.groups.person.length, 0);
});

test('kinds param filters which kinds are searched', async () => {
  const store = memoryStore();
  await seed(store);
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await (await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Ex&kinds=organisation' }))).json();
  assert.equal(response.data.groups.person.length, 0);
  assert.equal(response.data.groups.organisation.length, 1);
});

test('caps combined results at 20', async () => {
  const store = memoryStore();
  const entities = createEntitiesHandler(baseDeps(store));
  for (let i = 0; i < 25; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await entities(request({
      url: 'https://api.adam-russell.com/api/entities',
      method: 'POST',
      body: { kind: 'person', display_name: `Search Target ${i}` }
    }));
  }
  const search = createEntitySearchHandler(baseDeps(store));
  const response = await (await search(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Search' }))).json();
  assert.equal(response.data.groups.person.length, 20);
});

test('never returns a StudentReference kind (none registered, no such index exists)', async () => {
  const store = memoryStore();
  await seed(store);
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await (await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Ex&kinds=student_reference' }))).json();
  assert.equal(response.data.groups.person.length, 0);
  assert.equal(response.data.groups.organisation.length, 0);
});
