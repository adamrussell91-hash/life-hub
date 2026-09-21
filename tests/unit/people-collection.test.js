import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllPeopleWithRelationships } from '../../netlify/functions/_shared/people-collection.mjs';
import { makeLink, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';
import {
  deriveOrganisationId,
  derivePersonId,
  resetProfessionalDataCache
} from '../../netlify/functions/_shared/github-professional-data.mjs';
import { resolveOrganisation, resolvePerson } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { endpointNotFoundError } from '../../netlify/functions/_shared/entity-access.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';

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

function githubFetch({ people, organisations, relationships }) {
  return async (url) => {
    const href = String(url);
    const body = (data) => ({
      ok: true,
      status: 200,
      json: async () => ({ content: Buffer.from(JSON.stringify(data)).toString('base64') })
    });
    if (href.endsWith('/data/professional/people.json')) return body(people);
    if (href.endsWith('/data/professional/organisations.json')) return body(organisations);
    if (href.endsWith('/data/professional/relationships.json')) return body(relationships);
    return { ok: false, status: 404 };
  };
}

test('a person with zero Universal Links of any kind still appears with an empty array', async () => {
  const store = memoryStore();
  const lonely = await makePerson(store, { display_name: 'Lonely' });
  const result = await loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });
  assert.equal(result.length, 1);
  assert.equal(result[0].person.id, lonely.id);
  assert.deepEqual(result[0].relationships, []);
});

test('merges GitHub-imported people and their org relationships into the collection', async () => {
  resetProfessionalDataCache();
  const store = memoryStore();
  const native = await makePerson(store, { display_name: 'Native Only' });
  const env = { GITHUB_TOKEN: 'token' };
  const fetchImpl = githubFetch({
    people: [
      { legacy_id: 'leg-self', display_name: 'Adam Russell', is_self: true },
      { legacy_id: 'leg-colleague', display_name: 'Natalie Shih' }
    ],
    organisations: [{ legacy_id: 'leg-org-1', display_name: 'St. Aloysius College' }],
    relationships: [
      {
        person_legacy_id: 'leg-self',
        organisation_legacy_id: 'leg-org-1',
        relationship_type: 'employee_at',
        role: 'Gifted Education Teacher',
        valid_from: null,
        valid_to: null
      },
      {
        person_legacy_id: 'leg-colleague',
        organisation_legacy_id: 'leg-org-1',
        relationship_type: 'employee_at',
        role: null,
        valid_from: null,
        valid_to: null
      }
    ]
  });
  const resolveEntity = async (refInput, accessContext, options = {}) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (!ref) throw endpointNotFoundError();
    const withGithub = { ...options, env, fetchImpl, getStore: async () => store };
    if (ref.namespace === 'shared' && ref.kind === 'person') return resolvePerson(ref.id, accessContext, withGithub);
    if (ref.namespace === 'shared' && ref.kind === 'organisation') {
      return resolveOrganisation(ref.id, accessContext, withGithub);
    }
    throw endpointNotFoundError();
  };

  const result = await loadAllPeopleWithRelationships({ store, resolveEntity, env, fetchImpl });
  assert.equal(result.length, 3);
  assert.ok(result.some((row) => row.person.id === native.id));

  const self = result.find((row) => row.person.display_name === 'Adam Russell');
  const colleague = result.find((row) => row.person.display_name === 'Natalie Shih');
  assert.equal(self.person.is_self, true);
  assert.equal(self.person.id, derivePersonId('leg-self'));
  assert.equal(self.relationships.length, 1);
  assert.equal(self.relationships[0].link.relationship_type, 'employee_at');
  assert.equal(self.relationships[0].endpoint.display_label, 'St. Aloysius College');
  assert.equal(colleague.relationships[0].endpoint.ref, `shared:organisation:${deriveOrganisationId('leg-org-1')}`);
});
