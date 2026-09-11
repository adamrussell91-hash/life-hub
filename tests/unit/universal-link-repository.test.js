import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { getRelationshipDeclaration } from '../../netlify/functions/_shared/relationship-registry.mjs';
import { buildUniversalLinkRecord } from '../../netlify/functions/_shared/universal-link-schema.mjs';
import {
  buildMembershipRecord,
  bySourceKey,
  byTargetKey,
  linkKey,
  organisationKey,
  personKey,
  setJSON
} from '../../netlify/functions/_shared/universal-link-blobs.mjs';
import { taskKey } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { getLink, listForEntity, listIncoming, listOutgoing } from '../../netlify/functions/_shared/universal-link-repository.mjs';

// One flat in-memory store stands in for every store this module touches.
// None of the real key prefixes collide (`entities/person/`, `tasks/`,
// `universal-links/`, ...), so a single fake object can serve as both the
// repository's own store and every resolver's injected store.
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

async function seedLink(store, { sourceRef, targetRef, relationshipType, declKey = relationshipType, statusOverride, ...rest }) {
  const declaration = getRelationshipDeclaration(declKey);
  const record = buildUniversalLinkRecord({ sourceRef, targetRef, relationshipType, declaration, ...rest });
  const finalRecord = statusOverride ? { ...record, status: statusOverride } : record;
  await setJSON(store, linkKey(finalRecord.id), finalRecord);
  await setJSON(store, bySourceKey(sourceRef, finalRecord.id), buildMembershipRecord({ linkId: finalRecord.id, canonicalRef: sourceRef }));
  await setJSON(store, byTargetKey(targetRef, finalRecord.id), buildMembershipRecord({ linkId: finalRecord.id, canonicalRef: targetRef }));
  return finalRecord;
}

const tasksContext = createAccessContext({ workflow: 'tasks' });
const TASK_REF = 'tasks:task:task_email_seth';
const PERSON_REF = 'shared:person:person_seth';
const ORG_REF = 'shared:organisation:organisation_unsw';

async function seedTask(store) {
  await setJSON(store, taskKey('task_email_seth'), { id: 'task_email_seth', title: 'Email Seth about the proposal', status: 'open' });
}

async function seedPerson(store, overrides = {}) {
  await setJSON(store, personKey('person_seth'), { id: 'person_seth', display_name: 'Seth Example', lifecycle_status: 'active', ...overrides });
}

async function seedOrganisation(store) {
  await setJSON(store, organisationKey('organisation_unsw'), { id: 'organisation_unsw', display_name: 'Example University', lifecycle_status: 'active' });
}

function opts(store) {
  return { getStore: async () => store, resolverOptions: { getStore: async () => store } };
}

test('listOutgoing resolves the target endpoint for an accessible current link', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  await seedPerson(store);
  await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });

  const results = await listOutgoing(TASK_REF, tasksContext, opts(store));
  assert.equal(results.length, 1);
  assert.equal(results[0].endpoint.kind, 'person');
  assert.equal(results[0].endpoint.display_label, 'Seth Example');
  assert.equal(results[0].link.relationship_type, 'collaborator');
});

test('listIncoming resolves the source endpoint for an accessible current link', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  await seedPerson(store);
  await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });

  const results = await listIncoming(PERSON_REF, tasksContext, opts(store));
  assert.equal(results.length, 1);
  assert.equal(results[0].endpoint.kind, 'task');
  assert.equal(results[0].endpoint.display_label, 'Email Seth about the proposal');
});

test('listForEntity combines both directions', async () => {
  const store = createMemoryStore();
  await seedPerson(store);
  await seedOrganisation(store);
  await seedTask(store);
  await seedLink(store, { sourceRef: PERSON_REF, targetRef: ORG_REF, relationshipType: 'employee_at', role: 'Teacher', validFrom: '2025-02-01T00:00:00.000Z' });
  await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });

  const { outgoing, incoming } = await listForEntity(PERSON_REF, tasksContext, opts(store));
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].endpoint.kind, 'organisation');
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].endpoint.kind, 'task');
});

test('a link to a missing endpoint is dropped from results, not surfaced with a placeholder', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  // Deliberately do not seed the Person record.
  await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });

  const results = await listOutgoing(TASK_REF, tasksContext, opts(store));
  assert.deepEqual(results, []);
});

test('a link to an archived endpoint is dropped from ordinary (non-archive) results', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  await seedPerson(store, { lifecycle_status: 'archived' });
  await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });

  const results = await listOutgoing(TASK_REF, tasksContext, opts(store));
  assert.deepEqual(results, [], 'archived Person contributes nothing to an ordinary listing, not even a hidden placeholder');
});

test('a suppressed link is excluded from ordinary listing; an ended link stays visible as history', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  await seedPerson(store);
  await seedOrganisation(store);

  await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator', statusOverride: 'suppressed' });
  await seedLink(store, {
    sourceRef: PERSON_REF,
    targetRef: ORG_REF,
    relationshipType: 'member_of',
    validFrom: '2025-01-01T00:00:00.000Z',
    statusOverride: 'ended'
  });

  const outgoingFromTask = await listOutgoing(TASK_REF, tasksContext, opts(store));
  assert.deepEqual(outgoingFromTask, [], 'suppressed links never appear in an ordinary listing');

  const outgoingFromPerson = await listOutgoing(PERSON_REF, tasksContext, opts(store));
  assert.equal(outgoingFromPerson.length, 1, 'an ended relationship remains queryable history');
  assert.equal(outgoingFromPerson[0].link.status, 'ended');
});

test('a link whose stored record disagrees with the requested ref is dropped (defense in depth)', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  await seedPerson(store);
  const record = await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });
  // Corrupt the authoritative record after the membership entries were
  // written with the correct canonical ref, simulating a write bug rather
  // than a hash collision (already covered in universal-link-blobs.test.js).
  await setJSON(store, linkKey(record.id), { ...record, source_ref: 'tasks:task:task_other' });

  const results = await listOutgoing(TASK_REF, tasksContext, opts(store));
  assert.deepEqual(results, []);
});

test('getLink returns an accessible record and 404s a missing or inaccessible one', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  await seedPerson(store);
  const record = await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });

  const fetched = await getLink(record.id, tasksContext, { getStore: async () => store });
  assert.equal(fetched.id, record.id);

  await assert.rejects(
    getLink('ul_does_not_exist', tasksContext, { getStore: async () => store }),
    error => error.status === 404 && error.code === 'endpoint_not_found'
  );

  const noVisibilityContext = { actor: 'operator', workflow: 'tasks', allowed_visibility: [], allowed_entity_kinds: [] };
  await assert.rejects(
    getLink(record.id, noVisibilityContext, { getStore: async () => store }),
    error => error.code === 'endpoint_not_found'
  );
});

test('protected endpoints contribute nothing to result counts', async () => {
  const store = createMemoryStore();
  await seedTask(store);
  await seedPerson(store); // resolvable
  await seedLink(store, { sourceRef: TASK_REF, targetRef: PERSON_REF, relationshipType: 'collaborator' });
  // A second link to a target that will never resolve.
  await seedLink(store, {
    sourceRef: TASK_REF,
    targetRef: 'shared:person:person_missing',
    relationshipType: 'collaborator'
  });

  const results = await listOutgoing(TASK_REF, tasksContext, opts(store));
  assert.equal(results.length, 1, 'the unresolved second link is absent from both the list and its length, not just hidden in the UI');
});
