/**
 * Show All transitions. The layout is computed up front (no physics), so the map either fades in
 * once, already in its final place (first load), or glides from the old layout to the new one
 * (grouping or slider change). Nothing drifts, snaps or re-zooms after it appears.
 */
import type { GraphNodeDatum } from "./keywordGraph";
import type { ViewState } from "./forceGraphBehavior";

export const SHOW_ALL_REVEAL_MS = 560;
export const SHOW_ALL_MORPH_MS = 680;
export const SHOW_ALL_RETUNE_MORPH_MS = 320;

export function easeOutCubic(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return 1 - (1 - t) ** 3;
}

export function easeInOutCubic(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type MorphFrame = { fromX: number; fromY: number; toX: number; toY: number; fromO: number; toO: number };

export type ShowAllMorph = {
  nodes: GraphNodeDatum[];
  frames: Map<GraphNodeDatum, MorphFrame>;
};

/**
 * Pairs the map on screen with the freshly settled one. Notes in both glide; new notes fade in
 * where they will live; notes that are leaving fade out where they stand.
 */
export function planShowAllMorph(current: GraphNodeDatum[], settled: GraphNodeDatum[]): ShowAllMorph {
  const byId = new Map(current.filter(node => !node.departing).map(node => [node.id, node]));
  const frames = new Map<GraphNodeDatum, MorphFrame>();
  const nextIds = new Set<string>();
  for (const node of settled) {
    nextIds.add(node.id);
    const prev = byId.get(node.id);
    const toX = node.x ?? 0;
    const toY = node.y ?? 0;
    frames.set(node, {
      fromX: prev?.x ?? toX,
      fromY: prev?.y ?? toY,
      toX,
      toY,
      fromO: prev ? (prev.opacity ?? 1) : 0,
      toO: 1,
    });
  }
  const leaving: GraphNodeDatum[] = [];
  for (const node of current) {
    if (node.departing || nextIds.has(node.id)) continue;
    const ghost = { ...node, departing: true };
    frames.set(ghost, {
      fromX: node.x ?? 0,
      fromY: node.y ?? 0,
      toX: node.x ?? 0,
      toY: node.y ?? 0,
      fromO: node.opacity ?? 1,
      toO: 0,
    });
    leaving.push(ghost);
  }
  const morph = { nodes: [...settled, ...leaving], frames };
  applyShowAllMorph(morph, 0);
  return morph;
}

/** Writes the in-between positions. At progress 1 the leaving notes are dropped. */
export function applyShowAllMorph(morph: ShowAllMorph, progress: number) {
  const t = easeInOutCubic(progress);
  const fade = easeOutCubic(progress);
  for (const node of morph.nodes) {
    const frame = morph.frames.get(node);
    if (!frame) continue;
    const x = frame.fromX + (frame.toX - frame.fromX) * t;
    const y = frame.fromY + (frame.toY - frame.fromY) * t;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
    node.opacity = frame.fromO + (frame.toO - frame.fromO) * fade;
  }
  if (progress >= 1) {
    morph.nodes = morph.nodes.filter(node => !node.departing);
    for (const node of morph.nodes) node.opacity = 1;
  }
  return morph.nodes;
}

export function tweenView(from: ViewState, to: ViewState, progress: number): ViewState {
  const t = easeInOutCubic(progress);
  // Interpolate zoom in log space so a big zoom change does not lurch at one end.
  const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * t);
  return {
    k,
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}
