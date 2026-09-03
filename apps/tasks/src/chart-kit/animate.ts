/** Life Hub `js/app/chart-kit/animate.js` — ring fill and column grow. */

export type ChartMotionOptions = {
  quiet?: boolean;
  reducedMotion?: boolean;
};

export function prefersReducedMotion(media = globalThis.matchMedia): boolean {
  return typeof media === 'function' && Boolean(media('(prefers-reduced-motion: reduce)')?.matches);
}

function motionIsQuiet(node: Element | null, options: ChartMotionOptions = {}): boolean {
  if (options.quiet === true) return true;
  let el: Element | null = node;
  while (el) {
    if (el instanceof HTMLElement && el.dataset.syncQuiet != null && el.dataset.syncQuiet !== 'false') {
      return true;
    }
    el = el.parentElement;
  }
  return options.reducedMotion ?? prefersReducedMotion();
}

export function animateRingFill(
  circle: SVGCircleElement | null,
  { circumference, dashoffset }: { circumference: number; dashoffset: number },
  options: ChartMotionOptions = {}
): void {
  if (!circle) return;
  const reduced = motionIsQuiet(circle, options);
  circle.setAttribute('stroke-dasharray', String(circumference));
  if (reduced) {
    circle.style.transition = 'none';
    circle.setAttribute('stroke-dashoffset', String(dashoffset));
    return;
  }
  circle.style.transition = 'none';
  circle.setAttribute('stroke-dashoffset', String(circumference));
  void circle.getBoundingClientRect();
  circle.style.transition = 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)';
  circle.setAttribute('stroke-dashoffset', String(dashoffset));
}

export function animateColumnGrow(
  element: HTMLElement | null,
  pct: number,
  options: ChartMotionOptions & { property?: 'height' | 'width' } = {}
): void {
  if (!element) return;
  const property = options.property ?? 'height';
  const reduced = motionIsQuiet(element, options);
  if (reduced) {
    element.style.transition = 'none';
    element.style[property] = `${pct}%`;
    return;
  }
  element.style.transition = 'none';
  element.style[property] = '0%';
  void element.getBoundingClientRect();
  element.style.transition = `${property} 700ms cubic-bezier(.2,.8,.2,1)`;
  element.style[property] = `${pct}%`;
}
