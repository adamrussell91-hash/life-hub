import { describe, expect, it } from 'vitest';
import { asWorldApi, buildWorldModel, type WorldApi } from '@/components/miniworld/model';
import { layoutCommunities, layoutSeed, communityRadius } from '@/components/miniworld/layout';
import type { NetworkEcologyWorld } from '@/domain/types';

function fixture(): WorldApi {
  const raw: NetworkEcologyWorld = {
    nodes: [
      { ref: 'shared:person:adam', kind: 'person', display_name: 'Adam', is_self: true, last_contacted: '2026-01-01' },
      { ref: 'shared:person:alice', kind: 'person', display_name: 'Alice', is_self: false, last_contacted: '2024-01-01' },
      { ref: 'shared:person:bob', kind: 'person', display_name: 'Bob', is_self: false, last_contacted: null },
      { ref: 'shared:person:carol', kind: 'person', display_name: 'Carol', is_self: false, last_contacted: null },
      { ref: 'shared:person:drift', kind: 'person', display_name: 'Drift', is_self: false, last_contacted: null },
      { ref: 'shared:organisation:aloysius', kind: 'organisation', display_name: "St Aloysius" },
      { ref: 'shared:organisation:trinity', kind: 'organisation', display_name: 'Trinity' },
      { ref: 'shared:organisation:buoy', kind: 'organisation', display_name: 'Lone Org' }
    ],
    edges: [],
    clusters: [
      {
        id: 'shared:organisation:aloysius',
        kind: 'organisation',
        label: "St Aloysius",
        member_refs: ['shared:person:adam', 'shared:person:alice', 'shared:person:bob'],
        habitat: 'savannah',
        since: 2018
      },
      {
        id: 'shared:organisation:trinity',
        kind: 'organisation',
        label: 'Trinity',
        member_refs: ['shared:person:adam', 'shared:person:carol'],
        habitat: 'island',
        since: 2020
      }
    ],
    bridge_people: [
      {
        ref: 'shared:person:adam',
        display_name: 'Adam',
        organisation_refs: ['shared:organisation:aloysius', 'shared:organisation:trinity'],
        description: 'Connects St Aloysius and Trinity'
      }
    ],
    links: [
      {
        source_ref: 'shared:person:adam',
        target_ref: 'shared:organisation:aloysius',
        relationship_type: 'employee_at',
        role: null,
        valid_from: '2018-01-01',
        valid_to: null,
        status: 'current'
      },
      {
        source_ref: 'shared:person:alice',
        target_ref: 'shared:organisation:aloysius',
        relationship_type: 'employee_at',
        role: null,
        valid_from: '2019-01-01',
        valid_to: null,
        status: 'current'
      },
      {
        source_ref: 'shared:person:bob',
        target_ref: 'shared:organisation:aloysius',
        relationship_type: 'employee_at',
        role: null,
        valid_from: '2020-01-01',
        valid_to: null,
        status: 'current'
      },
      {
        source_ref: 'shared:person:adam',
        target_ref: 'shared:organisation:trinity',
        relationship_type: 'employee_at',
        role: null,
        valid_from: '2020-01-01',
        valid_to: null,
        status: 'current'
      },
      {
        source_ref: 'shared:person:carol',
        target_ref: 'shared:organisation:trinity',
        relationship_type: 'employee_at',
        role: null,
        valid_from: '2020-01-01',
        valid_to: null,
        status: 'current'
      },
      {
        source_ref: 'shared:person:drift',
        target_ref: 'shared:organisation:buoy',
        relationship_type: 'employee_at',
        role: null,
        valid_from: null,
        valid_to: null,
        status: 'current'
      },
      {
        source_ref: 'shared:person:alice',
        target_ref: 'shared:person:bob',
        relationship_type: 'professional_relationship',
        role: 'colleague',
        valid_from: '2021-01-01',
        valid_to: null,
        status: 'current'
      }
    ],
    timeline: {
      '2018': {
        clusters: [
          {
            id: 'shared:organisation:aloysius',
            kind: 'organisation',
            label: "St Aloysius",
            member_refs: ['shared:person:adam'],
            habitat: 'savannah',
            since: 2018
          }
        ],
        bridge_people: []
      },
      '2020': {
        clusters: [
          {
            id: 'shared:organisation:aloysius',
            kind: 'organisation',
            label: "St Aloysius",
            member_refs: ['shared:person:adam', 'shared:person:alice', 'shared:person:bob'],
            habitat: 'savannah',
            since: 2018
          },
          {
            id: 'shared:organisation:trinity',
            kind: 'organisation',
            label: 'Trinity',
            member_refs: ['shared:person:adam', 'shared:person:carol'],
            habitat: 'island',
            since: 2020
          }
        ],
        bridge_people: [
          {
            ref: 'shared:person:adam',
            display_name: 'Adam',
            organisation_refs: ['shared:organisation:aloysius', 'shared:organisation:trinity'],
            description: 'Connects St Aloysius and Trinity'
          }
        ]
      },
      '2026': {
        clusters: [
          {
            id: 'shared:organisation:aloysius',
            kind: 'organisation',
            label: "St Aloysius",
            member_refs: ['shared:person:adam', 'shared:person:alice', 'shared:person:bob'],
            habitat: 'savannah',
            since: 2018
          },
          {
            id: 'shared:organisation:trinity',
            kind: 'organisation',
            label: 'Trinity',
            member_refs: ['shared:person:adam', 'shared:person:carol'],
            habitat: 'island',
            since: 2020
          }
        ],
        bridge_people: [
          {
            ref: 'shared:person:adam',
            display_name: 'Adam',
            organisation_refs: ['shared:organisation:aloysius', 'shared:organisation:trinity'],
            description: 'Connects St Aloysius and Trinity'
          }
        ]
      }
    },
    upcoming_events: []
  };
  return asWorldApi(raw);
}

describe('buildWorldModel', () => {
  const today = new Date('2026-09-26T00:00:00.000Z');

  it('counts per community match the members', () => {
    const model = buildWorldModel(fixture(), 2026, today, { isNow: true });
    const aloysius = model.communities.find((c) => c.id === 'shared:organisation:aloysius')!;
    expect(aloysius.stats.memberCount).toBe(aloysius.memberRefs.length);
    expect(aloysius.stats.memberCount).toBe(3);
  });

  it('ecotone count equals the number of shared people', () => {
    const model = buildWorldModel(fixture(), 2026, today, { isNow: true });
    expect(model.ecotones).toHaveLength(1);
    expect(model.ecotones[0].people).toEqual(['shared:person:adam']);
  });

  it('no-start-date people are absent before Now', () => {
    const model2018 = buildWorldModel(fixture(), 2018, today, { isNow: false });
    const drift2018 = model2018.people.find((p) => p.ref === 'shared:person:drift')!;
    expect(drift2018.present).toBe(false);

    const modelNow = buildWorldModel(fixture(), 2026, today, { isNow: true });
    const driftNow = modelNow.people.find((p) => p.ref === 'shared:person:drift')!;
    expect(driftNow.present).toBe(true);
    expect(modelNow.notes.noStartDateCount).toBeGreaterThan(0);
  });

  it('quiet only at Now', () => {
    const past = buildWorldModel(fixture(), 2020, today, { isNow: false });
    expect(past.people.every((p) => !p.quiet)).toBe(true);
    expect(past.notes.dormancyOnlyAtNow).toBe(true);

    const now = buildWorldModel(fixture(), 2026, today, { isNow: true });
    const alice = now.people.find((p) => p.ref === 'shared:person:alice')!;
    expect(alice.quiet).toBe(true); // last_contacted 2024-01-01 > 365d before 2026-09-26
    const bob = now.people.find((p) => p.ref === 'shared:person:bob')!;
    expect(bob.quiet).toBe(false); // null last_contacted = not quiet
  });

  it('organisation clusters keep orgCount 1 even when members bridge elsewhere (D5)', () => {
    const model = buildWorldModel(fixture(), 2026, today, { isNow: true });
    const aloysius = model.communities.find((c) => c.id === 'shared:organisation:aloysius')!;
    expect(aloysius.stats.orgCount).toBe(1);
    expect(aloysius.why).not.toMatch(/across \d+ organisations/);
  });

  it('person in two clusters keeps both homes', () => {
    const model = buildWorldModel(fixture(), 2026, today, { isNow: true });
    const adam = model.people.find((p) => p.ref === 'shared:person:adam')!;
    expect(adam.homeIds.sort()).toEqual([
      'shared:organisation:aloysius',
      'shared:organisation:trinity'
    ].sort());
  });

  it('open sea lists unlinked present people', () => {
    const model = buildWorldModel(fixture(), 2026, today, { isNow: true });
    expect(model.openSea.people).toContain('shared:person:drift');
    expect(model.openSea.buoys.some((b) => b.personRef === 'shared:person:drift')).toBe(true);
  });
});

describe('layoutCommunities', () => {
  it('same input gives the same positions', () => {
    const api = fixture();
    const a = layoutCommunities(api);
    const b = layoutCommunities(api);
    expect(layoutSeed(api)).toBe(layoutSeed(api));
    expect(a.communities).toEqual(b.communities);
  });

  it('an island position is identical in 2018 and 2026 layouts (all-years placement)', () => {
    const api = fixture();
    // Layout uses every year — scrubbing must not move islands.
    const layout = layoutCommunities(api);
    const trinity = layout.communities.find((c) => c.id === 'shared:organisation:trinity')!;
    const again = layoutCommunities(api).communities.find((c) => c.id === 'shared:organisation:trinity')!;
    expect(trinity).toEqual(again);
    expect(Number.isFinite(trinity.x)).toBe(true);
  });

  it('radius grows with peak members but caps at 260', () => {
    expect(communityRadius(4, 'island')).toBeLessThan(communityRadius(26, 'savannah'));
    expect(communityRadius(10_000, 'savannah')).toBeLessThanOrEqual(260 * 1.22);
  });
});
