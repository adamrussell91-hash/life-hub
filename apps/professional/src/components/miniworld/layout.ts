/**
 * Deterministic community layout for the miniworld.
 * Positions every community that exists in **any** year so scrubbing never
 * moves an island (BUILD-PLAN Phase 2).
 */

import type { HabitatType, NetworkEcologyCluster, NetworkEcologyLink } from '@/domain/types';
import type { WorldApi } from './model';

export interface LayoutCommunity {
  id: string;
  label: string;
  habitat: HabitatType;
  /** Outer landform radius used for collision (includes reef ring). */
  radius: number;
  /** Largest member count across all timeline years. */
  peakMembers: number;
  kind: 'organisation' | 'event';
  /** Seed bias: wetlands / sandbanks start near linked communities. */
  bias?: { x: number; y: number };
}

export interface LayoutPosition {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface WorldLayout {
  communities: LayoutPosition[];
  /** Bounding box of the archipelago (before open-sea ring). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const MAX_RADIUS = 260;
const MAX_ATTRACTION_GAIN = 0.2;
const MAX_STEP = 60;
const COLLIDE_PAD = 40;

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashIds(ids: string[]): number {
  let h = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i += 1) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 124;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function communityRadius(peakMembers: number, habitat: HabitatType): number {
  const base = 62 + 26 * Math.sqrt(Math.max(0, peakMembers));
  const capped = Math.min(MAX_RADIUS, base);
  if (habitat === 'savannah') return capped * 1.22;
  if (habitat === 'island') return capped * 0.92;
  return capped;
}

/** Outer draw radius including fringing reef / atoll ring. */
export function outerRadius(radius: number, habitat: HabitatType): number {
  if (habitat === 'island' || habitat === 'reef') return radius * 1.35;
  if (habitat === 'wetland') return radius * 1.15;
  return radius;
}

function collectAllCommunities(api: WorldApi): LayoutCommunity[] {
  const peak = new Map<string, { cluster: NetworkEcologyCluster; members: number }>();

  const consider = (clusters: NetworkEcologyCluster[]) => {
    for (const c of clusters) {
      if (!c.habitat) continue;
      const n = c.member_refs.length;
      const prev = peak.get(c.id);
      if (!prev || n > prev.members) {
        peak.set(c.id, { cluster: c, members: n });
      }
    }
  };

  consider(api.clusters ?? []);
  for (const year of Object.keys(api.timeline ?? {})) {
    consider(api.timeline[year]?.clusters ?? []);
  }

  const list: LayoutCommunity[] = [...peak.entries()]
    .map(([id, { cluster, members }]) => ({
      id,
      label: cluster.label,
      habitat: cluster.habitat as HabitatType,
      peakMembers: members,
      kind: cluster.kind,
      radius: communityRadius(members, cluster.habitat as HabitatType)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return list;
}

function pairWeight(
  a: string,
  b: string,
  shared: Map<string, number>,
  cross: Map<string, number>
): number {
  const key = [a, b].sort().join('|');
  return 3 * (shared.get(key) ?? 0) + (cross.get(key) ?? 0);
}

function buildWeights(
  communities: LayoutCommunity[],
  api: WorldApi
): { shared: Map<string, number>; cross: Map<string, number> } {
  const ids = new Set(communities.map((c) => c.id));
  const shared = new Map<string, number>();
  const cross = new Map<string, number>();

  // Shared people: count across current + all timeline years (max).
  const countShared = (clusters: NetworkEcologyCluster[]) => {
    const snapshot = new Map<string, number>();
    const membership = new Map<string, string[]>();
    for (const c of clusters) {
      if (!ids.has(c.id)) continue;
      for (const ref of c.member_refs) {
        if (!membership.has(ref)) membership.set(ref, []);
        membership.get(ref)!.push(c.id);
      }
    }
    for (const homes of membership.values()) {
      if (homes.length < 2) continue;
      const sorted = [...homes].sort();
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) {
          const key = `${sorted[i]}|${sorted[j]}`;
          snapshot.set(key, (snapshot.get(key) ?? 0) + 1);
        }
      }
    }
    for (const [key, count] of snapshot) {
      shared.set(key, Math.max(shared.get(key) ?? 0, count));
    }
  };

  countShared(api.clusters ?? []);
  for (const year of Object.keys(api.timeline ?? {})) {
    countShared(api.timeline[year]?.clusters ?? []);
  }

  // Cross links from all dated links (person↔person spanning two orgs).
  const orgOf = new Map<string, Set<string>>();
  for (const c of api.clusters ?? []) {
    for (const ref of c.member_refs) {
      if (!orgOf.has(ref)) orgOf.set(ref, new Set());
      orgOf.get(ref)!.add(c.id);
    }
  }
  for (const link of api.links ?? []) {
    if (link.relationship_type !== 'professional_relationship') continue;
    const aHomes = [...(orgOf.get(link.source_ref) ?? [])];
    const bHomes = [...(orgOf.get(link.target_ref) ?? [])];
    for (const a of aHomes) {
      for (const b of bHomes) {
        if (a === b) continue;
        const key = [a, b].sort().join('|');
        cross.set(key, (cross.get(key) ?? 0) + 1);
      }
    }
  }

  return { shared, cross };
}

/**
 * Seeded force layout — synchronous, converges to a stable layout for the
 * same community id set. Wetlands start at the centroid of linked
 * communities; sandbanks near their best-linked neighbour; islands get
 * extra outward push.
 */
export function layoutCommunities(api: WorldApi): WorldLayout {
  const communities = collectAllCommunities(api);
  if (!communities.length) {
    return { communities: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  const { shared, cross } = buildWeights(communities, api);
  const seed = hashIds(communities.map((c) => c.id));
  const rand = mulberry32(seed);

  const pos = new Map<string, { x: number; y: number; vx: number; vy: number; r: number; habitat: HabitatType }>();

  // Initial ring placement (deterministic).
  const n = communities.length;
  communities.forEach((c, i) => {
    const angle = (i / n) * Math.PI * 2 + rand() * 0.2;
    const dist = 280 + rand() * 120 + c.radius;
    pos.set(c.id, {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      r: outerRadius(c.radius, c.habitat),
      habitat: c.habitat
    });
  });

  // Bias wetlands toward centroid of communities that share people; sandbanks toward best neighbour.
  for (const c of communities) {
    if (c.habitat !== 'wetland' && c.habitat !== 'sandbank') continue;
    let bestId: string | null = null;
    let bestW = 0;
    const linked: string[] = [];
    for (const other of communities) {
      if (other.id === c.id) continue;
      const w = pairWeight(c.id, other.id, shared, cross);
      if (w > 0) linked.push(other.id);
      if (w > bestW) {
        bestW = w;
        bestId = other.id;
      }
    }
    const p = pos.get(c.id)!;
    if (c.habitat === 'wetland' && linked.length) {
      let sx = 0;
      let sy = 0;
      for (const id of linked) {
        const o = pos.get(id)!;
        sx += o.x;
        sy += o.y;
      }
      p.x = sx / linked.length;
      p.y = sy / linked.length;
    } else if (c.habitat === 'sandbank' && bestId) {
      const o = pos.get(bestId)!;
      const ang = Math.atan2(p.y - o.y, p.x - o.x) || rand() * Math.PI * 2;
      p.x = o.x + Math.cos(ang) * (o.r + p.r + 60);
      p.y = o.y + Math.sin(ang) * (o.r + p.r + 60);
    }
  }

  const iterations = 220;
  for (let iter = 0; iter < iterations; iter += 1) {
    const alpha = 1 - iter / iterations;

    // Pairwise attraction by weight + collision.
    for (let i = 0; i < communities.length; i += 1) {
      for (let j = i + 1; j < communities.length; j += 1) {
        const a = communities[i];
        const b = communities[j];
        const pa = pos.get(a.id)!;
        const pb = pos.get(b.id)!;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const w = pairWeight(a.id, b.id, shared, cross);
        if (w > 0) {
          const target = pa.r + pb.r + 80;
          // Gain is capped: an uncapped 0.02 * w overshoots once w > ~50 and
          // the layout diverges (coordinates reached 1e147 and froze the
          // browser drawing sandbars across them).
          const force = ((dist - target) / dist) * Math.min(0.02 * w, MAX_ATTRACTION_GAIN) * alpha;
          pa.vx += dx * force;
          pa.vy += dy * force;
          pb.vx -= dx * force;
          pb.vy -= dy * force;
        }
        const minDist = pa.r + pb.r + COLLIDE_PAD;
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.5 * alpha;
          pa.vx -= dx * push;
          pa.vy -= dy * push;
          pb.vx += dx * push;
          pb.vy += dy * push;
        }
      }
    }

    // Island outward push + mild centering.
    for (const c of communities) {
      const p = pos.get(c.id)!;
      const dist = Math.hypot(p.x, p.y) || 0.01;
      if (c.habitat === 'island') {
        p.vx += (p.x / dist) * 8 * alpha;
        p.vy += (p.y / dist) * 8 * alpha;
      }
      p.vx -= p.x * 0.002 * alpha;
      p.vy -= p.y * 0.002 * alpha;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > MAX_STEP) {
        p.vx = (p.vx / speed) * MAX_STEP;
        p.vy = (p.vy / speed) * MAX_STEP;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.6;
      p.vy *= 0.6;
    }
  }

  const settled = [...pos.values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const result: LayoutPosition[] = communities.map((c, i) => {
    const p = pos.get(c.id)!;
    if (settled) return { id: c.id, x: p.x, y: p.y, radius: c.radius };
    const angle = (i / n) * Math.PI * 2;
    const dist = 320 + c.radius;
    return { id: c.id, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, radius: c.radius };
  });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of result) {
    const meta = communities.find((x) => x.id === c.id)!;
    const o = outerRadius(c.radius, meta.habitat);
    minX = Math.min(minX, c.x - o);
    minY = Math.min(minY, c.y - o);
    maxX = Math.max(maxX, c.x + o);
    maxY = Math.max(maxY, c.y + o);
  }

  return {
    communities: result,
    bounds: { minX, minY, maxX, maxY }
  };
}

/** Driftwood ring positions for open-sea people (deterministic). */
export function layoutOpenSea(
  peopleRefs: string[],
  bounds: WorldLayout['bounds'],
  buoys: { orgRef: string; personRef: string }[] = []
): { people: { ref: string; x: number; y: number }[]; buoys: { ref: string; x: number; y: number; personRef: string }[] } {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 200);
  const ring = span * 0.5 + 140;
  const sorted = [...peopleRefs].sort();
  const rand = mulberry32(hashIds(sorted));
  const people = sorted.map((ref, i) => {
    const a = (i / Math.max(1, sorted.length)) * Math.PI * 2 + rand() * 0.15;
    const jitter = 20 + rand() * 40;
    return {
      ref,
      x: cx + Math.cos(a) * (ring + jitter),
      y: cy + Math.sin(a) * (ring + jitter)
    };
  });
  const byPerson = new Map(people.map((p) => [p.ref, p]));
  const buoyPos = buoys.map((b) => {
    const p = byPerson.get(b.personRef);
    const a = rand() * Math.PI * 2;
    return {
      ref: b.orgRef,
      personRef: b.personRef,
      x: (p?.x ?? cx) + Math.cos(a) * 28,
      y: (p?.y ?? cy) + Math.sin(a) * 28
    };
  });
  return { people, buoys: buoyPos };
}

/** Exported for tests — same input → same positions. */
export function layoutSeed(api: WorldApi): number {
  const ids = collectAllCommunities(api).map((c) => c.id);
  return hashIds(ids);
}

export type { NetworkEcologyLink };
