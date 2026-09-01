import { WATCHLIST_SLOTS } from './watchlist-heat.js';

const WIDTH = 960;
const HEIGHT = 440;
const PAD = { left: 56, right: 56, top: 28, bottom: 78 };
const AXIS_Y = HEIGHT / 2;
const MAX_NODES = 12;

export function pairKey(themeA, themeB) {
  const a = String(themeA);
  const b = String(themeB);
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

function curveSide(themeA, themeB) {
  const seed = pairKey(themeA, themeB);
  let sum = 0;
  for (let index = 0; index < seed.length; index += 1) sum += seed.charCodeAt(index) * (index + 1);
  return sum % 2 === 0 ? 1 : -1;
}

function xAlong(index, count) {
  if (count <= 1) return WIDTH / 2;
  return PAD.left + (index / (count - 1)) * (WIDTH - PAD.left - PAD.right);
}

export function neighborhood(edges, focus, hops = 1) {
  const shown = new Set([focus]);
  let frontier = [focus];
  for (let hop = 0; hop < hops; hop += 1) {
    const next = [];
    for (const key of frontier) {
      for (const edge of edges ?? []) {
        if (edge.themeA !== key && edge.themeB !== key) continue;
        const other = edge.themeA === key ? edge.themeB : edge.themeA;
        if (shown.has(other)) continue;
        shown.add(other);
        next.push(other);
      }
    }
    frontier = next;
  }
  return shown;
}

function barycentricOrder(keys, edges) {
  let order = [...keys];
  for (let pass = 0; pass < 6; pass += 1) {
    const pos = new Map(order.map((key, index) => [key, index]));
    order = [...keys]
      .map(key => {
        let weight = 0;
        let sum = 0;
        for (const edge of edges) {
          if (edge.themeA !== key && edge.themeB !== key) continue;
          const other = edge.themeA === key ? edge.themeB : edge.themeA;
          if (!pos.has(other)) continue;
          weight += edge.count;
          sum += pos.get(other) * edge.count;
        }
        return { key, score: weight ? sum / weight : pos.get(key) };
      })
      .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))
      .map(item => item.key);
  }
  return order;
}

function focusOrder(keys, edges, focus) {
  const weights = new Map();
  for (const edge of edges) {
    if (edge.themeA === focus) weights.set(edge.themeB, (weights.get(edge.themeB) || 0) + edge.count);
    if (edge.themeB === focus) weights.set(edge.themeA, (weights.get(edge.themeA) || 0) + edge.count);
  }
  const others = keys.filter(key => key !== focus)
    .sort((a, b) => (weights.get(b) || 0) - (weights.get(a) || 0) || a.localeCompare(b));
  const left = [];
  const right = [];
  others.forEach((key, index) => {
    if (index % 2 === 0) right.push(key);
    else left.push(key);
  });
  return [...left.reverse(), focus, ...right];
}

function placeOnAxis(order, edges, focus) {
  if (!focus) {
    return new Map(order.map((key, index) => [key, xAlong(index, order.length)]));
  }
  const cx = WIDTH / 2;
  const weights = new Map();
  let maxW = 1;
  for (const edge of edges) {
    if (edge.themeA !== focus && edge.themeB !== focus) continue;
    const other = edge.themeA === focus ? edge.themeB : edge.themeA;
    const count = (weights.get(other) || 0) + edge.count;
    weights.set(other, count);
    maxW = Math.max(maxW, count);
  }
  const pos = new Map([[focus, cx]]);
  const focusIndex = order.indexOf(focus);
  const left = order.slice(0, focusIndex).reverse();
  const right = order.slice(focusIndex + 1);
  const place = (list, dir) => {
    let x = cx;
    for (const key of list) {
      const closeness = (weights.get(key) || 0) / maxW;
      x += dir * (26 + (1 - closeness) * 58);
      pos.set(key, x);
    }
  };
  place(left, -1);
  place(right, 1);
  return pos;
}

export function arcFor(a, b, { count, maxCount }) {
  const ax = a.x;
  const bx = b.x;
  const y = a.y ?? AXIS_Y;
  const span = Math.abs(bx - ax) || 1;
  const t = Math.min(1, Number(count) / Math.max(maxCount, 1));
  const rise = 28 + t * Math.min(168, 36 + span * 0.38);
  const side = curveSide(a.key, b.key);
  const midX = (ax + bx) / 2;
  const controlY = y - side * rise;
  return {
    d: `M${ax.toFixed(1)},${y.toFixed(1)} Q${midX.toFixed(1)},${controlY.toFixed(1)} ${bx.toFixed(1)},${y.toFixed(1)}`,
    controlY,
    side,
    strokeWidth: 1.15 + t * 7.8,
    opacity: 0.26 + t * 0.58
  };
}

/**
 * Horizontal arc map of theme co-occurrence. Stronger pairings are thicker
 * and rise higher. Optional focus recentres the strand; hops=2 keeps a
 * two-degree neighbourhood.
 */
export function buildThemeConstellation({
  nodes = [],
  edges = [],
  previousEdges = [],
  focus = null,
  hops = null,
  compare = false
} = {}) {
  const ranked = [...(nodes ?? [])]
    .filter(node => node?.key && Number(node.count) > 0)
    .sort((a, b) => (Number(b.count) - Number(a.count)) || String(a.key).localeCompare(String(b.key)))
    .slice(0, MAX_NODES);
  let keys = ranked.map(node => node.key);
  const rawEdges = (edges ?? [])
    .map(edge => ({
      themeA: edge.themeA,
      themeB: edge.themeB,
      count: Number(edge.count) || 0
    }))
    .filter(edge => edge.count >= 2 && edge.themeA && edge.themeB);

  if (focus && keys.includes(focus) && hops) {
    const keep = neighborhood(rawEdges, focus, hops);
    keys = keys.filter(key => keep.has(key));
  }

  const byMeta = new Map(ranked.map(node => [node.key, node]));
  const liveEdges = rawEdges.filter(edge => keys.includes(edge.themeA) && keys.includes(edge.themeB));
  const order = focus && keys.includes(focus)
    ? focusOrder(keys, liveEdges, focus)
    : barycentricOrder(keys, liveEdges);
  const xs = placeOnAxis(order, liveEdges, focus && keys.includes(focus) ? focus : null);
  const maxCount = Math.max(1, ...ranked.map(node => Number(node.count) || 0));
  const placed = order.map(key => {
    const node = byMeta.get(key);
    const t = maxCount <= 1 ? 0.5 : (Number(node?.count) - 1) / Math.max(maxCount - 1, 1);
    return {
      key,
      count: Number(node?.count) || 0,
      meanMood: Number.isFinite(Number(node?.meanMood)) ? Number(node.meanMood) : null,
      x: xs.get(key) ?? WIDTH / 2,
      y: AXIS_Y,
      r: 12 + t * 7,
      colour: WATCHLIST_SLOTS[ranked.findIndex(item => item.key === key) % WATCHLIST_SLOTS.length],
      rising: false
    };
  });
  const byKey = new Map(placed.map(node => [node.key, node]));

  const previous = new Map();
  for (const edge of previousEdges ?? []) {
    if (!edge?.themeA || !edge?.themeB) continue;
    previous.set(pairKey(edge.themeA, edge.themeB), Number(edge.count) || 0);
  }
  const maxWeight = Math.max(1, ...liveEdges.map(edge => edge.count));
  const links = liveEdges.map(edge => {
    const a = byKey.get(edge.themeA);
    const b = byKey.get(edge.themeB);
    const prior = previous.get(pairKey(edge.themeA, edge.themeB));
    const geom = arcFor(a, b, { count: edge.count, maxCount: maxWeight });
    const newer = prior == null || prior === 0;
    const change = newer ? 'new' : edge.count > prior ? 'up' : edge.count < prior ? 'down' : 'flat';
    return {
      themeA: edge.themeA,
      themeB: edge.themeB,
      count: edge.count,
      prior: prior ?? 0,
      newer,
      change,
      ...geom
    };
  });

  const ghosts = [];
  if (compare) {
    for (const [key, count] of previous.entries()) {
      const [themeA, themeB] = key.split('\0');
      if (!byKey.has(themeA) || !byKey.has(themeB)) continue;
      if (liveEdges.some(edge => pairKey(edge.themeA, edge.themeB) === key)) continue;
      const geom = arcFor(byKey.get(themeA), byKey.get(themeB), { count, maxCount: maxWeight });
      ghosts.push({ themeA, themeB, count, prior: count, newer: false, change: 'ghost', ...geom });
    }
  }

  const rising = new Set();
  for (const link of links) {
    if (link.change !== 'new' && link.change !== 'up') continue;
    rising.add(link.themeA);
    rising.add(link.themeB);
  }
  for (const node of placed) node.rising = rising.has(node.key);

  return {
    width: WIDTH,
    height: HEIGHT,
    cx: WIDTH / 2,
    cy: AXIS_Y,
    axisY: AXIS_Y,
    pad: PAD,
    focus: focus && keys.includes(focus) ? focus : null,
    hops,
    compare,
    nodes: placed,
    edges: links,
    ghosts,
    empty: placed.length === 0
  };
}
