import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllPeopleWithRelationships } from '../../netlify/functions/_shared/people-collection.mjs';
import { createObservationRepository } from '../../netlify/functions/_shared/observation-repository.mjs';
import { runRelationalSearch, searchPeopleRelationally } from '../../netlify/functions/_shared/relational-search.mjs';
import {
  makeLink,
  makeObservation,
  makeOrganisation,
  makePerson,
  makeResolveEntity,
  memoryStore
} from '../support/people-fixtures.mjs';

async function loadWithObservations(store, professionalStore) {
  const people = await loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });
  const observationRepo = createObservationRepository({ store: professionalStore });
  const withObservations = [];
  for (const entry of people) {
    const observations = await observationRepo.listObservationsForAboutRef(entry.person.ref);
    withObservations.push({ ...entry, observations });
  }
  return withObservations;
}

test('zero-filter query is rejected with a 400-shaped error', async () => {
  const store = memoryStore();
  const people = await loadWithObservations(store, memoryStore());
  assert.throws(
    () => runRelationalSearch(people, {}),
    (error) => error.status === 400 && error.code === 'missing_filter'
  );
});

test('organisation_ref filter: only people with a CURRENT employee_at/member_of link to that org match', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });
  const otherOrg = await makeOrganisation(store, { display_name: 'Acme' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: otherOrg.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });

  const people = await loadWithObservations(store, professionalStore);
  const results = runRelationalSearch(people, { organisation_ref: org.ref });

  assert.equal(results.length, 1);
  assert.equal(results[0].person_ref, alice.ref);
  assert.deepEqual(results[0].matched_reasons, ['Employed at UNSW']);
});

test('organisation_ref filter excludes an ended (non-current) link', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: org.ref,
    relationshipType: 'employee_at',
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: '2021-01-01T00:00:00.000Z'
  });

  const people = await loadWithObservations(store, professionalStore);
  const results = runRelationalSearch(people, { organisation_ref: org.ref });
  assert.equal(results.length, 0);
});

test('role filter: only people with a CURRENT professional_relationship link of that role match', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const carol = await makePerson(store, { display_name: 'Carol' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', role: 'academic_contact', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: carol.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', role: 'mentor', validFrom: '2025-01-01T00:00:00.000Z' });

  const people = await loadWithObservations(store, professionalStore);
  const results = runRelationalSearch(people, { role: 'academic_contact' });

  const matchedRefs = results.map((r) => r.person_ref).sort();
  // Both endpoints of the link (Alice as source, Bob as target-counterpart)
  // carry the relationship in their own relationship list per
  // people-collection.mjs's documented per-person merge — assert Alice is
  // present and carries the role reason; Carol (a different role) is not.
  assert.ok(matchedRefs.includes(alice.ref));
  assert.ok(!matchedRefs.includes(carol.ref));
  const aliceResult = results.find((r) => r.person_ref === alice.ref);
  assert.deepEqual(aliceResult.matched_reasons, ['Role: academic_contact']);
});

test('invalid role value is rejected with a 400-shaped error', async () => {
  const store = memoryStore();
  const people = await loadWithObservations(store, memoryStore());
  assert.throws(
    () => runRelationalSearch(people, { role: 'not_a_real_role' }),
    (error) => error.status === 400 && error.code === 'invalid_role'
  );
});

test('text filter matches a current professional_relationship link\'s human_label, case-insensitively', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const carol = await makePerson(store, { display_name: 'Carol' });

  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: bob.ref,
    relationshipType: 'professional_relationship',
    role: 'academic_contact',
    validFrom: '2025-01-01T00:00:00.000Z',
    metadata: { human_label: 'Connected through Gifted Education Network' }
  });
  await makeLink(store, {
    sourceRef: carol.ref,
    targetRef: bob.ref,
    relationshipType: 'professional_relationship',
    role: 'colleague',
    validFrom: '2025-01-01T00:00:00.000Z',
    metadata: { human_label: 'Worked together on assessment reform' }
  });

  const people = await loadWithObservations(store, professionalStore);
  const results = runRelationalSearch(people, { text: 'GIFTED education' });

  const matchedRefs = results.map((r) => r.person_ref);
  assert.ok(matchedRefs.includes(alice.ref));
  assert.ok(!matchedRefs.includes(carol.ref));
  const aliceResult = results.find((r) => r.person_ref === alice.ref);
  assert.ok(aliceResult.matched_reasons.some((r) => r.includes('Human label') && r.includes('GIFTED education')));
});

test('text filter matches an Observation\'s text, case-insensitively', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });

  await makeObservation(professionalStore, {
    aboutRef: alice.ref,
    text: 'Mentioned her work on Gifted Education policy at the last conference.'
  });
  await makeObservation(professionalStore, {
    aboutRef: bob.ref,
    text: 'Discussed budget planning for next quarter.'
  });

  const people = await loadWithObservations(store, professionalStore);
  const results = runRelationalSearch(people, { text: 'gifted education' });

  assert.equal(results.length, 1);
  assert.equal(results[0].person_ref, alice.ref);
  assert.deepEqual(results[0].matched_reasons, [`Observation mentions 'gifted education'`]);
});

test('AND semantics: a person matching organisation but NOT role is excluded when both filters given', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const carol = await makePerson(store, { display_name: 'Carol' });
  const dave = await makePerson(store, { display_name: 'Dave' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  // Alice: matches BOTH organisation and role -> should appear.
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', role: 'academic_contact', validFrom: '2025-01-01T00:00:00.000Z' });

  // Carol: matches organisation only -> must NOT appear.
  await makeLink(store, { sourceRef: carol.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });

  // Dave: matches role only (with someone unrelated to the org) -> must NOT appear.
  await makeLink(store, { sourceRef: dave.ref, targetRef: bob.ref, relationshipType: 'professional_relationship', role: 'academic_contact', validFrom: '2025-01-01T00:00:00.000Z' });

  const people = await loadWithObservations(store, professionalStore);
  const results = runRelationalSearch(people, { organisation_ref: org.ref, role: 'academic_contact' });

  assert.equal(results.length, 1);
  assert.equal(results[0].person_ref, alice.ref);
  assert.deepEqual(results[0].matched_reasons.sort(), ['Employed at UNSW', 'Role: academic_contact'].sort());
});

test('results are ordered alphabetically by display name, and carry no numeric score field anywhere', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const org = await makeOrganisation(store, { display_name: 'UNSW' });
  const carol = await makePerson(store, { display_name: 'Carol' });
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });

  for (const person of [carol, alice, bob]) {
    await makeLink(store, { sourceRef: person.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  }

  const people = await loadWithObservations(store, professionalStore);
  const results = runRelationalSearch(people, { organisation_ref: org.ref });

  assert.deepEqual(results.map((r) => r.display_name), ['Alice', 'Bob', 'Carol']);
  for (const result of results) {
    assert.equal(Object.keys(result).sort().join(','), 'display_name,matched_reasons,person_ref');
    assert.ok(!('score' in result));
    assert.ok(!('rank' in result));
    assert.ok(!('relevance' in result));
    for (const value of Object.values(result)) {
      assert.notEqual(typeof value, 'number');
    }
  }
});

test('searchPeopleRelationally: end-to-end orchestrator loads people + attaches observations via bounded concurrency', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeObservation(professionalStore, { aboutRef: alice.ref, text: 'Interested in gifted education programs.' });

  const results = await searchPeopleRelationally(
    { text: 'gifted education' },
    { store, professionalStore, resolveEntity: makeResolveEntity(store), now: new Date() }
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].person_ref, alice.ref);
});
