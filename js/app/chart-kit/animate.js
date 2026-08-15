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
  circle.style.transition = 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)';
  circle.setAttribute('stroke-dashoffset', String(dashoffset));
}

export function animateAreaReveal(svg, options = {}) {
  if (!svg) return;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  svg.classList.remove('chart-animating', 'chart-static');

  const line = svg.querySelector('[data-role="line"]');
  if (line) {
    line.style.strokeDasharray = '';
    line.style.strokeDashoffset = '';
    if (!reduced && typeof line.getTotalLength === 'function') {
      try {
        const length = Math.max(line.getTotalLength(), 1);
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
      } catch {
        // Some environments lack getTotalLength for the node type.
      }
    }
  }

  svg.classList.add(reduced ? 'chart-static' : 'chart-animating');

  if (!reduced && line && typeof line.addEventListener === 'function') {
    const onEnd = event => {
      if (event?.animationName && event.animationName !== 'line-draw') return;
      line.style.strokeDasharray = '';
      line.style.strokeDashoffset = '';
      line.removeEventListener?.('animationend', onEnd);
    };
    line.addEventListener('animationend', onEnd);
  }
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
  element.style.transition = 'height 700ms cubic-bezier(.2,.8,.2,1)';
  element.style.height = `${heightPct}%`;
}
