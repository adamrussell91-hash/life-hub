export function prefersReducedMotion(media = globalThis.matchMedia) {
  return typeof media === 'function' && Boolean(media('(prefers-reduced-motion: reduce)')?.matches);
}

const DEFAULT_SETTLE_MS = 800;
const settleTimers = new WeakMap();

function motionIsQuiet(node, options = {}) {
  if (options.quiet === true) return true;
  let el = node;
  while (el) {
    if (el.dataset?.syncQuiet != null && String(el.dataset.syncQuiet) !== 'false') return true;
    el = el.parentElement || el.parentNode;
  }
  return options.reducedMotion ?? prefersReducedMotion();
}

function clearSettleTimer(svg) {
  const prior = settleTimers.get(svg);
  if (prior != null) {
    clearTimeout(prior);
    settleTimers.delete(svg);
  }
}

function settleAreaReveal(svg, line) {
  clearSettleTimer(svg);
  if (line?.style) {
    line.style.strokeDasharray = '';
    line.style.strokeDashoffset = '';
  }
  // Leave charts in chart-static. chart-animating must not linger — a later
  // data-sync-quiet refresh would cancel area-fade and pin areas at opacity 0.
  svg.classList?.remove?.('chart-animating');
  svg.classList?.add?.('chart-static');
}

export function animateRingFill(circle, { circumference, dashoffset }, options = {}) {
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

export function animateAreaReveal(svg, options = {}) {
  if (!svg) return;
  const reduced = motionIsQuiet(svg, options);
  clearSettleTimer(svg);
  svg.classList?.remove?.('chart-animating', 'chart-static');

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

  if (reduced) {
    svg.classList?.add?.('chart-static');
    return;
  }

  svg.classList?.add?.('chart-animating');

  const settleMs = Number.isFinite(options.settleMs) ? options.settleMs : DEFAULT_SETTLE_MS;
  const finish = () => settleAreaReveal(svg, line);

  if (line && typeof line.addEventListener === 'function') {
    const onEnd = event => {
      if (event?.animationName && event.animationName !== 'line-draw') return;
      line.removeEventListener?.('animationend', onEnd);
      finish();
    };
    line.addEventListener('animationend', onEnd);
  }

  // iOS Safari and hidden-tab paints sometimes skip animationend. Fall back so
  // charts are never left mid-draw (invisible line / opacity-0 area).
  if (settleMs > 0) {
    settleTimers.set(svg, setTimeout(finish, settleMs));
  } else if (settleMs === 0) {
    // Tests that drive animationend directly can opt out of the timer.
  }
}

export function animateColumnGrow(element, heightPct, options = {}) {
  if (!element) return;
  const reduced = motionIsQuiet(element, options);
  if (reduced) {
    element.style.transition = 'none';
    element.style.height = `${heightPct}%`;
    return;
  }
  element.style.transition = 'none';
  element.style.height = '0%';
  if (typeof element.getBoundingClientRect === 'function') void element.getBoundingClientRect();
  element.style.transition = 'height 700ms cubic-bezier(.2,.8,.2,1)';
  element.style.height = `${heightPct}%`;
}
