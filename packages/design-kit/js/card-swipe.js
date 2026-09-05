import { prefersReducedMotion } from './hub-motion.js';

export const CARD_SWIPE_ITEM_WIDTH = 320;
export const CARD_SWIPE_GAP = 16;
export const CARD_SWIPE_DRAG_BUFFER = 50;
export const CARD_SWIPE_VELOCITY_THRESHOLD = 500;

const IGNORE_SELECTOR = 'input, textarea, select, option, [contenteditable="true"], [data-card-swipe-ignore]';

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function viewOf(root) {
  const doc = ownerDoc(root);
  return doc?.defaultView ?? globalThis;
}

function addClass(el, name) {
  if (!el || !name) return;
  if (el.classList?.add) {
    el.classList.add(name);
    return;
  }
  const current = String(el.className || '');
  if (!current.split(/\s+/).includes(name)) el.className = `${current} ${name}`.trim();
}

function removeClass(el, name) {
  if (!el || !name) return;
  if (el.classList?.remove) {
    el.classList.remove(name);
    return;
  }
  el.className = String(el.className || '')
    .split(/\s+/)
    .filter(token => token && token !== name)
    .join(' ');
}

function styleOf(el) {
  if (!el) return {};
  if (!el.style) el.style = {};
  return el.style;
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function isIgnoredTarget(target) {
  if (!target) return false;
  if (typeof target.closest === 'function') return Boolean(target.closest(IGNORE_SELECTOR));
  const tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option';
}

function childByClass(parent, className) {
  if (!parent) return null;
  if (parent.querySelector) return parent.querySelector(`.${className}`);
  return (parent.children ?? []).find(child => String(child.className || '').includes(className)) ?? null;
}

function slideEls(track) {
  if (!track) return [];
  if (track.querySelectorAll) {
    return [...track.querySelectorAll(':scope > .hub-card-swipe__slide, :scope > [data-card-swipe-slide]')];
  }
  return (track.children ?? []).filter(child => {
    const name = String(child.className || '');
    return name.includes('hub-card-swipe__slide') || child.dataset?.cardSwipeSlide;
  });
}

function measureWidth(el, fallback) {
  const width = el?.getBoundingClientRect?.()?.width;
  return Number.isFinite(width) && width > 0 ? width : fallback;
}

function measureHeight(el, fallback = 0) {
  const height = el?.getBoundingClientRect?.()?.height;
  return Number.isFinite(height) && height > 0 ? height : fallback;
}

/**
 * Decide the next index after a horizontal drag.
 * Velocity is px/s (positive = dragged right).
 */
export function nextSwipeIndex({
  offset = 0,
  velocity = 0,
  currentIndex = 0,
  itemCount = 0,
  dragBuffer = CARD_SWIPE_DRAG_BUFFER,
  velocityThreshold = CARD_SWIPE_VELOCITY_THRESHOLD
} = {}) {
  const last = Math.max(0, itemCount - 1);
  const index = Math.min(Math.max(0, currentIndex), last);
  if (itemCount <= 1) return 0;
  if (offset < -dragBuffer || velocity < -velocityThreshold) return Math.min(index + 1, last);
  if (offset > dragBuffer || velocity > velocityThreshold) return Math.max(index - 1, 0);
  return index;
}

function defaultIconSvg(kind) {
  const paths = {
    bench: '<path d="M4 14h16M6 14V9h12v5M8 14v4M16 14v4M4 9h16"/>',
    fly: '<path d="M7 8a5 5 0 0 1 10 0M6 14h12M8 14v5M16 14v5"/>',
    curl: '<path d="M8 20V9a4 4 0 0 1 8 0v11M8 12h8"/>',
    row: '<path d="M5 18h14M7 18V8l5-3 5 3v10"/>',
    core: '<path d="M12 4v16M8 8h8M8 16h8M7 12h10"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] ?? paths.bench}</svg>`;
}

export const DEFAULT_CARD_SWIPE_ITEMS = [
  {
    id: 'bench',
    title: 'Bench press',
    description: '4 × 8 · 36 kg · constant force. Chest stays over the handles.',
    icon: defaultIconSvg('bench')
  },
  {
    id: 'fly',
    title: 'Cable fly',
    description: '3 × 12 · 12 kg · squeeze at the centre, slow return.',
    icon: defaultIconSvg('fly')
  },
  {
    id: 'curl',
    title: 'Bayesian curl',
    description: '3 × 10 · 14 kg · stretch at the back, no swing.',
    icon: defaultIconSvg('curl')
  },
  {
    id: 'row',
    title: 'Chest-supported row',
    description: '4 × 10 · 28 kg · elbows toward hips.',
    icon: defaultIconSvg('row')
  },
  {
    id: 'core',
    title: 'Dead bug',
    description: '3 × 8 each side. Ribs down, slow opposite reach.',
    icon: defaultIconSvg('core')
  }
];

function buildItemCard(host, item) {
  const card = host.createElement('article');
  card.className = 'hub-card-swipe__card';

  if (item.icon) {
    const icon = host.createElement('div');
    icon.className = 'hub-card-swipe__icon';
    if (typeof item.icon === 'string') icon.innerHTML = item.icon;
    else if (typeof item.icon === 'function') icon.append(item.icon());
    else icon.append(item.icon);
    card.append(icon);
  }

  const title = host.createElement('h3');
  title.className = 'hub-card-swipe__title';
  title.textContent = item.title ?? 'Card';
  card.append(title);

  if (item.description) {
    const description = host.createElement('p');
    description.className = 'hub-card-swipe__description';
    description.textContent = item.description;
    card.append(description);
  }

  if (item.actionLabel || item.onAction) {
    const action = host.createElement('button');
    action.type = 'button';
    action.className = 'btn btn--primary';
    action.textContent = item.actionLabel ?? 'Continue';
    action.dataset.cardSwipeIgnore = '';
    if (item.onAction) action.addEventListener?.('click', event => item.onAction(item, event));
    card.append(action);
  }

  return card;
}

function wrapSlide(host, child) {
  if (String(child?.className || '').includes('hub-card-swipe__slide') || child?.dataset?.cardSwipeSlide) {
    return child;
  }
  const slide = host.createElement('div');
  slide.className = 'hub-card-swipe__slide';
  slide.dataset.cardSwipeSlide = '1';
  slide.append(child);
  return slide;
}

/**
 * @param {object} options
 * @returns {{
 *   el: HTMLElement,
 *   viewport: HTMLElement,
 *   track: HTMLElement,
 *   dots: HTMLElement,
 *   status: HTMLElement,
 *   appendSlide: Function,
 *   setIndex: Function,
 *   getIndex: Function,
 *   sync: Function,
 *   destroy: Function
 * }}
 */
export function createCardSwipe({
  root,
  items,
  slides,
  currentIndex = 0,
  onIndexChange,
  onSelect,
  className = '',
  label = 'Cards',
  itemWidth = CARD_SWIPE_ITEM_WIDTH,
  gap = CARD_SWIPE_GAP,
  tilt = 28,
  fluid = false
} = {}) {
  const host = root ?? globalThis.document;
  const wrap = host.createElement('div');
  wrap.className = ['hub-card-swipe', fluid ? 'hub-card-swipe--fluid' : '', className].filter(Boolean).join(' ');
  wrap.dataset.cardSwipe = '1';
  wrap.setAttribute?.('role', 'region');
  wrap.setAttribute?.('aria-roledescription', 'carousel');
  wrap.setAttribute?.('aria-label', label);
  wrap.tabIndex = 0;

  const status = host.createElement('p');
  status.className = 'hub-card-swipe__status';
  status.dataset.cardSwipeStatus = '1';
  status.setAttribute?.('aria-live', 'polite');

  const viewport = host.createElement('div');
  viewport.className = 'hub-card-swipe__viewport';

  const track = host.createElement('div');
  track.className = 'hub-card-swipe__track';
  viewport.append(track);

  const dots = host.createElement('div');
  dots.className = 'hub-card-swipe__dots';
  dots.dataset.cardSwipeDots = '1';
  dots.setAttribute?.('role', 'tablist');
  dots.setAttribute?.('aria-label', `${label} position`);

  wrap.append(status, viewport, dots);

  const api = bindCardSwipe(wrap, {
    root: host,
    currentIndex,
    onIndexChange,
    onSelect,
    itemWidth,
    gap,
    tilt,
    fluid,
    label
  });

  const sourceItems = items === undefined && !slides ? DEFAULT_CARD_SWIPE_ITEMS : items;
  if (Array.isArray(sourceItems)) {
    for (const item of sourceItems) {
      api.appendSlide(buildItemCard(host, item), { title: item.title });
    }
  }
  if (Array.isArray(slides)) {
    for (const slide of slides) api.appendSlide(slide);
  }
  api.sync();
  return api;
}

export function mountCardSwipe(el, options = {}) {
  if (!el) return null;
  addClass(el, 'hub-card-swipe');
  el.dataset.cardSwipe = '1';
  const api = bindCardSwipe(el, options);
  api.sync();
  return api;
}

export function mountCardSwipes(scope = globalThis.document) {
  const nodes = scope.querySelectorAll?.('[data-card-swipe]') ?? [];
  return [...nodes].map(node => mountCardSwipe(node)).filter(Boolean);
}

function bindCardSwipe(wrap, {
  root,
  currentIndex = 0,
  onIndexChange,
  onSelect,
  itemWidth = CARD_SWIPE_ITEM_WIDTH,
  gap = CARD_SWIPE_GAP,
  tilt = 28,
  fluid = false,
  label = 'Cards'
} = {}) {
  const host = root ?? ownerDoc(wrap);
  const viewport = childByClass(wrap, 'hub-card-swipe__viewport') ?? wrap.children?.[1];
  const track = childByClass(viewport, 'hub-card-swipe__track') ?? viewport?.children?.[0] ?? viewport;
  let dots = childByClass(wrap, 'hub-card-swipe__dots');
  if (!dots) {
    dots = host.createElement?.('div') ?? { className: '', children: [], append() {}, replaceChildren() {} };
    dots.className = 'hub-card-swipe__dots';
    dots.dataset = dots.dataset ?? {};
    dots.dataset.cardSwipeDots = '1';
    wrap.append?.(dots);
  }
  let status = childByClass(wrap, 'hub-card-swipe__status');
  if (!status && host.createElement) {
    status = host.createElement('p');
    status.className = 'hub-card-swipe__status';
    status.dataset.cardSwipeStatus = '1';
    wrap.insertBefore ? wrap.insertBefore(status, viewport) : wrap.append?.(status);
  }

  if (fluid) addClass(wrap, 'hub-card-swipe--fluid');

  let index = Math.max(0, currentIndex);
  let drag = null;
  let moved = false;
  const listeners = [];

  function slides() {
    return slideEls(track);
  }

  function count() {
    return slides().length;
  }

  function clamp(next) {
    const total = count();
    if (total === 0) return Math.max(0, next);
    return Math.min(Math.max(0, next), total - 1);
  }

  function stepWidth() {
    const first = slides()[0];
    const measured = first?.offsetWidth || measureWidth(first, fluid ? measureWidth(viewport, itemWidth) : itemWidth);
    return measured + gap;
  }

  function xFor(nextIndex) {
    return -(nextIndex * stepWidth());
  }

  function applyTilt(x, animate) {
    const reduced = prefersReducedMotion(ownerDoc(wrap));
    const cards = slides();
    const width = stepWidth();
    const progress = width ? -x / width : 0;
    cards.forEach((slide, slideIndex) => {
      const offset = slideIndex - progress;
      const deg = reduced || !tilt ? 0 : Math.max(-tilt, Math.min(tilt, offset * -tilt));
      const style = styleOf(slide);
      if (animate && !reduced) addClass(slide, 'is-tilting');
      else removeClass(slide, 'is-tilting');
      style.transform = deg ? `rotateY(${deg}deg)` : 'none';
      slide.setAttribute?.('aria-hidden', slideIndex === index ? 'false' : 'true');
    });
  }

  function applyX(x, { animate = false } = {}) {
    const style = styleOf(track);
    if (animate && !prefersReducedMotion(ownerDoc(wrap))) addClass(track, 'is-animated');
    else removeClass(track, 'is-animated');
    style.transform = `translate3d(${x}px, 0, 0)`;
    applyTilt(x, animate);
  }

  function renderDots() {
    const total = count();
    if (typeof dots.replaceChildren === 'function') dots.replaceChildren();
    else dots.children = [];
    for (let i = 0; i < total; i++) {
      const dot = host.createElement('button');
      dot.type = 'button';
      dot.className = 'hub-card-swipe__dot';
      dot.dataset.cardSwipeDot = String(i);
      dot.setAttribute?.('aria-label', `${label} ${i + 1} of ${total}`);
      if (i === index) dot.setAttribute?.('aria-current', 'true');
      dot.addEventListener?.('click', () => setIndex(i));
      dots.append(dot);
    }
  }

  function renderStatus() {
    const total = count();
    const current = slides()[index];
    const title = current?.dataset?.cardSwipeTitle
      || current?.querySelector?.('.hub-card-swipe__title, h3, h4')?.textContent
      || '';
    const prefix = total ? `${index + 1} of ${total}` : '0 of 0';
    setText(status, title ? `${prefix} · ${title}` : prefix);
  }

  function syncHeight() {
    const current = slides()[index];
    if (!current || !viewport) return;
    const height = measureHeight(current);
    if (height) styleOf(viewport).height = `${height}px`;
  }

  function syncSlideSizes() {
    if (!fluid || !viewport) return;
    const width = measureWidth(viewport, itemWidth);
    if (!(width > 0)) return;
    for (const slide of slides()) {
      const style = styleOf(slide);
      style.flex = `0 0 ${width}px`;
      style.width = `${width}px`;
      style.maxWidth = `${width}px`;
    }
  }

  function sync() {
    index = clamp(index);
    wrap.dataset.cardSwipeIndex = String(index);
    syncSlideSizes();
    applyX(xFor(index), { animate: false });
    renderDots();
    renderStatus();
    syncHeight();
  }

  function setIndex(next, { silent = false, animate = true } = {}) {
    const clamped = clamp(next);
    const changed = clamped !== index;
    index = clamped;
    wrap.dataset.cardSwipeIndex = String(index);
    syncSlideSizes();
    applyX(xFor(index), { animate });
    renderDots();
    renderStatus();
    syncHeight();
    if (changed && !silent) onIndexChange?.(index);
    return index;
  }

  function appendSlide(node, { title } = {}) {
    const slide = wrapSlide(host, node);
    if (title) slide.dataset.cardSwipeTitle = title;
    track.append(slide);
    return slide;
  }

  function onPointerDown(event) {
    moved = false;
    if (count() <= 1) return;
    if (event.button != null && event.button !== 0) return;
    if (isIgnoredTarget(event.target)) return;
    const startX = event.clientX ?? event.touches?.[0]?.clientX;
    if (!Number.isFinite(startX)) return;
    drag = {
      startX,
      lastX: startX,
      origin: xFor(index),
      startedAt: event.timeStamp ?? Date.now()
    };
    addClass(wrap, 'is-dragging');
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag) return;
    const x = event.clientX ?? event.touches?.[0]?.clientX;
    if (!Number.isFinite(x)) return;
    if (Math.abs(x - drag.startX) > 12) moved = true;
    drag.lastX = x;
    applyX(drag.origin + (x - drag.startX), { animate: false });
  }

  function onPointerUp(event) {
    if (!drag) return;
    const x = event.clientX ?? drag.lastX;
    const elapsed = Math.max(1, (event.timeStamp ?? Date.now()) - drag.startedAt);
    const offset = x - drag.startX;
    const velocity = (offset / elapsed) * 1000;
    drag = null;
    removeClass(wrap, 'is-dragging');
    setIndex(nextSwipeIndex({
      offset,
      velocity,
      currentIndex: index,
      itemCount: count()
    }));
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault?.();
      setIndex(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault?.();
      setIndex(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault?.();
      setIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault?.();
      setIndex(count() - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault?.();
      onSelect?.(index);
    }
  }

  function onClick(event) {
    if (moved) return;
    if (isIgnoredTarget(event.target)) return;
    onSelect?.(index);
  }

  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener?.(type, handler, options));
  }

  function layout() {
    syncSlideSizes();
    applyX(xFor(index), { animate: false });
    syncHeight();
  }

  listen(track, 'pointerdown', onPointerDown);
  listen(track, 'pointermove', onPointerMove);
  listen(track, 'pointerup', onPointerUp);
  listen(track, 'pointercancel', onPointerUp);
  listen(track, 'click', onClick);
  listen(wrap, 'keydown', onKeyDown);
  listen(viewOf(wrap), 'resize', layout);

  const ResizeObserverCtor = viewOf(wrap)?.ResizeObserver ?? globalThis.ResizeObserver;
  if (typeof ResizeObserverCtor === 'function' && viewport) {
    const observer = new ResizeObserverCtor(() => layout());
    observer.observe(viewport);
    listeners.push(() => observer.disconnect());
  }

  function destroy() {
    for (const off of listeners) off();
    listeners.length = 0;
  }

  return {
    el: wrap,
    viewport,
    track,
    dots,
    status,
    appendSlide,
    setIndex,
    getIndex: () => index,
    sync,
    destroy
  };
}
