export function prefersReducedMotion(media = globalThis.matchMedia) {
  return typeof media === 'function' && Boolean(media('(prefers-reduced-motion: reduce)')?.matches);
}

const DEFAULT_SETTLE_MS = 800;
const settleTimers = new WeakMap();

export function motionIsQuiet(node, options = {}) {
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

/** Jump metric rings to their stamped fill after a mid-flight sync-quiet freeze. */
export function settleMetricRings(root) {
  if (!root?.querySelectorAll) return;
  for (const circle of root.querySelectorAll('.metric-ring-fill[data-ring-dashoffset]')) {
    const target = circle.dataset.ringDashoffset;
    if (target == null || target === '') continue;
    circle.style.transition = 'none';
    // Attribute may already equal the target while a cancelled CSS transition left
    // the used value empty — nudge via the track length, then stamp the fill.
    const circ = circle.getAttribute('stroke-dasharray') || target;
    circle.setAttribute('stroke-dashoffset', circ);
    void circle.getBoundingClientRect?.();
    circle.setAttribute('stroke-dashoffset', target);
  }
}

export function animateRingFill(circle, { circumference, dashoffset }, options = {}) {
  if (!circle) return;
  const reduced = motionIsQuiet(circle, options);
  circle.setAttribute('stroke-dasharray', String(circumference));
  if (circle.dataset) circle.dataset.ringDashoffset = String(dashoffset);
  if (reduced) {
    circle.style.transition = 'none';
    circle.setAttribute('stroke-dashoffset', String(dashoffset));
    return;
  }
  circle.style.transition = 'none';
  circle.setAttribute('stroke-dashoffset', String(circumference));
  void circle.getBoundingClientRect();
  // Re-check: a sync-quiet flag can land between the empty frame and the fill.
  if (motionIsQuiet(circle, options)) {
    circle.style.transition = 'none';
    circle.setAttribute('stroke-dashoffset', String(dashoffset));
    return;
  }
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

const PLAY_MS = 2600;
const playTimers = new WeakMap();

// Card-level choreography: every mark's resting CSS is its final geometry, and the
// entrance keyframes only run while the card carries `is-playing`. Quiet, reduced
// motion or an interrupted play therefore always rests on the finished chart.
export function playCardMotion(card, options = {}) {
  if (!card?.classList) return false;
  const prior = playTimers.get(card);
  if (prior != null) clearTimeout(prior);
  playTimers.delete(card);
  card.classList.remove('is-playing');
  if (motionIsQuiet(card, options)) return false;
  void card.getBoundingClientRect?.();
  card.classList.add('is-playing');
  playTimers.set(card, setTimeout(() => {
    card.classList.remove('is-playing');
    playTimers.delete(card);
  }, Number.isFinite(options.durationMs) ? options.durationMs : PLAY_MS));
  return true;
}

const countFrames = new WeakMap();

export function countUp(element, to, options = {}) {
  if (!element) return;
  const format = options.format ?? (value => String(Math.round(value)));
  const raf = options.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  const cancel = options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
  const prior = countFrames.get(element);
  if (prior != null) cancel?.(prior);
  countFrames.delete(element);
  if (motionIsQuiet(element, options) || typeof raf !== 'function') {
    element.textContent = format(to);
    return;
  }
  const delay = options.delayMs ?? 300;
  const duration = options.durationMs ?? 1100;
  let start = null;
  element.textContent = format(0);
  const tick = now => {
    if (start == null) start = now + delay;
    // Clamp: the first frame can arrive before `start` (C7).
    const progress = Math.min(1, Math.max(0, now - start) / duration);
    element.textContent = format(to * (1 - (1 - progress) ** 3));
    if (progress < 1 && !motionIsQuiet(element, options)) countFrames.set(element, raf(tick));
    else {
      element.textContent = format(to);
      countFrames.delete(element);
    }
  };
  countFrames.set(element, raf(tick));
}
