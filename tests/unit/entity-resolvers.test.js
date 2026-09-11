import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { organisationKey, personKey, setJSON } from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import {
  resolveCommunication,
  resolveEntity,
  resolveOrganisation,
  resolvePerson,
  resolveTask
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

test('resolvePerson returns a safe projection for an active Person', async () => {
  const store = createMemoryStore();
  await setJSON(store, personKey('person_seth'), {
    id: 'person_seth',
    display_name: 'Seth Example',
    lifecycle_status: 'active'
  });
  const projection = await resolvePerson('person_seth', tasksContext, { getStore: async () => store });
  assert.deepEqual(projection, {
    ref: 'shared:person:person_seth',
    kind: 'person',
    display_label: 'Seth Example',
    supporting_label: null,
    href: null,
    lifecycle_status: 'active',
    visibility: 'operator'
  });
});

test('resolvePerson 404s a missing record and never leaks a distinct "forbidden" shape', async () => {
  const store = createMemoryStore();
  await assert.rejects(
    resolvePerson('person_missing', tasksContext, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
});

test('resolvePerson hides an archived Person from ordinary resolution but returns it for a deliberate archive lookup', async () => {
  const store = createMemoryStore();
  await setJSON(store, personKey('person_archived'), {
    id: 'person_archived',
    display_name: 'Archived Contact',
    lifecycle_status: 'archived'
  });
  await assert.rejects(
    resolvePerson('person_archived', tasksContext, { getStore: async () => store }),
    error => error.code === 'endpoint_not_found'
  );
  const projection = await resolvePerson('person_archived', tasksContext, {
    getStore: async () => store,
    includeArchived: true
  });
  assert.equal(projection.lifecycle_status, 'archived');
});

test('resolvePerson never resolves a deleted Person, even with includeArchived', async () => {
  const store = createMemoryStore();
  await setJSON(store, personKey('person_deleted'), {
    id: 'person_deleted',
    display_name: 'Should never appear',
    lifecycle_status: 'deleted'
  });
  await assert.rejects(
    resolvePerson('person_deleted', tasksContext, { getStore: async () => store, includeArchived: true }),
    error => error.code === 'endpoint_not_found'
  );
});

test('resolvePerson honours a caller-supplied accessContext that disallows operator visibility', async () => {
  const store = createMemoryStore();
  await setJSON(store, personKey('person_seth'), { id: 'person_seth', display_name: 'Seth', lifecycle_status: 'active' });
  const noVisibilityContext = { actor: 'operator', workflow: 'tasks', allowed_visibility: [], allowed_entity_kinds: [] };
  await assert.rejects(
    resolvePerson('person_seth', noVisibilityContext, { getStore: async () => store }),
    error => error.code === 'endpoint_not_found'
  );
});

test('resolveOrganisation resolves an active Organisation and 404s a missing one', async () => {
  const store = createMemoryStore();
  await setJSON(store, organisationKey('organisation_unsw'), {
    id: 'organisation_unsw',
    display_name: 'UNSW',
    lifecycle_status: 'active'
  });
  const projection = await resolveOrganisation('organisation_unsw', tasksContext, { getStore: async () => store });
  assert.equal(projection.display_label, 'UNSW');
  assert.equal(projection.ref, 'shared:organisation:organisation_unsw');

  await assert.rejects(
    resolveOrganisation('organisation_missing', tasksContext, { getStore: async () => store }),
    error => error.code === 'endpoint_not_found'
  );
});

test('resolveTask projects title as display_label and status as lifecycle_status', async () => {
  const store = createMemoryStore();
  await setJSON(store, taskKey('task_email_seth'), {
    id: 'task_email_seth',
    title: 'Email Seth about the proposal',
    status: 'open'
  });
  const projection = await resolveTask('task_email_seth', tasksContext, { getStore: async () => store });
  assert.equal(projection.display_label, 'Email Seth about the proposal');
  assert.equal(projection.supporting_label, 'open');
  assert.equal(projection.lifecycle_status, 'open');

  await assert.rejects(
    resolveTask('task_missing', tasksContext, { getStore: async () => store }),
    error => error.code === 'endpoint_not_found'
  );
});

test('resolveCommunication projects subject/channel and 404s a missing record', async () => {
  const store = {
    async get(key, { type } = {}) {
      if (key !== 'communications/communication_001') return null;
      const value = { id: 'communication_001', subject: 'Following up', channel: 'email' };
      return type === 'json' ? value : JSON.stringify(value);
    }
  };
  const projection = await resolveCommunication('communication_001', tasksContext, { getStore: async () => store });
  assert.equal(projection.display_label, 'Following up');
  assert.equal(projection.supporting_label, 'email');

  const emptyStore = { async get() { return null; } };
  await assert.rejects(
    resolveCommunication('communication_missing', tasksContext, { getStore: async () => emptyStore }),
    error => error.code === 'endpoint_not_found'
  );
});

test('resolveEntity dispatches by namespace:kind to the matching resolver', async () => {
  const store = createMemoryStore();
  await setJSON(store, personKey('person_seth'), { id: 'person_seth', display_name: 'Seth', lifecycle_status: 'active' });
  const projection = await resolveEntity('shared:person:person_seth', tasksContext, { getStore: async () => store });
  assert.equal(projection.kind, 'person');
});

test('resolveEntity 404s an unregistered kind (e.g. StudentReference) exactly like a missing record', async () => {
  // No resolver is registered for teaching:student_reference in Slice 1 —
  // this is how StudentReference stays absent from generic resolution
  // without a special case in the dispatcher.
  await assert.rejects(
    resolveEntity('teaching:student_reference:student_ref_ar1', tasksContext),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );
  await assert.rejects(
    resolveEntity('not a ref at all', tasksContext),
    error => error.code === 'endpoint_not_found'
  );
});
