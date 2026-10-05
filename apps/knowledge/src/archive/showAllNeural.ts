/**
 * Show All as a neural map. Two things make a graph read as neurons rather than a fishnet:
 *
 * 1. Topology — a branching backbone. Every note joins the single note it is most like (a
 *    maximum spanning tree), so notes form chains that split into branches and end in tips.
 *    A few notes naturally gather many neighbours (capped), most hold one to three, and a thin
 *    layer of cross-links ties branches together.
 * 2. Geometry from links — positions come from the backbone, not from topic. Each branch grows
 *    outward from its parent inside an angular wedge sized to how much it carries, so trunks
 *    run long and twigs stay short. Topic regions emerge because similar notes share branches.
 *
 * No physics: the layout is computed once, in O(n), and is identical every time.
 */
import { forceCollide, forceLink, forceSimulation, forceX, forceY } from "d3-force";
import type { ScoredPair } from "./showAllEdges";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

/** No note gathers more than this many links, so nothing becomes a 300-spoke hub. */
export const NEURAL_DEGREE_CAP = 18;
/** Cross-links between branches, as a share of the note count. */
export const NEURAL_CROSS_SHARE = 0.4;
export const NEURAL_BASE_LENGTH = 26;

const LAYOUT_CENTRE = { x: 760, y: 560 };

function hashUnit(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function pairKey(a: number, b: number) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

class Sets {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  union(a: number, b: number) {
    const left = this.find(a);
    const right = this.find(b);
    if (left === right) return false;
    this.parent[left] = right;
    return true;
  }
}

export type NeuralEdges = { tree: ScoredPair[]; cross: ScoredPair[]; degree: number[] };

/** How central a note is in its own neighbourhood: the sum of its strongest few similarities. */
export function noteCentrality(n: number, scored: ScoredPair[], top = 8) {
  const best = Array.from({ length: n }, () => [] as number[]);
  for (const pair of scored) {
    best[pair.a]!.push(pair.score);
    best[pair.b]!.push(pair.score);
  }
  return best.map((scores, index) => {
    scores.sort((x, y) => y - x);
    const sum = scores.slice(0, top).reduce((total, value) => total + value, 0);
    // A whisker of stable noise breaks exact ties without favouring low indexes.
    return sum + hashUnit(`c${index}`) * 1e-6;
  });
}

/**
 * Backbone = a bushy tree, not a chain. Every note joins the most similar note that is more
 * central than itself (capped children), so central notes gather branches — the bright knots —
 * while ordinary notes trail off as twigs. A note with no more-central partner is a local peak;
 * peaks then join the nearest more-central peak so the map is one connected web. Finally the
 * strongest remaining pairs become cross-links, never pushing a note past the cap.
 */
export function buildNeuralEdges(n: number, scored: ScoredPair[], cap = NEURAL_DEGREE_CAP): NeuralEdges {
  const centrality = noteCentrality(n, scored);
  const partners = Array.from({ length: n }, () => [] as Array<{ other: number; score: number }>);
  for (const pair of scored) {
    partners[pair.a]!.push({ other: pair.b, score: pair.score });
    partners[pair.b]!.push({ other: pair.a, score: pair.score });
  }
  const degree = new Array<number>(n).fill(0);
  const tree: ScoredPair[] = [];
  const used = new Set<string>();
  const sets = new Sets(n);
  const cross: ScoredPair[] = [];
  const join = (a: number, b: number, score: number, into: ScoredPair[] = tree) => {
    into.push({ a: Math.min(a, b), b: Math.max(a, b), score });
    used.add(pairKey(a, b));
    degree[a] += 1;
    degree[b] += 1;
    sets.union(a, b);
  };

  // Most central first, so a parent always has its links counted before its children ask.
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => centrality[y]! - centrality[x]!);
  const peaks: number[] = [];
  for (const i of order) {
    let parent = -1;
    let best = -Infinity;
    for (const { other, score } of partners[i]!) {
      if (centrality[other]! <= centrality[i]!) continue;
      if (degree[other]! >= cap) continue;
      if (score > best) {
        best = score;
        parent = other;
      }
    }
    if (parent >= 0) join(i, parent, best);
    else peaks.push(i);
  }
  // Each peak's tree is its own cluster. Peaks reach out to their best partner in another tree;
  // those become the long threads between clusters, not part of any cluster's backbone.
  for (const peak of peaks) {
    let target = -1;
    let best = -Infinity;
    for (const { other, score } of partners[peak]!) {
      if (sets.find(other) === sets.find(peak) || degree[other]! >= cap) continue;
      if (score > best) {
        best = score;
        target = other;
      }
    }
    if (target >= 0) join(peak, target, best, cross);
  }

  const ordered = [...scored].sort(
    (x, y) => y.score - x.score || hashUnit(pairKey(x.a, x.b)) - hashUnit(pairKey(y.a, y.b)),
  );
  const want = cross.length + Math.round(n * NEURAL_CROSS_SHARE);
  for (const pair of ordered) {
    if (cross.length >= want) break;
    const key = pairKey(pair.a, pair.b);
    if (used.has(key)) continue;
    if (degree[pair.a]! >= cap || degree[pair.b]! >= cap) continue;
    // Cross-links tie different branches together; neighbours on the same twig add nothing.
    used.add(key);
    cross.push(pair);
    degree[pair.a] += 1;
    degree[pair.b] += 1;
  }
  return { tree, cross, degree };
}

type Body = { index: number; r: number; x: number; y: number; vx?: number; vy?: number };

/**
 * Packs clusters into one round body: biggest at the core, clusters that share threads side by
 * side. Deterministic (sunflower seed, fixed tick count).
 */
export function packClusters(radii: number[], threads: Map<string, number>, gap: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const step = (radii[0] ?? 1) * 0.9;
  const bodies: Body[] = radii.map((r, index) => ({
    index,
    r,
    x: LAYOUT_CENTRE.x + Math.cos(index * golden) * step * Math.sqrt(index),
    y: LAYOUT_CENTRE.y + Math.sin(index * golden) * step * Math.sqrt(index),
  }));
  if (bodies.length > 1) {
    const maxR = Math.max(...radii);
    const maxThread = Math.max(1, ...threads.values());
    const springs = [...threads.entries()].map(([key, weight]) => {
      const [a, b] = key.split("|").map(Number);
      return { source: a!, target: b!, weight };
    });
    const sim = forceSimulation<Body>(bodies)
      .stop()
      .force(
        "threads",
        forceLink<Body, { source: number | Body; target: number | Body; weight: number }>(springs)
          .id(body => body.index)
          .distance(link => (link.source as Body).r + (link.target as Body).r + gap)
          .strength(link => 0.02 + 0.3 * (link.weight / maxThread)),
      )
      .force("x", forceX<Body>(LAYOUT_CENTRE.x).strength(body => 0.03 + 0.2 * (body.r / maxR) ** 2))
      .force("y", forceY<Body>(LAYOUT_CENTRE.y).strength(body => 0.03 + 0.2 * (body.r / maxR) ** 2))
      .force("collide", forceCollide<Body>(body => body.r + gap * 0.3).strength(1).iterations(4));
    sim.tick(300);
  }
  return bodies.map(body => ({ x: body.x, y: body.y }));
}

type TreeNode = { id: string; children: TreeNode[]; size: number; parent?: TreeNode };

function endId(end: GraphLinkDatum["source"]) {
  return typeof end === "string" ? end : end.id;
}

export type NeuralShape = { spread: number; fan: number };
export const NEURAL_DEFAULT_SHAPE: NeuralShape = { spread: 1, fan: 1 };

/**
 * Grows every component outward from its centre. Each child gets a slice of its parent's wedge
 * in proportion to the notes it carries, and an edge length that grows with that load — trunks
 * long, twigs short. The biggest component sits in the middle; smaller ones ring it.
 */
export function layoutNeural(
  nodes: GraphNodeDatum[],
  links: GraphLinkDatum[],
  shape: NeuralShape = NEURAL_DEFAULT_SHAPE,
) {
  const leaves = nodes.filter(node => node.kind === "leaf" && !node.departing);
  const ids = new Set(leaves.map(node => node.id));
  const adjacency = new Map<string, string[]>(leaves.map(node => [node.id, []]));
  for (const link of links) {
    if (link.kind !== "backbone") continue;
    const a = endId(link.source);
    const b = endId(link.target);
    if (!ids.has(a) || !ids.has(b)) continue;
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
  }
  for (const list of adjacency.values()) list.sort();

  // Components, biggest first.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const node of [...leaves].sort((a, b) => a.id.localeCompare(b.id))) {
    if (seen.has(node.id)) continue;
    const members: string[] = [];
    const stack = [node.id];
    seen.add(node.id);
    while (stack.length) {
      const id = stack.pop()!;
      members.push(id);
      for (const other of adjacency.get(id) ?? []) {
        if (seen.has(other)) continue;
        seen.add(other);
        stack.push(other);
      }
    }
    components.push(members);
  }
  components.sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));

  const byId = new Map(leaves.map(node => [node.id, node]));
  const base = NEURAL_BASE_LENGTH * shape.spread;
  const place = (id: string, x: number, y: number) => {
    const node = byId.get(id)!;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
    node.homeX = x;
    node.homeY = y;
  };

  const grow = (members: string[], cx: number, cy: number, startAngle: number, wedge: number): number => {
    // Root at the cluster's knot: its best-linked note (ties broken by id).
    const rootId = [...members].sort(
      (a, b) => (adjacency.get(b)?.length ?? 0) - (adjacency.get(a)?.length ?? 0) || a.localeCompare(b),
    )[0]!;
    // Build the rooted tree breadth-first so very deep chains never blow the stack.
    const root: TreeNode = { id: rootId, children: [], size: 1 };
    const order: TreeNode[] = [root];
    const visited = new Set([rootId]);
    for (let i = 0; i < order.length; i++) {
      const current = order[i]!;
      for (const other of adjacency.get(current.id) ?? []) {
        if (visited.has(other)) continue;
        visited.add(other);
        const child: TreeNode = { id: other, children: [], size: 1, parent: current };
        current.children.push(child);
        order.push(child);
      }
    }
    for (let i = order.length - 1; i > 0; i--) order[i]!.parent!.size += order[i]!.size;
    for (const node of order) node.children.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));

    // Each note sends its branches out across an arc facing away from its parent (the full circle
    // at the root). Arc shares follow branch size, edge length grows with what a branch carries:
    // trunks run long, twigs stay short, chains wander. Linear in the number of notes.
    place(rootId, cx, cy);
    type Job = { node: TreeNode; x: number; y: number; heading: number };
    const jobs: Job[] = [{ node: root, x: cx, y: cy, heading: startAngle }];
    while (jobs.length) {
      const job = jobs.pop()!;
      const kids = job.node.children;
      if (!kids.length) continue;
      const arc = job.node === root ? wedge : Math.min(Math.PI * 1.5, 0.7 + kids.length * 0.38);
      const shares = kids.map(child => child.size ** (0.75 * shape.fan));
      const total = shares.reduce((sum, value) => sum + value, 0) || 1;
      // Interleave big and small branches so the heavy ones do not crowd one side.
      const arranged: number[] = [];
      for (let lo = 0, hi = kids.length - 1; lo <= hi; lo++, hi--) {
        arranged.push(lo);
        if (lo !== hi) arranged.push(hi);
      }
      let cursor = job.heading - arc / 2;
      for (const index of arranged) {
        const child = kids[index]!;
        const span = (arc * shares[index]!) / total;
        const jitter = (hashUnit(`${child.id}:a`) - 0.5) * Math.min(span, 0.9) * 0.6;
        const angle = cursor + span / 2 + jitter;
        cursor += span;
        const wobble = 0.8 + hashUnit(`${child.id}:l`) * 0.4;
        const length = base * (0.6 + 0.24 * Math.log2(1 + child.size)) * wobble;
        const x = job.x + Math.cos(angle) * length;
        const y = job.y + Math.sin(angle) * length;
        place(child.id, x, y);
        jobs.push({ node: child, x, y, heading: angle });
      }
    }
    return 0;
  };

  if (!components.length) return;
  // Grow each cluster around the origin, measure it, then pack the clusters into one round body
  // with clusters that share threads pulled together.
  const extents = components.map(members => {
    grow(members, 0, 0, 0, Math.PI * 2);
    let reachSq = 0;
    for (const id of members) {
      const node = byId.get(id)!;
      reachSq = Math.max(reachSq, (node.x ?? 0) ** 2 + (node.y ?? 0) ** 2);
    }
    return Math.sqrt(reachSq) + base * 0.6;
  });
  const clusterOf = new Map<string, number>();
  components.forEach((members, index) => members.forEach(id => clusterOf.set(id, index)));
  const threads = new Map<string, number>();
  for (const link of links) {
    if (link.kind === "backbone") continue;
    const a = clusterOf.get(endId(link.source));
    const b = clusterOf.get(endId(link.target));
    if (a == null || b == null || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    threads.set(key, (threads.get(key) ?? 0) + 1);
  }
  const centres = packClusters(extents, threads, base * 0.5);
  components.forEach((members, index) => {
    const { x: ox, y: oy } = centres[index]!;
    for (const id of members) {
      const node = byId.get(id)!;
      place(id, (node.x ?? 0) + ox, (node.y ?? 0) + oy);
    }
  });

  placeTopicAnchors(nodes, links);
}

/**
 * Topic anchors (labels, selection) sit at the middle of the topic's notes in the backbone cluster
 * that holds most of them — a topic spread over several clusters would otherwise average to nowhere.
 */
export function placeTopicAnchors(nodes: GraphNodeDatum[], links: GraphLinkDatum[]) {
  const leaves = nodes.filter(node => node.kind === "leaf" && !node.departing);
  const sets = new Sets(leaves.length);
  const index = new Map(leaves.map((node, i) => [node.id, i]));
  for (const link of links) {
    if (link.kind !== "backbone") continue;
    const a = index.get(endId(link.source));
    const b = index.get(endId(link.target));
    if (a != null && b != null) sets.union(a, b);
  }
  const perCluster = new Map<string, Map<number, { x: number; y: number; n: number }>>();
  leaves.forEach((node, i) => {
    if (!node.parentKeyword || node.x == null || node.y == null) return;
    const cluster = sets.find(i);
    const byCluster = perCluster.get(node.parentKeyword) ?? new Map();
    const sum = byCluster.get(cluster) ?? { x: 0, y: 0, n: 0 };
    sum.x += node.x;
    sum.y += node.y;
    sum.n += 1;
    byCluster.set(cluster, sum);
    perCluster.set(node.parentKeyword, byCluster);
  });
  for (const node of nodes) {
    if (node.kind !== "major") continue;
    const byCluster = perCluster.get(node.label);
    const best = byCluster ? [...byCluster.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0])[0]![1] : null;
    const x = best ? best.x / best.n : LAYOUT_CENTRE.x;
    const y = best ? best.y / best.n : LAYOUT_CENTRE.y;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.homeX = x;
    node.homeY = y;
  }
}

/**
 * How much each backbone link carries: the number of notes beyond it, seen from its cluster's
 * best-linked note. Drawn as thickness, so trunks taper into twigs like dendrites.
 * Keyed by `${a}|${b}` with ids sorted.
 */
export function branchLoads(nodes: GraphNodeDatum[], links: GraphLinkDatum[]) {
  const ids = nodes.filter(node => node.kind === "leaf" && !node.departing).map(node => node.id);
  const adjacency = new Map<string, string[]>(ids.map(id => [id, []]));
  const degree = new Map<string, number>(ids.map(id => [id, 0]));
  for (const link of links) {
    if (link.kind !== "backbone" && link.kind !== "overlap") continue;
    const a = endId(link.source);
    const b = endId(link.target);
    if (!adjacency.has(a) || !adjacency.has(b)) continue;
    degree.set(a, degree.get(a)! + 1);
    degree.set(b, degree.get(b)! + 1);
    if (link.kind !== "backbone") continue;
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
  }
  const loads = new Map<string, number>();
  const seen = new Set<string>();
  const starts = [...ids].sort((a, b) => degree.get(b)! - degree.get(a)! || a.localeCompare(b));
  for (const start of starts) {
    if (seen.has(start)) continue;
    seen.add(start);
    const order = [start];
    const parent = new Map<string, string | null>([[start, null]]);
    for (let i = 0; i < order.length; i++) {
      for (const other of adjacency.get(order[i]!)!) {
        if (seen.has(other)) continue;
        seen.add(other);
        parent.set(other, order[i]!);
        order.push(other);
      }
    }
    const size = new Map(order.map(id => [id, 1]));
    for (let i = order.length - 1; i > 0; i--) {
      const id = order[i]!;
      const up = parent.get(id)!;
      size.set(up, size.get(up)! + size.get(id)!);
      loads.set(id < up ? `${id}|${up}` : `${up}|${id}`, size.get(id)!);
    }
  }
  return loads;
}
