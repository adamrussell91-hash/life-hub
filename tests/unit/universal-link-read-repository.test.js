import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext, endpointNotFoundError, isVisibilityAllowed } from '../../netlify/functions/_shared/entity-access.mjs';
import { formatEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { bySourcePrefix, byTargetPrefix, linkKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { createUniversalLinkReadRepository } from '../../netlify/functions/_shared/universal-link-read-repository.mjs';

// This suite exercises the read repository against a synthetic, injected
// `resolveEntity` — not `entity-resolvers.mjs`'s real one, which in Slice 1
// can only resolve Task and leaves Person/Organisation/Communication
// unavailable. Injecting a fake resolver proves the repository's own logic
// (batching, sorting, membership validation, authorisation ordering) is
// correct independent of which concrete kinds a later slice wires in.

function createMemoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async list({ prefix = '' } = {}) {
      const blobs = [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }));
      return { blobs };
    }
  };
}

// entities: Map<canonicalRef, { kind, hidden?, archived?, visibility? }>
function createFakeResolver(entities) {
  return async function resolveEntity(refInput, accessContext) {
    const ref = typeof refInput === 'string' ? refInput : formatEntityRef(refInput);
    const entity = entities.get(ref);
    if (!entity || entity.hidden || entity.archived) throw endpointNotFoundError();
    if (!isVisibilityAllowed(accessContext, entity.visibility ?? 'operator')) throw endpointNotFoundError();
    return {
      ref,
      kind: entity.kind,
      display_label: entity.display_label ?? ref,
      supporting_label: null,
      href: null,
      lifecycle_status: entity.lifecycle_status ?? 'active',
      visibility: entity.visibility ?? 'operator'
    };
  };
}

function linkRecord({
  id,
  sourceRef,
  targetRef,
  relationshipType = 'collaborator',
  temporalMode = 'timeless',
  status = 'current',
  visibility = 'operator',
  updatedAt = '2026-09-11T00:00:00.000Z',
  overrides = {}
}) {
  return {
    schema_version: 1,
    id,
    source_ref: sourceRef,
    target_ref: targetRef,
    relationship_type: relationshipType,
    role: null,
    context_key: null,
    context_ref: null,
    temporal_mode: temporalMode,
    valid_from: null,
    valid_to: null,
    occurred_at: null,
    status,
    visibility,
    metadata: {},
    created_at: updatedAt,
    updated_at: updatedAt,
    ...overrides
  };
}

async function seedMembership(store, { sourceRef, targetRef, linkId, sourceCanonical = sourceRef, targetCanonical = targetRef, key: overrideKey }) {
  const membership = { schema_version: 1, link_id: linkId, created_at: '2026-09-11T00:00:00.000Z' };
  await store.setJSON(overrideKey ?? `${bySourcePrefix(sourceRef)}${linkId}`, { ...membership, canonical_ref: sourceCanonical });
  if (targetRef) {
    await store.setJSON(`${byTargetPrefix(targetRef)}${linkId}`, { ...membership, canonical_ref: targetCanonical });
  }
}

const TASK_REF = 'tasks:task:task_email_seth';
const PERSON_REF = 'shared:person:person_seth';
const ORG_REF = 'shared:organisation:organisation_unsw';

const context = createAccessContext({ workflow: 'tasks' });

async function setupVisibleLink(store) {
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_visible' });
}

function defaultResolver() {
  return createFakeResolver(new Map([
    [TASK_REF, { kind: 'task', display_label: 'Email Seth about the proposal' }],
    [PERSON_REF, { kind: 'person', display_label: 'Seth Example' }],
    [ORG_REF, { kind: 'organisation', display_label: 'Example University' }]
  ]));
}

test('createUniversalLinkReadRepository requires a store and a resolveEntity function', () => {
  assert.throws(() => createUniversalLinkReadRepository({ resolveEntity: async () => {} }));
  assert.throws(() => createUniversalLinkReadRepository({ store: createMemoryStore() }));
});

test('listOutgoing resolves the target endpoint for a visible link', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  const results = await repo.listOutgoing(TASK_REF, context);
  assert.equal(results.length, 1);
  assert.equal(results[0].endpoint.kind, 'person');
  assert.equal(results[0].link.relationship_type, 'collaborator');
});

test('listIncoming resolves the source endpoint for a visible link', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  const results = await repo.listIncoming(PERSON_REF, context);
  assert.equal(results.length, 1);
  assert.equal(results[0].endpoint.kind, 'task');
});

test('listForEntity combines both directions', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_employee'), linkRecord({
    id: 'ul_employee',
    sourceRef: PERSON_REF,
    targetRef: ORG_REF,
    relationshipType: 'employee_at',
    temporalMode: 'period',
    overrides: { valid_from: '2025-02-01T00:00:00.000Z' }
  }));
  await seedMembership(store, { sourceRef: PERSON_REF, targetRef: ORG_REF, linkId: 'ul_employee' });
  await setupVisibleLink(store);

  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  const { outgoing, incoming } = await repo.listForEntity(PERSON_REF, context);
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].endpoint.kind, 'organisation');
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].endpoint.kind, 'task');
});

test('listOutgoing rejects a malformed requested ref with 400, not 404', async () => {
  const store = createMemoryStore();
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  await assert.rejects(
    repo.listOutgoing('not a ref', context),
    error => error.status === 400 && error.code === 'invalid_entity_ref'
  );
});

test('a hidden REQUESTED source is authorised before membership lookup and yields an empty list, not an error', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const resolver = createFakeResolver(new Map([
    [TASK_REF, { kind: 'task', hidden: true }],
    [PERSON_REF, { kind: 'person' }]
  ]));
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a hidden REQUESTED target is authorised before membership lookup and yields an empty list, not an error', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const resolver = createFakeResolver(new Map([
    [TASK_REF, { kind: 'task' }],
    [PERSON_REF, { kind: 'person', hidden: true }]
  ]));
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  assert.deepEqual(await repo.listIncoming(PERSON_REF, context), []);
});

test('a link to a missing OTHER endpoint is dropped from results, not surfaced with a placeholder', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_visible' });
  const resolver = createFakeResolver(new Map([[TASK_REF, { kind: 'task' }]])); // Person not registered at all: "missing"
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a link to a hidden OTHER endpoint is dropped from results', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const resolver = createFakeResolver(new Map([
    [TASK_REF, { kind: 'task' }],
    [PERSON_REF, { kind: 'person', hidden: true }]
  ]));
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a link to an archived OTHER endpoint is dropped from ordinary results', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const resolver = createFakeResolver(new Map([
    [TASK_REF, { kind: 'task' }],
    [PERSON_REF, { kind: 'person', archived: true }]
  ]));
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a link whose visibility the caller cannot see is dropped from results', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF, visibility: 'teaching_protected' }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_visible' });
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a missing authoritative link referenced by membership is dropped, not thrown', async () => {
  const store = createMemoryStore();
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_ghost' }); // no linkKey('ul_ghost') ever written
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a membership hash collision with a mismatched canonical_ref is dropped', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_visible', sourceCanonical: 'tasks:task:task_unrelated' });
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a malformed link record (unknown relationship key) is dropped without crashing the read', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_bad'), linkRecord({ id: 'ul_bad', sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'made_up_key' }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_bad' });
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a malformed link record (invalid temporal fields) is dropped without crashing the read', async () => {
  const store = createMemoryStore();
  // collaborator is timeless; a stored valid_from violates that.
  await store.setJSON(linkKey('ul_bad_dates'), linkRecord({
    id: 'ul_bad_dates',
    sourceRef: TASK_REF,
    targetRef: PERSON_REF,
    overrides: { valid_from: '2026-01-01T00:00:00.000Z' }
  }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_bad_dates' });
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a malformed link record (unparseable ref) is dropped without crashing the read', async () => {
  const store = createMemoryStore();
  const bad = linkRecord({ id: 'ul_bad_ref', sourceRef: TASK_REF, targetRef: PERSON_REF });
  bad.target_ref = 'not a valid ref';
  await store.setJSON(linkKey('ul_bad_ref'), bad);
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_bad_ref' });
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
});

test('a duplicate membership blob for the same link, seen twice under one prefix, is not double counted', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_visible' });
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, linkId: 'ul_visible', key: `${bySourcePrefix(TASK_REF)}ul_visible_dup` });
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  const results = await repo.listOutgoing(TASK_REF, context);
  assert.equal(results.length, 1);
});

test('bounded hydration processes more than one batch of ten without dropping links', async () => {
  const store = createMemoryStore();
  const entities = new Map([[TASK_REF, { kind: 'task' }]]);
  for (let i = 0; i < 11; i += 1) {
    const personRef = `shared:person:person_${i}`;
    entities.set(personRef, { kind: 'person', display_label: `Person ${i}` });
    const linkId = `ul_batch_${i}`;
    await store.setJSON(linkKey(linkId), linkRecord({ id: linkId, sourceRef: TASK_REF, targetRef: personRef, updatedAt: `2026-09-${String(11 - i).padStart(2, '0')}T00:00:00.000Z` }));
    await seedMembership(store, { sourceRef: TASK_REF, targetRef: personRef, linkId });
  }
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: createFakeResolver(entities) });
  const results = await repo.listOutgoing(TASK_REF, context);
  assert.equal(results.length, 11, 'all eleven links across two batches must be returned');
  assert.equal(new Set(results.map(r => r.link.id)).size, 11);
});

test('results sort by updated_at descending, then id ascending for ties', async () => {
  const store = createMemoryStore();
  const entities = new Map([
    [TASK_REF, { kind: 'task' }],
    ['shared:person:person_a', { kind: 'person' }],
    ['shared:person:person_b', { kind: 'person' }],
    ['shared:person:person_c', { kind: 'person' }]
  ]);
  await store.setJSON(linkKey('ul_older'), linkRecord({ id: 'ul_older', sourceRef: TASK_REF, targetRef: 'shared:person:person_a', updatedAt: '2026-01-01T00:00:00.000Z' }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: 'shared:person:person_a', linkId: 'ul_older' });
  await store.setJSON(linkKey('ul_newer_b'), linkRecord({ id: 'ul_newer_b', sourceRef: TASK_REF, targetRef: 'shared:person:person_b', updatedAt: '2026-09-11T00:00:00.000Z' }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: 'shared:person:person_b', linkId: 'ul_newer_b' });
  await store.setJSON(linkKey('ul_newer_a'), linkRecord({ id: 'ul_newer_a', sourceRef: TASK_REF, targetRef: 'shared:person:person_c', updatedAt: '2026-09-11T00:00:00.000Z' }));
  await seedMembership(store, { sourceRef: TASK_REF, targetRef: 'shared:person:person_c', linkId: 'ul_newer_a' });

  const repo = createUniversalLinkReadRepository({ store, resolveEntity: createFakeResolver(entities) });
  const results = await repo.listOutgoing(TASK_REF, context);
  assert.deepEqual(results.map(r => r.link.id), ['ul_newer_a', 'ul_newer_b', 'ul_older']);
});

test('getLink returns a record when both endpoints resolve and are visible', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  const record = await repo.getLink('ul_visible', context);
  assert.equal(record.id, 'ul_visible');
});

test('getLink 404s when the link itself does not exist', async () => {
  const store = createMemoryStore();
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  await assert.rejects(
    repo.getLink('ul_does_not_exist', context),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('getLink 404s when the source endpoint is missing', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF }));
  const resolver = createFakeResolver(new Map([[PERSON_REF, { kind: 'person' }]])); // Task never registered: "missing"
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  await assert.rejects(repo.getLink('ul_visible', context), error => error.code === 'endpoint_not_found');
});

test('getLink 404s when the target endpoint is archived', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF }));
  const resolver = createFakeResolver(new Map([
    [TASK_REF, { kind: 'task' }],
    [PERSON_REF, { kind: 'person', archived: true }]
  ]));
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  await assert.rejects(repo.getLink('ul_visible', context), error => error.code === 'endpoint_not_found');
});

test('getLink 404s when an endpoint is inaccessible under the caller\'s visibility', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_visible'), linkRecord({ id: 'ul_visible', sourceRef: TASK_REF, targetRef: PERSON_REF }));
  const resolver = createFakeResolver(new Map([
    [TASK_REF, { kind: 'task' }],
    [PERSON_REF, { kind: 'person', visibility: 'teaching_protected' }]
  ]));
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: resolver });
  await assert.rejects(repo.getLink('ul_visible', context), error => error.code === 'endpoint_not_found');
});

test('getLink 404s when the link record itself is malformed', async () => {
  const store = createMemoryStore();
  await store.setJSON(linkKey('ul_bad'), linkRecord({ id: 'ul_bad', sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'made_up_key' }));
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  await assert.rejects(repo.getLink('ul_bad', context), error => error.code === 'endpoint_not_found');
});

test('a valid, visible ref with no memberships returns an empty array, not an error', async () => {
  const store = createMemoryStore();
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  assert.deepEqual(await repo.listOutgoing(TASK_REF, context), []);
  assert.deepEqual(await repo.listIncoming(PERSON_REF, context), []);
});

test('no read method writes to the fake store', async () => {
  const store = createMemoryStore();
  await setupVisibleLink(store);
  const setJSONCalls = [];
  const originalSetJSON = store.setJSON.bind(store);
  store.setJSON = async (...args) => {
    setJSONCalls.push(args);
    return originalSetJSON(...args);
  };
  const repo = createUniversalLinkReadRepository({ store, resolveEntity: defaultResolver() });
  await repo.listOutgoing(TASK_REF, context);
  await repo.listIncoming(PERSON_REF, context);
  await repo.getLink('ul_visible', context);
  await repo.listForEntity(TASK_REF, context);
  assert.equal(setJSONCalls.length, 0);
});
