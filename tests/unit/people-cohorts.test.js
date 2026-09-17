import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllPeopleWithRelationships } from '../../netlify/functions/_shared/people-collection.mjs';
import { computeDynamicCohorts } from '../../netlify/functions/_shared/people-cohorts.mjs';
import { makeLink, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

async function load(store) {
  return loadAllPeopleWithRelationships({ store, resolveEntity: makeResolveEntity(store) });
}

test('people sharing a current organisation link with >= 2 members group into one cohort', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const carol = await makePerson(store, { display_name: 'Carol' });
  const org = await makeOrganisation(store, { display_name: 'UNSW' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: org.ref, relationshipType: 'member_of', validFrom: '2025-02-01T00:00:00.000Z' });
  // Carol is unrelated — she should not appear in the UNSW cohort.

  const people = await load(store);
  const cohorts = computeDynamicCohorts(people);

  assert.equal(cohorts.length, 1);
  assert.equal(cohorts[0].label, 'UNSW');
  assert.equal(cohorts[0].kind, 'organisation');
  const memberNames = cohorts[0].members.map((m) => m.display_name).sort();
  assert.deepEqual(memberNames, ['Alice', 'Bob']);
  assert.ok(!memberNames.includes('Carol'));
});

test('a person with no shared context appears in zero cohorts — never a default "Uncategorised" cohort', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const lonely = await makePerson(store, { display_name: 'Lonely' });
  const org = await makeOrganisation(store, { display_name: 'Acme' });

  // Only Alice is linked to Acme — one person alone doesn't make a cohort.
  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });

  const people = await load(store);
  const cohorts = computeDynamicCohorts(people);

  assert.equal(cohorts.length, 0, 'a single-person org link never forms a cohort');
  for (const cohort of cohorts) {
    assert.notEqual(cohort.label, 'Uncategorised');
  }
  // Lonely appears in no cohort at all — not swept into a fallback bucket.
  const allMemberRefs = cohorts.flatMap((c) => c.members.map((m) => m.ref));
  assert.ok(!allMemberRefs.includes(lonely.ref));
  assert.ok(!allMemberRefs.includes(alice.ref));
});

test('an ended (non-current) organisation link does not count toward a cohort', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });
  const org = await makeOrganisation(store, { display_name: 'Old Co' });

  await makeLink(store, {
    sourceRef: alice.ref,
    targetRef: org.ref,
    relationshipType: 'employee_at',
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: '2021-01-01T00:00:00.000Z'
  });
  await makeLink(store, { sourceRef: bob.ref, targetRef: org.ref, relationshipType: 'member_of', validFrom: '2025-01-01T00:00:00.000Z' });

  const people = await load(store);
  const cohorts = computeDynamicCohorts(people);
  assert.equal(cohorts.length, 0, 'only one currently-linked member (Bob) remains — not a cohort');
});

test('two separate organisations each with >= 2 current members produce two cohorts, sorted by size then label', async () => {
  const store = memoryStore();
  const a = await makePerson(store, { display_name: 'A' });
  const b = await makePerson(store, { display_name: 'B' });
  const c = await makePerson(store, { display_name: 'C' });
  const d = await makePerson(store, { display_name: 'D' });
  const bigOrg = await makeOrganisation(store, { display_name: 'Big Org' });
  const smallOrg = await makeOrganisation(store, { display_name: 'Small Org' });

  await makeLink(store, { sourceRef: a.ref, targetRef: bigOrg.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: b.ref, targetRef: bigOrg.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: c.ref, targetRef: bigOrg.ref, relationshipType: 'employee_at', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: c.ref, targetRef: smallOrg.ref, relationshipType: 'member_of', validFrom: '2025-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: d.ref, targetRef: smallOrg.ref, relationshipType: 'member_of', validFrom: '2025-01-01T00:00:00.000Z' });

  const people = await load(store);
  const cohorts = computeDynamicCohorts(people);
  assert.equal(cohorts.length, 2);
  assert.equal(cohorts[0].label, 'Big Org');
  assert.equal(cohorts[0].members.length, 3);
  assert.equal(cohorts[1].label, 'Small Org');
  assert.equal(cohorts[1].members.length, 2);
});

test('empty state: no cohorts when nobody shares an organisation', async () => {
  const store = memoryStore();
  await makePerson(store, { display_name: 'Solo' });
  const people = await load(store);
  assert.deepEqual(computeDynamicCohorts(people), []);
});
