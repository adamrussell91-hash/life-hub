/** Life Hub `js/app/chart-kit/apply-ring.js` — write ring geometry onto an SVG. */

import { animateRingFill, type ChartMotionOptions } from '@/chart-kit/animate';
import { buildRingTarget } from '@/chart-kit/ring';

export function applyRingTarget(
  svg: SVGSVGElement | null,
  { value, target }: { value: number; target: number },
  options: ChartMotionOptions & { size?: number; strokeWidth?: number } = {}
): ReturnType<typeof buildRingTarget> | null {
  if (!svg) return null;
  const ring = buildRingTarget({ value, target }, options);
  const key = `${value}\0${target}\0${ring.size}\0${ring.strokeWidth}`;
  const unchanged = svg.dataset.ringKey === key;
  svg.dataset.ringKey = key;
  const motion = unchanged ? { ...options, reducedMotion: true } : options;
  for (const role of ['track', 'fill'] as const) {
    const circle = svg.querySelector<SVGCircleElement>(`[data-role="${role}"]`);
    if (!circle) continue;
    circle.setAttribute('cx', String(ring.center));
    circle.setAttribute('cy', String(ring.center));
    circle.setAttribute('r', String(ring.radius));
    circle.setAttribute('stroke-width', String(ring.strokeWidth));
    if (role === 'fill') animateRingFill(circle, ring, motion);
  }
  return ring;
}
