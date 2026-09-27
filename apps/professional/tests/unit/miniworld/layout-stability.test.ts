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
