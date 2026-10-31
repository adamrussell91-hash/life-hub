// My board's clusters: the edits Adam makes to them (add, take off, move a tile, move or make a
// cluster) and where a dragged tile lands. Pure: every edit returns new clusters.
import { addToCluster, BOARD_CLUSTER_ID, BOARD_CLUSTER_NAME, MAX_CLUSTERS, MAX_CLUSTER_NAME, newClusterId, touchingFreeCells } from '../../../../packages/walkthrus/clusters.mjs';
import { clusterCellPx, clusterLabelBox, DEFAULT_SIZE, type BoardLayout, type BoardTile, type ClusterData } from '../../../../packages/walkthrus/board/layout';
import type { Cell, Pt } from '../../../../packages/walkthrus/board/hex';

/** The Proof mark a tile may carry on its top-right corner. Null draws nothing. */
export type TileMark = '+' | '−' | 'few' | null;

const replace = (clusters: ClusterData[], next: ClusterData): ClusterData[] => clusters.map((c) => (c.id === next.id ? next : c));

export function addTile(clusters: ClusterData[], clusterId: string, tileId: string): ClusterData[] {
  const c = clusters.find((x) => x.id === clusterId);
  return c ? replace(clusters, addToCluster(c, tileId) as ClusterData) : clusters;
}

export function removeTile(clusters: ClusterData[], clusterId: string, tileId: string): ClusterData[] {
  const c = clusters.find((x) => x.id === clusterId);
  return c ? replace(clusters, { ...c, tiles: c.tiles.filter((t) => t.id !== tileId) }) : clusters;
}

/** Moves a tile onto a cell of a cluster (its own or another), leaving the cluster it came from. */
export function placeTile(clusters: ClusterData[], fromId: string, tileId: string, toId: string, cell: Cell): ClusterData[] {
  return clusters.map((c) => {
    let tiles = c.tiles;
    if (c.id === fromId) tiles = tiles.filter((t) => t.id !== tileId);
    if (c.id === toId) tiles = [...tiles.filter((t) => t.id !== tileId), { id: tileId, q: cell.q, r: cell.r }];
    return tiles === c.tiles ? c : { ...c, tiles };
  });
}

export function moveCluster(clusters: ClusterData[], id: string, x: number, y: number): ClusterData[] {
  return clusters.map((c) => (c.id === id ? { ...c, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } : c));
}

/** The left edge for a new cluster: to the right of everything on the board, with clear space between. */
export function newClusterSpot(layout: BoardLayout): Pt {
  if (!layout.clusters.length) return { x: 0, y: 0 };
  const right = Math.max(...layout.clusters.map((c) => Math.max(c.frame.x + c.frame.w, c.label.x + c.label.w / 2)));
  const top = Math.min(...layout.clusters.map((c) => c.label.y));
  return { x: Math.round(right + layout.size * 2), y: Math.round(top) };
}

/** A new empty cluster whose title starts at `left` (its x is the title's middle). */
export function makeCluster(clusters: ClusterData[], name: string, left: Pt, size = DEFAULT_SIZE): { clusters: ClusterData[]; id: string } | null {
  const clean = name.trim().slice(0, MAX_CLUSTER_NAME).trim();
  if (!clean || clusters.length >= MAX_CLUSTERS) return null;
  const id = newClusterId() as string;
  const half = Math.max(clusterLabelBox({ x: 0, y: 0, name: clean }).w / 2, size * 1.5);
  return { clusters: [...clusters, { id, name: clean, x: Math.round(left.x + half), y: left.y, tiles: [] }], id };
}

/**
 * Anything that must stay on My board (the live goal, the ends of Adam's arrows) but sits in no
 * cluster goes into the first cluster, or a new "My board" cluster when there is none.
 */
export function ensureOnBoard(clusters: ClusterData[], ids: Array<string | null | undefined>): ClusterData[] {
  const on = new Set(clusters.flatMap((c) => c.tiles.map((t) => t.id)));
  const missing = ids.filter((id): id is string => Boolean(id) && !on.has(id!));
  if (!missing.length) return clusters;
  let out = clusters.length ? clusters : [{ id: BOARD_CLUSTER_ID, name: BOARD_CLUSTER_NAME, x: 0, y: 0, tiles: [] }];
  for (const id of [...new Set(missing)]) out = replace(out, addToCluster(out[0]!, id) as ClusterData);
  return out;
}

/** The free cell touching the cluster nearest to a board point. The tile being moved doesn't count as there. */
export function snapCell(cluster: ClusterData, tileId: string, at: Pt, size = DEFAULT_SIZE): Cell {
  const others = cluster.tiles.filter((t) => t.id !== tileId);
  const free = touchingFreeCells(others) as Cell[];
  let best = free[0]!;
  let bestD = Infinity;
  for (const cell of free) {
    const p = clusterCellPx(cluster, cell, size);
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < bestD - 1e-9) { bestD = d; best = cell; }
  }
  return best;
}

export type DropResult =
  | { kind: 'fuse'; target: BoardTile }
  | { kind: 'cluster'; clusterId: string };

/**
 * What a tile dropped with its centre at `at` lands on: another tile, when the centre is within
 * half a hexagon of it (a fuse), else the cluster under or next to it, else the one it came from.
 */
export function dropTarget(layout: BoardLayout, dragged: BoardTile, at: Pt): DropResult {
  const others = layout.tiles.filter((t) => t.key !== dragged.key);
  let nearest: BoardTile | null = null;
  let nearestD = Infinity;
  for (const t of others) {
    const d = Math.hypot(t.x - at.x, t.y - at.y);
    if (d < nearestD) { nearestD = d; nearest = t; }
  }
  if (nearest && nearestD <= layout.size * 0.5 && nearest.id !== dragged.id) return { kind: 'fuse', target: nearest };
  if (nearest && nearestD <= layout.size * 2.2) return { kind: 'cluster', clusterId: nearest.cluster };
  const empty = layout.clusters.find((c) => c.empty && Math.hypot(c.x - at.x, c.y - at.y) <= layout.size * 1.6);
  if (empty) return { kind: 'cluster', clusterId: empty.key };
  return { kind: 'cluster', clusterId: dragged.cluster };
}
