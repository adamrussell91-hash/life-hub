const DEFAULT_HOLD_MS = 2000;
const DEFAULT_FADE_MS = 280;

const timers = new WeakMap();

function clearTimers(el) {
  const entry = timers.get(el);
  if (!entry) return;
  clearTimeout(entry.holdId);
  clearTimeout(entry.fadeId);
  timers.delete(el);
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/**
 * Show a short-lived banner/status line, then fade and clear it.
 * Passing an empty message clears immediately.
 */
export function showEphemeralMessage(el, message, {
  holdMs = DEFAULT_HOLD_MS,
  fadeMs = DEFAULT_FADE_MS,
  severity
} = {}) {
  if (!el) return;
  clearTimers(el);
  el.classList?.remove?.('is-fading');

  if (!message) {
    el.textContent = '';
    el.hidden = true;
    if (el.dataset) delete el.dataset.severity;
    return;
  }

  el.textContent = message;
  if (severity != null && el.dataset) el.dataset.severity = severity;
  el.hidden = false;
  if (el.style) el.style.opacity = '';

  const reduced = prefersReducedMotion();
  const holdId = setTimeout(() => {
    if (reduced) {
      el.textContent = '';
      el.hidden = true;
      el.classList?.remove?.('is-fading');
      if (el.dataset) delete el.dataset.severity;
      timers.delete(el);
      return;
    }
    el.classList?.add?.('is-fading');
    const fadeId = setTimeout(() => {
      el.textContent = '';
      el.hidden = true;
      el.classList?.remove?.('is-fading');
      if (el.dataset) delete el.dataset.severity;
      timers.delete(el);
    }, fadeMs);
    timers.set(el, { holdId: null, fadeId });
  }, holdMs);

  timers.set(el, { holdId, fadeId: null });
}

export function clearEphemeralMessage(el) {
  if (!el) return;
  showEphemeralMessage(el, '');
}
