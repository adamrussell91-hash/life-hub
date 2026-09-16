import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitiesHandler } from '../../netlify/functions/entities.mjs';
import { createEntityOverviewHandler } from '../../netlify/functions/entity-overview.mjs';
import { createUniversalLinksHandler } from '../../netlify/functions/universal-links.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';
import { resolveOrganisation, resolvePerson, resolveTask } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';

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
function makeResolveEntity(store, tasksStore = null) {
  return async function resolveEntity(refInput, accessContext, options = {}) {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (!ref) throw endpointNotFoundError();
    if (ref.namespace === 'shared' && ref.kind === 'person') {
      return resolvePerson(ref.id, accessContext, { ...options, getStore: async () => store });
    }
    if (ref.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, { ...options, getStore: async () => store });
    }
    if (ref.namespace === 'tasks' && ref.kind === 'task' && tasksStore) {
      return resolveTask(ref.id, accessContext, { ...options, getStore: async () => tasksStore });
    }
    throw endpointNotFoundError();
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
    repositoryNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => store,
    getTasksStore: async () => tasksMemoryStore(),
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

test('timeline_limit and timeline_next_cursor paginate the timeline stably, without truncating current/historical relationships', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const links = createUniversalLinksHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  const orgA = await createOrganisation(entities, 'Org A');
  const orgB = await createOrganisation(entities, 'Org B');
  const orgC = await createOrganisation(entities, 'Org C');

  for (const [org, validFrom] of [
    [orgA, '2025-01-01T00:00:00.000Z'],
    [orgB, '2025-06-01T00:00:00.000Z'],
    [orgC, '2025-09-01T00:00:00.000Z']
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await links(request({
      url: 'https://api.adam-russell.com/api/universal-links',
      method: 'POST',
      body: { source_ref: seth.ref, target_ref: org.ref, relationship_type: 'member_of', valid_from: validFrom }
    }));
  }

  const firstPageResponse = await overview(request({
    url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}&timeline_limit=2`
  }));
  const firstPage = (await firstPageResponse.json()).data;
  assert.equal(firstPage.timeline.length, 2);
  assert.equal(firstPage.timeline[0].date, '2025-09-01T00:00:00.000Z');
  assert.equal(firstPage.timeline[1].date, '2025-06-01T00:00:00.000Z');
  assert.ok(firstPage.timeline_next_cursor, 'a third entry remains, so a cursor must be returned');
  // Pagination never truncates the deliberately-complete relationship views.
  assert.equal(firstPage.current_relationships.length, 3);

  const secondPageResponse = await overview(request({
    url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}&timeline_limit=2&timeline_cursor=${encodeURIComponent(firstPage.timeline_next_cursor)}`
  }));
  const secondPage = (await secondPageResponse.json()).data;
  assert.equal(secondPage.timeline.length, 1);
  assert.equal(secondPage.timeline[0].date, '2025-01-01T00:00:00.000Z');
  assert.equal(secondPage.timeline_next_cursor, null, 'no further page remains');
});

test('an invalid timeline_cursor is rejected as a caller error, not silently ignored', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const overview = createEntityOverviewHandler(deps);
  const seth = await createPerson(entities);

  const response = await overview(request({
    url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}&timeline_cursor=not-a-real-cursor`
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_cursor');
});

test('a timeline entry from a Task shows a source link even though context_ref was never set', async () => {
  const store = memoryStore();
  const tasksStore = tasksMemoryStore();
  await tasksStore.setJSON(taskKey('task_email_seth'), {
    id: 'task_email_seth',
    title: 'Email Seth about the proposal',
    status: 'open'
  });
  const deps = baseDeps(store, { resolveEntity: makeResolveEntity(store, tasksStore) });
  const entities = createEntitiesHandler(deps);
  const links = createUniversalLinksHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: { source_ref: 'tasks:task:task_email_seth', target_ref: seth.ref, relationship_type: 'contact' }
  }));

  const response = await overview(request({ url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}` }));
  const body = (await response.json()).data;
  assert.equal(body.timeline.length, 1);
  assert.equal(body.timeline[0].context_href, '/tasks/#/task/task_email_seth');
  assert.equal(body.timeline[0].href, '/tasks/#/task/task_email_seth');
});

test('timeline cursor stays stable when the entry it pointed at is suppressed between page requests', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const links = createUniversalLinksHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  const orgA = await createOrganisation(entities, 'Org A');
  const orgB = await createOrganisation(entities, 'Org B');
  const orgC = await createOrganisation(entities, 'Org C');

  const linkB = await (await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: { source_ref: seth.ref, target_ref: orgB.ref, relationship_type: 'member_of', valid_from: '2025-06-01T00:00:00.000Z' }
  }))).json();
  await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: { source_ref: seth.ref, target_ref: orgA.ref, relationship_type: 'member_of', valid_from: '2025-01-01T00:00:00.000Z' }
  }));
  await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: { source_ref: seth.ref, target_ref: orgC.ref, relationship_type: 'member_of', valid_from: '2025-09-01T00:00:00.000Z' }
  }));

  const firstPage = (await (await overview(request({
    url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}&timeline_limit=1`
  }))).json()).data;
  assert.equal(firstPage.timeline[0].date, '2025-09-01T00:00:00.000Z');
  const cursor = firstPage.timeline_next_cursor;
  assert.ok(cursor);

  // The entry the first page's cursor points past (Org C, 2025-09) is now
  // suppressed — an administrative action, but the same "no longer in
  // ordinary reads" effect a deletion has.
  await links(request({
    url: `https://api.adam-russell.com/api/universal-links?id=${linkB.data.link.id}&action=suppress`,
    method: 'PATCH',
    body: { reason: 'operator_requested' }
  }));

  const secondPage = (await (await overview(request({
    url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}&timeline_limit=1&timeline_cursor=${encodeURIComponent(cursor)}`
  }))).json()).data;
  // Org B (2025-06) is now hidden, but Org A (2025-01) must still be
  // reachable through the OLD cursor rather than the page coming back
  // empty just because the entry the cursor named is gone.
  assert.equal(secondPage.timeline.length, 1);
  assert.equal(secondPage.timeline[0].date, '2025-01-01T00:00:00.000Z');
});

test('only the requested page resolves context_href — entries beyond it are never touched', async () => {
  const store = memoryStore();
  const tasksStore = tasksMemoryStore();
  for (const id of ['task_a', 'task_b', 'task_c']) {
    // eslint-disable-next-line no-await-in-loop
    await tasksStore.setJSON(taskKey(id), { id, title: `Task ${id}`, status: 'open' });
  }
  let taskResolveCalls = 0;
  const countingResolveEntity = async (refInput, accessContext, options) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (ref?.namespace === 'tasks' && ref?.kind === 'task') taskResolveCalls += 1;
    return makeResolveEntity(store, tasksStore)(refInput, accessContext, options);
  };
  const deps = baseDeps(store, { resolveEntity: countingResolveEntity });
  const entities = createEntitiesHandler(deps);
  const links = createUniversalLinksHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  const orgA = await createOrganisation(entities, 'Org A');
  // Three period relationships, each recording a different Task as the
  // context that established it — context_href must resolve one of these
  // per timeline entry.
  for (const [validFrom, taskId] of [
    ['2025-01-01T00:00:00.000Z', 'task_a'],
    ['2025-06-01T00:00:00.000Z', 'task_b'],
    ['2025-09-01T00:00:00.000Z', 'task_c']
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await links(request({
      url: 'https://api.adam-russell.com/api/universal-links',
      method: 'POST',
      body: {
        source_ref: seth.ref,
        target_ref: orgA.ref,
        relationship_type: 'member_of',
        valid_from: validFrom,
        context_ref: `tasks:task:${taskId}`
      }
    }));
  }
  taskResolveCalls = 0; // reset: only count resolves made by the overview call below

  const response = await overview(request({
    url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}&timeline_limit=1`
  }));
  const body = (await response.json()).data;
  assert.equal(body.timeline.length, 1);
  assert.equal(body.timeline[0].context_href, '/tasks/#/task/task_c');
  // Only the one page entry's context_ref was resolved — task_a and task_b
  // (entries 2 and 3, not on this page) were never touched.
  assert.equal(taskResolveCalls, 1);
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

test('B5: overview preserves current and historical relationships for an archived Person, while ordinary reads still hide it', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const links = createUniversalLinksHandler(deps);
  const overview = createEntityOverviewHandler(deps);
  const search = createEntitySearchHandler(deps);

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

  await entities(request({
    url: `https://api.adam-russell.com/api/entities?ref=${encodeURIComponent(seth.ref)}&action=archive`,
    method: 'PATCH',
    body: {}
  }));

  // Before the fix: entity-overview.mjs loaded the archived Person directly
  // (bypassing the resolver's ordinary archived-hiding), but then called
  // listForEntity with the *ordinary* resolver, which 404s the requested
  // archived ref during its own initial authorisation check — so both
  // outgoing and incoming came back empty even though the relationships
  // were still there.
  const response = await overview(request({ url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}` }));
  const body = (await response.json()).data;

  assert.equal(response.status, 200);
  assert.equal(body.entity.lifecycle_status, 'archived');
  assert.equal(body.current_relationships.length, 1, 'the current member_of relationship must remain visible in the archived Person\'s own overview');
  assert.equal(body.historical_relationships.length, 1, 'the ended employee_at relationship must remain visible');
  assert.equal(body.timeline.length, 2, 'both timeline entries must remain visible');
  assert.equal(body.linked_records.organisations.length, 2, 'the linked Organisation must remain visible');

  // Ordinary Universal Link reads must still hide the archived Person: from
  // UNSW's own (non-archived) perspective, its relationship to the now
  // archived Seth must not appear.
  const unswLinks = await (await links(request({
    url: `https://api.adam-russell.com/api/universal-links?entity_ref=${encodeURIComponent(unsw.ref)}`
  }))).json();
  assert.equal(unswLinks.data.incoming.length, 0, 'ordinary Universal Link reads must not disclose a relationship to an archived Person');

  // Ordinary entity search must still hide the archived Person by default.
  const ordinarySearch = await (await search(request({ url: 'https://api.adam-russell.com/api/entities/search?q=Seth' }))).json();
  assert.equal(ordinarySearch.data.groups.person.length, 0, 'ordinary suggestions must not surface an archived Person');
});

test('Feature 1.3: current and historical relationships carry metadata (e.g. professional_relationship human_label)', async () => {
  const store = memoryStore();
  const deps = baseDeps(store);
  const entities = createEntitiesHandler(deps);
  const links = createUniversalLinksHandler(deps);
  const overview = createEntityOverviewHandler(deps);

  const seth = await createPerson(entities);
  const jane = await createPerson(entities, { display_name: 'Jane Doe' });
  const alsoJane = await createPerson(entities, { display_name: 'Alex Roe' });

  const mentorLink = await (await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: {
      source_ref: seth.ref,
      target_ref: jane.ref,
      relationship_type: 'professional_relationship',
      role: 'mentor',
      valid_from: '2025-01-01T00:00:00.000Z',
      metadata: { human_label: 'Mentor to Jane Doe' }
    }
  }))).json();

  // A relationship with no metadata supplied must still come back with an
  // explicit (empty) metadata object, not an absent field.
  await links(request({
    url: 'https://api.adam-russell.com/api/universal-links',
    method: 'POST',
    body: {
      source_ref: seth.ref,
      target_ref: alsoJane.ref,
      relationship_type: 'professional_relationship',
      role: 'colleague',
      valid_from: '2025-02-01T00:00:00.000Z'
    }
  }));

  await links(request({
    url: `https://api.adam-russell.com/api/universal-links?id=${mentorLink.data.link.id}&action=end`,
    method: 'PATCH',
    body: { valid_to: '2026-01-01T00:00:00.000Z' }
  }));

  const response = await overview(request({ url: `https://api.adam-russell.com/api/entities/overview?ref=${encodeURIComponent(seth.ref)}` }));
  const body = (await response.json()).data;

  assert.equal(response.status, 200);
  assert.equal(body.current_relationships.length, 1);
  assert.deepEqual(body.current_relationships[0].link.metadata, {});

  assert.equal(body.historical_relationships.length, 1);
  assert.deepEqual(body.historical_relationships[0].link.metadata, { human_label: 'Mentor to Jane Doe' });
});

test('rejects a ref for an unsupported kind', async () => {
  const store = memoryStore();
  const handler = createEntityOverviewHandler(baseDeps(store));
  const response = await handler(request({ url: 'https://api.adam-russell.com/api/entities/overview?ref=tasks:task:task_1' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'unsupported_entity_kind');
});
