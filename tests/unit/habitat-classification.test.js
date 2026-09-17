import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOREST_MIN_DENSITY,
  FOREST_MIN_DURATION_DAYS,
  FOREST_MIN_SIZE,
  REEF_MIN_DENSITY,
  REEF_MIN_ROLE_DIVERSITY,
  REEF_MIN_SIZE,
  SAVANNAH_MIN_SIZE,
  SAVANNAH_MAX_DENSITY,
  ISLAND_MAX_BRIDGE_RATIO,
  ISLAND_MAX_SIZE,
  classifyHabitat,
  computeBridgePeople,
  computeOrganisationClusterStats
} from '../../netlify/functions/_shared/habitat-classification.mjs';

// --- Wetland: event clusters only ------------------------------------------

test('Wetland: a qualifying event cluster (size >= 2, in window) classifies as wetland', () => {
  const result = classifyHabitat({ kind: 'event', size: 2, inWindow: true });
  assert.equal(result, 'wetland');
});

test('Wetland: an event cluster below the size floor does not classify as wetland', () => {
  const result = classifyHabitat({ kind: 'event', size: 1, inWindow: true });
  assert.equal(result, null);
});

test('Wetland: an event cluster outside the time window does not classify as wetland', () => {
  const result = classifyHabitat({ kind: 'event', size: 4, inWindow: false });
  assert.equal(result, null);
});

test('Wetland never applies to an organisation cluster, even with identical size/candidacy stats to a qualifying event cluster', () => {
  const organisationCluster = {
    kind: 'organisation',
    size: 2,
    density: 0,
    avgDurationDays: 0,
    roleDiversity: 0,
    bridgeRatio: 1 // bypass Island so we can see the org cluster fall through to null, never wetland
  };
  const result = classifyHabitat(organisationCluster);
  assert.notEqual(result, 'wetland');
  assert.equal(result, null);
});

// --- Island ------------------------------------------------------------------

test('Island: exactly at the size and bridgeRatio boundary classifies as island', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: ISLAND_MAX_SIZE,
    bridgeRatio: ISLAND_MAX_BRIDGE_RATIO,
    density: 0,
    avgDurationDays: 0,
    roleDiversity: 0
  });
  assert.equal(result, 'island');
});

test('Island: just over the size boundary does not classify as island', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: ISLAND_MAX_SIZE + 1,
    bridgeRatio: ISLAND_MAX_BRIDGE_RATIO,
    density: 0,
    avgDurationDays: 0,
    roleDiversity: 0
  });
  assert.notEqual(result, 'island');
  assert.equal(result, null);
});

test('Island: just over the bridgeRatio boundary does not classify as island', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: ISLAND_MAX_SIZE,
    bridgeRatio: ISLAND_MAX_BRIDGE_RATIO + 0.01,
    density: 0,
    avgDurationDays: 0,
    roleDiversity: 0
  });
  assert.notEqual(result, 'island');
  assert.equal(result, null);
});

// --- Forest --------------------------------------------------------------

test('Forest: exactly at the density/duration/size boundary classifies as forest', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: Math.max(FOREST_MIN_SIZE, ISLAND_MAX_SIZE + 1),
    density: FOREST_MIN_DENSITY,
    avgDurationDays: FOREST_MIN_DURATION_DAYS,
    roleDiversity: 0,
    bridgeRatio: 0
  });
  assert.equal(result, 'forest');
});

test('Forest: just under the density boundary does not classify as forest', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: Math.max(FOREST_MIN_SIZE, ISLAND_MAX_SIZE + 1),
    density: FOREST_MIN_DENSITY - 0.01,
    avgDurationDays: FOREST_MIN_DURATION_DAYS,
    roleDiversity: 0, // deliberately below REEF_MIN_ROLE_DIVERSITY so this doesn't accidentally land on reef
    bridgeRatio: 0
  });
  assert.notEqual(result, 'forest');
  assert.equal(result, null);
});

test('Forest: just under the duration boundary does not classify as forest', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: Math.max(FOREST_MIN_SIZE, ISLAND_MAX_SIZE + 1),
    density: FOREST_MIN_DENSITY,
    avgDurationDays: FOREST_MIN_DURATION_DAYS - 1,
    roleDiversity: 0,
    bridgeRatio: 0
  });
  assert.notEqual(result, 'forest');
  assert.equal(result, null);
});

test('Forest: just under the size boundary does not classify as forest', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: FOREST_MIN_SIZE - 1,
    density: FOREST_MIN_DENSITY,
    avgDurationDays: FOREST_MIN_DURATION_DAYS,
    roleDiversity: 0,
    bridgeRatio: 1 // bypass Island (which would otherwise claim this small, low-density-irrelevant cluster)
  });
  assert.notEqual(result, 'forest');
  assert.equal(result, null);
});

// --- Reef ------------------------------------------------------------------

test('Reef: exactly at the density/roleDiversity/size boundary classifies as reef', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: Math.max(REEF_MIN_SIZE, ISLAND_MAX_SIZE + 1),
    density: REEF_MIN_DENSITY,
    avgDurationDays: 1, // deliberately short, so this cannot also satisfy Forest
    roleDiversity: REEF_MIN_ROLE_DIVERSITY,
    bridgeRatio: 0
  });
  assert.equal(result, 'reef');
});

test('Reef: just under the density boundary does not classify as reef', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: Math.max(REEF_MIN_SIZE, ISLAND_MAX_SIZE + 1),
    density: REEF_MIN_DENSITY - 0.01,
    avgDurationDays: 1,
    roleDiversity: REEF_MIN_ROLE_DIVERSITY,
    bridgeRatio: 0
  });
  assert.notEqual(result, 'reef');
  assert.equal(result, null);
});

test('Reef: just under the roleDiversity boundary does not classify as reef', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: Math.max(REEF_MIN_SIZE, ISLAND_MAX_SIZE + 1),
    density: REEF_MIN_DENSITY,
    avgDurationDays: 1,
    roleDiversity: REEF_MIN_ROLE_DIVERSITY - 0.01,
    bridgeRatio: 0
  });
  assert.notEqual(result, 'reef');
  assert.equal(result, null);
});

// --- Savannah ----------------------------------------------------------------

test('Savannah: exactly at the size/density boundary classifies as savannah', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: SAVANNAH_MIN_SIZE,
    density: SAVANNAH_MAX_DENSITY,
    avgDurationDays: 0,
    roleDiversity: 0,
    bridgeRatio: 0
  });
  assert.equal(result, 'savannah');
});

test('Savannah: just under the size boundary does not classify as savannah', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: SAVANNAH_MIN_SIZE - 1,
    density: SAVANNAH_MAX_DENSITY,
    avgDurationDays: 0,
    roleDiversity: 0,
    bridgeRatio: 0
  });
  assert.notEqual(result, 'savannah');
  assert.equal(result, null);
});

test('Savannah: just over the density boundary does not classify as savannah', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: SAVANNAH_MIN_SIZE,
    density: SAVANNAH_MAX_DENSITY + 0.01,
    avgDurationDays: 0,
    roleDiversity: 0,
    bridgeRatio: 0
  });
  assert.notEqual(result, 'savannah');
  assert.equal(result, null);
});

// --- Explicit "no habitat forced" case ---------------------------------------

test('a genuinely ungrouped cluster classifies as null, not an error and not a forced habitat', () => {
  const result = classifyHabitat({
    kind: 'organisation',
    size: 4,
    density: 0.1,
    avgDurationDays: 50,
    roleDiversity: 0.1,
    bridgeRatio: 0.5 // bypass Island
  });
  assert.equal(result, null);
});

test('classifyHabitat handles a missing/undersized cluster without throwing', () => {
  assert.equal(classifyHabitat(null), null);
  assert.equal(classifyHabitat({ kind: 'organisation', size: 1, density: 1, avgDurationDays: 9999, roleDiversity: 1, bridgeRatio: 0 }), null);
});

// --- computeOrganisationClusterStats -----------------------------------------

test('computeOrganisationClusterStats computes density/avgDurationDays/roleDiversity/bridgeRatio from raw groups + current professional_relationship links', () => {
  const now = new Date('2027-01-01T00:00:00.000Z');
  const groups = [
    {
      ref: 'shared:organisation:org-a',
      display_name: 'Org A',
      members: [
        { ref: 'shared:person:alice', display_name: 'Alice', link: { valid_from: '2026-01-01T00:00:00.000Z' } },
        { ref: 'shared:person:bob', display_name: 'Bob', link: { valid_from: '2026-01-01T00:00:00.000Z' } },
        { ref: 'shared:person:carol', display_name: 'Carol', link: { valid_from: '2026-01-01T00:00:00.000Z' } }
      ]
    }
  ];
  const links = [
    { id: 'link_1', source_ref: 'shared:person:alice', target_ref: 'shared:person:bob', role: 'mentor' },
    { id: 'link_2', source_ref: 'shared:person:bob', target_ref: 'shared:person:carol', role: 'colleague' }
  ];

  const [stats] = computeOrganisationClusterStats(groups, links, { now });
  assert.equal(stats.size, 3);
  // 2 links among 3 possible pairs (3 choose 2 = 3)
  assert.equal(stats.density, 2 / 3);
  assert.equal(Math.round(stats.avgDurationDays), 365);
  assert.equal(stats.roleDiversity, 1); // 2 distinct roles / 2 links
  assert.equal(stats.bridgeRatio, 0); // nobody belongs to a second cluster in this input
});

test('computeOrganisationClusterStats: bridgeRatio counts members who also belong to another size>=2 group in the input', () => {
  const groups = [
    {
      ref: 'shared:organisation:org-a',
      display_name: 'Org A',
      members: [
        { ref: 'shared:person:alice', display_name: 'Alice', link: { valid_from: '2026-01-01T00:00:00.000Z' } },
        { ref: 'shared:person:bob', display_name: 'Bob', link: { valid_from: '2026-01-01T00:00:00.000Z' } }
      ]
    },
    {
      ref: 'shared:organisation:org-b',
      display_name: 'Org B',
      members: [
        { ref: 'shared:person:alice', display_name: 'Alice', link: { valid_from: '2026-01-01T00:00:00.000Z' } },
        { ref: 'shared:person:carol', display_name: 'Carol', link: { valid_from: '2026-01-01T00:00:00.000Z' } }
      ]
    }
  ];

  const [orgAStats, orgBStats] = computeOrganisationClusterStats(groups, [], { now: new Date('2027-01-01T00:00:00.000Z') });
  assert.equal(orgAStats.bridgeRatio, 0.5); // Alice bridges, Bob does not
  assert.equal(orgBStats.bridgeRatio, 0.5); // Alice bridges, Carol does not
});

// --- Bridge People (Mangrove / Feature 4.5) ----------------------------------

test('computeBridgePeople identifies a person who is a current member of >= 2 organisation clusters, citing which', () => {
  const groups = [
    {
      ref: 'shared:organisation:unsw',
      display_name: 'UNSW',
      members: [
        { ref: 'shared:person:alice', display_name: 'Alice', link: {} },
        { ref: 'shared:person:bob', display_name: 'Bob', link: {} }
      ]
    },
    {
      ref: 'shared:organisation:st-aloysius',
      display_name: 'St Aloysius',
      members: [
        { ref: 'shared:person:alice', display_name: 'Alice', link: {} },
        { ref: 'shared:person:carol', display_name: 'Carol', link: {} }
      ]
    }
  ];

  const bridgePeople = computeBridgePeople(groups);
  assert.equal(bridgePeople.length, 1);
  assert.equal(bridgePeople[0].ref, 'shared:person:alice');
  // Alphabetical by organisation label, regardless of input order — a
  // plain-language description must not leak internal load/sort order.
  assert.equal(bridgePeople[0].description, 'Connects St Aloysius and UNSW');
  assert.deepEqual(bridgePeople[0].organisation_refs.sort(), ['shared:organisation:st-aloysius', 'shared:organisation:unsw'].sort());
});

test('computeBridgePeople never flags someone who belongs to only one cluster', () => {
  const groups = [
    {
      ref: 'shared:organisation:unsw',
      display_name: 'UNSW',
      members: [
        { ref: 'shared:person:alice', display_name: 'Alice', link: {} },
        { ref: 'shared:person:bob', display_name: 'Bob', link: {} }
      ]
    }
  ];

  const bridgePeople = computeBridgePeople(groups);
  assert.equal(bridgePeople.length, 0);
});

test('computeBridgePeople joins three or more organisations with a natural-language "and"', () => {
  const groups = [
    { ref: 'shared:organisation:a', display_name: 'Org A', members: [{ ref: 'shared:person:dan', display_name: 'Dan', link: {} }] },
    { ref: 'shared:organisation:b', display_name: 'Org B', members: [{ ref: 'shared:person:dan', display_name: 'Dan', link: {} }] },
    { ref: 'shared:organisation:c', display_name: 'Org C', members: [{ ref: 'shared:person:dan', display_name: 'Dan', link: {} }] }
  ];

  const [bridgePerson] = computeBridgePeople(groups);
  assert.equal(bridgePerson.description, 'Connects Org A, Org B, and Org C');
});
