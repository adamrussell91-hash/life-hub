// packages/walkthrus/clusters.mjs
// The named clusters on Adam's own board. Each cluster has a title anchor (x, y in board units) and
// its tiles on an axial hexagon grid relative to the cluster's origin, which sits under the title.
// A tile (technique or fusion) may sit in several clusters; within one cluster it sits once.
import { isTileId } from './tiles.mjs';

export const MAX_CLUSTERS = 40;
export const MAX_CLUSTER_TILES = 40;
export const MAX_CLUSTER_NAME = 40;
export const BOARD_CLUSTER_ID = 'cl_board';
export const BOARD_CLUSTER_NAME = 'My board';

const ID = /^cl_[a-z0-9_]{1,30}$/;
const SQRT3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const isClusterId = (id) => typeof id === 'string' && ID.test(id);
export const newClusterId = () => `cl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const finite = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
const cellKey = (q, r) => `${q},${r}`;

/** Pixel centre of an axial cell at unit size (flat-top hexagons, y grows down). */
export const cellCentre = (q, r) => ({ x: 1.5 * q, y: SQRT3 * (r + q / 2) });

/** Cells on or below the origin's row, so a cluster's tiles always hang under its title. */
export const belowTitle = (q, r) => r + q / 2 >= 0;

function normalizeTiles(value) {
  const ids = new Set();
  const cells = new Set();
  const out = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== 'object' || !isTileId(raw.id)) continue;
    if (!Number.isInteger(raw.q) || !Number.isInteger(raw.r)) continue;
    const key = cellKey(raw.q, raw.r);
    if (ids.has(raw.id) || cells.has(key)) continue;
    ids.add(raw.id);
    cells.add(key);
    out.push({ id: raw.id, q: raw.q + 0, r: raw.r + 0 });
    if (out.length >= MAX_CLUSTER_TILES) break;
  }
  return out;
}

/** The valid clusters from whatever was sent, in the order given. */
export function normalizeClusters(value) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== 'object' || !isClusterId(raw.id) || seen.has(raw.id)) continue;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_CLUSTER_NAME).trim() : '';
    if (!name) continue;
    seen.add(raw.id);
    out.push({ id: raw.id, name, x: finite(raw.x), y: finite(raw.y), tiles: normalizeTiles(raw.tiles) });
    if (out.length >= MAX_CLUSTERS) break;
  }
  return out;
}

/** Whether a tile at (q, r) would have tiles on all six sides. */
const enclosed = (taken, q, r) => DIRS.every(([dq, dr]) => taken.has(cellKey(q + dq, r + dr)));

/**
 * The free cells a tile may snap to in a cluster: every empty cell touching one of its tiles, under
 * the title. An empty cluster offers only its origin. A cell is never offered when filling it would
 * close a tile in on all six sides: every tile keeps an open edge for arrows.
 */
export function touchingFreeCells(tiles) {
  if (!tiles.length) return [{ q: 0, r: 0 }];
  const taken = new Set(tiles.map((t) => cellKey(t.q, t.r)));
  const closesIn = (q, r) => {
    const after = new Set(taken).add(cellKey(q, r));
    return enclosed(after, q, r) || DIRS.some(([dq, dr]) => after.has(cellKey(q + dq, r + dr)) && enclosed(after, q + dq, r + dr));
  };
  const seen = new Set();
  const out = [];
  for (const t of tiles) {
    for (const [dq, dr] of DIRS) {
      const q = t.q + dq;
      const r = t.r + dr;
      const key = cellKey(q, r);
      if (taken.has(key) || seen.has(key) || !belowTitle(q, r)) continue;
      seen.add(key);
      if (closesIn(q, r)) continue;
      out.push({ q, r });
    }
  }
  return out;
}

/** Where the next tile goes so the cluster stays a compact honeycomb: the free touching cell nearest its middle. */
export function nextCell(tiles) {
  const free = touchingFreeCells(tiles);
  if (!tiles.length) return free[0];
  let cx = 0;
  let cy = 0;
  for (const t of tiles) { const p = cellCentre(t.q, t.r); cx += p.x; cy += p.y; }
  cx /= tiles.length;
  cy /= tiles.length;
  // A slight pull towards the title keeps a growing cluster wide rather than tall.
  const score = (c) => { const p = cellCentre(c.q, c.r); return Math.hypot(p.x - cx, (p.y - cy) * 1.15) + p.y * 0.02; };
  return free.reduce((best, c) => {
    const d = score(c) - score(best);
    return d < -1e-9 || (Math.abs(d) <= 1e-9 && (c.r < best.r || (c.r === best.r && c.q < best.q))) ? c : best;
  });
}

/** One cluster with the tile added on its next cell, or unchanged when it is already there or full. */
export function addToCluster(cluster, id) {
  if (cluster.tiles.some((t) => t.id === id) || cluster.tiles.length >= MAX_CLUSTER_TILES) return cluster;
  return { ...cluster, tiles: [...cluster.tiles, { id, ...nextCell(cluster.tiles) }] };
}

/** Existing `picked` techniques, in order, as one compact cluster called "My board". */
export function clustersFromPicked(picked) {
  let cluster = { id: BOARD_CLUSTER_ID, name: BOARD_CLUSTER_NAME, x: 0, y: 0, tiles: [] };
  for (const id of Array.isArray(picked) ? picked : []) if (isTileId(id)) cluster = addToCluster(cluster, id);
  return [cluster];
}

/** Every tile id on the board, first appearance first. */
export function clusterTileIds(clusters) {
  const out = [];
  for (const c of clusters) for (const t of c.tiles) if (!out.includes(t.id)) out.push(t.id);
  return out;
}
