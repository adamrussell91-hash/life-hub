import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllPeopleWithRelationships } from '../../netlify/functions/_shared/people-collection.mjs';
import { makeLink, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

test('loads every Person, each paired with an empty relationships array when none exist', async () => {
  const store = memoryStore();
  await makePerson(store, { display_name: 'Alice' });
  await makePerson(store, { display_name: 'Bob' });

  const result = await loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });

  assert.equal(result.length, 2);
  const names = result.map((r) => r.person.display_name).sort();
  assert.deepEqual(names, ['Alice', 'Bob']);
  for (const { relationships } of result) assert.deepEqual(relationships, []);
});

test('aggregates a fixture set of people/links, merging outgoing + incoming for each person', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'Acme' });

  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: bob.ref,
    relationshipType: 'professional_relationship',
    role: 'mentor',
    validFrom: '2026-01-01T00:00:00.000Z'
  });
  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: org.ref,
    relationshipType: 'employee_at',
    validFrom: '2025-01-01T00:00:00.000Z'
  });

  const result = await loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });

  const aliceRow = result.find((r) => r.person.id === alice.id);
  const bobRow = result.find((r) => r.person.id === bob.id);

  // Alice: outgoing professional_relationship (to Bob) + outgoing employee_at (to org).
  assert.equal(aliceRow.relationships.length, 2);
  const aliceTypes = aliceRow.relationships.map((e) => e.link.relationship_type).sort();
  assert.deepEqual(aliceTypes, ['employee_at', 'professional_relationship']);
  const aliceProfRel = aliceRow.relationships.find((e) => e.link.relationship_type === 'professional_relationship');
  assert.equal(aliceProfRel.direction, 'outgoing');
  assert.equal(aliceProfRel.endpoint.ref, bob.ref);
  assert.equal(aliceProfRel.endpoint.kind, 'person');

  // Bob: only the incoming professional_relationship from Alice.
  assert.equal(bobRow.relationships.length, 1);
  assert.equal(bobRow.relationships[0].direction, 'incoming');
  assert.equal(bobRow.relationships[0].endpoint.ref, alice.ref);
});

test('each person carries its own canonical ref alongside the hydrated record', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const result = await loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });
  assert.equal(result[0].person.ref, alice.ref);
  assert.equal(result[0].person.display_name, 'Alice');
});

test('an archived person still appears with their relationship history intact', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: bob.ref,
    relationshipType: 'professional_relationship',
    validFrom: '2026-01-01T00:00:00.000Z'
  });
  await store.setJSON(`entities/person/${alice.id}`, { ...(await store.get(`entities/person/${alice.id}`)), lifecycle_status: 'archived' });

  const result = await loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });
  const aliceRow = result.find((r) => r.person.id === alice.id);
  assert.equal(aliceRow.person.lifecycle_status, 'archived');
  assert.equal(aliceRow.relationships.length, 1);
});

test('a person with zero Universal Links of any kind still appears with an empty array', async () => {
  const store = memoryStore();
  const lonely = await makePerson(store, { display_name: 'Lonely' });
  const result = await loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });
  assert.equal(result.length, 1);
  assert.equal(result[0].person.id, lonely.id);
  assert.deepEqual(result[0].relationships, []);
});
