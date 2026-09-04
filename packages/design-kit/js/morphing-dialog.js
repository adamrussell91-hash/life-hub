/** Shared MorphingDialog — spring FLIP from a micro card to a larger view.
 * Same strength on every hub. Respects prefers-reduced-motion.
 *
 * Overlay: openMorphingDialog({ trigger, frame })
 * In-place (board cards): runMorphTransform({ from, update, to })
 * Route change: morphFromRect(firstRect, target)
 */

const DEFAULT_SPRING = { stiffness: 200, damping: 24, mass: 1 };
const SETTLE = 0.06;
const MAX_MS = 900;
const SHARED_SELECTOR = '[data-hub-morph]';

let activeClose = null;

export function prefersReducedMotion(root = globalThis.document) {
  const view = root?.defaultView ?? globalThis;
  return Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function readRect(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const rect = node.getBoundingClientRect();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: readRadius(node)
  };
}

function readRadius(node) {
  const view = node.ownerDocument?.defaultView;
  if (!view) return 0;
  const raw = view.getComputedStyle(node).borderTopLeftRadius;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Transform that makes `to` look like `from` (origin top-left). */
function invert(from, to) {
  return {
    x: from.left - to.left,
    y: from.top - to.top,
    sx: from.width / to.width,
    sy: from.height / to.height,
    radius: from.radius ?? 0
  };
}

const IDENTITY = { x: 0, y: 0, sx: 1, sy: 1, radius: 0 };

function applyInvert(node, state, radiusTo) {
  node.style.transformOrigin = 'top left';
  node.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.sx}, ${state.sy})`;
  if (radiusTo != null) {
    const sx = Math.max(state.sx || 1, 0.001);
    node.style.borderRadius = `${(state.radius ?? radiusTo) / sx}px`;
  }
}

function clearInvert(node) {
  node.style.transform = '';
  node.style.transformOrigin = '';
  node.style.borderRadius = '';
  node.classList.remove('hub-morph-dialog__animating');
}

function mix(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    sx: a.sx + (b.sx - a.sx) * t,
    sy: a.sy + (b.sy - a.sy) * t,
    radius: (a.radius ?? 0) + ((b.radius ?? 0) - (a.radius ?? 0)) * t
  };
}

function springProgress(spring, onProgress, onDone) {
  const k = spring.stiffness ?? DEFAULT_SPRING.stiffness;
  const c = spring.damping ?? DEFAULT_SPRING.damping;
  const m = spring.mass ?? DEFAULT_SPRING.mass;
  const start = nowMs();
  let pos = 0;
  let vel = 0;

  const tick = time => {
    const dt = 1 / 60;
    const accel = (-k * (pos - 1) - c * vel) / m;
    vel += accel * dt;
    pos += vel * dt;
    onProgress(Math.max(0, pos));
    if ((Math.abs(pos - 1) < SETTLE && Math.abs(vel) < SETTLE) || time - start > MAX_MS) {
      onDone();
      return;
    }
    if (!globalThis.requestAnimationFrame) {
      onDone();
      return;
    }
    globalThis.requestAnimationFrame(tick);
  };

  if (!globalThis.requestAnimationFrame) {
    onDone();
    return;
  }
  globalThis.requestAnimationFrame(tick);
}

function playBetween(node, fromState, toState, radiusTo, reduced, spring, onDone) {
  if (!node) {
    onDone?.();
    return;
  }
  if (reduced) {
    applyInvert(node, toState, radiusTo);
    if (toState.sx === 1 && toState.sy === 1 && toState.x === 0 && toState.y === 0) clearInvert(node);
    onDone?.();
    return;
  }
  node.classList.add('hub-morph-dialog__animating');
  applyInvert(node, fromState, radiusTo);
  springProgress(
    spring ?? DEFAULT_SPRING,
    t => applyInvert(node, mix(fromState, toState, t), radiusTo),
    () => {
      applyInvert(node, toState, radiusTo);
      if (toState.x === 0 && toState.y === 0 && toState.sx === 1 && toState.sy === 1) clearInvert(node);
      onDone?.();
    }
  );
}

function hideOrigin(node) {
  if (!node) return;
  node.classList.add('hub-morph-dialog__origin');
  node.setAttribute('aria-hidden', 'true');
}

function showOrigin(node) {
  if (!node) return;
  node.classList.remove('hub-morph-dialog__origin');
  node.removeAttribute('aria-hidden');
}

function pairShared(fromRoot, toRoot) {
  if (!fromRoot || !toRoot) return [];
  const pairs = [];
  for (const last of toRoot.querySelectorAll?.(SHARED_SELECTOR) ?? []) {
    const id = last.getAttribute('data-hub-morph');
    if (!id) continue;
    const first = fromRoot.querySelector?.(`${SHARED_SELECTOR}[data-hub-morph="${id}"]`);
    if (!first) continue;
    const from = readRect(first);
    const to = readRect(last);
    if (!from || !to) continue;
    pairs.push({ node: last, from: invert(from, to), radiusTo: to.radius });
  }
  return pairs;
}

function playShared(pairs, reduced, spring) {
  for (const item of pairs) {
    playBetween(item.node, item.from, { ...IDENTITY, radius: item.radiusTo }, item.radiusTo, reduced, spring);
  }
}

export function tagTriggerMorph(trigger) {
  if (!trigger?.querySelector) return;
  const title = trigger.querySelector(
    '[data-hub-morph="title"], .hub-card__title, .hub-row__title, .home-class-tile__title, .entity-cover-tile__title, .lesson-list__title, .card__title, .mind-tile__title, .medical-card__title'
  );
  const subtitle = trigger.querySelector(
    '[data-hub-morph="subtitle"], .hub-card__eyebrow, .home-class-tile__eyebrow, .hub-row__updated, .card__meta, .lesson-list__meta, .medical-card__meta'
  );
  const image = trigger.querySelector(
    '[data-hub-morph="image"], img, .entity-cover-tile__media img, .entity-banner img'
  );
  if (title && !title.hasAttribute('data-hub-morph')) title.setAttribute('data-hub-morph', 'title');
  if (subtitle && !subtitle.hasAttribute('data-hub-morph')) subtitle.setAttribute('data-hub-morph', 'subtitle');
  if (image && !image.hasAttribute('data-hub-morph')) image.setAttribute('data-hub-morph', 'image');
}

function closeGlyph(doc) {
  const svg = doc.createElementNS?.('http://www.w3.org/2000/svg', 'svg');
  if (!svg) return null;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M6 6l12 12M18 6 6 18"/>';
  return svg;
}

/**
 * Overlay dialog that springs from `trigger` to a larger frame.
 * @param {{
 *   trigger?: Element | null,
 *   frame: HTMLElement,
 *   backdropClass?: string,
 *   closeButton?: boolean,
 *   labelledBy?: string,
 *   label?: string,
 *   onRequestClose?: () => void,
 *   onClose?: () => void,
 *   spring?: { stiffness?: number, damping?: number, mass?: number }
 * }} options
 */
export function openMorphingDialog(options) {
  const doc = options.frame?.ownerDocument ?? globalThis.document;
  if (!doc?.body) {
    return { close() {}, backdrop: null, frame: options.frame };
  }

  if (activeClose) activeClose();

  const trigger = options.trigger ?? null;
  tagTriggerMorph(trigger);
  const first = readRect(trigger);
  const reduced = prefersReducedMotion(doc);
  const spring = options.spring ?? DEFAULT_SPRING;

  const backdrop = doc.createElement('div');
  backdrop.className = ['hub-morph-dialog', options.backdropClass].filter(Boolean).join(' ');
  backdrop.dataset.hubMorph = 'backdrop';

  const frame = options.frame;
  frame.classList.add('hub-morph-dialog__frame');
  if (!frame.getAttribute('role')) frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-modal', 'true');
  if (options.labelledBy) frame.setAttribute('aria-labelledby', options.labelledBy);
  else if (options.label) frame.setAttribute('aria-label', options.label);

  if (options.closeButton !== false && !frame.querySelector('[data-hub-morph-close]')) {
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hub-icon-btn hub-morph-dialog__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.dataset.hubMorphClose = '1';
    const glyph = closeGlyph(doc);
    if (glyph) closeBtn.append(glyph);
    else closeBtn.textContent = 'Close';
    frame.append(closeBtn);
  }

  backdrop.append(frame);
  doc.body.append(backdrop);
  hideOrigin(trigger);

  const openFrom = first ?? readRect(frame);
  const openTo = readRect(frame);
  if (openFrom && openTo && first) {
    const shared = pairShared(trigger, frame);
    playBetween(frame, invert(first, openTo), { ...IDENTITY, radius: openTo.radius }, openTo.radius, reduced, spring);
    playShared(shared, reduced, spring);
  }
  const kick = globalThis.requestAnimationFrame ?? (cb => cb(nowMs()));
  kick(() => backdrop.classList.add('is-in'));

  let disposed = false;
  const close = () => {
    if (disposed) return;
    disposed = true;
    if (activeClose === close) activeClose = null;
    doc.removeEventListener('keydown', onKey);

    const current = readRect(frame);
    const origin = readRect(trigger) ?? first;
    const finish = () => {
      clearInvert(frame);
      backdrop.remove();
      showOrigin(trigger);
      options.onClose?.();
    };

    backdrop.classList.remove('is-in');
    if (!current || !origin || reduced) {
      finish();
      return;
    }
    playBetween(frame, { ...IDENTITY, radius: current.radius }, invert(origin, current), origin.radius, false, spring, finish);
  };

  const requestClose = () => {
    if (options.onRequestClose) options.onRequestClose();
    else close();
  };

  const onKey = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
    }
  };

  doc.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) requestClose();
  });
  frame.querySelector('[data-hub-morph-close]')?.addEventListener('click', () => requestClose());

  activeClose = close;
  return { close, backdrop, frame };
}

/**
 * In-place micro → expanded swap with the same spring FLIP.
 * @param {{
 *   from?: Element | null,
 *   update: () => void,
 *   to?: () => Element | null,
 *   guard?: { current: boolean },
 *   spring?: { stiffness?: number, damping?: number, mass?: number }
 * }} options
 */
export function runMorphTransform(options) {
  if (options.guard?.current) return;
  const fromEl = options.from ?? null;
  tagTriggerMorph(fromEl);
  const first = readRect(fromEl);
  const reduced = prefersReducedMotion(fromEl?.ownerDocument ?? globalThis.document);
  const spring = options.spring ?? DEFAULT_SPRING;

  if (options.guard) options.guard.current = true;
  options.update();
  const toEl = options.to?.() ?? fromEl;
  const last = readRect(toEl);
  if (first && last && toEl && !reduced) {
    playBetween(toEl, invert(first, last), { ...IDENTITY, radius: last.radius }, last.radius, false, spring, () => {
      if (options.guard) options.guard.current = false;
    });
  } else if (options.guard) {
    options.guard.current = false;
  }
}

/**
 * Morph an already-mounted target from a remembered rect (list card → page).
 * @param {{ left: number, top: number, width: number, height: number, radius?: number } | null} first
 * @param {HTMLElement | null} target
 */
export function morphFromRect(first, target) {
  if (!first || !target) return;
  const reduced = prefersReducedMotion(target.ownerDocument);
  if (!(first.width > 0) || !(first.height > 0) || reduced) return;
  const last = readRect(target);
  if (!last) return;
  playBetween(target, invert(first, last), { ...IDENTITY, radius: last.radius }, last.radius, false, DEFAULT_SPRING);
}

export function closeActiveMorphingDialog() {
  activeClose?.();
}

/** Test helper — drop the singleton closer. */
export function resetMorphingDialogForTests() {
  activeClose = null;
}

export function morphingDialogIsOpen() {
  return Boolean(activeClose);
}
