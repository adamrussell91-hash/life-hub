import { buildRingTarget } from './ring.js';
import { animateRingFill } from './animate.js';

export function applyRingTarget(svg, { value, target }, options = {}) {
  if (!svg) return null;
  const ring = buildRingTarget({ value, target }, options);
  for (const role of ['track', 'fill']) {
    const circle = svg.querySelector(`[data-role="${role}"]`);
    if (!circle) continue;
    circle.setAttribute('cx', ring.center);
    circle.setAttribute('cy', ring.center);
    circle.setAttribute('r', ring.radius);
    circle.setAttribute('stroke-width', ring.strokeWidth);
    if (role === 'fill') animateRingFill(circle, ring, options);
  }
  return ring;
}
