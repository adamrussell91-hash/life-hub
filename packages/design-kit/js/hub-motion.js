/** Shared hub motion. Same strength on Life, Knowledge, Teaching, and Tasks. */

import { enhanceKinetic, KINETIC_SELECTOR } from './hub-kinetic.js';
import { mountHubComposes } from './hub-compose.js';
import { mountAdaptiveSliders } from './adaptive-slider.js';
import { mountContextualAiBars, mountSelectAiAgents } from './hub-ai-bar.js';
import { mountInlineEdits } from './hub-inline-edit.js';
import { mountCreateDisclosures } from './hub-create-disclosure.js';
import { mountCaptures } from './hub-capture.js';
import { mountHubSurfaces } from './hub-surfaces.js';

const CARD_SELECTOR = [
  '.metric-card',
  '.week-card',
  '.hub-card',
  '.glass-panel',
  '.glass-tile',
  '.card',
  '.sign-in__card',
  '.mind-tile',
  '.alchemist-card',
  '.podcast-card',
  '.wiki-card',
  '.uni-tl__card',
  '.quiz-card',
  '.pcard'
].join(',');

const CARD_SKIP = '.confirm-card, [role="dialog"], .create-modal, .search-palette, .hub-morph-dialog';

const MAGNET_SELECTOR = [
  '.hub-pulse-card',
  '.home-class-tile',
  '.dashboard-overview__tile'
].join(',');

const LIST_SELECTOR = [
  '.logging-list',
  '.chat-messages',
  '.meal-log',
  '.cards',
  '.nutrition-challenge-list',
  '[data-hub-list]'
].join(',');

const SCROLL_HIDE_SELECTOR = '[data-hub-scroll-hide]';
const SCROLL_HIDE_HOST = '.chat-view, .chat-overlay, .coach.chat, [data-hub-scroll-root]';

/** Hide after this much downward travel unless the element sets data-hub-scroll-threshold. */
export const DEFAULT_SCROLL_HIDE_THRESHOLD = 80;

const scrollHideState = new WeakMap();

const COUNT_SELECTOR = [
  '[data-value]',
  '[data-hub-count]',
  '[data-percent]',
  '.hub-pulse-card__count'
].join(',');

const SKIP_VALUE_KEYS = new Set([
  'date',
  'workout',
  'workout-state',
  'sync',
  'hammond-line'
]);

const DATE_TEXT = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const NUMBER_HEAD = /^([+\-−]?\d{1,3}(?:,\d{3})*(?:\.\d+)?)(\s.*)?$/;
const OF_PATTERN = /^(\d+)\s+of\s+(\d+)(.*)$/i;
const WORD_COUNT = /^(\d{1,3}(?:,\d{3})*)(\s+[a-z][a-z\s]{0,18})$/i;

const listKeys = new WeakMap();
const ticking = new WeakSet();
let started = false;

export function prefersReducedMotion(root = document) {
  const view = root.defaultView ?? globalThis;
  return Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

export function parseCountable(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw === '—' || raw === '–' || DATE_TEXT.test(raw)) return null;
  const of = OF_PATTERN.exec(raw);
  if (of) {
    return { value: Number(of[1]), format: n => `${n} of ${of[2]}${of[3] ?? ''}` };
  }
  const word = WORD_COUNT.exec(raw);
  if (word && !/kcal|g\b|%/.test(word[2])) {
    return { value: Number(word[1].replace(/,/g, '')), format: n => `${formatLike(word[1], n)}${word[2]}` };
  }
  const head = NUMBER_HEAD.exec(raw);
  if (!head) return null;
  const suffix = head[2] ?? '';
  if (suffix.length > 24) return null;
  return { value: Number(head[1].replace(/,/g, '')), format: n => `${formatLike(head[1], n)}${suffix}` };
}

function formatLike(sample, value) {
  // Cap at 1 dp so IEEE junk like 135.10000000000002 cannot force toFixed(14)
  // on the count-up overlay (Home fat used to paint the full float string).
  const decimals = Math.min((sample.split('.')[1] || '').length, 1);
  const useComma = sample.includes(',');
  const abs = Math.abs(value);
  const body = decimals
    ? abs.toFixed(decimals)
    : String(Math.round(abs));
  const grouped = useComma
    ? body.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : body;
  if (sample.startsWith('−') || (sample.startsWith('-') && !sample.startsWith('+'))) {
    return value < 0 || sample.startsWith('-') || sample.startsWith('−')
      ? `${sample[0]}${grouped}`
      : grouped;
  }
  if (sample.startsWith('+')) return `${value < 0 ? '-' : '+'}${grouped}`;
  return grouped;
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function shouldCount(el) {
  const key = el.getAttribute('data-value');
  if (key && (SKIP_VALUE_KEYS.has(key) || key.endsWith('-trend'))) return false;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return false;
  return true;
}

function wrapCount(el) {
  if (el.parentElement?.classList.contains('hub-count')) return el.parentElement;
  const wrap = el.ownerDocument.createElement('span');
  wrap.className = 'hub-count';
  el.replaceWith(wrap);
  wrap.append(el);
  return wrap;
}

function runCount(el, nextText, reduced) {
  if (!shouldCount(el) || ticking.has(el)) return;
  const parsed = parseCountable(nextText);
  if (!parsed || !Number.isFinite(parsed.value)) return;
  if (reduced) return;

  const wrap = wrapCount(el);
  const from = Number(wrap.dataset.hubCountValue ?? 0);
  wrap.dataset.hubCountValue = String(parsed.value);
  if (from === parsed.value) return;

  ticking.add(el);
  wrap.classList.add('is-ticking');
  let fx = wrap.querySelector('.hub-count__fx');
  if (!fx) {
    fx = el.ownerDocument.createElement('span');
    fx.className = 'hub-count__fx';
    fx.setAttribute('aria-hidden', 'true');
    wrap.append(fx);
  }

  const startedAt = performance.now();
  const duration = 560;

  const frame = now => {
    const t = Math.min(1, (now - startedAt) / duration);
    const current = from + (parsed.value - from) * easeOut(t);
    fx.textContent = parsed.format(current);
    if (t < 1) {
      requestAnimationFrame(frame);
      return;
    }
    fx.textContent = parsed.format(parsed.value);
    wrap.classList.remove('is-ticking');
    ticking.delete(el);
  };
  requestAnimationFrame(frame);
}

function revealDelay(el) {
  const parent = el.parentElement;
  if (!parent) return 0;
  const siblings = [...parent.children].filter(node => node.matches?.(CARD_SELECTOR));
  const index = Math.max(0, siblings.indexOf(el));
  return Math.min(index, 6) * 45;
}

function enhanceCard(el, reduced) {
  if (el.dataset.hubMotionCard === '1') return;
  if (el.closest('[data-state="loading"]')) return;
  // Virtual list windows append or rebuild rows while scrolling. A reveal
  // here fades every visible card out and back in — archive flicker.
  if (el.closest('.list-window, .virtual-list__window')) return;
  if (el.closest(CARD_SKIP) && !el.matches('.sign-in__card')) return;
  el.dataset.hubMotionCard = '1';

  const isGate = el.classList.contains('sign-in__card');
  el.classList.add('hub-reveal');
  if (isGate) el.classList.add('hub-reveal--gate');
  if (!reduced) el.style.setProperty('--hub-reveal-delay', `${revealDelay(el)}ms`);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('is-in'));
  });
}

function enhanceMagnet(el, reduced) {
  if (el.dataset.hubMotionMagnet === '1') return;
  if (reduced) return;
  el.dataset.hubMotionMagnet = '1';
  el.classList.add('hub-magnet');
  const strength = 5;

  el.addEventListener('pointermove', event => {
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    el.style.translate = `${x * strength * 2}px ${y * strength * 2}px`;
  });
  el.addEventListener('pointerleave', () => {
    el.style.translate = '';
  });
}

function itemKey(el) {
  return el.getAttribute('data-id')
    || el.getAttribute('data-message-id')
    || el.textContent.trim().slice(0, 96);
}

function enhanceList(list, reduced) {
  const kids = [...list.children];
  if (!kids.length) return;
  let seen = listKeys.get(list);
  if (!seen) {
    seen = new Set();
    listKeys.set(list, seen);
  }
  let delay = 0;
  for (const child of kids) {
    const key = itemKey(child);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (reduced || child.dataset.hubListItem === '1') continue;
    child.dataset.hubListItem = '1';
    child.classList.add('hub-list-item');
    child.style.setProperty('--hub-list-delay', `${Math.min(delay, 8) * 45}ms`);
    delay += 1;
  }
}

function enhanceCount(el, reduced) {
  if (!shouldCount(el)) return;
  runCount(el, el.textContent, reduced);
}

const pillResize = new WeakMap();

export function isActiveHubPill(btn) {
  if (!btn) return false;
  return btn.classList.contains('is-active')
    || btn.classList.contains('is-selected')
    || btn.getAttribute('aria-selected') === 'true'
    || btn.getAttribute('aria-checked') === 'true'
    || btn.getAttribute('aria-pressed') === 'true';
}

function isLoosePills(group) {
  return group.classList.contains('hub-pills--loose')
    || group.getAttribute('data-hub-pills') === 'loose';
}

function directChild(group, className) {
  return [...(group.children ?? [])].find(node => node.classList?.contains(className)) ?? null;
}

export function hubPillsButtons(group) {
  return [...(group.children ?? [])].filter(node => node.classList?.contains('hub-pills__btn'));
}

function ensurePillThumb(group) {
  let thumb = directChild(group, 'hub-pills__thumb');
  if (thumb) return thumb;
  const doc = group.ownerDocument ?? document;
  thumb = doc.createElement('span');
  thumb.className = 'hub-pills__thumb';
  thumb.setAttribute('aria-hidden', 'true');
  group.insertBefore(thumb, group.firstChild);
  return thumb;
}

/**
 * Slide the paper thumb under the selected option. Exclusive groups only.
 * @param {Element} group
 * @param {{ animate?: boolean, reduced?: boolean }} [options]
 */
export function applyHubPillsThumb(group, options = {}) {
  if (!group?.style?.setProperty) return null;
  if (isLoosePills(group)) {
    group.classList.remove('is-ready', 'is-animated');
    directChild(group, 'hub-pills__thumb')?.remove();
    return null;
  }

  const buttons = hubPillsButtons(group);
  if (buttons.length < 2) {
    group.classList.remove('is-ready', 'is-animated');
    return null;
  }

  const active = buttons.find(isActiveHubPill);
  if (!active) {
    group.classList.remove('is-ready');
    return null;
  }

  const missingThumb = !directChild(group, 'hub-pills__thumb');
  ensurePillThumb(group);

  const box = {
    x: `${active.offsetLeft}px`,
    y: `${active.offsetTop}px`,
    w: `${active.offsetWidth}px`,
    h: `${active.offsetHeight}px`
  };
  group.style.setProperty('--hub-pill-x', box.x);
  group.style.setProperty('--hub-pill-y', box.y);
  group.style.setProperty('--hub-pill-w', box.w);
  group.style.setProperty('--hub-pill-h', box.h);
  group.classList.add('is-ready');

  const reduced = options.reduced ?? prefersReducedMotion(group);
  const animate = options.animate !== false && !reduced && !missingThumb;
  group.classList.toggle('is-animated', animate);
  return box;
}

function watchPillsSize(group) {
  if (pillResize.has(group) || typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => applyHubPillsThumb(group));
  ro.observe(group);
  pillResize.set(group, ro);
}

function enhancePills(group, reduced) {
  if (!group?.classList?.contains('hub-pills')) return;
  if (isLoosePills(group)) return;

  if (group.dataset.hubPills !== '1') {
    group.dataset.hubPills = '1';
    group.addEventListener('click', () => {
      requestAnimationFrame(() => applyHubPillsThumb(group));
    });
    watchPillsSize(group);
  }

  const first = !group.classList.contains('is-ready');
  applyHubPillsThumb(group, { animate: !first, reduced });
  if (first && !reduced) {
    requestAnimationFrame(() => {
      if (group.classList.contains('is-ready')) group.classList.add('is-animated');
    });
  }
}

/**
 * Same rule as the Motion scroll-hide header: tuck away on scroll down
 * past a threshold, come back on scroll up or when back near the top.
 * @param {{ current: number, previous?: number, threshold?: number, hidden?: boolean }} input
 */
export function nextScrollHideState({
  current,
  previous = 0,
  threshold = DEFAULT_SCROLL_HIDE_THRESHOLD,
  hidden = false
}) {
  const y = Number(current);
  const last = Number(previous);
  const floor = Number(threshold);
  if (!Number.isFinite(y)) return Boolean(hidden);
  if (y <= (Number.isFinite(floor) ? floor : DEFAULT_SCROLL_HIDE_THRESHOLD)) return false;
  if (Number.isFinite(last) && y > last) return true;
  if (Number.isFinite(last) && y < last) return false;
  return Boolean(hidden);
}

function scrollTopOf(scroller) {
  if (!scroller) return 0;
  if (scroller === globalThis || scroller === globalThis.window) {
    return Number(scroller.scrollY ?? scroller.pageYOffset ?? 0);
  }
  if (scroller === globalThis.document || scroller === document) {
    return Number(globalThis.scrollY ?? document.documentElement?.scrollTop ?? 0);
  }
  if (typeof scroller.scrollY === 'number' && scroller.document) {
    return scroller.scrollY;
  }
  return Number(scroller.scrollTop ?? 0);
}

function scrollerOverflows(scroller) {
  if (!scroller) return false;
  if (scroller === globalThis || scroller === globalThis.window || scroller === document) {
    const view = scroller.document?.defaultView ?? globalThis;
    const root = (scroller.document ?? document).documentElement;
    return (root?.scrollHeight ?? 0) > (view.innerHeight ?? 0) + 8;
  }
  return (scroller.scrollHeight ?? 0) > (scroller.clientHeight ?? 0) + 8;
}

export function resolveScrollHideScroller(el, root = el?.getRootNode?.() ?? document) {
  if (!el) return globalThis;
  const sel = el.getAttribute?.('data-hub-scroll-scroller');
  if (!sel) return el.ownerDocument?.defaultView ?? globalThis;
  const scope = el.closest?.(SCROLL_HIDE_HOST) ?? (root.querySelectorAll ? root : document);
  return scope.querySelector?.(sel)
    ?? (root.querySelector?.(sel) ?? document.querySelector?.(sel))
    ?? el.ownerDocument?.defaultView
    ?? globalThis;
}

function readThreshold(el) {
  const raw = Number(el.getAttribute?.('data-hub-scroll-threshold'));
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SCROLL_HIDE_THRESHOLD;
}

/**
 * Apply hidden/revealed chrome. Used by the scroll listener and tests.
 * @param {Element} el
 * @param {{ current: number, previous?: number, threshold?: number }} [scroll]
 */
export function applyHubScrollHide(el, scroll = {}) {
  if (!el?.classList) return false;
  el.classList.add('hub-scroll-hide');
  const hidden = nextScrollHideState({
    current: scroll.current,
    previous: scroll.previous,
    threshold: scroll.threshold ?? readThreshold(el),
    hidden: el.classList.contains('is-hidden')
  });
  el.classList.toggle('is-hidden', hidden);
  el.toggleAttribute?.('inert', hidden);
  if (hidden) el.setAttribute?.('aria-hidden', 'true');
  else el.removeAttribute?.('aria-hidden');
  return hidden;
}

function listenTarget(scroller) {
  if (!scroller || scroller === document) return globalThis;
  return scroller;
}

function bindScrollHide(el) {
  const scroller = resolveScrollHideScroller(el);
  let state = scrollHideState.get(el);
  if (state?.scroller === scroller && state.onScroll) return state;

  if (state?.onScroll && state.scroller) {
    listenTarget(state.scroller).removeEventListener?.('scroll', state.onScroll);
  }

  const onScroll = () => {
    if (!el.isConnected) {
      listenTarget(scroller).removeEventListener?.('scroll', onScroll);
      return;
    }
    const live = resolveScrollHideScroller(el);
    const current = scrollTopOf(live);
    const previous = scrollHideState.get(el)?.y ?? current;
    if (!scrollerOverflows(live)) {
      applyHubScrollHide(el, { current: 0, previous: 0 });
      const next = scrollHideState.get(el);
      if (next) next.y = current;
      return;
    }
    applyHubScrollHide(el, { current, previous });
    const next = scrollHideState.get(el);
    if (next) next.y = current;
  };

  state = { scroller, y: scrollTopOf(scroller), onScroll };
  scrollHideState.set(el, state);
  listenTarget(scroller).addEventListener?.('scroll', onScroll, { passive: true });
  return state;
}

function ensureScrollHideInner(el) {
  if (el.querySelector?.(':scope > .hub-scroll-hide__inner')) return;
  const doc = el.ownerDocument ?? globalThis.document;
  if (!doc?.createElement) return;
  const inner = doc.createElement('div');
  inner.className = 'hub-scroll-hide__inner';
  while (el.firstChild) inner.append(el.firstChild);
  el.append(inner);
}

function enhanceScrollHide(el) {
  if (!el?.classList) return;
  el.classList.add('hub-scroll-hide');
  ensureScrollHideInner(el);
  if (el.dataset.hubScrollHideReady !== '1') {
    el.dataset.hubScrollHideReady = '1';
    el.addEventListener?.('focusin', () => {
      applyHubScrollHide(el, { current: 0, previous: 0 });
      const state = scrollHideState.get(el);
      if (state) state.y = 0;
    });
  }
  bindScrollHide(el);
}

function syncPillsFromTarget(target, reduced) {
  const btn = target.closest?.('.hub-pills__btn');
  const group = (btn?.parentElement?.classList.contains('hub-pills') ? btn.parentElement : null)
    ?? target.closest?.('.hub-pills')
    ?? (target.classList?.contains('hub-pills') ? target : null);
  if (group) enhancePills(group, reduced);
}

function scan(root, reduced) {
  const scope = root.nodeType === 1 || root.nodeType === 9 || root.nodeType === 11 ? root : root.parentElement;
  if (!scope?.querySelectorAll) return;

  for (const el of scope.querySelectorAll(CARD_SELECTOR)) enhanceCard(el, reduced);
  for (const el of scope.querySelectorAll(MAGNET_SELECTOR)) enhanceMagnet(el, reduced);
  for (const el of scope.querySelectorAll(LIST_SELECTOR)) enhanceList(el, reduced);
  for (const el of scope.querySelectorAll(COUNT_SELECTOR)) enhanceCount(el, reduced);
  for (const el of scope.querySelectorAll(KINETIC_SELECTOR)) enhanceKinetic(el, reduced);
  for (const el of scope.querySelectorAll('.hub-pills')) enhancePills(el, reduced);
  for (const el of scope.querySelectorAll(SCROLL_HIDE_SELECTOR)) enhanceScrollHide(el);
  mountHubComposes(scope);
  mountAdaptiveSliders(scope);
  mountContextualAiBars(scope);
  mountSelectAiAgents(scope);
  mountInlineEdits(scope);
  mountCreateDisclosures(scope);
  mountCaptures(scope);
  mountHubSurfaces(scope);

  if (scope.matches?.(CARD_SELECTOR)) enhanceCard(scope, reduced);
  if (scope.matches?.(MAGNET_SELECTOR)) enhanceMagnet(scope, reduced);
  if (scope.matches?.(LIST_SELECTOR)) enhanceList(scope, reduced);
  if (scope.matches?.(KINETIC_SELECTOR)) enhanceKinetic(scope, reduced);
  if (scope.matches?.('.hub-pills')) enhancePills(scope, reduced);
  else syncPillsFromTarget(scope, reduced);
  if (scope.matches?.(SCROLL_HIDE_SELECTOR)) enhanceScrollHide(scope);
}

function watchKinetic(mutations, reduced) {
  const seen = new Set();
  for (const mutation of mutations) {
    const node = mutation.target;
    const el = (node.nodeType === 1 ? node : node.parentElement)?.closest?.(KINETIC_SELECTOR);
    if (el && !seen.has(el)) {
      seen.add(el);
      enhanceKinetic(el, reduced);
    }
  }
}

function watchCounts(mutations, reduced) {
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      const el = mutation.target.parentElement?.closest?.(COUNT_SELECTOR);
      if (el) runCount(el, el.textContent, reduced);
      continue;
    }
    if (mutation.type === 'childList') {
      const el = mutation.target.closest?.(COUNT_SELECTOR) ?? (
        mutation.target.matches?.(COUNT_SELECTOR) ? mutation.target : null
      );
      if (el && mutation.target === el) runCount(el, el.textContent, reduced);
    }
  }
}

/**
 * Start motion once on a document or subtree. Safe to call more than once.
 * @param {Document | ParentNode} [root]
 */
export function startHubMotion(root = document) {
  if (started) {
    scan(root, prefersReducedMotion(root));
    return;
  }
  started = true;
  const reduced = prefersReducedMotion(root);
  const doc = root.ownerDocument ?? root;
  scan(root, reduced);

  const observer = new MutationObserver(mutations => {
    const nextReduced = prefersReducedMotion(root);
    watchCounts(mutations, nextReduced);
    watchKinetic(mutations, nextReduced);
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (mutation.attributeName === 'data-state') {
          scan(mutation.target, nextReduced);
        }
        if (
          mutation.attributeName === 'aria-selected'
          || mutation.attributeName === 'aria-pressed'
          || mutation.attributeName === 'aria-checked'
        ) {
          syncPillsFromTarget(mutation.target, nextReduced);
        }
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) scan(node, nextReduced);
      }
    }
  });

  observer.observe(doc.documentElement ?? root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-state', 'aria-selected', 'aria-pressed', 'aria-checked']
  });
}

/**
 * Soften an abrupt remount (board pack, palette refresh). No Motion package.
 * @param {Element | null | undefined} el
 */
export function playHubRemount(el) {
  if (!el?.classList) return;
  const root = el.ownerDocument ?? document;
  if (prefersReducedMotion(root)) return;
  el.classList.remove('hub-remount-in');
  // Force restart when the same node is re-packed.
  void el.offsetWidth;
  el.classList.add('hub-remount-in');
  const clear = () => el.classList.remove('hub-remount-in');
  el.addEventListener('animationend', clear, { once: true });
}

/** Test helper — reset the singleton so suites can start clean. */
export function resetHubMotionForTests() {
  started = false;
}
