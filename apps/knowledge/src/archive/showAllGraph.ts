import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { PageManifestEntry } from "../domain/page";
import {
  colorForHub,
  type ArchiveGraphModel,
  type GraphLinkDatum,
  type GraphNodeDatum,
} from "./keywordGraph";
import {
  filterShowAllEntries,
  hubLabelsFor,
  type ShowAllGrouping,
} from "./showAllScope";
import { buildShowAllNoteEdges } from "./showAllEdges";

const LAYOUT_CENTRE = { x: 760, y: 560 };
export const SHOW_ALL_CLUSTER_GAP = 140;
/** World units between neighbouring notes in a topic disc at Spread 1. */
export const SHOW_ALL_NOTE_SPACING = 13;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export type ShowAllShape = {
  /** Multiplies note spacing. 1 is the default. */
  spread: number;
  /** How far a multi-topic note leans toward its other topics (0 = none, 1 = all the way to the rim). */
  lean: number;
};

export const SHOW_ALL_DEFAULT_SHAPE: ShowAllShape = { spread: 1, lean: 0.6 };

export function showAllNoteRadius(degree: number) {
  return 3.2 + Math.sqrt(Math.max(degree, 0)) * 1.7;
}

function hubRadius(count: number) {
  return Math.max(16, Math.min(30, 14 + Math.sqrt(Math.max(count, 1)) * 1.2));
}

/** Radius of the disc a topic's notes fill, including the clear ring around the hub. */
export function showAllDiscRadius(noteCount: number, _hubR = 0, spread = 1) {
  const c = SHOW_ALL_NOTE_SPACING * spread;
  return Math.sqrt(c * c * (Math.max(noteCount, 1) + 0.5)) + c;
}

function hashUnit(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export type ShowAllHubTie = { a: string; b: string; weight: number };

/** How many notes each pair of hubs shares. Drives hub placement and the visible ties. */
export function showAllHubTies(labelsByEntry: string[][], hubLabels: Set<string>): ShowAllHubTie[] {
  const shared = new Map<string, ShowAllHubTie>();
  for (const labels of labelsByEntry) {
    const hubs = [...new Set(labels)].filter(label => hubLabels.has(label)).sort();
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const key = `${hubs[i]}\u0000${hubs[j]}`;
        const tie = shared.get(key) ?? { a: hubs[i]!, b: hubs[j]!, weight: 0 };
        tie.weight += 1;
        shared.set(key, tie);
      }
    }
  }
  return [...shared.values()].sort((x, y) => y.weight - x.weight || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}

type HubBody = { label: string; r: number; x: number; y: number; vx?: number; vy?: number };
type TieSpring = { source: string | HubBody; target: string | HubBody; weight: number };

/**
 * Packs topic discs into one compact nexus: the biggest topic sits at the core and topics that
 * share notes are pulled next to each other. Deterministic — sunflower seed, no randomness.
 */
export function placeShowAllHubs(majors: GraphNodeDatum[], ties: ShowAllHubTie[], discRadius: (hub: GraphNodeDatum) => number) {
  if (!majors.length) return;
  const radii = majors.map(discRadius);
  const step = Math.max(...radii) * 1.2;
  const bodies: HubBody[] = majors.map((node, index) => ({
    label: node.label,
    r: radii[index]!,
    x: LAYOUT_CENTRE.x + Math.cos(index * GOLDEN_ANGLE) * step * Math.sqrt(index),
    y: LAYOUT_CENTRE.y + Math.sin(index * GOLDEN_ANGLE) * step * Math.sqrt(index),
  }));
  if (bodies.length > 1) {
    const byLabel = new Map(bodies.map(body => [body.label, body]));
    const maxTie = Math.max(1, ...ties.map(tie => tie.weight));
    const maxR = Math.max(...bodies.map(body => body.r));
    const springs: TieSpring[] = ties
      .filter(tie => byLabel.has(tie.a) && byLabel.has(tie.b))
      .map(tie => ({ source: tie.a, target: tie.b, weight: tie.weight }));
    const sim = forceSimulation<HubBody>(bodies)
      .stop()
      .force(
        "ties",
        forceLink<HubBody, TieSpring>(springs)
          .id(body => body.label)
          .distance(link => (link.source as HubBody).r + (link.target as HubBody).r + SHOW_ALL_CLUSTER_GAP)
          .strength(link => 0.03 + 0.45 * (link.weight / maxTie)),
      )
      .force("charge", forceManyBody<HubBody>().strength(-40))
      // Bigger zones are pulled harder to the middle, so the largest topic forms the core.
      .force("x", forceX<HubBody>(LAYOUT_CENTRE.x).strength(body => 0.04 + 0.2 * (body.r / maxR) ** 3))
      .force("y", forceY<HubBody>(LAYOUT_CENTRE.y).strength(body => 0.04 + 0.2 * (body.r / maxR) ** 3))
      .force(
        "collide",
        forceCollide<HubBody>(body => body.r + SHOW_ALL_CLUSTER_GAP / 2)
          .strength(1)
          .iterations(4),
      );
    sim.tick(400);
    const cx = bodies.reduce((sum, body) => sum + body.x, 0) / bodies.length;
    const cy = bodies.reduce((sum, body) => sum + body.y, 0) / bodies.length;
    for (const body of bodies) {
      body.x += LAYOUT_CENTRE.x - cx;
      body.y += LAYOUT_CENTRE.y - cy;
    }
  }
  majors.forEach((node, index) => {
    const body = bodies[index]!;
    node.x = body.x;
    node.y = body.y;
    node.homeX = body.x;
    node.homeY = body.y;
    node.fx = body.x;
    node.fy = body.y;
  });
}

/** A note with several topics points from its own hub toward the others, weighted by `lean`. */
export function blendedHome(hubs: Array<{ x?: number; y?: number }>, lean = SHOW_ALL_DEFAULT_SHAPE.lean) {
  let x = 0;
  let y = 0;
  let total = 0;
  hubs.forEach((hub, index) => {
    const weight = index === 0 ? 1 : lean;
    x += (hub.x ?? LAYOUT_CENTRE.x) * weight;
    y += (hub.y ?? LAYOUT_CENTRE.y) * weight;
    total += weight;
  });
  return total ? { x: x / total, y: y / total } : { ...LAYOUT_CENTRE };
}

/** Sunflower slots around a hub, with a little deterministic jitter so the disc reads organic. */
function discSlots(hub: GraphNodeDatum, count: number, spread: number) {
  const c = SHOW_ALL_NOTE_SPACING * spread;
  // The zone has no drawn hub any more, so notes fill right to the middle.
  const offset = 0.5;
  const slots: Array<{ x: number; y: number; taken: boolean }> = [];
  for (let i = 0; i < count; i++) {
    const jitterR = (hashUnit(`${hub.id}:r${i}`) - 0.5) * c * 0.55;
    const jitterA = (hashUnit(`${hub.id}:a${i}`) - 0.5) * 0.5;
    const radius = Math.sqrt(offset + i) * c + jitterR;
    const angle = i * GOLDEN_ANGLE + jitterA / Math.sqrt(i + 1);
    slots.push({ x: (hub.x ?? 0) + Math.cos(angle) * radius, y: (hub.y ?? 0) + Math.sin(angle) * radius, taken: false });
  }
  return slots;
}

type Neighbour = { id: string; weight: number };

function noteAdjacency(links: GraphLinkDatum[]) {
  const adjacency = new Map<string, Neighbour[]>();
  const add = (from: string, to: string, weight: number) => {
    const list = adjacency.get(from) ?? [];
    list.push({ id: to, weight });
    adjacency.set(from, list);
  };
  for (const link of links) {
    if (link.kind !== "overlap" && link.kind !== "backbone") continue;
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    const weight = Math.max(0.05, link.weight);
    add(source, target, weight);
    add(target, source, weight);
  }
  return adjacency;
}

/**
 * Lays the whole Show All map out with no physics. Topics become zones: hubs are packed into one
 * nexus, then each zone is grown outward from its best-linked note, every note taking the free
 * seat nearest the notes it links to. Linked notes end up side by side, notes linked into another
 * zone sit on the edge facing it, and the same input always gives the same picture.
 */
export function layoutShowAll(
  nodes: GraphNodeDatum[],
  ties: ShowAllHubTie[],
  shape: ShowAllShape = SHOW_ALL_DEFAULT_SHAPE,
  links: GraphLinkDatum[] = [],
) {
  const majors = nodes.filter(node => node.kind === "major" && !node.departing);
  placeShowAllHubs(majors, ties, hub => showAllDiscRadius(hub.count, hub.r, shape.spread));
  const hubByLabel = new Map(majors.map(node => [node.label, node]));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const adjacency = noteAdjacency(links);

  const groups = new Map<string, GraphNodeDatum[]>();
  for (const node of nodes) {
    if (node.kind !== "leaf" || node.departing) continue;
    const key = node.parentKeyword && hubByLabel.has(node.parentKeyword) ? node.parentKeyword : "";
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  const placed = new Set<string>();

  for (const [label, members] of groups) {
    const hub =
      hubByLabel.get(label) ??
      ({ id: "major:none", kind: "major", label: "", count: members.length, color: "", soft: "", ink: "", r: 16, ...LAYOUT_CENTRE } satisfies GraphNodeDatum);
    const hx = hub.x ?? LAYOUT_CENTRE.x;
    const hy = hub.y ?? LAYOUT_CENTRE.y;
    const slots = discSlots(hub, members.length, shape.spread);
    const rim = showAllDiscRadius(members.length, hub.r, shape.spread);
    const inZone = new Set(members.map(node => node.id));

    // Where a note wants to sit: among its placed neighbours, leaning toward other zones it links into.
    const desire = (node: GraphNodeDatum) => {
      let x = 0;
      let y = 0;
      let total = 0;
      for (const next of adjacency.get(node.id) ?? []) {
        const other = byId.get(next.id);
        if (!other || other.departing) continue;
        if (inZone.has(next.id)) {
          if (!placed.has(next.id)) continue;
          x += (other.x ?? hx) * next.weight;
          y += (other.y ?? hy) * next.weight;
          total += next.weight;
          continue;
        }
        const zone = other.parentKeyword ? hubByLabel.get(other.parentKeyword) : undefined;
        const ox = placed.has(next.id) ? other.x : zone?.x;
        const oy = placed.has(next.id) ? other.y : zone?.y;
        if (ox == null || oy == null) continue;
        const weight = next.weight * shape.lean * 0.5;
        x += ox * weight;
        y += oy * weight;
        total += weight;
      }
      // Topic overlap with no direct link still leans the note toward the shared zone.
      for (const other of node.hubLabels ?? []) {
        if (other === label) continue;
        const zone = hubByLabel.get(other);
        if (!zone || zone.x == null || zone.y == null) continue;
        const weight = shape.lean * 0.35;
        x += zone.x * weight;
        y += zone.y * weight;
        total += weight;
      }
      if (!total) return { x: hx, y: hy };
      let dx = x / total - hx;
      let dy = y / total - hy;
      const reach = Math.hypot(dx, dy);
      if (reach > rim) {
        dx = (dx / reach) * rim;
        dy = (dy / reach) * rim;
      }
      return { x: hx + dx, y: hy + dy };
    };

    const linkedWeight = (node: GraphNodeDatum) =>
      (adjacency.get(node.id) ?? []).reduce((sum, next) => sum + (placed.has(next.id) && inZone.has(next.id) ? next.weight : 0), 0);
    const strength = new Map(
      members.map(node => [node.id, (adjacency.get(node.id) ?? []).reduce((sum, next) => sum + next.weight, 0)]),
    );
    const waiting = [...members].sort(
      (a, b) => (strength.get(b.id) ?? 0) - (strength.get(a.id) ?? 0) || a.id.localeCompare(b.id),
    );

    while (waiting.length) {
      // Grow from what is already placed: the note most tied to placed notes goes next.
      // If nothing waiting touches the placed set, start a new patch from the best-linked note.
      let pick = 0;
      let best = -1;
      for (let i = 0; i < waiting.length; i++) {
        const tied = linkedWeight(waiting[i]!);
        if (tied > best) {
          best = tied;
          pick = i;
        }
      }
      const node = waiting.splice(pick, 1)[0]!;
      const want = desire(node);
      let seat = -1;
      let seatD = Infinity;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        if (slot.taken) continue;
        const d = (slot.x - want.x) ** 2 + (slot.y - want.y) ** 2;
        if (d < seatD) {
          seatD = d;
          seat = i;
        }
      }
      const slot = slots[seat]!;
      slot.taken = true;
      node.x = slot.x;
      node.y = slot.y;
      node.fx = slot.x;
      node.fy = slot.y;
      node.vx = 0;
      node.vy = 0;
      node.homeX = hx;
      node.homeY = hy;
      placed.add(node.id);
    }
  }
}

function buildHubs(counts: Map<string, number>): GraphNodeDatum[] {
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ordered.map(([label, count]) => {
    const palette = colorForHub(label);
    return {
      id: `major:${label}`,
      kind: "major" as const,
      label,
      count,
      color: palette.fill,
      soft: palette.soft,
      ink: palette.ink,
      r: hubRadius(count),
    };
  });
}

export function buildShowAllGraph(
  entries: PageManifestEntry[],
  grouping: ShowAllGrouping = "tags",
): ArchiveGraphModel {
  const eligible = filterShowAllEntries(entries, grouping);
  const counts = new Map<string, number>();
  const labelsByEntry = eligible.map(entry => hubLabelsFor(entry, grouping));
  for (const labels of labelsByEntry) {
    for (const label of new Set(labels)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const hubNodes = buildHubs(counts);
  const hubTies = showAllHubTies(labelsByEntry, new Set(counts.keys()));
  const hubByLabel = new Map(hubNodes.map(node => [node.label, node]));
  const nodes: GraphNodeDatum[] = [...hubNodes];
  const links: GraphLinkDatum[] = [];

  const labelsById = new Map(eligible.map((entry, index) => [entry.id, labelsByEntry[index] ?? []]));
  const byHub = new Map<string, { hub?: GraphNodeDatum; entries: PageManifestEntry[] }>();
  eligible.forEach((entry, index) => {
    const labels = labelsByEntry[index] ?? [];
    const hub = hubByLabel.get(labels[0] ?? "");
    const hubKey = hub?.id ?? "none";
    const group = byHub.get(hubKey) ?? { hub, entries: [] };
    group.entries.push(entry);
    byHub.set(hubKey, group);
  });

  const built = buildShowAllNoteEdges(eligible, labelsByEntry);
  const degreeById = new Map(eligible.map((entry, index) => [`leaf:${entry.id}`, built.degree[index] ?? 0]));

  for (const group of byHub.values()) {
    group.entries.forEach(entry => {
      const hubLabels = [...new Set(labelsById.get(entry.id) ?? [])].filter(label => hubByLabel.has(label));
      const degree = degreeById.get(`leaf:${entry.id}`) ?? 0;
      const palette = group.hub
        ? { fill: group.hub.color, soft: group.hub.soft, ink: group.hub.ink }
        : colorForHub(hubLabels[0] ?? entry.title);
      nodes.push({
        id: `leaf:${entry.id}`,
        kind: "leaf",
        label: entry.title,
        count: 1,
        pageId: entry.id,
        parentKeyword: group.hub?.label,
        hubLabels,
        degree,
        color: palette.fill,
        soft: palette.soft,
        ink: palette.ink,
        r: showAllNoteRadius(degree),
      });
    });
  }

  const overlaps = built.links;
  const leafById = new Map(nodes.filter(node => node.kind === "leaf").map(node => [node.id, node]));
  for (const link of overlaps) {
    const source = typeof link.source === "string" ? leafById.get(link.source) : link.source;
    if (source) link.color = source.soft;
  }
  links.push(...overlaps);
  layoutShowAll(nodes, hubTies, SHOW_ALL_DEFAULT_SHAPE, links);

  return {
    nodes,
    links,
    majorCount: hubNodes.length,
    minorCount: 0,
    leaves: new Map(),
    hubTies,
  };
}
