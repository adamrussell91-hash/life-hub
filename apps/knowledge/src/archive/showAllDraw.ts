/** Show All canvas LOD — keep the map connected without drawing every edge every frame. */

import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";

export const SHOW_ALL_EDGE_BUDGET_FAR = 2200;
export const SHOW_ALL_EDGE_BUDGET_NEAR = 7000;
export const SHOW_ALL_LOD_NEAR = 0.55;
export const SHOW_ALL_RING_MIN_K = 0.32;

export function showAllEdgeBudget(k: number): number {
  return k >= SHOW_ALL_LOD_NEAR ? SHOW_ALL_EDGE_BUDGET_NEAR : SHOW_ALL_EDGE_BUDGET_FAR;
}

export function showAllLinkEndId(end: GraphLinkDatum["source"] | GraphLinkDatum["target"]): string {
  return typeof end === "string" ? end : end.id;
}

export function showAllLinkRank(link: GraphLinkDatum): number {
  return (link.kind === "backbone" ? 1_000_000 : 0) + (link.weight ?? 0);
}

export function rankShowAllLinks(links: GraphLinkDatum[]): GraphLinkDatum[] {
  return [...links].sort((a, b) => showAllLinkRank(b) - showAllLinkRank(a));
}

export function pickShowAllLinksToDraw(
  ranked: GraphLinkDatum[],
  k: number,
  opts: {
    keepExtra?: (link: GraphLinkDatum) => boolean;
    preferVisible?: (link: GraphLinkDatum) => boolean;
  } = {},
): GraphLinkDatum[] {
  const budget = showAllEdgeBudget(k);
  const pool =
    k >= SHOW_ALL_LOD_NEAR && opts.preferVisible
      ? ranked.filter(link => opts.preferVisible!(link))
      : ranked;
  const picked = pool.slice(0, budget);
  if (!opts.keepExtra) return picked;
  const seen = new Set(picked);
  for (const link of ranked) {
    if (seen.has(link)) continue;
    if (!opts.keepExtra(link)) continue;
    picked.push(link);
    seen.add(link);
  }
  return picked;
}

export function showAllLabelVisible(
  node: GraphNodeDatum,
  viewK: number,
  hover = false,
  neighborhood = false,
): boolean {
  if (node.kind === "leaf") return neighborhood;
  if (node.kind === "major") return true;
  if (hover) return viewK > 0.35;
  if ((node.degree ?? node.count ?? 0) >= 18) return viewK >= 0.28;
  if ((node.degree ?? node.count ?? 0) >= 8) return viewK >= 0.55;
  return viewK >= 1.05;
}

export function showAllDrawRings(k: number): boolean {
  return k >= SHOW_ALL_RING_MIN_K;
}

export type HubLabelCandidate = { text: string; width: number };
export type HubLabelInput = {
  id: string;
  x: number;
  y: number;
  /** Radius of the drawn hub core, same units as x/y. */
  coreR: number;
  /** Longest first. The first one that fits wins. */
  candidates: HubLabelCandidate[];
  /** Hovered or selected: placed first and never hidden. */
  pinned?: boolean;
};
export type HubLabelPlacement = { text: string; side: "above" | "below"; box: LabelBox };
export type LabelBox = { x0: number; y0: number; x1: number; y1: number };

function boxesHit(a: LabelBox, b: LabelBox) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Shorter fallbacks for a topic name: "Teacher Practice and Professional Learning" → "Teacher Practice". */
export function hubLabelVariants(label: string, max = 30): string[] {
  const full = label.length > max ? `${label.slice(0, max - 1)}…` : label;
  const head = label.split(/\s+and\s+/i)[0]!.trim();
  const words = head.split(/\s+/);
  const short = words.length > 2 ? words.slice(0, 2).join(" ") : head;
  return [...new Set([full, head, short].filter(Boolean))];
}

/**
 * Collision pass for hub labels (UI failure C1): try above, then below, then a shorter name;
 * if nothing fits the label hides and the hover tip carries it. Hubs are placed in the order
 * given (biggest topic first), pinned ones before all others.
 */
export function placeHubLabels(hubs: HubLabelInput[], lineHeight: number, gap: number, bounds?: LabelBox) {
  const placed = new Map<string, HubLabelPlacement>();
  const taken: LabelBox[] = hubs.map(hub => ({
    x0: hub.x - hub.coreR,
    y0: hub.y - hub.coreR,
    x1: hub.x + hub.coreR,
    y1: hub.y + hub.coreR,
  }));
  const order = [...hubs.filter(hub => hub.pinned), ...hubs.filter(hub => !hub.pinned)];
  for (const hub of order) {
    const own = hubs.indexOf(hub);
    let done = false;
    for (const candidate of hub.candidates) {
      for (const side of ["above", "below"] as const) {
        const top = side === "above" ? hub.y - hub.coreR - gap - lineHeight : hub.y + hub.coreR + gap;
        let x0 = hub.x - candidate.width / 2;
        // Slide the label back inside the visible stage rather than letting it clip at an edge.
        if (bounds) x0 = Math.min(Math.max(x0, bounds.x0), bounds.x1 - candidate.width);
        const box = { x0, y0: top, x1: x0 + candidate.width, y1: top + lineHeight };
        if (bounds && !hub.pinned && (box.x0 < bounds.x0 || box.y0 < bounds.y0 || box.y1 > bounds.y1)) continue;
        const clash = taken.some((other, index) => index !== own && boxesHit(box, other));
        if (clash && !hub.pinned) continue;
        placed.set(hub.id, { text: candidate.text, side, box });
        taken.push(box);
        done = true;
        break;
      }
      if (done) break;
    }
  }
  return placed;
}
