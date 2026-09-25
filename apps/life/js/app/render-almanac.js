/**
 * Almanac, the fifth calendar zoom. Mounts once from GET /api/almanac.
 * apply() is the only function that writes geometry. Numbers stay on the server.
 */
import { createMotion, EASE, OVERSHOOT } from '../../../../packages/design-kit/js/hub-motion-engine.js';
import { ALM } from '../../../../packages/design-kit/js/almanac-geometry.js';
import { addDays, addMonths, daysBetween } from '../../../../packages/design-kit/js/lead-lines.js';
import { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';
import { applyHubPillsThumb } from '../../../../packages/design-kit/js/hub-motion.js';
import { ALMANAC_WANTS } from './almanac-rules.js';
import { getSydneyDateKey } from '../core/time.js';

const NS = 'http://www.w3.org/2000/svg';
const WANT_WHY = Object.fromEntries(ALMANAC_WANTS.map(want => [want.id, want.why]));
const HOLD_LABEL = {
  'good-night': 'Hold it',
  'keep-empty': 'Wall it',
  newcastle: 'Hold both days'
};
/** Layout-contract notes. Drawn only when that day is in the server series. */
const WAVE_NOTES = [
  ['2026-10-03', 'holidays refill you', -10],
  ['2026-11-22', 'report-writing dip (your T2 pattern)', 20],
  ['2026-12-31', 'Korea', -10]
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Reference habit card. It is not on the Almanac API; the session count is still computed. */
const HABIT = Object.freeze({
  id: 'korean',
  title: 'Korean for travellers',
  minutes: 20,
  perWeek: 3,
  from: '2026-09-28',
  until: '2026-12-23',
  why: 'Enough to order, ask directions and get home: comforting adventure.'
});

const nodes = new Map();
const state = { done: new Set(), tasked: new Set(), held: new Set(), phone: false };
let engine = null;
let observer = null;
let phoneQuery = null;
let phoneListener = null;
let generation = 0;
let current = null;
let measureCtx = null;
const measured = new Map();

const WD = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const DOW = date => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][WD(date)];
const dd = date => formatDisplayDate(date).slice(0, 5);

function textW(text) {
  let width = measured.get(text);
  if (width == null) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = ALM.beadFont;
    width = measureCtx.measureText(text).width;
    measured.set(text, width);
  }
  return width;
}

/** Longest prefix of `text` (ending in …) that fits `max` px. */
function fitText(text, max) {
  if (textW(text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textW(text.slice(0, mid).trimEnd() + '…') <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo).trimEnd() + '…' : '';
}

function monthName(date) {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
}

function monthFirsts(from, to) {
  const out = [];
  if (!from || !to) return out;
  let cursor = `${from.slice(0, 7)}-01`;
  if (cursor <= from) cursor = addMonths(cursor, 1);
  while (cursor < to) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

function termNumber(anchor, terms) {
  const fromId = /^term-(\d+)$/.exec(anchor.id ?? '');
  if (fromId) return fromId[1];
  const named = /term\s*(\d+)/i.exec(anchor.title ?? '');
  if (named) return named[1];
  return terms.find(term => term.starts_on === anchor.date)?.term ?? '';
}

function placeName(anchor) {
  return String(anchor?.title ?? '').split(/[\s·]/)[0];
}

function horizonTrip(lines, horizon) {
  return lines.map(line => line.anchor).find(anchor => anchor?.kind === 'trip' && anchor.returns === horizon) ?? null;
}

function periodCopy(view) {
  const place = placeName(horizonTrip(view.lines, view.to));
  const weeks = Math.max(0, Math.round(daysBetween(view.from, view.to) / 7));
  return {
    title: place ? `The Almanac · until you\u2019re home from ${place}` : 'The Almanac',
    span: `${formatDisplayDate(view.from)} \u2192 ${formatDisplayDate(view.to)} · ${weeks} week${weeks === 1 ? '' : 's'}`
  };
}

function whenText(opening) {
  const [start, end] = opening.dates;
  if (end) return `${DOW(start)} ${dd(start).slice(0, 2)} \u2013 ${DOW(end)} ${dd(end)}`;
  if (opening.span === 'evening') return `${DOW(start)} ${dd(start)} · 6\u201310 pm`;
  if (opening.span === 'lunch') return `${DOW(start)} ${dd(start)} · lunch`;
  return `${DOW(start)} ${dd(start)} · all day`;
}

function present(body) {
  const from = body.from;
  const horizon = typeof body.horizon === 'string' && body.to && body.horizon < body.to ? body.horizon : body.to;
  return {
    today: body.today || from,
    from,
    to: horizon,
    terms: Array.isArray(body.terms) ? body.terms : [],
    lines: body.lines ?? [],
    summary: body.summary ?? { unbooked: 0, lastSafeSoon: 0, openings: 0 },
    series: (body.series ?? []).filter(point => point.date >= from && point.date <= horizon),
    openings: body.openings ?? [],
    world: (body.world ?? []).filter(entry => entry.date >= from && entry.date <= horizon)
  };
}

/** The only function that writes geometry or motion values. */
function apply(id, props) {
  const node = nodes.get(id);
  if (id === '__toast' || id === '__pop') {
    if (!node) return;
    node.style.opacity = String(props.opacity);
    node.style.transform = `translateY(${props.y}px)`;
    return;
  }
  if (id === 'wave') {
    nodes.get('wave-clip')?.setAttribute('width', String(props.w));
    return;
  }
  if (id.startsWith('stat:')) {
    if (node) node.textContent = String(Math.round(props.n));
    return;
  }
  if (id.startsWith('rail:')) {
    if (!node) return;
    const from = Number(node.dataset.from);
    const to = Number(node.dataset.to);
    node.setAttribute('x1', String(to + (from - to) * props.draw));
    return;
  }
  if (id.startsWith('bead:')) {
    if (!node) return;
    node.setAttribute('transform', `scale(${props.scale})`);
    node.style.opacity = String(props.opacity);
  }
  if (id.startsWith('open:')) node?.style.setProperty('--held', String(props.held));
}

function openPop() {}
function closePop() {}
function addTask() {}
function markDone() {}

function publish(win) {
  const hostname = win?.location?.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
  win.__almanac = {
    state,
    ALM,
    lines: () => current?.lines ?? [],
    summary: () => current?.summary ?? { unbooked: 0, lastSafeSoon: 0, openings: 0 },
    openings: current?.openings ?? [],
    series: current?.series ?? [],
    openPop,
    closePop,
    addTask,
    markDone,
    finish: () => engine?.finish(),
    stats: () => engine?.stats()
  };
}

function paint(doc, host, view, options) {
  engine?.dispose();
  engine = null;
  nodes.clear();
  const win = doc.defaultView;
  state.phone = win?.matchMedia?.('(max-width: 719px)')?.matches === true;
  current = view;
  host.replaceChildren();

  const dates = view.series.map(point => point.date);
  const N = dates.length;
  const indexOf = new Map(dates.map((date, index) => [date, index]));
  let DX = N > 1 ? (ALM.width - ALM.rightPad - ALM.x0) / (N - 1) : 0;
  const idx = date => (indexOf.has(date) ? indexOf.get(date) : daysBetween(dates[0], date));
  const X = date => ALM.x0 + (N ? Math.max(0, Math.min(N - 1, idx(date))) * DX : 0);
  function setWidth(width) {
    ALM.width = Math.round(width);
    DX = N > 1 ? (ALM.width - ALM.rightPad - ALM.x0) / (N - 1) : 0;
  }

  const el = (tag, cls, parent, attrs = {}) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent?.appendChild(node);
    return node;
  };
  const s = (tag, attrs, parent, text) => {
    const node = doc.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text != null) node.textContent = text;
    parent.appendChild(node);
    return node;
  };

  const period = periodCopy(view);
  const root = el('section', 'alm', host, { 'data-part': 'almanac', 'aria-label': 'Almanac' });
  const nav = el('header', 'alm__nav', root, { 'data-part': 'nav' });
  const earlier = el('button', 'alm__round', nav, { type: 'button', 'aria-label': 'Earlier' });
  earlier.innerHTML = '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>';
  const periodNode = el('div', 'alm__period', nav, { 'data-part': 'period' });
  const periodTitle = el('b', '', periodNode);
  periodTitle.textContent = period.title;
  const periodSpan = el('span', '', periodNode);
  periodSpan.textContent = period.span;
  const later = el('button', 'alm__round', nav, { type: 'button', 'aria-label': 'Later' });
  later.innerHTML = '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>';
  const todayButton = el('button', 'btn btn--secondary', nav, { type: 'button' });
  todayButton.textContent = 'Today';
  const zoom = el('div', 'hub-pills', nav, { role: 'group', 'aria-label': 'Zoom', 'data-part': 'zoom-pills' });
  zoom.innerHTML = '<span class="hub-pills__thumb"></span>';
  for (const name of ['Day', 'Week', 'Term', 'Year', 'Almanac']) {
    const pressed = name === 'Almanac';
    const button = el('button', `hub-pills__btn${pressed ? ' is-active' : ''}`, zoom, {
      type: 'button',
      'aria-pressed': String(pressed),
      'data-zoom': name.toLowerCase()
    });
    button.textContent = name;
  }
  el('div', 'alm__spacer', nav);
  const ask = el('div', 'alm__ask', nav);
  const askMark = el('span', 'alm-av', ask);
  askMark.textContent = 'H';
  ask.append(doc.createTextNode('What am I forgetting?'));

  const card = el('div', 'alm__card', root, { 'data-part': 'card' });
  const top = el('div', 'alm-top', card, { 'data-part': 'summary' });
  const thesis = el('div', 'alm-top__thesis', top);
  thesis.textContent = 'Every calendar remembers what you booked. This one remembers what you’ll wish you had.';
  const sum = view.summary;
  for (const [id, n, label, tone] of [
    ['unbooked', sum.unbooked, 'due now that nobody booked', 'warn'],
    ['soon', sum.lastSafeSoon, 'last safe days in the next 5 weeks', ''],
    ['openings', sum.openings, 'openings that fit you', 'ok']
  ]) {
    const cell = el('div', 'alm-top__stat', top, { 'data-part': `stat-${id}` });
    const value = el('div', `alm-top__n${tone ? ` is-${tone}` : ''}`, cell);
    value.textContent = String(n);
    nodes.set(`stat:${id}`, value);
    const caption = el('small', '', cell);
    caption.textContent = label;
  }

  if (!state.phone && N > 1) mountChart();
  else if (state.phone) mountList(card);
  mountOpenings(card);

  nodes.set('__toast', el('div', 'alm-toast', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'alm-pop', root, { role: 'dialog', 'data-part': 'popover', hidden: '' }));
  nodes.set('__live', el('div', 'alm-sr', root, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply });
  engine.place('__toast', { opacity: 0, y: ALM.toastRise });
  engine.place('__pop', { opacity: 0, y: ALM.popRise });
  for (const id of ['unbooked', 'soon', 'openings']) {
    engine.place(`stat:${id}`, { n: Number(nodes.get(`stat:${id}`)?.textContent) });
  }
  entrance();
  win?.requestAnimationFrame?.(() => applyHubPillsThumb(zoom));
  root.addEventListener('click', event => {
    const button = event.target.closest?.('[data-zoom]');
    if (!button) return;
    const name = button.getAttribute('data-zoom');
    if (name === 'day' || name === 'week') options.onSwitchView?.(name);
  });
  publish(win);

  function mountChart() {
    const width = card.clientWidth || host.clientWidth;
    if (width > 1) setWidth(width);
    const chartH = ALM.lanes.top + view.lines.length * ALM.lanes.rowH + 8;
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${ALM.width} ${chartH}`);
    svg.setAttribute('width', String(ALM.width));
    svg.setAttribute('height', String(chartH));
    svg.setAttribute('class', 'alm-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Almanac chart: world, anchors, capacity forecast and last safe days to ${formatDisplayDate(view.to)}`);
    svg.setAttribute('data-part', 'chart');
    card.appendChild(svg);
    const g = cls => s('g', { class: cls }, svg);
    const back = g('alm-layer-back');
    const trip = horizonTrip(view.lines, view.to);
    for (const [start, end] of holidaySpans(view.terms, view, trip?.date)) {
      s('rect', {
        class: 'alm-holiday',
        x: X(start),
        y: 30,
        width: Math.max(0, X(end) - X(start)),
        height: 610
      }, back);
    }
    if (trip?.date && trip.returns) {
      s('rect', {
        class: 'alm-wall',
        x: X(trip.date),
        y: 98,
        width: Math.max(0, X(trip.returns) + 6 - X(trip.date)),
        height: 542,
        'data-part': 'wall'
      }, back);
    }
    const firsts = monthFirsts(view.from, view.to);
    for (const date of firsts) {
      s('line', { class: 'alm-month', x1: X(date), x2: X(date), y1: 8, y2: 640 }, back);
      s('text', { class: 'alm-t-month', x: X(date) + 6, y: ALM.months.y }, back, monthName(date));
    }
    if (firsts.length && X(firsts[0]) - ALM.x0 >= 60) {
      s('text', { class: 'alm-t-month', x: ALM.x0 + 30, y: ALM.months.y }, back, monthName(view.from));
    }
    for (const tier of tierSpans(view.terms, view.lines.map(line => line.anchor), view)) {
      const x = X(tier.from);
      const widthPx = X(tier.to) - X(tier.from);
      if (widthPx <= 0) continue;
      s('rect', { class: `alm-tier ${tier.cls}`, x: x + 2, y: ALM.tiers.y, width: widthPx - 4, height: ALM.tiers.h, rx: 6 }, back);
      if (widthPx > 60) s('text', { class: `alm-t-tier ${tier.cls}`, x: x + 10, y: ALM.tiers.y + 13 }, back, tier.label);
    }
    s('line', { class: 'alm-labelrule', x1: ALM.x0 - 12, x2: ALM.x0 - 12, y1: 0, y2: 640 }, back);
    const lab = (y, title, sub) => {
      s('text', { class: 'alm-t-lab', x: ALM.labelX, y }, back, title);
      s('text', { class: 'alm-t-sub', x: ALM.labelX, y: y + 16 }, back, sub);
    };
    lab(72, 'The world', 'BOM · NSW · NESA · listings');
    lab(118, 'Anchors', 'things already fixed');
    lab(186, 'Forecast you', 'capacity from your logs');

    const world = g('alm-layer-world');
    for (const entry of view.world) {
      const y = ALM.world.rows[entry.row];
      if (y == null) continue;
      s('circle', { class: 'alm-world-dot', cx: X(entry.date), cy: y - 4, r: 3.5 }, world);
      s('text', { class: 'alm-t-world', x: X(entry.date) + 8, y }, world, entry.title);
      if (entry.sub) {
        s('text', { class: 'alm-t-sub', x: X(entry.date) + 8, y: y + 13 }, world, `${entry.sub}${entry.example ? ' · example' : ''}`);
      }
    }

    const anchors = g('alm-layer-anchors');
    const flags = collectFlags(view.lines, view.terms, view, trip?.id);
    flags.forEach((flag, index) => {
      const x = X(flag.date);
      const y = ALM.anchors.rows[index % 2];
      s('path', { class: 'alm-flag', d: `M${x} ${y + 6} V${y - 12} l9 4 -9 4` }, anchors);
      s('text', { class: 'alm-t-anchor', x: x + 13, y: y - 2 }, anchors, flag.title);
      s('text', { class: 'alm-t-sub', x: x + 13, y: y + 11 }, anchors, flag.sub);
    });
    if (trip?.date && trip.returns) {
      const pill = s('g', { transform: `translate(${Math.min(X(trip.date) + 6, ALM.width - ALM.rightPad - 150)} 106)` }, anchors);
      s('rect', { class: 'alm-pill', width: 150, height: 20, rx: 10 }, pill);
      s('text', { class: 'alm-t-pill', x: 75, y: 14 }, pill, `${placeName(trip)} · ${dd(trip.date)} \u2013 ${dd(trip.returns)}`);
    }

    const clip = s('clipPath', { id: 'alm-reveal' }, s('defs', {}, svg));
    nodes.set('wave-clip', s('rect', { x: 0, y: 0, width: 0, height: 640 }, clip));
    const wave = s('g', { class: 'alm-layer-wave', 'clip-path': 'url(#alm-reveal)', 'data-part': 'forecast' }, svg);
    const Y = value => ALM.wave.base - (Number(value) / 100) * ALM.wave.h;
    const pt = (index, value) => `${(ALM.x0 + index * DX).toFixed(1)} ${Y(value).toFixed(1)}`;
    const up = view.series.map((point, index) => `${index ? 'L' : 'M'}${pt(index, point.high)}`).join(' ');
    const down = view.series.map((point, index) => [index, point]).reverse().map(([index, point]) => `L${pt(index, point.low)}`).join(' ');
    const line = view.series.map((point, index) => `${index ? 'L' : 'M'}${pt(index, point.pct)}`).join(' ');
    s('path', { class: 'alm-wave-area', d: `${line} L${pt(N - 1, 0)} L${pt(0, 0)} Z` }, wave);
    s('path', { class: 'alm-wave-band', d: `${up} ${down} Z` }, wave);
    s('line', { class: 'alm-wave-soften', x1: ALM.x0, x2: X(view.to), y1: Y(ALM.wave.softenPct), y2: Y(ALM.wave.softenPct) }, wave);
    s('text', { class: 'alm-t-soften', x: X(view.to), y: Y(ALM.wave.softenPct) + 14 }, wave, '40%');
    s('path', { class: 'alm-wave-line', d: line }, wave);
    s('line', { class: 'alm-wave-base', x1: ALM.x0, x2: X(view.to), y1: ALM.wave.base, y2: ALM.wave.base }, wave);
    for (const [date, text, dy] of WAVE_NOTES) {
      if (!indexOf.has(date)) continue;
      s('text', { class: 'alm-t-wave', x: X(date), y: Y(view.series[idx(date)].pct) + dy }, wave, text);
    }
    for (const opening of view.openings) {
      for (const date of opening.dates) {
        if (!indexOf.has(date)) continue;
        s('circle', { class: 'alm-open-dot', cx: X(date), cy: Y(view.series[idx(date)].pct), r: 4.5, 'data-part': 'opening-dot' }, wave);
      }
    }

    s('line', { class: 'alm-divider', x1: 0, x2: ALM.width, y1: ALM.lanes.divider, y2: ALM.lanes.divider }, svg);
    s('text', { class: 'alm-t-caps', x: ALM.labelX, y: ALM.lanes.label }, svg, 'LAST SAFE DAYS');
    const lanes = s('g', { class: 'alm-layer-lanes' }, svg);
    view.lines.forEach((lead, row) => {
      const anchor = lead.anchor;
      const y = ALM.lanes.top + row * ALM.lanes.rowH;
      const cy = y + 22;
      const lane = s('g', { class: `alm-lane is-${anchor.kind}`, 'data-part': 'lead-line', 'data-anchor': anchor.id }, lanes);
      s('line', { class: 'alm-lane-rule', x1: 0, x2: ALM.width, y1: y + ALM.lanes.rowH - 2, y2: y + ALM.lanes.rowH - 2 }, lane);
      s('text', { class: 'alm-t-lab', x: ALM.labelX, y: cy - 2 }, lane, anchor.title);
      s('text', { class: 'alm-t-sub', x: ALM.labelX, y: cy + 13 }, lane, anchor.sub ?? '');
      if (anchor.window) {
        s('rect', {
          class: 'alm-window',
          x: X(anchor.window.opens),
          y: cy - 7,
          width: Math.max(0, X(anchor.window.closes) - X(anchor.window.opens)),
          height: 14,
          rx: 7
        }, lane);
        s('text', { class: 'alm-t-sub', x: X(anchor.window.closes) + 8, y: cy + 4 }, lane, `window closes ${dd(anchor.window.closes)}`);
      } else if (anchor.kind === 'dream') {
        s('line', { class: 'alm-dream', x1: X(lead.from), x2: X(view.to), y1: cy, y2: cy }, lane);
        s('text', { class: 'alm-t-dream', x: X(view.to), y: cy + 18 }, lane, `\u2192 ${view.to.slice(0, 4)}`);
      } else if (anchor.date) {
        nodes.set(`rail:${anchor.id}`, s('line', {
          class: 'alm-rail',
          x1: X(anchor.date),
          x2: X(anchor.date),
          y1: cy,
          y2: cy,
          'data-from': X(lead.from),
          'data-to': X(anchor.date)
        }, lane));
        const dx = X(anchor.date);
        s('rect', {
          class: 'alm-anchor',
          x: dx - 6,
          y: cy - 6,
          width: 12,
          height: 12,
          rx: 2,
          transform: `rotate(45 ${dx} ${cy})`
        }, lane);
      }
      const xs = lead.steps.map(step => X(step.lastSafe));
      const isRight = x => x > ALM.width - ALM.rightPad - ALM.labelRoom;
      const budget = (k, right) => {
        const same = xs.filter((_, j) => j % 2 === k % 2 && j !== k);
        if (right) {
          const prev = same.filter(value => value < xs[k]).pop();
          const limit = prev == null ? ALM.x0 : isRight(prev) ? prev + ALM.labelGap : (prev + xs[k]) / 2 + ALM.labelGap / 2;
          return xs[k] - 10 - limit;
        }
        const next = same.find(value => value > xs[k]);
        const limit = next == null ? ALM.width - ALM.rightPad : isRight(next) ? (xs[k] + next) / 2 - ALM.labelGap / 2 : next - ALM.labelGap;
        return limit - (xs[k] - 4);
      };
      lead.steps.forEach((step, k) => {
        const x = X(step.lastSafe);
        const bead = s('g', {
          class: `alm-bead is-${step.status}`,
          transform: `translate(${x} ${cy})`,
          tabindex: 0,
          role: 'button',
          'data-part': 'bead',
          'data-step': step.id,
          'data-status': step.status,
          'aria-label': `${step.title}. Last safe day ${formatDisplayDate(step.lastSafe)}.`
        }, lane);
        const inner = s('g', { class: 'alm-bead__shape' }, bead);
        s('circle', { class: 'alm-bead__halo', r: ALM.bead.haloR }, inner);
        s('rect', {
          class: 'alm-bead__diamond',
          x: -ALM.bead.diamond,
          y: -ALM.bead.diamond,
          width: ALM.bead.diamond * 2,
          height: ALM.bead.diamond * 2,
          rx: 2,
          transform: 'rotate(45)'
        }, inner);
        s('circle', { class: 'alm-bead__dot', r: step.status === 'now' ? ALM.bead.nowR : ALM.bead.r }, inner);
        s('path', { class: 'alm-bead__tick', d: 'M-3 0.2 -1 2.2 3.2 -2' }, inner);
        const above = k % 2 === 0;
        const right = isRight(x);
        const lx = right ? x - 10 : x + (step.lastSafe === view.today ? 12 : -4);
        s('text', { class: `alm-t-bead${right ? ' is-end' : ''}`, x: lx, y: above ? cy - 12 : cy + 21 }, lane, fitText(step.title, budget(k, right)));
        nodes.set(`bead:${step.id}`, inner);
        nodes.set(`beadg:${step.id}`, bead);
      });
    });

    const today = s('g', { class: 'alm-today', 'data-part': 'today' }, svg);
    s('line', { x1: X(view.today), x2: X(view.today), y1: 16, y2: 640 }, today);
    s('rect', { x: X(view.today) - 26, y: 0, width: 52, height: 18, rx: 9 }, today);
    s('text', { x: X(view.today), y: 13 }, today, 'Today');
  }

  function mountList(parent) {
    const list = el('div', 'alm-list', parent, { 'data-part': 'lead-list' });
    const caps = el('p', 'alm-list__caps', list);
    caps.textContent = 'Last safe days';
    for (const lead of view.lines) {
      const anchor = lead.anchor;
      const item = el('section', `alm-list__line is-${lead.status}`, list, { 'data-part': 'lead-line', 'data-anchor': anchor.id });
      const heading = el('h3', '', item);
      heading.textContent = anchor.title ?? '';
      const sub = el('p', '', item);
      sub.textContent = anchor.sub ?? '';
      for (const step of lead.steps) {
        const button = el('button', `alm-list__step is-${step.status}`, item, {
          type: 'button',
          'data-part': 'bead',
          'data-step': step.id,
          'data-status': step.status
        });
        el('span', 'alm-list__dot', button);
        const title = el('span', 'alm-list__t', button);
        title.textContent = step.title;
        const when = el('span', 'alm-list__d', button);
        when.textContent = step.status === 'now' ? 'now' : dd(step.lastSafe);
      }
    }
  }

  function mountOpenings(parent) {
    const wrap = el('div', 'alm-opens', parent, { 'data-part': 'openings' });
    const heading = el('h4', '', wrap);
    heading.textContent = 'Openings · free, high-capacity windows held for you';
    for (const opening of view.openings) {
      if (!opening.dates?.length) continue;
      const corey = opening.with === 'corey';
      const article = el('article', `alm-open${corey ? ' is-corey' : ''}`, wrap, { 'data-part': 'opening', 'data-want': opening.wantId });
      const when = el('div', 'alm-open__when', article);
      const whenLabel = el('span', '', when);
      whenLabel.textContent = whenText(opening);
      const pct = el('b', '', when);
      pct.textContent = `${opening.pct}%`;
      const title = el('h5', '', article);
      if (corey) el('span', 'alm-mark', title);
      title.append(doc.createTextNode(opening.title ?? ''));
      const why = el('p', '', article);
      why.textContent = WANT_WHY[opening.wantId] ?? '';
      const buttons = el('div', 'alm-open__btns', article);
      const hold = HOLD_LABEL[opening.wantId];
      if (hold && opening.ids?.hold) {
        const button = el('button', 'btn btn--primary', buttons, { type: 'button', 'data-open': opening.wantId, 'data-act': 'hold' });
        button.textContent = hold;
      }
      if (opening.ids?.draft) {
        const button = el('button', `btn ${opening.wantId === 'bob' ? 'btn--primary' : 'btn--secondary'}`, buttons, {
          type: 'button',
          'data-open': opening.wantId,
          'data-act': 'draft'
        });
        button.textContent = 'Draft a message';
      }
      nodes.set(`open:${opening.wantId}`, article);
    }
    const sessions = Math.round(daysBetween(HABIT.from, HABIT.until) / 7 * HABIT.perWeek);
    const habit = el('article', 'alm-open is-habit', wrap, { 'data-part': 'opening', 'data-want': HABIT.id });
    const habitWhen = el('div', 'alm-open__when', habit);
    const habitSpan = el('span', '', habitWhen);
    habitSpan.textContent = `Hol W1 \u2192 ${dd(HABIT.until)}`;
    const habitBadge = el('b', '', habitWhen);
    habitBadge.textContent = 'habit';
    const habitTitle = el('h5', '', habit);
    habitTitle.textContent = HABIT.title;
    const habitWhy = el('p', '', habit);
    habitWhy.textContent = `${HABIT.minutes} min, ${HABIT.perWeek} times a week is about ${sessions} sessions before Seoul. ${HABIT.why}`;
    const habitButtons = el('div', 'alm-open__btns', habit);
    const plan = el('button', 'btn btn--secondary', habitButtons, { type: 'button', 'data-open': 'korean', 'data-act': 'plan' });
    plan.textContent = 'Plan it with Hammond';
  }

  function entrance() {
    if (!state.phone && nodes.has('wave-clip')) {
      engine.place('wave', { w: 0 });
      engine.to('wave', { w: ALM.width }, { duration: ALM.waveRevealMs, easing: EASE });
      view.lines.forEach((lead, row) => {
        const id = lead.anchor?.id;
        if (id && nodes.has(`rail:${id}`)) {
          engine.place(`rail:${id}`, { draw: 0 });
          engine.to(`rail:${id}`, { draw: 1 }, { duration: ALM.enterDrawMs, delay: row * ALM.enterStagger, easing: EASE });
        }
        lead.steps.forEach((step, k) => {
          engine.enter(`bead:${step.id}`, { opacity: 1, scale: 1 }, {
            from: { opacity: 0, scale: 0.4 },
            delay: row * ALM.enterStagger + ALM.enterDrawMs * 0.5 + k * ALM.beadStagger,
            duration: ALM.beadPopMs,
            easing: OVERSHOOT
          });
        });
      });
    } else {
      engine.place('wave', { w: ALM.width });
    }
    for (const opening of view.openings) {
      if (nodes.has(`open:${opening.wantId}`)) engine.place(`open:${opening.wantId}`, { held: 0 });
    }
  }
}

function holidaySpans(terms, range, wallFrom) {
  const sorted = [...terms].filter(term => term.starts_on && term.ends_on).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const spans = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = addDays(sorted[i].ends_on, 1);
    const end = sorted[i + 1].starts_on;
    if (start < end && end >= range.from && start <= range.to) spans.push([start, end]);
  }
  const clip = wallFrom && wallFrom > range.from ? wallFrom : range.to;
  const last = sorted.filter(term => addDays(term.ends_on, 1) < clip).at(-1);
  if (last) {
    const start = addDays(last.ends_on, 1);
    if (start < clip && start <= range.to) spans.push([start, clip]);
  }
  return spans;
}

function tierSpans(terms, anchors, range) {
  const sorted = [...terms].filter(term => term.starts_on && term.ends_on).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const tiers = [];
  const visible = sorted.filter(term => term.starts_on >= range.from && term.starts_on <= range.to);
  for (const term of visible) {
    const prev = sorted.filter(item => item.ends_on < term.starts_on).at(-1);
    if (prev) {
      const start = addDays(prev.ends_on, 1);
      if (start < term.starts_on) tiers.push({ from: start, to: term.starts_on, label: 'HOLIDAYS', cls: 'is-hol' });
    }
    const anchor = anchors.find(item => item?.kind === 'term' && (item.date === term.starts_on || item.id === `term-${term.term}`));
    const oneClass = anchor && /one class/i.test(`${anchor.title ?? ''} ${anchor.sub ?? ''}`);
    tiers.push({
      from: term.starts_on,
      to: addDays(term.ends_on, 1),
      label: `TERM ${term.term}${oneClass ? ' · ONE CLASS' : ''}`,
      cls: 'is-term'
    });
  }
  const last = visible.at(-1);
  if (last) {
    const start = addDays(last.ends_on, 1);
    if (start < range.to) tiers.push({ from: start, to: range.to, label: 'SUMMER', cls: 'is-hol' });
  }
  return tiers;
}

function collectFlags(lines, terms, range, tripId) {
  const flags = [];
  for (const lead of lines) {
    const anchor = lead.anchor;
    if (!anchor?.date || anchor.kind === 'dream' || anchor.id === tripId) continue;
    if (anchor.date < range.from || anchor.date > range.to) continue;
    if (anchor.kind === 'event') flags.push({ date: anchor.date, title: anchor.title, sub: dd(anchor.date) });
    else if (anchor.kind === 'term') flags.push({ date: anchor.date, title: `T${termNumber(anchor, terms)} starts`, sub: dd(anchor.date) });
    else if (anchor.kind === 'trip') flags.push({ date: anchor.date, title: anchor.title, sub: `from ${dd(anchor.date)}` });
  }
  for (const term of terms) {
    if (!term.starts_on || !term.ends_on) continue;
    if (term.starts_on < range.from || term.starts_on > range.to) continue;
    if (term.ends_on < range.from || term.ends_on > range.to) continue;
    flags.push({ date: term.ends_on, title: `T${term.term} ends`, sub: dd(term.ends_on) });
  }
  flags.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return flags;
}

function teardown() {
  engine?.dispose();
  engine = null;
  observer?.disconnect();
  observer = null;
  if (phoneQuery && phoneListener) phoneQuery.removeEventListener('change', phoneListener);
  phoneQuery = null;
  phoneListener = null;
  nodes.clear();
}

function bindWatchers(doc, host, isCurrent, repaint) {
  if (!observer && typeof ResizeObserver === 'function') {
    let lastW = 0;
    observer = new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (lastW && Math.abs(width - lastW) > 2 && isCurrent() && !state.phone) {
        requestAnimationFrame(() => { if (isCurrent()) repaint(); });
      }
      lastW = width;
    });
    observer.observe(host);
  }
  const view = doc.defaultView;
  if (!phoneQuery && view?.matchMedia) {
    phoneQuery = view.matchMedia('(max-width: 719px)');
    phoneListener = () => { if (isCurrent()) repaint(); };
    phoneQuery.addEventListener?.('change', phoneListener);
  }
}

function showUnavailable(doc, host) {
  host.replaceChildren();
  const note = doc.createElement('p');
  note.textContent = 'Almanac unavailable.';
  host.append(note);
}

async function load(token, doc, host, options) {
  try {
    const today = getSydneyDateKey(options.now ?? new Date());
    const { API_BASE_URL } = await import('./config.js');
    if (token !== generation) return;
    const response = await fetch(`${API_BASE_URL}/api/almanac?from=${today}&to=${addDays(today, 365)}`, {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('almanac');
    const body = await response.json();
    if (!body?.ok || !Array.isArray(body.lines) || !Array.isArray(body.series)) throw new Error('almanac');
    await (doc.fonts?.ready ?? Promise.resolve());
    if (token !== generation) return;
    const view = present(body);
    const repaint = () => {
      if (token !== generation) return;
      paint(doc, host, view, options);
    };
    bindWatchers(doc, host, () => token === generation, repaint);
    repaint();
  } catch {
    if (token !== generation) return;
    showUnavailable(doc, host);
  }
}

export function renderAlmanac(doc, host, options = {}) {
  teardown();
  const token = ++generation;
  host.style.minWidth = '0';
  if (host.parentElement) host.parentElement.style.minWidth = '0';
  host.replaceChildren();
  void load(token, doc, host, options);
}

export function unmountAlmanac() {
  generation += 1;
  teardown();
}
