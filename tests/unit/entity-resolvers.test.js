import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { resolveEntity, resolveTask, resolverUnavailableError } from '../../netlify/functions/_shared/entity-resolvers.mjs';

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

test('resolveEntity dispatches shared:person, shared:organisation, and professional:communication to unavailable slots', async () => {
  for (const ref of ['shared:person:person_seth', 'shared:organisation:organisation_unsw', 'professional:communication:communication_001']) {
    await assert.rejects(
      resolveEntity(ref, tasksContext),
      error => error.status === 501 && error.code === 'resolver_unavailable'
    );
  }
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
