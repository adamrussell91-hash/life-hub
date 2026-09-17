import assert from 'node:assert/strict';
import test from 'node:test';
import { isLinkActiveAsOf, parseHistoryDate, assembleHistoryGraph } from '../../netlify/functions/_shared/network-ecology-history.mjs';
import { makeLink, makeOrganisation, makePerson, makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

// --- parseHistoryDate ---------------------------------------------------

test('parseHistoryDate accepts a bare YYYY-MM-DD date (what <input type="date"> sends)', () => {
  const parsed = parseHistoryDate('2025-03-15');
  assert.equal(parsed.toISOString(), '2025-03-15T00:00:00.000Z');
});

test('parseHistoryDate accepts a full ISO timestamp', () => {
  const parsed = parseHistoryDate('2025-03-15T12:30:00.000Z');
  assert.equal(parsed.toISOString(), '2025-03-15T12:30:00.000Z');
});

function assertInvalidDate(fn) {
  assert.throws(fn, (err) => err.code === 'invalid_date' && err.status === 400);
}

test('parseHistoryDate rejects malformed input', () => {
  assertInvalidDate(() => parseHistoryDate('not-a-date'));
  assertInvalidDate(() => parseHistoryDate(''));
  assertInvalidDate(() => parseHistoryDate(null));
});

// --- isLinkActiveAsOf: the core point-in-time predicate ------------------

const CUTOFF = Date.parse('2025-06-01T00:00:00.000Z');

test('a link whose valid_from is AFTER the query date is excluded', () => {
  const link = { valid_from: '2025-07-01T00:00:00.000Z', valid_to: null };
  assert.equal(isLinkActiveAsOf(link, CUTOFF), false);
});

test('a link that ENDED before the query date is excluded', () => {
  const link = { valid_from: '2024-01-01T00:00:00.000Z', valid_to: '2025-05-01T00:00:00.000Z' };
  assert.equal(isLinkActiveAsOf(link, CUTOFF), false);
});

test('CORE CASE: a link that started before the query date and ended AFTER it IS included — it was active back then even though it has since ended', () => {
  const link = { valid_from: '2024-01-01T00:00:00.000Z', valid_to: '2025-12-01T00:00:00.000Z' };
  assert.equal(isLinkActiveAsOf(link, CUTOFF), true);
});

test('a link still open today (valid_to: null) with valid_from before the query date is included', () => {
  const link = { valid_from: '2024-01-01T00:00:00.000Z', valid_to: null };
  assert.equal(isLinkActiveAsOf(link, CUTOFF), true);
});

test('a link with no known valid_from (null) is not excluded on that basis alone', () => {
  const link = { valid_from: null, valid_to: null };
  assert.equal(isLinkActiveAsOf(link, CUTOFF), true);
});

test('boundary: valid_from exactly at the cutoff instant is included', () => {
  const link = { valid_from: new Date(CUTOFF).toISOString(), valid_to: null };
  assert.equal(isLinkActiveAsOf(link, CUTOFF), true);
});

test('boundary: valid_to exactly at the cutoff instant is included (still active at that instant)', () => {
  const link = { valid_from: '2024-01-01T00:00:00.000Z', valid_to: new Date(CUTOFF).toISOString() };
  assert.equal(isLinkActiveAsOf(link, CUTOFF), true);
});

// --- End-to-end: habitat classification genuinely CHANGES across two
// historical dates on the SAME underlying data ---------------------------

test('habitat classification differs at two different historical dates: a cluster is NOT yet Forest before a key relationship starts, and IS Forest after', async () => {
  const store = memoryStore();
  const org = await makeOrganisation(store, { display_name: 'Old Guard Collective' });

  // 6 members — deliberately ABOVE ISLAND_MAX_SIZE (5), so this cluster
  // can never land on Island regardless of its bridgeRatio (0 here), and
  // the test genuinely exercises the Forest density/duration boundary
  // rather than accidentally being decided by the Island rule first (the
  // same reason habitat-classification.test.js's own Forest fixtures use
  // `size: Math.max(FOREST_MIN_SIZE, ISLAND_MAX_SIZE + 1)`).
  const people = [];
  for (let i = 0; i < 6; i += 1) {
    const person = await makePerson(store, { display_name: `Member ${i}` });
    people.push(person);
    await makeLink(store, { sourceRef: person.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  }
  const [p0, p1, p2, p3, p4, p5] = people;

  // 6 members -> 15 possible pairs. FOREST_MIN_DENSITY is 0.4, i.e. >= 6
  // linked pairs. 5 professional_relationship links exist from the start
  // (2020) — density 5/15 (~0.33), below the floor. The 6TH link (p0-p5)
  // only starts in 2026 — this is the key relationship whose start date
  // changes what's "current" (density) at each historical query date. All
  // links share one role so roleDiversity stays low, keeping this
  // genuinely off Reef too (not just off Forest) before the 6th link.
  await makeLink(store, { sourceRef: p0.ref, targetRef: p1.ref, relationshipType: 'professional_relationship', role: 'colleague', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: p0.ref, targetRef: p2.ref, relationshipType: 'professional_relationship', role: 'colleague', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: p0.ref, targetRef: p3.ref, relationshipType: 'professional_relationship', role: 'colleague', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: p0.ref, targetRef: p4.ref, relationshipType: 'professional_relationship', role: 'colleague', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: p1.ref, targetRef: p2.ref, relationshipType: 'professional_relationship', role: 'colleague', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: p0.ref, targetRef: p5.ref, relationshipType: 'professional_relationship', role: 'colleague', validFrom: '2026-01-01T00:00:00.000Z' });

  const deps = { store, now: new Date('2027-01-01T00:00:00.000Z'), resolveEntity: makeResolveEntity(store) };

  // BEFORE the 6th relationship starts: density is only 5/15 (~0.33),
  // below FOREST_MIN_DENSITY (0.4) — not Forest.
  const before = await assembleHistoryGraph('2025-06-01T00:00:00.000Z', deps);
  const beforeCluster = before.clusters.find((c) => c.id === org.ref);
  assert.ok(beforeCluster, 'expected an organisation cluster to exist before the 6th relationship starts');
  assert.notEqual(beforeCluster.habitat, 'forest');

  // AFTER the 6th relationship starts: density is 6/15 (0.4), clearing
  // FOREST_MIN_DENSITY, with long duration already established (all
  // memberships since 2020) — Forest.
  const after = await assembleHistoryGraph('2026-06-01T00:00:00.000Z', deps);
  const afterCluster = after.clusters.find((c) => c.id === org.ref);
  assert.ok(afterCluster, 'expected an organisation cluster to exist after the 6th relationship starts');
  assert.equal(afterCluster.habitat, 'forest');
});

test('a link that has since ended is correctly counted as part of an earlier historical cluster (organisation membership)', async () => {
  const store = memoryStore();
  const org = await makeOrganisation(store, { display_name: 'Departed Org' });
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  // Bob was a member 2020-2022, but has since left (ended) — status is
  // 'ended' today, yet he WAS a current member as of the 2021 query date.
  await makeLink(store, {
    sourceRef: bob.ref,
    targetRef: org.ref,
    relationshipType: 'employee_at',
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: '2022-01-01T00:00:00.000Z'
  });

  const deps = { store, now: new Date('2027-01-01T00:00:00.000Z'), resolveEntity: makeResolveEntity(store) };

  const duringMembership = await assembleHistoryGraph('2021-01-01T00:00:00.000Z', deps);
  const clusterDuring = duringMembership.clusters.find((c) => c.id === org.ref);
  assert.ok(clusterDuring, 'Bob (ended today) was active as of 2021, so a 2-person cluster must exist then');
  assert.deepEqual(clusterDuring.member_refs.sort(), [alice.ref, bob.ref].sort());

  const afterDeparture = await assembleHistoryGraph('2023-01-01T00:00:00.000Z', deps);
  // Only Alice remains as of 2023 — below the >= 2 candidate floor, so no
  // cluster at all (never a degenerate 1-person cluster).
  assert.equal(afterDeparture.clusters.find((c) => c.id === org.ref), undefined);
});

test('a link starting in the future relative to the query date is excluded from that historical view', async () => {
  const store = memoryStore();
  const org = await makeOrganisation(store, { display_name: 'Future Org' });
  const alice = await makePerson(store, { display_name: 'Alice' });
  const bob = await makePerson(store, { display_name: 'Bob' });

  await makeLink(store, { sourceRef: alice.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2020-01-01T00:00:00.000Z' });
  await makeLink(store, { sourceRef: bob.ref, targetRef: org.ref, relationshipType: 'employee_at', validFrom: '2030-01-01T00:00:00.000Z' });

  const deps = { store, now: new Date('2027-01-01T00:00:00.000Z'), resolveEntity: makeResolveEntity(store) };
  const result = await assembleHistoryGraph('2025-01-01T00:00:00.000Z', deps);
  const cluster = result.clusters.find((c) => c.id === org.ref);
  assert.equal(cluster, undefined, 'Bob has not joined yet as of 2025, so only 1 active member — below the floor');
  // Bob still appears as a NODE (every visible Person is a node, same as
  // /world's own behaviour) — it is specifically his employee_at EDGE and
  // his CLUSTER membership that must be absent as of 2025, since that link
  // has not started yet at that historical instant.
  assert.deepEqual(result.nodes.map((n) => n.ref).sort(), [alice.ref, bob.ref, org.ref].sort());
  assert.ok(
    !result.edges.some((e) => e.source_ref === bob.ref || e.target_ref === bob.ref),
    "Bob's future-dated employee_at link must not appear as an edge as of the 2025 query date"
  );
});

test('response echoes the queried date so the client can confirm what it is displaying', async () => {
  const store = memoryStore();
  await makePerson(store, { display_name: 'Alice' });
  const result = await assembleHistoryGraph('2025-03-15', {
    store,
    now: new Date('2027-01-01T00:00:00.000Z'),
    resolveEntity: makeResolveEntity(store)
  });
  assert.equal(result.date, '2025-03-15T00:00:00.000Z');
});

test('a future date relative to real "now" is handled gracefully, not as an error', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const result = await assembleHistoryGraph('2099-01-01T00:00:00.000Z', {
    store,
    now: new Date('2027-01-01T00:00:00.000Z'),
    resolveEntity: makeResolveEntity(store)
  });
  assert.ok(result.nodes.some((n) => n.ref === alice.ref));
  assert.deepEqual(result.clusters, []);
});

test('event/meeting clusters are never included in History mode results (documented scoping decision)', async () => {
  const store = memoryStore();
  const alice = await makePerson(store, { display_name: 'Alice' });
  const result = await assembleHistoryGraph('2025-01-01T00:00:00.000Z', {
    store,
    now: new Date('2027-01-01T00:00:00.000Z'),
    resolveEntity: makeResolveEntity(store)
  });
  assert.ok(!result.clusters.some((c) => c.kind === 'event'));
  assert.ok(result.nodes.some((n) => n.ref === alice.ref));
});
