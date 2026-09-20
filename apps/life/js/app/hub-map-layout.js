import { CENTRAL_ID } from './hub-map-model.js';

export const CARD_W = 232;
export const CARD_H = 92;
export const COL_GAP = 72;
export const ROW_GAP = 14;
export const ROW_PITCH = CARD_H + ROW_GAP;
export const COL_PITCH = CARD_W + COL_GAP;

/**
 * Left-to-right tidy tree. Every visible leaf owns a row and each parent sits at
 * the midpoint of its first and last child, so no two cards can overlap.
 */
export function layoutMap(map, visible) {
  const order = new Map(map.nodes.map((node, index) => [node.id, index]));
  const kids = new Map();
  for (const edge of map.edges) {
    if (edge.type !== 'structure' || !visible.has(edge.from) || !visible.has(edge.to)) continue;
    if (!kids.has(edge.from)) kids.set(edge.from, []);
    kids.get(edge.from).push(edge.to);
  }
  for (const list of kids.values()) list.sort((a, b) => order.get(a) - order.get(b));

  const positions = new Map();
  let nextRow = 0;
  let maxDepth = 0;
  let maxY = 0;

  function place(id, depth) {
    maxDepth = Math.max(maxDepth, depth);
    const children = kids.get(id) ?? [];
    let y;
    if (children.length === 0) {
      y = nextRow * ROW_PITCH;
      nextRow += 1;
    } else {
      const ys = children.map(child => place(child, depth + 1));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    positions.set(id, { x: depth * COL_PITCH, y, w: CARD_W, h: CARD_H });
    maxY = Math.max(maxY, y);
    return y;
  }

  place(CENTRAL_ID, 0);
  return { positions, width: maxDepth * COL_PITCH + CARD_W, height: maxY + CARD_H };
}

function curve(x1, y1, x2, y2) {
  const dx = (x2 - x1) / 2;
  return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

export function structurePath(a, b) {
  return curve(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2);
}

export function linkPath(a, b) {
  const y1 = a.y + a.h / 2;
  const y2 = b.y + b.h / 2;
  if (b.x >= a.x + a.w) return curve(a.x + a.w, y1, b.x, y2);
  if (b.x + b.w <= a.x) return curve(a.x, y1, b.x + b.w, y2);
  const x1 = a.x + a.w;
  const x2 = b.x + b.w;
  const bulge = Math.min(140, Math.max(48, Math.abs(y2 - y1) / 3));
  return `M${x1} ${y1} C${x1 + bulge} ${y1} ${x2 + bulge} ${y2} ${x2} ${y2}`;
}
