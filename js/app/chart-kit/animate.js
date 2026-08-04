export function prefersReducedMotion(media = globalThis.matchMedia) {
  return typeof media === 'function' && Boolean(media('(prefers-reduced-motion: reduce)')?.matches);
}

export function animateRingFill(circle, { circumference, dashoffset }, options = {}) {
  if (!circle) return;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  circle.setAttribute('stroke-dasharray', String(circumference));
  if (reduced) {
    circle.style.transition = 'none';
    circle.setAttribute('stroke-dashoffset', String(dashoffset));
    return;
  }
  circle.style.transition = 'none';
  circle.setAttribute('stroke-dashoffset', String(circumference));
  void circle.getBoundingClientRect();
  circle.style.transition = 'stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)';
  circle.setAttribute('stroke-dashoffset', String(dashoffset));
}

export function animateAreaReveal(svg, options = {}) {
  if (!svg) return;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  svg.classList.remove('chart-animating', 'chart-static');
  svg.classList.add(reduced ? 'chart-static' : 'chart-animating');
}

export function animateColumnGrow(element, heightPct, options = {}) {
  if (!element) return;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  if (reduced) {
    element.style.transition = 'none';
    element.style.height = `${heightPct}%`;
    return;
  }
  element.style.transition = 'none';
  element.style.height = '0%';
  void element.getBoundingClientRect();
  element.style.transition = 'height 600ms cubic-bezier(.2,.8,.2,1)';
  element.style.height = `${heightPct}%`;
}
