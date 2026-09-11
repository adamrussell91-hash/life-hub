import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { generateOrganisationId, generatePersonId, IDENTITY_SCHEMA_VERSION, TOMBSTONE_LABEL } from '../../netlify/functions/_shared/identity-schema.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { organisationKey, personKey } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import {
  resolveEntity,
  resolveOrganisation,
  resolvePerson,
  resolveTask,
  resolverUnavailableError
} from '../../netlify/functions/_shared/entity-resolvers.mjs';

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
    }
  };
}

const tasksContext = createAccessContext({ workflow: 'tasks' });

function personRecord(overrides = {}) {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id: generatePersonId(),
    kind: 'person',
    display_name: 'Seth Example',
    sort_name: 'Example, Seth',
    aliases: [],
    lifecycle_status: 'active',
    is_self: false,
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    ...overrides
  };
}

function organisationRecord(overrides = {}) {
  return {
    schema_version: IDENTITY_SCHEMA_VERSION,
    id: generateOrganisationId(),
    kind: 'organisation',
    display_name: 'Example University',
    legal_name: null,
    aliases: [],
    lifecycle_status: 'active',
    retention_reason: null,
    retention_review_at: null,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
    ...overrides
  };
}

test('resolveTask projects title as display_label and status as lifecycle_status', async () => {
  const store = createMemoryStore();
  await store.setJSON(taskKey('task_email_seth'), {
    id: 'task_email_seth',
    title: 'Email Seth about the proposal',
    status: 'open'
  });
  const projection = await resolveTask('task_email_seth', tasksContext, { getStore: async () => store });
  assert.deepEqual(projection, {
    ref: 'tasks:task:task_email_seth',
    kind: 'task',
    display_label: 'Email Seth about the proposal',
    supporting_label: 'open',
    href: null,
    lifecycle_status: 'open',
    visibility: 'operator'
  });
});

test('resolveTask 404s a missing record', async () => {
  const store = createMemoryStore();
  await assert.rejects(
    resolveTask('task_missing', tasksContext, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('resolverUnavailableError names the kind and uses a distinct code from endpoint_not_found', () => {
  const error = resolverUnavailableError('person');
  assert.equal(error.status, 501);
  assert.equal(error.code, 'resolver_unavailable');
  assert.equal(error.kind, 'person');
  assert.notEqual(error.code, 'endpoint_not_found');
});

test('resolveEntity still dispatches professional:communication to an unavailable slot (Slice 5 not landed)', async () => {
  await assert.rejects(
    resolveEntity('professional:communication:communication_001', tasksContext),
    error => error.status === 501 && error.code === 'resolver_unavailable'
  );
});

// --- Slice 3: real Person and Organisation resolution ---

test('resolvePerson projects display_name as display_label, is_self as supporting_label', async () => {
  const store = createMemoryStore();
  const record = personRecord({ is_self: true });
  await store.setJSON(personKey(record.id), record);
  const projection = await resolvePerson(record.id, tasksContext, { getStore: async () => store });
  assert.deepEqual(projection, {
    ref: `shared:person:${record.id}`,
    kind: 'person',
    display_label: 'Seth Example',
    supporting_label: 'self',
    href: null,
    lifecycle_status: 'active',
    visibility: 'operator'
  });
});

test('resolveOrganisation projects display_name as display_label', async () => {
  const store = createMemoryStore();
  const record = organisationRecord();
  await store.setJSON(organisationKey(record.id), record);
  const projection = await resolveOrganisation(record.id, tasksContext, { getStore: async () => store });
  assert.equal(projection.display_label, 'Example University');
  assert.equal(projection.supporting_label, null);
});

test('resolvePerson/resolveOrganisation 404 a missing record', async () => {
  const store = createMemoryStore();
  await assert.rejects(
    resolvePerson(generatePersonId(), tasksContext, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
  await assert.rejects(
    resolveOrganisation(generateOrganisationId(), tasksContext, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('resolvePerson treats a malformed id as missing, not as a 400', async () => {
  const store = createMemoryStore();
  await assert.rejects(
    resolvePerson('person_seth', tasksContext, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('resolvePerson hides an archived Person from ordinary resolution but resolves it when includeArchived is set', async () => {
  const store = createMemoryStore();
  const record = personRecord({ lifecycle_status: 'archived' });
  await store.setJSON(personKey(record.id), record);
  await assert.rejects(
    resolvePerson(record.id, tasksContext, { getStore: async () => store }),
    error => error.code === 'endpoint_not_found'
  );
  const projection = await resolvePerson(record.id, tasksContext, { getStore: async () => store, includeArchived: true });
  assert.equal(projection.lifecycle_status, 'archived');
});

test('resolvePerson never exposes a deleted or deidentified Person\'s former name or aliases', async () => {
  const store = createMemoryStore();
  const deleted = personRecord({ lifecycle_status: 'deleted', aliases: ['Sethy'] });
  const deidentified = personRecord({ lifecycle_status: 'deidentified', aliases: ['Sethy'] });
  await store.setJSON(personKey(deleted.id), deleted);
  await store.setJSON(personKey(deidentified.id), deidentified);

  const deletedProjection = await resolvePerson(deleted.id, tasksContext, { getStore: async () => store });
  const deidentifiedProjection = await resolvePerson(deidentified.id, tasksContext, { getStore: async () => store });
  assert.equal(deletedProjection.display_label, TOMBSTONE_LABEL);
  assert.equal(deidentifiedProjection.display_label, TOMBSTONE_LABEL);
  assert.doesNotMatch(JSON.stringify(deletedProjection), /Seth|Sethy/);
  assert.doesNotMatch(JSON.stringify(deidentifiedProjection), /Seth|Sethy/);
});

test('resolveEntity dispatches tasks:task to real resolution', async () => {
  const store = createMemoryStore();
  await store.setJSON(taskKey('task_email_seth'), { id: 'task_email_seth', title: 'Email Seth', status: 'open' });
  const projection = await resolveEntity('tasks:task:task_email_seth', tasksContext, { getStore: async () => store });
  assert.equal(projection.kind, 'task');
});

test('resolveEntity 404s an unregistered kind (e.g. StudentReference) exactly like a missing record', async () => {
  await assert.rejects(
    resolveEntity('teaching:student_reference:student_ref_ar1', tasksContext),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
  await assert.rejects(
    resolveEntity('not a ref at all', tasksContext),
    error => error.code === 'endpoint_not_found'
  );
});

test('resolveEntity enforces allowed_entity_kinds before dispatching to any resolver', async () => {
  const restricted = createAccessContext({ workflow: 'tasks', allowedEntityKinds: ['task'] });
  await assert.rejects(
    resolveEntity('shared:person:person_seth', restricted),
    error => error.status === 404 && error.code === 'endpoint_not_found',
    'a disallowed kind must read as not-found, not as resolver_unavailable'
  );

  const store = createMemoryStore();
  await store.setJSON(taskKey('task_email_seth'), { id: 'task_email_seth', title: 'Email Seth', status: 'open' });
  const allowed = await resolveEntity('tasks:task:task_email_seth', restricted, { getStore: async () => store });
  assert.equal(allowed.kind, 'task');
});
