import { formatDisplayDate, daysBetween, isCalendarDate } from '../core/time.js';
import { MEDICAL_THREAD_COLOURS } from './medical-model.js';

const GUTTER = 140;
const PAD_R = 24;
const AXIS_H = 28;
const LANE_H = 88;
const STORAGE_OPEN = 'life-hub-medical-strip-open';
const ZOOM_SPANS = { weeks: 42, months: 180, years: 730 };
const stripStateByRoot = new WeakMap();

/**
 * Health Threads strip (MO-18–23). Zoom state lives here as one object
 * `{ spanDays, centerDate }` driving SVG + active pill.
 */
export function renderMedicalStrip(root, model, hooks = {}) {
  const host = root.querySelector('#medical-strip');
  if (!host || !model) return;

  let state = stripStateByRoot.get(root);
  if (!state) {
    state = {
      zoom: { spanDays: ZOOM_SPANS.months, centerDate: model.today },
      open: readOpenDefault(),
      observer: null,
      width: 0,
      pinch: null,
      anim: null
    };
    stripStateByRoot.set(root, state);
  }
  if (!state.zoom.centerDate) state.zoom.centerDate = model.today;

  const lanes = model.threads?.lanes || [];
  host.replaceChildren();
  host.className = 'medical-strip';
  host.style.touchAction = 'pan-y';

  const header = root.createElement('div');
  header.className = 'medical-strip__header';

  const toggle = root.createElement('button');
  toggle.type = 'button';
  toggle.className = 'medical-strip__toggle';
  toggle.setAttribute('aria-expanded', state.open ? 'true' : 'false');
  toggle.setAttribute('aria-controls', 'medical-strip-body');
  const chevron = root.createElement('span');
  chevron.className = 'medical-strip__chevron';
  chevron.textContent = state.open ? '▾' : '▸';
  const title = root.createElement('strong');
  title.textContent = 'Health Threads';
  const summary = root.createElement('span');
  summary.className = 'medical-strip__summary';
  summary.textContent = collapseSummary(lanes, model);
  toggle.append(chevron, title, summary);
  toggle.addEventListener('click', () => {
    state.open = !state.open;
    writeOpen(state.open);
    renderMedicalStrip(root, model, hooks);
  });

  const zoom = root.createElement('div');
  zoom.className = 'medical-strip__zoom hub-pills';
  zoom.setAttribute('role', 'group');
  zoom.setAttribute('aria-label', 'Thread zoom');
  for (const [key, days] of Object.entries(ZOOM_SPANS)) {
    const btn = root.createElement('button');
    btn.type = 'button';
    btn.className = 'hub-pills__btn';
    btn.dataset.stripZoom = key;
    btn.textContent = key[0].toUpperCase() + key.slice(1);
    const active = nearestZoomKey(state.zoom.spanDays) === key;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.addEventListener('click', () => setSpan(root, model, hooks, days, true));
    zoom.append(btn);
  }
  const minus = root.createElement('button');
  minus.type = 'button';
  minus.className = 'btn btn--ghost medical-strip__zoom-btn';
  minus.textContent = '−';
  minus.setAttribute('aria-label', 'Zoom out');
  minus.addEventListener('click', () => setSpan(root, model, hooks, state.zoom.spanDays * 1.35, true));
  const plus = root.createElement('button');
  plus.type = 'button';
  plus.className = 'btn btn--ghost medical-strip__zoom-btn';
  plus.textContent = '+';
  plus.setAttribute('aria-label', 'Zoom in');
  plus.addEventListener('click', () => setSpan(root, model, hooks, state.zoom.spanDays / 1.35, true));
  zoom.append(minus, plus);

  header.append(toggle, zoom);
  host.append(header);

  const body = root.createElement('div');
  body.id = 'medical-strip-body';
  body.className = 'medical-strip__body';
  if (!state.open) {
    body.hidden = true;
    body.setAttribute('hidden', '');
  } else {
    body.hidden = false;
    body.removeAttribute('hidden');
  }
  host.append(body);

  if (!state.open) return;

  if (!lanes.length) {
    const empty = root.createElement('p');
    empty.className = 'medical-strip__empty';
    empty.textContent = 'No thread events in the visible window.';
    body.append(empty);
    return;
  }

  const canvas = root.createElement('div');
  canvas.className = 'medical-strip__canvas';
  body.append(canvas);

  const paint = () => {
    const width = Math.max(320, canvas.clientWidth || state.width || 720);
    state.width = width;
    canvas.replaceChildren(buildSvg(root, model, lanes, state.zoom, width, hooks));
    resolveAxisLabelCollisions(canvas.querySelector('svg'));
  };

  if (typeof ResizeObserver === 'function') {
    state.observer?.disconnect?.();
    state.observer = new ResizeObserver(() => paint());
    state.observer.observe(canvas);
  }
  paint();
  bindGestures(canvas, root, model, hooks, state);

  // Phone: scroll so TODAY sits ~70% across.
  if (typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches) {
    requestAnimationFrame?.(() => {
      const svg = canvas.querySelector('svg');
      if (!svg || !body.scrollWidth) return;
      const xToday = dateToX(model.today, state.zoom, state.width);
      body.scrollLeft = Math.max(0, xToday - body.clientWidth * 0.7);
    });
  }
}

function setSpan(root, model, hooks, nextDays, animate) {
  const state = stripStateByRoot.get(root);
  if (!state) return;
  const clamped = Math.min(1200, Math.max(21, nextDays));
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced) {
    state.zoom.spanDays = clamped;
    renderMedicalStrip(root, model, hooks);
    return;
  }
  const from = state.zoom.spanDays;
  const start = performance.now?.() ?? Date.now();
  const dur = 180;
  const tick = now => {
    const t = Math.min(1, (now - start) / dur);
    state.zoom.spanDays = from + (clamped - from) * t;
    renderMedicalStrip(root, model, hooks);
    if (t < 1) requestAnimationFrame?.(tick);
    else state.zoom.spanDays = clamped;
  };
  requestAnimationFrame?.(tick) ?? (() => { state.zoom.spanDays = clamped; renderMedicalStrip(root, model, hooks); })();
}

function bindGestures(canvas, root, model, hooks, state) {
  if (canvas.dataset.stripGestures) return;
  canvas.dataset.stripGestures = '1';

  canvas.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.08 : 1 / 1.08;
    setSpan(root, model, hooks, state.zoom.spanDays * factor, false);
  }, { passive: false });

  canvas.addEventListener('gesturestart', event => {
    event.preventDefault?.();
    state.pinch = { scale0: 1, span0: state.zoom.spanDays };
  });
  canvas.addEventListener('gesturechange', event => {
    if (!state.pinch) return;
    event.preventDefault?.();
    const scale = event.scale || 1;
    setSpan(root, model, hooks, state.pinch.span0 / scale, false);
  });
  canvas.addEventListener('gestureend', () => { state.pinch = null; });

  const pointers = new Map();
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      state.pinch = {
        dist0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        span0: state.zoom.spanDays,
        pan0: state.zoom.centerDate
      };
    } else if (pointers.size === 1) {
      state.drag = { x0: event.clientX, center0: state.zoom.centerDate };
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && state.pinch?.dist0) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (dist > 0) setSpan(root, model, hooks, state.pinch.span0 * (state.pinch.dist0 / dist), false);
      return;
    }
    if (pointers.size === 1 && state.drag) {
      const dx = event.clientX - state.drag.x0;
      const plotW = Math.max(1, (state.width || 720) - GUTTER - PAD_R);
      const dayShift = -(dx / plotW) * state.zoom.spanDays;
      state.zoom.centerDate = shiftDate(state.drag.center0, dayShift);
      renderMedicalStrip(root, model, hooks);
    }
  });
  const endPointer = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) state.pinch = null;
    if (pointers.size === 0) state.drag = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
}

function buildSvg(root, model, lanes, zoom, width, hooks) {
  const height = AXIS_H + lanes.length * LANE_H + 16;
  const svg = svgEl(root, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Health threads timeline');
  svg.classList.add('medical-strip__svg');

  const defs = svgEl(root, 'defs');
  const pattern = svgEl(root, 'pattern');
  pattern.setAttribute('id', 'medical-strip-hatch');
  pattern.setAttribute('width', '6');
  pattern.setAttribute('height', '6');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const path = svgEl(root, 'path');
  path.setAttribute('d', 'M0 6L6 0');
  path.setAttribute('stroke', 'var(--line)');
  path.setAttribute('stroke-width', '1');
  pattern.append(path);
  defs.append(pattern);
  svg.append(defs);

  const xToday = dateToX(model.today, zoom, width);
  const future = svgEl(root, 'rect');
  future.setAttribute('x', String(xToday));
  future.setAttribute('y', String(AXIS_H));
  future.setAttribute('width', String(Math.max(0, width - PAD_R - xToday)));
  future.setAttribute('height', String(height - AXIS_H));
  future.setAttribute('fill', 'url(#medical-strip-hatch)');
  future.setAttribute('opacity', '0.55');
  svg.append(future);

  drawAxis(root, svg, zoom, width);
  const todayLine = svgEl(root, 'line');
  todayLine.setAttribute('x1', String(xToday));
  todayLine.setAttribute('x2', String(xToday));
  todayLine.setAttribute('y1', String(AXIS_H - 4));
  todayLine.setAttribute('y2', String(height));
  todayLine.setAttribute('stroke', 'var(--accent)');
  todayLine.setAttribute('stroke-width', '2');
  svg.append(todayLine);
  const todayLabel = svgEl(root, 'text');
  todayLabel.setAttribute('data-strip-today-label', '1');
  todayLabel.setAttribute('x', String(xToday + 6));
  todayLabel.setAttribute('y', String(AXIS_H - 8));
  todayLabel.setAttribute('fill', 'var(--accent)');
  todayLabel.setAttribute('font-size', '11');
  todayLabel.setAttribute('font-weight', '700');
  todayLabel.textContent = 'TODAY';
  svg.append(todayLabel);

  lanes.forEach((lane, index) => {
    const y0 = AXIS_H + index * LANE_H;
    const colour = lane.colour || MEDICAL_THREAD_COLOURS[lane.id] || 'var(--muted)';
    const label = svgEl(root, 'text');
    label.setAttribute('x', '12');
    label.setAttribute('y', String(y0 + 28));
    label.setAttribute('fill', 'var(--ink)');
    label.setAttribute('font-size', '13');
    label.setAttribute('font-weight', '700');
    label.textContent = lane.label;
    svg.append(label);

    const rail = svgEl(root, 'line');
    rail.setAttribute('x1', String(GUTTER));
    rail.setAttribute('x2', String(width - PAD_R));
    rail.setAttribute('y1', String(y0 + 40));
    rail.setAttribute('y2', String(y0 + 40));
    rail.setAttribute('stroke', 'var(--line)');
    svg.append(rail);

    drawRibbons(root, svg, lane, zoom, width, y0, colour);
    const labelBoxes = [];
    // Reserve axis TODAY label so event labels do not eat it.
    labelBoxes.push({
      x: xToday + 2,
      y: AXIS_H - 22,
      w: 48,
      h: 14
    });
    // Prefer biomarker last-point labels; event titles yield on collision.
    const ribbonBoxes = collectRibbonLabelBoxes(lane, zoom, width, y0);
    for (const box of ribbonBoxes) labelBoxes.push(box);

    const markers = [...(lane.events || [])]
      .filter(event => event.date && isCalendarDate(event.date))
      .map(event => ({ event, x: dateToX(event.date, zoom, width) }))
      .filter(({ x }) => x >= GUTTER - 8 && x <= width - PAD_R + 8)
      .sort((a, b) => a.x - b.x);

    for (const { event, x } of markers) {
      const shape = drawMarker(root, svg, event, x, y0 + 40, colour, hooks);
      const lab = placeLabel(root, svg, event, x, y0 + 40, width, labelBoxes);
      if (lab) labelBoxes.push(lab);
      shape?.addEventListener?.('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault?.();
          hooks.onSelect?.(event.id);
        }
      });
    }
  });

  return svg;
}

function collectRibbonLabelBoxes(lane, zoom, width, y0) {
  const boxes = [];
  const groups = new Map();
  for (const point of lane.markers || []) {
    if (!point.date || point.value == null) continue;
    const key = point.key || point.label;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  let offset = 0;
  for (const [, points] of groups) {
    const last = points[points.length - 1];
    if (!last?.date || !isCalendarDate(last.date)) {
      offset += 18;
      continue;
    }
    const x = dateToX(last.date, zoom, width);
    const text = `${last.value} ${last.status === 'Normal' ? '✓' : '↑'}`;
    const approxW = text.length * 6.2;
    const lx = Math.min(width - PAD_R, x + 6);
    boxes.push({
      x: lx,
      y: y0 + 58 + offset - 14,
      w: approxW,
      h: 12
    });
    offset += 18;
  }
  return boxes;
}

function drawAxis(root, svg, zoom, width) {
  const ticks = monthTicks(zoom);
  for (const tick of ticks) {
    const x = dateToX(tick.date, zoom, width);
    if (x < GUTTER || x > width - PAD_R) continue;
    const text = svgEl(root, 'text');
    text.setAttribute('data-strip-axis-tick', '1');
    text.setAttribute('x', String(x));
    text.setAttribute('y', '18');
    text.setAttribute('fill', 'var(--muted)');
    text.setAttribute('font-size', '11');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = tick.label;
    svg.append(text);
  }
}

/** Hide month ticks whose getBBox intersects TODAY (MO-21 / §4.13). */
function resolveAxisLabelCollisions(svg) {
  if (!svg?.querySelector) return;
  const today = svg.querySelector('[data-strip-today-label]');
  if (!today || typeof today.getBBox !== 'function') return;
  let todayBox;
  try {
    todayBox = today.getBBox();
  } catch {
    return;
  }
  if (!todayBox || todayBox.width <= 0) return;
  const pad = 3;
  const t = {
    x: todayBox.x - pad,
    y: todayBox.y - pad,
    w: todayBox.width + pad * 2,
    h: todayBox.height + pad * 2
  };
  const overlaps = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  for (const tick of svg.querySelectorAll('[data-strip-axis-tick]')) {
    let box;
    try {
      box = tick.getBBox();
    } catch {
      continue;
    }
    if (!box || box.width <= 0) continue;
    if (overlaps({ x: box.x, y: box.y, w: box.width, h: box.height }, t)) {
      tick.setAttribute('visibility', 'hidden');
    }
  }
}

function drawRibbons(root, svg, lane, zoom, width, y0, colour) {
  const groups = new Map();
  for (const point of lane.markers || []) {
    if (!point.date || point.value == null) continue;
    const key = point.key || point.label;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  let offset = 0;
  for (const [, points] of groups) {
    const ys = points.map(p => Number(p.value)).filter(Number.isFinite);
    if (!ys.length) continue;
    const refLow = Number(points[0].ref_low);
    const refHigh = Number(points[0].ref_high);
    const min = Math.min(...ys, Number.isFinite(refLow) ? refLow : Infinity);
    const max = Math.max(...ys, Number.isFinite(refHigh) ? refHigh : -Infinity);
    const bandY = y0 + 58 + offset;
    const h = 14;
    if (Number.isFinite(refLow) && Number.isFinite(refHigh) && max > min) {
      const band = svgEl(root, 'rect');
      band.setAttribute('x', String(GUTTER));
      band.setAttribute('y', String(bandY));
      band.setAttribute('width', String(Math.max(0, width - GUTTER - PAD_R)));
      band.setAttribute('height', String(h));
      band.setAttribute('fill', 'color-mix(in srgb, var(--success) 18%, transparent)');
      svg.append(band);
    }
    const pathParts = [];
    points.forEach((point, i) => {
      const x = dateToX(point.date, zoom, width);
      const t = max === min ? 0.5 : (Number(point.value) - min) / (max - min);
      const y = bandY + h - t * h;
      pathParts.push(`${i ? 'L' : 'M'}${x} ${y}`);
      if (i === points.length - 1) {
        const status = point.status === 'Normal' ? '✓' : '↑';
        const lab = svgEl(root, 'text');
        lab.setAttribute('x', String(Math.min(width - PAD_R, x + 6)));
        lab.setAttribute('y', String(y - 4));
        lab.setAttribute('fill', colour);
        lab.setAttribute('font-size', '10');
        lab.setAttribute('font-weight', '700');
        lab.textContent = `${point.value} ${status}`;
        svg.append(lab);
      }
    });
    if (pathParts.length) {
      const line = svgEl(root, 'path');
      line.setAttribute('d', pathParts.join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', colour);
      line.setAttribute('stroke-width', '2');
      svg.append(line);
    }
    offset += 18;
  }
}

function drawMarker(root, svg, event, x, y, colour, hooks) {
  const planned = event.planned;
  const virtual = event.virtual;
  const specialist = event.kind === 'specialist';
  let node;
  if (event.kind === 'symptom' || event.episode) {
    // Thin rounded bar for episode-ish acute markers when span unknown: small pill.
    node = svgEl(root, 'rect');
    node.setAttribute('x', String(x - 10));
    node.setAttribute('y', String(y - 4));
    node.setAttribute('width', '20');
    node.setAttribute('height', '8');
    node.setAttribute('rx', '4');
    node.setAttribute('fill', colour);
    if (planned) {
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke', colour);
      node.setAttribute('stroke-width', '2');
    }
  } else if (specialist) {
    node = svgEl(root, 'rect');
    node.setAttribute('x', String(x - 7));
    node.setAttribute('y', String(y - 7));
    node.setAttribute('width', '14');
    node.setAttribute('height', '14');
    node.setAttribute('rx', '3');
    if (planned) {
      node.setAttribute('fill', 'var(--paper)');
      node.setAttribute('stroke', colour);
      node.setAttribute('stroke-width', '2');
    } else {
      node.setAttribute('fill', colour);
    }
  } else {
    node = svgEl(root, 'circle');
    node.setAttribute('cx', String(x));
    node.setAttribute('cy', String(y));
    node.setAttribute('r', '7');
    if (virtual) {
      node.setAttribute('fill', 'var(--paper)');
      node.setAttribute('stroke', colour);
      node.setAttribute('stroke-width', '2');
      node.setAttribute('stroke-dasharray', '3 2');
    } else if (planned) {
      node.setAttribute('fill', 'var(--paper)');
      node.setAttribute('stroke', colour);
      node.setAttribute('stroke-width', '2.5');
    } else {
      node.setAttribute('fill', colour);
    }
  }
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'button');
  const when = event.planned
    ? (event.virtual ? 'virtual planned' : 'planned')
    : 'happened';
  const dateLabel = event.date ? formatDisplayDate(event.date) : '';
  node.setAttribute('aria-label', `${event.title}, ${when}${dateLabel ? `, ${dateLabel}` : ''}`);
  node.style.cursor = 'pointer';
  node.addEventListener('click', () => hooks.onSelect?.(event.id));
  node.addEventListener('mouseenter', () => showTip(svg, event, x, y));
  node.addEventListener('mouseleave', () => hideTip(svg));
  node.addEventListener('focus', () => showTip(svg, event, x, y));
  node.addEventListener('blur', () => hideTip(svg));
  svg.append(node);
  return node;
}

function placeLabel(root, svg, event, x, y, width, existing) {
  const short = String(event.title || '').split(/[—-]/)[0].trim().slice(0, 14);
  if (!short) return null;
  const nearRight = x > width - PAD_R - 60;
  const nearLeft = x < GUTTER + 40;
  let ty = y - 14;
  const approxW = short.length * 6.2;
  const makeBox = (topY) => ({
    x: nearRight ? x - approxW : nearLeft ? x : x - approxW / 2,
    y: topY - 10,
    w: approxW,
    h: 12
  });
  const collides = (a, b) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  const inBounds = (box) => box.x >= GUTTER - 4 && box.x + box.w <= width - PAD_R + 4;

  let box = makeBox(ty);
  if (!inBounds(box) || existing.some(prev => collides(box, prev))) {
    ty = y + 22;
    box = makeBox(ty);
  }
  if (!inBounds(box) || existing.some(prev => collides(box, prev))) {
    // Hide; reveal via tip on hover/focus (MO-21).
    return null;
  }
  const text = svgEl(root, 'text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(ty));
  text.setAttribute('fill', 'var(--ink)');
  text.setAttribute('font-size', '10');
  text.setAttribute('text-anchor', nearRight ? 'end' : nearLeft ? 'start' : 'middle');
  text.textContent = short;
  text.classList.add('medical-strip__label');
  svg.append(text);
  return box;
}

function showTip(svg, event, x, y) {
  hideTip(svg);
  const doc = svg.ownerDocument || globalThis.document;
  if (!doc?.createElementNS) return;
  const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('data-strip-tip', '1');
  const label = `${event.title}${event.date ? ` · ${formatDisplayDate(event.date)}` : ''}`;
  const w = Math.min(220, Math.max(80, label.length * 6.5 + 16));
  const svgW = Number(svg.getAttribute('width')) || 720;
  const tx = Math.max(GUTTER, Math.min(x - w / 2, svgW - PAD_R - w));
  const ty = Math.max(AXIS_H + 4, y - 36);
  const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(tx));
  rect.setAttribute('y', String(ty));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', '22');
  rect.setAttribute('rx', '6');
  rect.setAttribute('fill', 'var(--paper)');
  rect.setAttribute('stroke', 'var(--line)');
  const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(tx + 8));
  text.setAttribute('y', String(ty + 15));
  text.setAttribute('fill', 'var(--ink)');
  text.setAttribute('font-size', '11');
  text.textContent = label;
  g.append(rect, text);
  svg.append(g);
}

function hideTip(svg) {
  svg.querySelector?.('[data-strip-tip]')?.remove?.();
}

function collapseSummary(lanes, model) {
  const planned = (lanes || []).reduce((n, lane) => n + (lane.events || []).filter(e => e.planned).length, 0);
  const n = lanes.length;
  if (!n) return 'No threads';
  return `${n} thread${n === 1 ? '' : 's'} · ${planned} planned`;
}

function nearestZoomKey(spanDays) {
  let best = 'months';
  let bestDiff = Infinity;
  for (const [key, days] of Object.entries(ZOOM_SPANS)) {
    const diff = Math.abs(days - spanDays);
    if (diff < bestDiff) {
      best = key;
      bestDiff = diff;
    }
  }
  return best;
}

function dateToX(date, zoom, width) {
  if (!isCalendarDate(date) || !isCalendarDate(zoom.centerDate)) return GUTTER;
  const plotW = Math.max(1, width - GUTTER - PAD_R);
  const delta = daysBetween(zoom.centerDate, date);
  const t = 0.5 + delta / zoom.spanDays;
  return GUTTER + t * plotW;
}

function monthTicks(zoom) {
  if (!isCalendarDate(zoom.centerDate)) return [];
  const half = zoom.spanDays / 2;
  const start = shiftDate(zoom.centerDate, -half);
  const end = shiftDate(zoom.centerDate, half);
  const ticks = [];
  let [y, m] = start.split('-').map(Number);
  const endKey = end;
  for (let i = 0; i < 36; i += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}-01`;
    if (key > endKey) break;
    if (key >= start.slice(0, 7) + '-01') {
      const label = zoom.spanDays > 400
        ? `${MONTHS[m - 1]} ’${String(y).slice(-2)}`
        : MONTHS[m - 1];
      ticks.push({ date: key, label });
    }
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return ticks;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function shiftDate(dateKey, days) {
  if (!isCalendarDate(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.round(days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function svgEl(root, tag) {
  const doc = root.ownerDocument || globalThis.document;
  if (doc?.createElementNS) return doc.createElementNS('http://www.w3.org/2000/svg', tag);
  const node = root.createElement?.(tag) || doc.createElement(tag);
  return node;
}

function readOpenDefault() {
  try {
    const raw = globalThis.localStorage?.getItem?.(STORAGE_OPEN);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch { /* ignore */ }
  if (typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches) return false;
  return true;
}

function writeOpen(open) {
  try {
    globalThis.localStorage?.setItem?.(STORAGE_OPEN, open ? '1' : '0');
  } catch { /* ignore */ }
}
