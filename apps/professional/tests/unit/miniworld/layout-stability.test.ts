import { describe, expect, it } from 'vitest';
import { asWorldApi } from '@/components/miniworld/model';
import { layoutCommunities } from '@/components/miniworld/layout';
import type { NetworkEcologyCluster, NetworkEcologyWorld } from '@/domain/types';

// Regression: many people shared between communities across many timeline
// years made the attraction gain (0.02 * weight) overshoot, and the layout
// diverged to ~1e147. Drawing sandbars across those distances froze the
// browser (Network Ecology stuck on "Loading…", whole machine unresponsive).
function heavyWorld(): NetworkEcologyWorld {
  const orgs = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => `shared:organisation:${k}`);
  const people = Array.from({ length: 60 }, (_, i) => `shared:person:p${i}`);
  // Everyone belongs to three of the six orgs, so every pair shares people.
  const clusters: NetworkEcologyCluster[] = orgs.map((id, o) => ({
    id,
    kind: 'organisation',
    label: id,
    member_refs: people.filter((_, i) => [i % 6, (i + 1) % 6, (i + 2) % 6].includes(o)),
    habitat: o % 2 ? 'forest' : 'savannah',
    since: 2014
  }));
  const timeline: NetworkEcologyWorld['timeline'] = {};
  for (let year = 2015; year <= 2026; year += 1) {
    timeline[String(year)] = { clusters, bridge_people: [] };
  }
  const links = people.flatMap((p, i) => [
    {
      source_ref: p,
      target_ref: people[(i + 7) % people.length]!,
      relationship_type: 'professional_relationship',
      role: 'colleague',
      valid_from: '2015-01-01',
      valid_to: null,
      status: 'current'
    }
  ]);
  return {
    nodes: [
      ...people.map((ref) => ({ ref, kind: 'person' as const, display_name: ref })),
      ...orgs.map((ref) => ({ ref, kind: 'organisation' as const, display_name: ref }))
    ],
    edges: [],
    links,
    clusters,
    bridge_people: [],
    timeline,
    upcoming_events: []
  } as unknown as NetworkEcologyWorld;
}

describe('layoutCommunities stability', () => {
  it('stays bounded when communities share many people across many years', () => {
    const layout = layoutCommunities(asWorldApi(heavyWorld()));
    expect(layout.communities).toHaveLength(6);
    for (const c of layout.communities) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
      expect(Math.abs(c.x)).toBeLessThan(10_000);
      expect(Math.abs(c.y)).toBeLessThan(10_000);
    }
    expect(layout.bounds.maxX - layout.bounds.minX).toBeLessThan(20_000);
  });
});

// Regression: islands (communities that share nobody with anyone) used to get
// an outward push every iteration, so a lone school ended up stranded at the
// far edge with an empty sea between it and the mainland.
function mainlandWithIslands(): NetworkEcologyWorld {
  const mainland = Array.from({ length: 10 }, (_, i) => `shared:organisation:m${i}`);
  const islands = Array.from({ length: 4 }, (_, i) => `shared:organisation:i${i}`);
  const clusters: NetworkEcologyCluster[] = [
    ...mainland.map((id, o) => ({
      id,
      kind: 'organisation' as const,
      label: id,
      // Neighbouring mainland orgs share one person, chaining them together.
      member_refs: [`shared:person:m${o}a`, `shared:person:m${o}b`, `shared:person:m${(o + 1) % 10}a`],
      habitat: (o % 2 ? 'forest' : 'savannah') as NetworkEcologyCluster['habitat'],
      since: 2018
    })),
    ...islands.map((id, o) => ({
      id,
      kind: 'organisation' as const,
      label: id,
      member_refs: Array.from({ length: 2 + o * 3 }, (_, k) => `shared:person:i${o}-${k}`),
      habitat: 'island' as const,
      since: 2020
    }))
  ];
  const people = [...new Set(clusters.flatMap((c) => c.member_refs))];
  return {
    nodes: [
      ...people.map((ref) => ({ ref, kind: 'person' as const, display_name: ref })),
      ...clusters.map((c) => ({ ref: c.id, kind: 'organisation' as const, display_name: c.label }))
    ],
    edges: [],
    links: [],
    clusters,
    bridge_people: [],
    timeline: { '2026': { clusters, bridge_people: [] } },
    upcoming_events: []
  } as unknown as NetworkEcologyWorld;
}

describe('layoutCommunities packing', () => {
  const layout = layoutCommunities(asWorldApi(mainlandWithIslands()));
  const gapToNearest = (id: string) => {
    const a = layout.communities.find((c) => c.id === id)!;
    return Math.min(
      ...layout.communities
        .filter((b) => b.id !== id)
        .map((b) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius * 1.35 - b.radius * 1.35)
    );
  };

  it('keeps unlinked islands beside the mainland, not out at the edge', () => {
    for (const c of layout.communities) {
      expect(gapToNearest(c.id)).toBeLessThan(160);
    }
  });

  it('frames a roughly square world, not one stretched by an outlier', () => {
    const w = layout.bounds.maxX - layout.bounds.minX;
    const h = layout.bounds.maxY - layout.bounds.minY;
    expect(Math.max(w, h) / Math.min(w, h)).toBeLessThan(1.8);
  });
});

describe('asWorldApi', () => {
  it('drops meeting and event clusters so they never become named places', () => {
    const raw = mainlandWithIslands();
    raw.clusters = [
      ...raw.clusters,
      {
        id: 'professional:meeting:m1',
        kind: 'event',
        label: 'Planning meeting',
        member_refs: ['shared:person:m0a', 'shared:person:m1a'],
        habitat: 'wetland',
        since: 2026
      } as NetworkEcologyCluster
    ];
    const api = asWorldApi(raw);
    expect(api.clusters.some((c) => c.kind === 'event')).toBe(false);
    expect(layoutCommunities(api).communities.some((c) => c.id === 'professional:meeting:m1')).toBe(false);
  });
});
