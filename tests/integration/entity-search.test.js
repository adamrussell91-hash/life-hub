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

// --- Correction B2: normalise (trim) before validating query length ---

test('B2: whitespace-only and padded-short queries are rejected after trimming, before any store read', async () => {
  let storeAccessed = false;
  const store = new Proxy(memoryStore(), {
    get(target, prop) {
      if (prop === 'get' || prop === 'list') storeAccessed = true;
      return target[prop];
    }
  });
  const handler = createEntitySearchHandler(baseDeps(store));

  for (const q of ['  ', '\t\t', '\n', ' a ']) {
    // eslint-disable-next-line no-await-in-loop
    const response = await handler(request({ url: `https://api.adam-russell.com/api/entities/search?q=${encodeURIComponent(q)}` }));
    assert.equal(response.status, 400, `expected 400 for query ${JSON.stringify(q)}`);
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await response.json()).error.code, 'invalid_query_length');
  }
  assert.equal(storeAccessed, false, 'an invalid query must never list an index or read a Blob');
});

test('B2: a valid two-character query surrounded by spaces is accepted', async () => {
  const store = memoryStore();
  const { seth } = await seed(store);
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await (await handler(request({ url: `https://api.adam-russell.com/api/entities/search?q=${encodeURIComponent('  Se  ')}` }))).json();
  assert.ok(response.data.groups.person.some(r => r.ref === seth.ref));
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

// --- Correction B6: Task results in entity search ---

function tasksStoreSeededWith(tasks) {
  const store = tasksMemoryStore();
  const ids = [];
  for (const task of tasks) {
    store.setJSON(`tasks/${task.id}`, task);
    ids.push(task.id);
  }
  store.setJSON('tasks/_index', ids);
  return store;
}

test('B6: task results are returned, grouped separately, and ranked alongside person/organisation results', async () => {
  const store = memoryStore();
  const { unsw } = await seed(store);
  const tasksStore = tasksStoreSeededWith([
    { id: 'task_1', title: 'Example task about the proposal', status: 'open' },
    { id: 'task_2', title: 'Unrelated task', status: 'open' }
  ]);
  const handler = createEntitySearchHandler(baseDeps(store, { getTasksStore: async () => tasksStore }));

  const response = await (await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Example' }))).json();
  assert.equal(response.data.groups.task.length, 1);
  assert.equal(response.data.groups.task[0].ref, 'tasks:task:task_1');
  assert.equal(response.data.groups.task[0].display_label, 'Example task about the proposal');
  assert.ok(response.data.groups.organisation.some(r => r.ref === unsw.ref));
});

test('B6: task search respects the combined cap of 20 across all kinds', async () => {
  const store = memoryStore();
  const entities = createEntitiesHandler(baseDeps(store));
  for (let i = 0; i < 15; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await entities(request({
      url: 'https://api.adam-russell.com/api/entities',
      method: 'POST',
      body: { kind: 'person', display_name: `Search Target ${i}` }
    }));
  }
  const tasksStore = tasksStoreSeededWith(
    Array.from({ length: 15 }, (_, i) => ({ id: `task_${i}`, title: `Search Target Task ${i}`, status: 'open' }))
  );
  const handler = createEntitySearchHandler(baseDeps(store, { getTasksStore: async () => tasksStore }));

  const response = await (await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Search' }))).json();
  const total = response.data.groups.person.length + response.data.groups.organisation.length + response.data.groups.task.length;
  assert.equal(total, 20);
});

test('B6: an unsupported kind (including student_reference) is rejected with 400, not silently dropped', async () => {
  const store = memoryStore();
  await seed(store);
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Ex&kinds=student_reference' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_kind');
});

test('never returns a StudentReference kind through an ordinary, fully-valid kinds list', async () => {
  const store = memoryStore();
  await seed(store);
  const handler = createEntitySearchHandler(baseDeps(store));
  const response = await (await handler(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Ex&kinds=person,organisation,task' }))).json();
  assert.doesNotMatch(JSON.stringify(response), /student_reference/);
});
