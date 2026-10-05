/**
 * What the neural map can tell you, as pure functions over its nodes and links:
 * how two notes connect, which notes bridge topics, which topics never meet,
 * what is recent, the order notes were written in, and a route for a guided walk.
 */
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

type Adjacent = { id: string; weight: number };

function endId(end: GraphLinkDatum["source"]) {
  return typeof end === "string" ? end : end.id;
}

export function noteNeighbours(links: GraphLinkDatum[]) {
  const map = new Map<string, Adjacent[]>();
  const add = (a: string, b: string, weight: number) => {
    const list = map.get(a) ?? [];
    list.push({ id: b, weight });
    map.set(a, list);
  };
  for (const link of links) {
    if (link.kind !== "backbone" && link.kind !== "overlap") continue;
    const a = endId(link.source);
    const b = endId(link.target);
    const weight = Math.max(0.05, link.weight);
    add(a, b, weight);
    add(b, a, weight);
  }
  for (const list of map.values()) list.sort((x, y) => y.weight - x.weight || x.id.localeCompare(y.id));
  return map;
}

/** A topic's representative note: its best-linked note, nearest the topic's anchor on ties. */
export function topicRepresentative(nodes: GraphNodeDatum[], topic: string, links: GraphLinkDatum[]) {
  const neighbours = noteNeighbours(links);
  const anchor = nodes.find(node => node.kind === "major" && node.label === topic);
  const members = nodes.filter(node => node.kind === "leaf" && !node.departing && node.parentKeyword === topic);
  members.sort(
    (a, b) =>
      (neighbours.get(b.id)?.length ?? 0) - (neighbours.get(a.id)?.length ?? 0) ||
      Math.hypot((a.x ?? 0) - (anchor?.x ?? 0), (a.y ?? 0) - (anchor?.y ?? 0)) -
        Math.hypot((b.x ?? 0) - (anchor?.x ?? 0), (b.y ?? 0) - (anchor?.y ?? 0)) ||
      a.id.localeCompare(b.id),
  );
  return members[0] ?? null;
}

/**
 * The chain of linked notes from `from` to `to`. Each hop costs 1 + 1/strength, so the route
 * prefers few, strong links. Returns note ids including both ends, or [] when they never meet.
 */
export function shortestNotePath(links: GraphLinkDatum[], from: string, to: string): string[] {
  if (from === to) return [from];
  const neighbours = noteNeighbours(links);
  const dist = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const done = new Set<string>();
  const frontier = new Set<string>([from]);
  while (frontier.size) {
    let current = "";
    let best = Infinity;
    for (const id of frontier) {
      const d = dist.get(id)!;
      if (d < best || (d === best && id < current)) {
        best = d;
        current = id;
      }
    }
    frontier.delete(current);
    if (current === to) break;
    done.add(current);
    for (const next of neighbours.get(current) ?? []) {
      if (done.has(next.id)) continue;
      const d = best + 1 + 1 / next.weight;
      if (d < (dist.get(next.id) ?? Infinity)) {
        dist.set(next.id, d);
        previous.set(next.id, current);
        frontier.add(next.id);
      }
    }
  }
  if (!previous.has(to)) return [];
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0]!)!);
  return path;
}

export type Bridge = { id: string; label: string; topics: string[] };

/**
 * Key bridges: notes whose links reach into the most other topics. These are the notes that hold
 * separate areas of your thinking together.
 */
export function keyBridges(nodes: GraphNodeDatum[], links: GraphLinkDatum[], limit = 8): Bridge[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const neighbours = noteNeighbours(links);
  const scored: Array<Bridge & { score: number }> = [];
  for (const node of nodes) {
    if (node.kind !== "leaf" || node.departing) continue;
    const reached = new Set<string>();
    for (const next of neighbours.get(node.id) ?? []) {
      const topic = byId.get(next.id)?.parentKeyword;
      if (topic && topic !== node.parentKeyword) reached.add(topic);
    }
    if (reached.size < 2) continue;
    const degree = neighbours.get(node.id)?.length ?? 0;
    scored.push({
      id: node.id,
      label: node.label,
      topics: [...reached].sort(),
      score: reached.size * 10 + Math.log2(1 + degree),
    });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit).map(({ score: _score, ...bridge }) => bridge);
}

export type MissingLink = { a: string; b: string; shared: number };

/**
 * Missing links: topics you have tagged together on notes, but whose notes never link to each
 * other. Strongest first; falls back to the biggest topic pairs with no links at all.
 */
export function missingLinks(
  nodes: GraphNodeDatum[],
  links: GraphLinkDatum[],
  ties: Array<{ a: string; b: string; weight: number }> = [],
  limit = 5,
): MissingLink[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const crossing = new Set<string>();
  for (const link of links) {
    if (link.kind !== "backbone" && link.kind !== "overlap") continue;
    const a = byId.get(endId(link.source))?.parentKeyword;
    const b = byId.get(endId(link.target))?.parentKeyword;
    if (!a || !b || a === b) continue;
    crossing.add(a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  }
  const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const out: MissingLink[] = ties
    .filter(tie => tie.weight > 0 && !crossing.has(key(tie.a, tie.b)))
    .map(tie => ({ a: tie.a, b: tie.b, shared: tie.weight }));
  if (out.length < limit) {
    const topics = nodes
      .filter(node => node.kind === "major" && !node.departing)
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label))
      .slice(0, 12);
    for (let i = 0; i < topics.length && out.length < limit * 3; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const a = topics[i]!.label;
        const b = topics[j]!.label;
        if (crossing.has(key(a, b)) || out.some(item => key(item.a, item.b) === key(a, b))) continue;
        out.push({ a: a < b ? a : b, b: a < b ? b : a, shared: 0 });
      }
    }
  }
  return out.sort((x, y) => y.shared - x.shared || x.a.localeCompare(y.a) || x.b.localeCompare(y.b)).slice(0, limit);
}

/** Epoch ms for a note's creation date, or null when it has none / it is unreadable. */
export function noteTime(node: Pick<GraphNodeDatum, "createdAt">) {
  if (!node.createdAt) return null;
  const time = Date.parse(node.createdAt);
  return Number.isFinite(time) ? time : null;
}

/** First and last creation dates in the map. Undated notes count as present from the start. */
export function growthSpan(nodes: GraphNodeDatum[]) {
  let first = Infinity;
  let last = -Infinity;
  for (const node of nodes) {
    if (node.kind !== "leaf") continue;
    const time = noteTime(node);
    if (time == null) continue;
    first = Math.min(first, time);
    last = Math.max(last, time);
  }
  return Number.isFinite(first) ? { first, last } : null;
}

/** Is the note written by `until`? Undated notes are always there. */
export function grownBy(node: GraphNodeDatum, until: number) {
  const time = noteTime(node);
  return time == null || time <= until;
}

export const RECENT_WINDOWS = [
  { id: "week", label: "Week", days: 7 },
  { id: "month", label: "Month", days: 30 },
  { id: "quarter", label: "Quarter", days: 91 },
  { id: "year", label: "Year", days: 365 },
] as const;

export type RecentWindow = (typeof RECENT_WINDOWS)[number]["id"];

export function isRecent(node: GraphNodeDatum, window: RecentWindow, now: number) {
  const days = RECENT_WINDOWS.find(item => item.id === window)?.days ?? 30;
  const time = noteTime(node);
  return time != null && time >= now - days * 86_400_000 && time <= now + 86_400_000;
}

/**
 * A guided walk: start at the best-linked note, then keep stepping to the strongest unvisited
 * neighbour; at a dead end, jump to the best-linked note not yet seen.
 */
export function walkRoute(nodes: GraphNodeDatum[], links: GraphLinkDatum[], steps = 40, start?: string) {
  const neighbours = noteNeighbours(links);
  const leaves = nodes.filter(node => node.kind === "leaf" && !node.departing);
  const ranked = [...leaves].sort(
    (a, b) => (neighbours.get(b.id)?.length ?? 0) - (neighbours.get(a.id)?.length ?? 0) || a.id.localeCompare(b.id),
  );
  const route: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = start && leaves.some(node => node.id === start) ? start : ranked[0]?.id;
  while (current && route.length < steps) {
    route.push(current);
    seen.add(current);
    const next: Adjacent | undefined = (neighbours.get(current) ?? []).find(item => !seen.has(item.id));
    current = next?.id ?? ranked.find(node => !seen.has(node.id))?.id;
  }
  return route;
}
