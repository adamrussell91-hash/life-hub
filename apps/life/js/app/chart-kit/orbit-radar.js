/**
 * Orbit radar — polar due-date geometry and physics.
 * Numbers from docs/proposals/graph-reference/orbit.html (port exactly).
 */
import { fx } from './scene.js';

/** Port exactly from the Orbit reference `O` block. */
export const ORBIT = {
  size: 640,
  cx: 320,
  cy: 320,
  core: 30,
  r0: 52,
  rMax: 262,
  later: 292,
  horizon: 30,
  heatDays: 14,
  base: 0.000078,
  exp: 1.35,
  sizes: [0, 4.5, 6.5, 9.5],
  halo: 2,
  trailMs: 2200,
  trailMaxRad: 1.3,
  trailOpacity: 0.22,
  rings: [
    [7, '1 week'],
    [14, '2 weeks'],
    [30, '1 month']
  ]
};

/** Derived from --danger at 9%. */
export const ORBIT_CORE_FILL = 'rgba(155,44,44,.09)';
export const ORBIT_LATER_STROKE = 'rgba(23,55,94,.06)';
export const ORBIT_RING_STROKE = 'rgba(23,55,94,.16)';
export const ORBIT_DANGER = [155, 44, 44];

export const ORBIT_RMAX = ORBIT.rMax;
export const ORBIT_LATER_GAP = ORBIT.later - ORBIT.rMax;
export const ORBIT_RINGS = ORBIT.rings.map(([days, label]) => ({ days, label }));

export function radiusForDays(days) {
  if (days <= 0) return 14 + Math.min(-days, 4) * 3;
  if (days > ORBIT.horizon) return ORBIT.later;
  return ORBIT.r0 + (days / ORBIT.horizon) * (ORBIT.rMax - ORBIT.r0);
}

export function heatForDays(days) {
  return days <= 0 ? 1 : Math.max(0, Math.min(1, 1 - days / ORBIT.heatDays));
}

export function omegaForRadius(r) {
  return ORBIT.base * (ORBIT.rMax / Math.max(r, 14)) ** ORBIT.exp;
}

/** FNV-1a, then Knuth multiplicative scramble — spreads start angles across quadrants. */
export function hashAngle(id) {
  let x = 2166136261;
  for (const ch of String(id)) {
    x ^= ch.charCodeAt(0);
    x = Math.imul(x, 16777619) >>> 0;
  }
  x = Math.imul(x, 2654435761) >>> 0;
  return (x / 4294967296) * Math.PI * 2;
}

export function heatColour(hex, k) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${rgb.map((v, i) => Math.round(v + (ORBIT_DANGER[i] - v) * k)).join(',')})`;
}

/** Reference convention: 0 rad = east, standard math cos/sin. */
export function bodyPoint(cx, cy, radius, angle) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

export function trailPath(cx, cy, r, angle, omega) {
  const length = Math.min(omega * ORBIT.trailMs, ORBIT.trailMaxRad);
  const a0 = angle - length;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(angle);
  const y1 = cy + r * Math.sin(angle);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export function bodySize(effort) {
  const idx = Math.max(1, Math.min(3, effort ?? 1));
  return ORBIT.sizes[idx];
}

export function buildOrbitRadar(input, { width = ORBIT.size, height = ORBIT.size } = {}) {
  return {
    width,
    height,
    cx: ORBIT.cx,
    cy: ORBIT.cy,
    rMax: ORBIT.rMax,
    label: input.label ?? 'Orbit',
    nodes: [],
    hits: (input.bodies ?? []).map((b) => ({ id: b.id, title: b.title }))
  };
}

export function radiusForDaysLegacy(days, rMax = ORBIT.rMax) {
  void rMax;
  return radiusForDays(days);
}

export { fx };
