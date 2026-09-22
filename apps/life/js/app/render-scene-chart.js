/**
 * Mount a chart-kit scene (see chart-kit/scene.js) into a host element and give
 * it hover tooltips, click-to-select, keyboard navigation and entrance motion.
 *
 * Host contract: an empty element. The renderer adds
 *   svg.hc-chart, div.hc-tip (tooltip) and p.hc-readout (aria-live detail line).
 * Re-rendering with the same data key and width is a no-op, so live sync
 * refreshes never replay the animation.
 */
import { prefersReducedMotion } from './chart-kit/animate.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SETTLE_EXTRA_MS = 1200;
let instanceCount = 0;

function motionQuiet(host, quiet) {
  if (quiet) return true;
  let el = host;
  while (el) {
    if (el.dataset?.syncQuiet != null && String(el.dataset.syncQuiet) !== 'false') return true;
    el = el.parentElement;
  }
  return prefersReducedMotion();
}

function scopedValue(value, prefix) {
  return typeof value === 'string' ? value.replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`) : value;
}

function createNode(doc, spec, prefix, animate, state) {
  const el = doc.createElementNS(SVG_NS, spec.tag);
  for (const [name, raw] of Object.entries(spec.attrs ?? {})) {
    if (raw == null) continue;
    const value = name === 'id' ? `${prefix}-${raw}` : scopedValue(raw, prefix);
    el.setAttribute(name, String(value));
  }
  const classes = [spec.cls];
  if (spec.hit) {
    el.dataset.hit = spec.hit;
    classes.push('hc-hit');
  }
  if (spec.group) el.dataset.group = spec.group;
  if (animate && spec.anim) {
    classes.push(`hc-anim-${spec.anim}`);
    el.style.setProperty('--hc-delay', `${spec.delay ?? 0}ms`);
    if (spec.dur) el.style.setProperty('--hc-dur', `${spec.dur}ms`);
    if (spec.origin) {
      el.style.transformOrigin = `${spec.origin[0]}px ${spec.origin[1]}px`;
    }
    state.maxDelay = Math.max(state.maxDelay, (spec.delay ?? 0) + Math.max(0, (spec.dur ?? 0) - 900));
  }
  if (animate && spec.motion?.path) {
    // Travel along an absolute path, then rest where the node's own attrs put it.
    el.setAttribute('cx', '0');
    el.setAttribute('cy', '0');
    const motion = doc.createElementNS(SVG_NS, 'animateMotion');
    motion.setAttribute('path', spec.motion.path);
    motion.setAttribute('dur', `${Math.max(1, spec.motion.dur)}ms`);
    motion.setAttribute('begin', 'indefinite');
    motion.setAttribute('fill', 'freeze');
    el.append(motion);
    state.motions.push(motion);
    state.maxDelay = Math.max(state.maxDelay, spec.motion.dur);
  }
  const cls = classes.filter(Boolean).join(' ');
  if (cls) el.setAttribute('class', cls);
  if (spec.text != null) el.textContent = spec.text;
  for (const child of spec.children ?? []) el.append(createNode(doc, child, prefix, animate, state));
  return el;
}

function ensureShell(host) {
  if (host._hc) return host._hc;
  const doc = host.ownerDocument;
  instanceCount += 1;
  const prefix = `hc${instanceCount}`;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'hc-chart');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'group');
  const tip = doc.createElement('div');
  tip.className = 'hc-tip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  const readout = doc.createElement('p');
  readout.className = 'hc-readout';
  readout.setAttribute('aria-live', 'polite');
  host.classList.add('hc-host');
  host.replaceChildren(svg, tip, readout);
  const hc = {
    prefix, svg, tip, readout,
    scene: null, key: null, width: 0,
    hover: null, focusIndex: -1, pinned: null, selected: null,
    options: {}, build: null, data: null, settleTimer: null, resize: null
  };
  host._hc = hc;
  wireEvents(host, hc);
  return hc;
}

function hitNodes(hc, id) {
  return id ? [...hc.svg.querySelectorAll(`[data-hit="${CSS.escape(id)}"]`)] : [];
}

function hitOrder(hc) {
  const seen = new Set();
  const order = [];
  for (const el of hc.svg.querySelectorAll('[data-hit]')) {
    const id = el.dataset.hit;
    if (!seen.has(id) && hc.scene?.hits?.[id]) {
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}

function setClass(nodes, name, on) {
  for (const el of nodes) el.classList.toggle(name, on);
}

function paintHover(hc, id) {
  if (hc.hover === id) return;
  setClass(hitNodes(hc, hc.hover), 'is-hover', false);
  hc.hover = id;
  setClass(hitNodes(hc, id), 'is-hover', true);
  const guide = hc.svg.querySelector('.hc-guide');
  const hit = id ? hc.scene?.hits?.[id] : null;
  if (guide) {
    if (hit?.guide) {
      guide.setAttribute('x1', hit.guide.x);
      guide.setAttribute('x2', hit.guide.x);
      guide.setAttribute('y1', hit.guide.y1);
      guide.setAttribute('y2', hit.guide.y2);
      guide.classList.add('is-on');
    } else {
      guide.classList.remove('is-on');
    }
  }
}

function showTip(host, hc, id, pointer) {
  const hit = id ? hc.scene?.hits?.[id] : null;
  if (!hit) {
    hc.tip.hidden = true;
    hc.tip.classList.remove('is-on');
    return;
  }
  const doc = host.ownerDocument;
  const title = doc.createElement('strong');
  title.textContent = hit.title;
  const lines = (hit.lines ?? []).map(line => {
    const span = doc.createElement('span');
    span.textContent = line;
    return span;
  });
  hc.tip.replaceChildren(title, ...lines);
  hc.tip.hidden = false;

  const hostBox = host.getBoundingClientRect();
  const target = hitNodes(hc, id)
    .map(el => el.getBoundingClientRect())
    .filter(box => box.width || box.height)
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  let ax;
  let ay;
  if (pointer && (!target || target.width > 72 || target.height > 72)) {
    ax = pointer.x - hostBox.left;
    ay = pointer.y - hostBox.top;
  } else if (target) {
    ax = target.left + target.width / 2 - hostBox.left;
    ay = target.top - hostBox.top;
  } else {
    ax = hostBox.width / 2;
    ay = 0;
  }
  const tipBox = hc.tip.getBoundingClientRect();
  const margin = 8;
  let left = ax - tipBox.width / 2;
  left = Math.max(margin - 4, Math.min(hostBox.width - tipBox.width - margin + 4, left));
  let top = ay - tipBox.height - 12;
  let below = false;
  if (top < -hostBox.top + 4 && top < 0) {
    top = (target ? target.bottom - hostBox.top : ay) + 12;
    below = true;
  }
  hc.tip.style.left = `${Math.round(left)}px`;
  hc.tip.style.top = `${Math.round(top)}px`;
  hc.tip.classList.toggle('is-below', below);
  requestAnimationFrame(() => hc.tip.classList.add('is-on'));
}

function hideTip(hc) {
  hc.tip.classList.remove('is-on');
  hc.tip.hidden = true;
}

function applySelection(hc) {
  const group = hc.selected;
  hc.svg.classList.toggle('has-selection', Boolean(group));
  for (const el of hc.svg.querySelectorAll('[data-group]')) {
    const match = el.dataset.group === group;
    el.classList.toggle('is-selected', Boolean(group) && match);
    el.classList.toggle('is-dimmed', Boolean(group) && !match);
  }
  setClass([...hc.svg.querySelectorAll('.is-pinned')], 'is-pinned', false);
  setClass(hitNodes(hc, hc.pinned), 'is-pinned', true);
}

function setReadout(hc, text) {
  hc.readout.textContent = text ?? hc.scene?.readout ?? '';
}

function activate(host, hc, id, pointer) {
  const hit = hc.scene?.hits?.[id];
  if (!hit) return;
  if (hc.pinned === id) {
    clearSelection(host, hc);
    return;
  }
  hc.pinned = id;
  if (hit.select) hc.selected = hit.select;
  else if (hit.group && hc.options.selectByGroup) hc.selected = hit.group;
  applySelection(hc);
  setReadout(hc, hit.detail);
  showTip(host, hc, id, pointer);
  if (hit.select) hc.options.onSelect?.(hit.select, hit);
  if (hit.action) hc.options.onAction?.(hit.action, hit);
}

function clearSelection(host, hc, { silent = false } = {}) {
  const had = hc.selected;
  hc.pinned = null;
  hc.selected = null;
  applySelection(hc);
  setReadout(hc, null);
  hideTip(hc);
  if (had && !silent) hc.options.onSelect?.(null, null);
}

function wireEvents(host, hc) {
  const svg = hc.svg;
  svg.addEventListener('pointermove', event => {
    const target = event.target.closest?.('[data-hit]');
    const id = target?.dataset.hit ?? null;
    if (!id) {
      paintHover(hc, null);
      if (!hc.pinned) hideTip(hc);
      return;
    }
    paintHover(hc, id);
    if (event.pointerType === 'mouse' || !hc.pinned) showTip(host, hc, id, { x: event.clientX, y: event.clientY });
  });
  svg.addEventListener('pointerleave', () => {
    paintHover(hc, null);
    if (hc.pinned) showTip(host, hc, hc.pinned);
    else hideTip(hc);
  });
  svg.addEventListener('click', event => {
    const target = event.target.closest?.('[data-hit]');
    if (!target) {
      clearSelection(host, hc);
      return;
    }
    activate(host, hc, target.dataset.hit, { x: event.clientX, y: event.clientY });
  });
  svg.addEventListener('focus', () => {
    const order = hitOrder(hc);
    if (!order.length) return;
    if (hc.focusIndex < 0 || hc.focusIndex >= order.length) {
      hc.focusIndex = Math.max(0, order.indexOf(hc.pinned));
    }
    const id = order[hc.focusIndex];
    paintHover(hc, id);
    setClass(hitNodes(hc, id), 'is-focus', true);
    showTip(host, hc, id);
  });
  svg.addEventListener('blur', () => {
    setClass([...svg.querySelectorAll('.is-focus')], 'is-focus', false);
    paintHover(hc, null);
    if (!hc.pinned) hideTip(hc);
  });
  svg.addEventListener('keydown', event => {
    const order = hitOrder(hc);
    if (!order.length) return;
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (move) {
      event.preventDefault();
      setClass([...svg.querySelectorAll('.is-focus')], 'is-focus', false);
      hc.focusIndex = (Math.max(0, hc.focusIndex) + move + order.length) % order.length;
      const id = order[hc.focusIndex];
      paintHover(hc, id);
      setClass(hitNodes(hc, id), 'is-focus', true);
      showTip(host, hc, id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const id = order[Math.max(0, hc.focusIndex)];
      activate(host, hc, id);
    } else if (event.key === 'Escape') {
      clearSelection(host, hc);
    }
  });
}

function paint(host, hc, scene, animate) {
  const doc = host.ownerDocument;
  clearTimeout(hc.settleTimer);
  const svg = hc.svg;
  const state = { maxDelay: 0, motions: [] };
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`);
  svg.setAttribute('width', String(scene.width));
  svg.setAttribute('height', String(scene.height));
  svg.setAttribute('aria-label', `${scene.label} Use arrow keys to explore, Enter to select.`);
  const guide = doc.createElementNS(SVG_NS, 'line');
  guide.setAttribute('class', 'hc-guide');
  for (const spec of scene.nodes) svg.append(createNode(doc, spec, hc.prefix, animate, state));
  svg.append(guide);
  svg.classList.remove('hc-settled', 'hc-animate');
  if (animate) {
    // Force a style flush so the animation starts from its first frame.
    void svg.getBoundingClientRect();
    svg.classList.add('hc-animate');
    for (const motion of state.motions) motion.beginElement?.();
    hc.settleTimer = setTimeout(() => {
      svg.classList.remove('hc-animate');
      svg.classList.add('hc-settled');
    }, state.maxDelay + SETTLE_EXTRA_MS);
  } else {
    svg.classList.add('hc-settled');
  }
  hc.scene = scene;
  hc.hover = null;
  hc.focusIndex = -1;
  if (hc.pinned && !scene.hits?.[hc.pinned]) hc.pinned = null;
  applySelection(hc);
  const pinnedHit = hc.pinned ? scene.hits[hc.pinned] : null;
  setReadout(hc, pinnedHit?.detail ?? null);
  hideTip(hc);
}

function measure(host) {
  return Math.max(260, Math.floor(host.clientWidth || host.getBoundingClientRect().width || 520));
}

/**
 * @param {HTMLElement} host
 * @param {(data: any, opts: { width: number }) => object} build  chart-kit builder
 * @param {any} data
 * @param {{ quiet?: boolean, onSelect?: Function, onAction?: Function, selectByGroup?: boolean, maxWidth?: number }} options
 */
export function mountSceneChart(host, build, data, options = {}) {
  if (!host?.ownerDocument) return null;
  const hc = ensureShell(host);
  hc.options = options;
  hc.build = build;
  hc.data = data;
  const width = Math.min(options.maxWidth ?? Infinity, measure(host));
  const key = JSON.stringify(data);
  if (hc.key === key && hc.width === width) return hc;
  const firstPaint = hc.key == null;
  const dataChanged = hc.key !== key;
  hc.key = key;
  hc.width = width;
  const animate = (firstPaint || dataChanged) && !motionQuiet(host, options.quiet);
  paint(host, hc, build(data, { width }), animate);

  if (!hc.resize && typeof ResizeObserver !== 'undefined') {
    let frame = 0;
    hc.resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = Math.min(hc.options.maxWidth ?? Infinity, measure(host));
        if (Math.abs(next - hc.width) < 2) return;
        hc.width = next;
        paint(host, hc, hc.build(hc.data, { width: next }), false);
      });
    });
    hc.resize.observe(host);
  }
  return hc;
}

/** Select a group from outside (cross-chart linking). null clears. */
export function selectSceneGroup(host, group) {
  const hc = host?._hc;
  if (!hc) return;
  if (group == null) {
    clearSelection(host, hc, { silent: true });
    return;
  }
  hc.selected = group;
  hc.pinned = null;
  applySelection(hc);
}
