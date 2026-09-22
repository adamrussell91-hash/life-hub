/**
 * Animated orbit radar. Polar placement from days-until-due.
 * Reuses polar-clock helpers. Tasks drives the rAF loop.
 */
import { polar } from './polar-clock.js';
import { fx, node, text } from './scene.js';

export const ORBIT_RMAX = 180;
export const ORBIT_LATER_GAP = 24;

export const ORBIT_RINGS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' }
];

export function radiusForDays(days, rMax = ORBIT_RMAX) {
  if (days <= 0) return 19;
  if (days <= 30) return 40 + ((days - 1) / 29) * (rMax - 40);
  return rMax + ORBIT_LATER_GAP;
}

export function bodyPoint(cx, cy, radius, angle) {
  return polar(cx, cy, radius, (angle * 180) / Math.PI);
}

export function buildOrbitRadar(input, { width = 720, height = 720 } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const rMax = Math.min(cx, cy) - 48;
  const nodes = [
    node('circle', { cx: fx(cx), cy: fx(cy), r: 28 }, { cls: 'or-core' }),
    text(cx, cy + 4, 'Today', { size: 11, anchor: 'middle', cls: 'or-core__label' })
  ];
  for (const ring of ORBIT_RINGS) {
    const r = radiusForDays(ring.days, rMax);
    nodes.push(node('circle', { cx: fx(cx), cy: fx(cy), r: fx(r) }, { cls: 'or-ring' }));
    nodes.push(text(cx, cy - r - 6, ring.label, { size: 10, anchor: 'middle', cls: 'or-ring__label' }));
  }
  for (const body of input.bodies ?? []) {
    const r = body.radius ?? radiusForDays(body.days ?? 14, rMax);
    const { x, y } = bodyPoint(cx, cy, r, body.angle ?? 0);
    nodes.push(
      node('circle', { cx: fx(x), cy: fySafe(y), r: body.size === 3 ? 10 : body.size === 2 ? 8 : 6 }, {
        cls: 'or-body',
        hit: body.id,
        anim: 'grow',
        origin: [x, y]
      })
    );
  }
  return { width, height, cx, cy, rMax, label: input.label ?? 'Orbit', nodes, hits: (input.bodies ?? []).map((b) => ({ id: b.id, title: b.title })) };
}

function fySafe(value) {
  return fx(value);
}
