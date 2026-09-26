/**
 * Term River: the Term and Year zoom stops. The term (or the year) drawn as identity
 * lanes, a body capacity line underneath and a weekly load strip.
 *
 * Structure follows docs/proposals/calendar-reference/term-river/src/river-ref.ts:
 * mount builds the DOM once, every positioned thing registers a placer, the `__zoom`
 * entity's apply calls every placer with the blended scale X = A + (B − A) × t, and
 * apply(id, props) is the only function that writes geometry.
 *
 * Sections: 1 Constants · 2 Model · 3 Mount · 4 Render · 5 Interaction.
 */
import { createMotion, EASE } from '../../../../packages/design-kit/js/hub-motion-engine.js';
import { TR } from '../../../../packages/design-kit/js/term-river-geometry.js';
import { addDaysKey, buildTimeScale } from '../../../../packages/design-kit/js/school-time.js';
import { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';
import { applyHubPillsThumb } from '../../../../packages/design-kit/js/hub-motion.js';
import { LANES, byLane, riverWeekLabel, weeklyLoad, weeksBetween } from './term-river.js';
import { forecastSeries } from './capacity-model.js';
import { acceptPlan } from './ghost-writes.js';

/* ======================================================================== 1. Constants */

const NS = 'http://www.w3.org/2000/svg';
const ZOOM_PILLS = ['Day', 'Week', 'Term', 'Year', 'Almanac'];
const ICON = {
  prev: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>'
};
const WEEK_FONT = '600 12px Inter, ui-sans-serif, sans-serif';
const DATE_FONT = '400 11px Inter, ui-sans-serif, sans-serif';
const TIER_FONT = '600 10.5px Inter, sans-serif';
const HUM_FONT = '400 11px Inter, ui-sans-serif, sans-serif';
/** The zoom ranges the reference uses when the visual payload carries none. */
const DEFAULT_ZOOMS = {
  term: { from: '2026-09-14', to: '2026-11-01', holidayFactor: 0.65 },
  year: { from: '2026-07-20', to: '2027-01-10', holidayFactor: 0.5 }
};
/** The reveal owns the chart for this long: data and resize re-layouts wait for it. */
const ENTRANCE_GUARD_MS = TR.revealMs + 120;

/** Text is measured once through a cache, never in the frame loop. */
let measureCtx;
const measured = new Map();
function textW(text, font) {
  const cacheKey = `${font}|${text}`;
  let width = measured.get(cacheKey);
  if (width == null) {
    if (measureCtx === undefined) measureCtx = doc?.createElement?.('canvas')?.getContext?.('2d') ?? null;
    if (!measureCtx) return String(text).length * 6.2; // no canvas (tests): a rough width keeps layout sane
    measureCtx.font = font;
    width = measureCtx.measureText(text).width;
    measured.set(cacheKey, width);
  }
  return width;
}

/** Longest prefix that fits `max` px, ending in "…". The full title stays in the popover and aria-label. */
function fitText(text, max, font = TR.font) {
  const value = String(text ?? '');
  if (max <= 12) return '';
  if (!value || textW(value, font) <= max) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textW(value.slice(0, mid).trimEnd() + '…', font) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? value.slice(0, lo).trimEnd() + '…' : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ======================================================================== 2. Model */

const state = { zoom: 'term', accepted: new Set(), dismissed: new Set(), phone: false, toast: null };
const busy = new Set();
const nodes = new Map();
/** Every positioned thing registers a placer; apply('__zoom') calls them all with the blended scale. */
let placers = [];

let doc = null;
let host = null;
let input = null;
let engine = null;
let root = null;
let svg = null;
let W = 1000;
let H = 600;
let blendT = 0;
let popFor = null;
let toastTimer = 0;
let repaintTimer = 0;
let observer = null;
let mountedFor = null;
let playedEntrance = false;
let entranceGuardUntil = 0;
let skipResize = false;
let lastHostW = 0;
let lastZoomInput = null;
/** The pending queue re-read after a decision, until the app hands us a fresh one. */
let fetchedGhosts = null;
/** Both zoom scales for the current width. Rebuilt on mount, never inside the frame loop. */
let scaleCache = new Map();

// Resolved once per mount from `input`.
let ZOOMS = DEFAULT_ZOOMS;
let YEAR = DEFAULT_ZOOMS.year;
let TODAY = '';
let TERMS = [];
let ITEMS = [];
let WALLS = [];
let LOGGED = {};
let PATTERN = [];
let COMMITMENTS = [];
let TIERS = [];
let MONTHS = [];
let ALL_DAYS = [];
let CAP = new Map();
let LOADS = [];
let GROUPED = {};
let SCHOOL_WEEK = '';
let lastLogged = null;

const addDays = addDaysKey;
const dd = date => formatDisplayDate(date).slice(0, 5);
const inTerm = date => TERMS.some(term => date >= term.starts_on && date <= term.ends_on);
const capFor = date => CAP.get(date)?.pct ?? 70;
const perfNow = () => doc?.defaultView?.performance?.now?.() ?? Date.now();
const itemById = id => ITEMS.find(item => item.id === id) ?? null;
const ghostFor = item => (item?.ghost ? { id: item.id, ...item.ghost } : null);

function river() {
  return input?.visual?.RIVER ?? {};
}

/** The pending queue: the freshest read wins, then what the app handed us. */
function pendingGhosts() {
  if (Array.isArray(fetchedGhosts)) return fetchedGhosts;
  if (Array.isArray(input?.ghosts)) return input.ghosts;
  return [];
}

/**
 * Ghost ids the server has already written as a held Life block. `cb-{id}` when the
 * write carried the ghost's id, otherwise the block the protect plan creates (same
 * title, same day). This is what survives a reload once the queue has dropped the ghost.
 */
function heldGhostIds(items) {
  const blocks = (input?.events ?? [])
    .map(event => event?.record)
    .filter(record => record?.type === 'calendar_block');
  const held = new Set();
  if (!blocks.length) return held;
  for (const item of items) {
    const ghost = item?.ghost;
    if (!ghost) continue;
    const match = blocks.some(record => record.id === `cb-${item.id}`
      || (record.title === ghost.title && record.date === ghost.date));
    if (match) held.add(item.id);
  }
  return held;
}

/**
 * Where a proposal stands. This session's decision wins, then the queue, then the
 * written block. A proposal we cannot place stays a proposal: it is never dropped
 * because a read came back empty.
 */
function ghostStatus(id, held) {
  if (state.dismissed.has(id)) return 'dismissed';
  if (state.accepted.has(id)) return 'accepted';
  const queued = pendingGhosts().find(ghost => ghost?.id === id);
  if (queued) {
    // Still on the pending queue: that wins over a leftover Life block from an earlier seed run.
    const settled = queued.settled ?? queued.status;
    if (settled === 'accepted' || settled === 'dismissed') return settled;
    return 'pending';
  }
  if (held?.has(id)) return 'accepted';
  return 'pending';
}

/** Accepted proposals become held points with the same id; dismissed ones leave the river. */
function resolveItems(items) {
  const held = heldGhostIds(items);
  const out = [];
  for (const item of items) {
    if (!item?.ghost) {
      if (item) out.push(item);
      continue;
    }
    const status = ghostStatus(item.id, held);
    if (status === 'dismissed') continue;
    if (status === 'accepted') out.push({ ...item, ghost: null, sub: 'held' });
    else out.push(item);
  }
  return out;
}

/** Tier bar spans: each term, the holidays between them, and the summer after the last. */
function buildTiers(items) {
  const sorted = [...TERMS].sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
  const oneClass = term => items.some(item => item.date === term.starts_on && /one class/i.test(item.title ?? ''));
  const out = [];
  sorted.forEach((term, index) => {
    const prev = sorted[index - 1];
    const gap = prev ? addDays(prev.ends_on, 1) : null;
    if (gap && gap < term.starts_on) out.push({ from: gap, to: addDays(term.starts_on, -1), label: 'HOLIDAYS', cls: 'is-hol' });
    out.push({ from: term.starts_on, to: term.ends_on, label: `TERM ${term.term}${oneClass(term) ? ' · ONE CLASS' : ''}`, cls: 'is-term' });
  });
  const last = sorted[sorted.length - 1];
  if (last && addDays(last.ends_on, 1) <= YEAR.to) out.push({ from: addDays(last.ends_on, 1), to: YEAR.to, label: 'SUMMER', cls: 'is-hol' });
  return out.filter(tier => tier.to >= YEAR.from && tier.from <= YEAR.to);
}

/** Month firsts inside the year range, for the axis when weeks get too narrow. */
function monthFirsts() {
  const out = [];
  let cursor = `${YEAR.from.slice(0, 7)}-01`;
  while (cursor <= YEAR.to) {
    if (cursor >= YEAR.from) out.push(cursor);
    const month = Number(cursor.slice(5, 7));
    cursor = month === 12 ? `${Number(cursor.slice(0, 4)) + 1}-01-01` : `${cursor.slice(0, 4)}-${String(month + 1).padStart(2, '0')}-01`;
  }
  return out;
}

function buildModel() {
  const data = river();
  ZOOMS = data.ZOOMS ?? DEFAULT_ZOOMS;
  YEAR = ZOOMS.year ?? DEFAULT_ZOOMS.year;
  TODAY = data.TODAY ?? input?.today ?? YEAR.from;
  TERMS = input?.terms?.length ? input.terms : (data.TERMS ?? input?.visual?.school_terms ?? []);
  WALLS = data.WALLS ?? [];
  LOGGED = data.LOGGED ?? {};
  PATTERN = data.PATTERN ?? [];
  COMMITMENTS = data.COMMITMENTS ?? [];
  ITEMS = resolveItems([...(data.ITEMS ?? [])]);

  ALL_DAYS = [];
  for (let date = YEAR.from; date <= YEAR.to; date = addDays(date, 1)) ALL_DAYS.push(date);

  // Capacity per day: logged where known, else the forecast (the Almanac's rule).
  const loggedKeys = Object.keys(LOGGED).sort();
  lastLogged = loggedKeys[loggedKeys.length - 1] ?? null;
  const pattern = date => PATTERN.filter(p => date >= p.from && date <= p.to).reduce((sum, p) => sum + p.delta, 0);
  CAP = new Map();
  for (const date of ALL_DAYS) if (LOGGED[date] != null) CAP.set(date, { pct: LOGGED[date], forecast: false });
  if (lastLogged) {
    const future = forecastSeries(ALL_DAYS.filter(date => date > lastLogged), {
      lastPct: LOGGED[lastLogged],
      lastDate: lastLogged,
      isHoliday: date => !inTerm(date),
      pattern
    });
    for (const point of future) CAP.set(point.date, { pct: point.pct, low: point.low, high: point.high, forecast: true });
  }

  LOADS = weeklyLoad({ from: YEAR.from, to: YEAR.to, terms: TERMS, commitments: COMMITMENTS, capacityFor: capFor });
  GROUPED = byLane(ITEMS);
  TIERS = buildTiers(ITEMS);
  MONTHS = monthFirsts();
  // Weeks vs months is decided on a school week: today's week can run into compressed holidays.
  const school = [...TERMS].sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)))[0];
  SCHOOL_WEEK = weeksBetween(school?.starts_on ?? YEAR.from, school?.starts_on ?? YEAR.from)[0];
  scaleCache = new Map();
}

/** X for a zoom: its range fills the plot width; holidays compressed by that zoom's factor. */
function scaleFor(zoom) {
  const cached = scaleCache.get(zoom);
  if (cached) return cached;
  const z = ZOOMS[zoom] ?? YEAR;
  const unit = buildTimeScale({ start: YEAR.from, end: addDays(YEAR.to, 1), terms: TERMS, dayWidth: 1, holidayFactor: z.holidayFactor });
  const x0 = unit.x(z.from);
  const span = unit.x(addDays(z.to, 1)) - x0 || 1;
  const plot = W - TR.labelW - TR.padR;
  const fn = date => TR.labelW + ((unit.x(date) - x0) / span) * plot;
  scaleCache.set(zoom, fn);
  return fn;
}

/* ======================================================================== 3. Mount */

function attach(parent, node) {
  if (!parent || !node) return node;
  (parent.appendChild ?? parent.append).call(parent, node);
  return node;
}

function el(tag, cls, html, parent, attrs = {}) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return attach(parent, node);
}

function s(tag, attrs, parent, text) {
  const node = typeof doc.createElementNS === 'function' ? doc.createElementNS(NS, tag) : doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return attach(parent, node);
}

const set = (node, attrs) => {
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, typeof value === 'number' ? value.toFixed(1) : value);
};

/** Views may run without requestAnimationFrame (unit tests): then motion lands at once. */
function clockFor(view) {
  if (typeof view?.requestAnimationFrame === 'function') return undefined;
  return { now: () => 0, request: () => 1, cancel: () => {} };
}

/** The wall hatch. The Life shell may already carry it; never define it twice. */
function ensureHatch(defs) {
  if (doc.getElementById?.('tr-hatch')) return;
  const pattern = s('pattern', { id: 'tr-hatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  s('rect', { width: 7, height: 7, fill: 'color-mix(in srgb, var(--navy) 4%, transparent)' }, pattern);
  s('rect', { width: 2, height: 7, fill: 'color-mix(in srgb, var(--navy) 13%, transparent)' }, pattern);
}

function mount({ entrance = false } = {}) {
  const view = doc.defaultView;
  engine?.dispose();
  engine = null;
  clearTimeout(toastTimer);
  toastTimer = 0;
  popFor = null;
  nodes.clear();
  placers = [];
  skipResize = true;
  state.phone = view?.matchMedia?.('(max-width: 719px)')?.matches === true;
  buildModel();

  host.replaceChildren();
  root = el('section', 'tr', undefined, host, { 'data-part': 'term-river', 'aria-label': state.zoom === 'year' ? 'Year' : 'Term' });

  const nav = el('header', 'tr__nav', undefined, root, { 'data-part': 'nav' });
  el('button', 'tr__round', ICON.prev, nav, { type: 'button', 'aria-label': 'Earlier', 'data-step': '-1' });
  nodes.set('period', el('div', 'tr__period', '', nav, { 'data-part': 'period' }));
  el('button', 'tr__round', ICON.next, nav, { type: 'button', 'aria-label': 'Later', 'data-step': '1' });
  el('button', 'btn btn--secondary', 'Today', nav, { type: 'button', 'data-today': '' });
  const zoom = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'Zoom', 'data-part': 'zoom-pills' });
  for (const name of ZOOM_PILLS) {
    const on = name.toLowerCase() === state.zoom;
    el('button', `hub-pills__btn${on ? ' is-active' : ''}`, name, zoom, {
      type: 'button',
      'aria-pressed': String(on),
      'data-zoom': name.toLowerCase()
    });
  }
  nodes.set('zoom', zoom);

  const card = el('div', 'tr__card', undefined, root, { 'data-part': 'card' });
  if (state.phone) mountList(card);
  else mountChart(card);
  mountLegend(card);

  nodes.set('__toast', el('div', 'tr-toast', '', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'tr-pop', '', root, { role: 'dialog', 'data-part': 'popover', hidden: '' }));
  nodes.set('__live', el('div', 'tr-sr', '', root, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: clockFor(view) });
  engine.place('__toast', { opacity: 0, y: TR.toastRise });
  engine.place('__pop', { opacity: 0, y: TR.popRise });
  engine.place('__zoom', { t: state.zoom === 'year' ? 1 : 0 });
  if (!state.phone) {
    if (entrance) {
      engine.place('__reveal', { w: 0 });
      engine.to('__reveal', { w: W }, { duration: TR.revealMs, easing: EASE });
      entranceGuardUntil = perfNow() + ENTRANCE_GUARD_MS;
    } else {
      engine.place('__reveal', { w: W });
    }
  }
  updatePeriod();

  lastHostW = Math.round(host.getBoundingClientRect?.().width || W);
  const settle = () => {
    skipResize = false;
    lastHostW = Math.round(host.getBoundingClientRect?.().width || lastHostW);
    applyHubPillsThumb(zoom);
  };
  if (typeof view?.requestAnimationFrame === 'function') view.requestAnimationFrame(settle);
  else settle();
  wire(root);
  publish(view);
  if (state.toast && Date.now() < state.toast.until) showToast(state.toast.html, { resume: true });
}

function mountChart(card) {
  W = Math.round(card.clientWidth || host.clientWidth || 1000);
  scaleCache = new Map();
  const laneTops = {};
  let y = TR.axis.h;
  for (const lane of LANES) {
    laneTops[lane.id] = y;
    y += TR.lanes[lane.id];
  }
  const loadTop = y + 8;
  H = loadTop + TR.load;
  svg = typeof doc.createElementNS === 'function' ? doc.createElementNS(NS, 'svg') : doc.createElement('svg');
  svg.setAttribute('class', 'tr-chart');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.setAttribute('role', 'img');
  svg.setAttribute('data-part', 'chart');
  svg.setAttribute('aria-label', 'Term River: your identities as lanes across the term, with capacity and weekly load');
  attach(card, svg);
  const defs = s('defs', {}, svg);
  ensureHatch(defs);
  // Reuse the shell's #tr-plot clip (first in the document) so the visual probe's
  // `#tr-plot rect, clipPath rect` selector cannot land on a home-chart clipPath.
  let clipRect = doc.getElementById?.('tr-plot')?.querySelector?.('rect') ?? null;
  if (!clipRect) {
    const clip = s('clipPath', { id: 'tr-plot' }, defs);
    clipRect = s('rect', { x: TR.labelW, y: 0, width: 0, height: H }, clip);
  } else {
    set(clipRect, { x: TR.labelW, y: 0, width: 0, height: H });
  }
  nodes.set('plotclip', clipRect);
  const plot = s('g', { 'clip-path': 'url(#tr-plot)' }, svg);
  const labels = s('g', {}, svg);

  // Holiday washes and walls (behind everything)
  const back = s('g', { class: 'tr-back' }, plot);
  const runs = [];
  let run = null;
  for (const date of ALL_DAYS) {
    if (!inTerm(date) && run == null) run = date;
    if (inTerm(date) && run != null) {
      runs.push({ from: run, to: addDays(date, -1) });
      run = null;
    }
  }
  if (run) runs.push({ from: run, to: YEAR.to });
  for (const r of runs) {
    const node = s('rect', { class: 'tr-holiday', y: TR.axis.tiers - 2, height: H - TR.axis.tiers + 2 }, back);
    placers.push(X => set(node, { x: X(r.from), width: Math.max(0, X(addDays(r.to, 1)) - X(r.from)) }));
  }
  for (const wall of WALLS) {
    const node = s('rect', { class: 'tr-wall', y: TR.axis.h, height: loadTop - TR.axis.h, 'data-part': 'wall' }, back);
    placers.push(X => set(node, { x: X(wall.from), width: Math.max(0, X(addDays(wall.to, 1)) - X(wall.from)) }));
  }

  // Axis: tiers
  for (const tier of TIERS) {
    const rect = s('rect', { class: `tr-tier ${tier.cls}`, y: TR.axis.tiers - 22, height: 18, rx: 6 }, plot);
    const text = s('text', { class: `tr-t-tier ${tier.cls}`, y: TR.axis.tiers - 9 }, plot);
    placers.push(X => {
      const a = X(tier.from);
      const b = X(addDays(tier.to, 1));
      set(rect, { x: a + 2, width: Math.max(0, b - a - 4) });
      const vis = Math.max(a, TR.labelW) + 10;
      set(text, { x: vis });
      text.textContent = fitText(tier.label, Math.min(b, W - TR.padR) - vis - 8, TIER_FONT);
    });
  }

  // Axis: weeks (and months when weeks get narrow)
  for (const week of weeksBetween(YEAR.from, YEAR.to)) {
    const line = s('line', { class: 'tr-weekline', y1: TR.axis.tiers + 4, y2: H }, plot);
    const label = s('text', { class: 'tr-t-week', y: TR.axis.weekLabel }, plot, riverWeekLabel(week, TERMS));
    const date = s('text', { class: 'tr-t-sub', y: TR.axis.weekDate }, plot, dd(week));
    placers.push((X, weekW) => {
      const x = X(week);
      set(line, { x1: x, x2: x });
      // Week labels need room, and never run past the plot's right edge.
      // Full label ("Hol W1") if it fits its own week, else the short one ("H1"), else none.
      const own = X(addDays(week, 7)) - x;
      const room = own - 8;
      const full = riverWeekLabel(week, TERMS);
      const short = full.replace(/^Hol W/, 'H').replace(/^T\d /, '');
      const fits = (text, font) => textW(text, font) <= room;
      label.textContent = fits(full, WEEK_FONT) ? full : short;
      const inPlot = weekW >= TR.minWeekLabel && x >= TR.labelW && x + own <= W - TR.padR + 1;
      const show = inPlot && fits(label.textContent, WEEK_FONT);
      set(label, { x: x + 6, opacity: show ? 1 : 0 });
      set(date, { x: x + 6, opacity: show && fits(date.textContent, DATE_FONT) ? 1 : 0 });
    });
  }
  for (const month of MONTHS) {
    const name = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: 'UTC' }).format(new Date(`${month}T00:00:00Z`));
    const label = s('text', { class: 'tr-t-week', y: TR.axis.weekLabel + 6 }, plot, name);
    placers.push((X, weekW) => set(label, {
      x: X(month) + 4,
      opacity: weekW < TR.minWeekLabel && X(month) >= TR.labelW && X(month) + 30 <= W - TR.padR ? 1 : 0
    }));
  }
  s('line', { class: 'tr-rule', x1: 0, x2: W, y1: TR.axis.h, y2: TR.axis.h }, svg);

  // Lanes
  for (const lane of LANES) {
    const top = laneTops[lane.id];
    const h = TR.lanes[lane.id];
    // The Corey wash sits behind the whole chart, not over the plot.
    if (lane.id === 'corey') svg.insertBefore(s('rect', { class: 'tr-lane-wash', x: 0, y: top, width: W, height: h }, svg), svg.firstChild);
    s('line', { class: 'tr-rule', x1: 0, x2: W, y1: top + h, y2: top + h }, svg);
    s('text', { class: `tr-t-lane${lane.id === 'corey' ? ' is-corey' : ''}`, x: 18, y: top + 24 }, labels, lane.label);
    s('text', { class: 'tr-t-sub', x: 18, y: top + 40 }, labels, lane.sub);
    const group = s('g', { 'data-part': 'lane', 'data-lane': lane.id }, plot);
    if (lane.id === 'body') mountBody(group, top, h);
    mountLaneItems(group, lane.id, top, h);
  }

  // Load strip
  s('text', { class: 'tr-t-lane', x: 18, y: loadTop + 24 }, labels, 'Load');
  s('text', { class: 'tr-t-sub', x: 18, y: loadTop + 40 }, labels, 'booked h vs capacity');
  const strip = s('g', { 'data-part': 'load' }, plot);
  const base = loadTop + TR.load - 14;
  const maxH = TR.load - 34;
  const peak = Math.max(...LOADS.map(load => Math.max(load.booked, load.capacity)), 1);
  for (const load of LOADS) {
    const bar = s('rect', {
      class: `tr-load${load.over ? ' is-over' : ''}${load.holiday ? ' is-hol' : ''}`,
      rx: 4,
      'data-part': 'load-week',
      'data-week': load.week,
      'data-over': String(load.over)
    }, strip);
    const cap = s('line', { class: 'tr-cap' }, strip);
    const value = s('text', { class: `tr-t-load${load.over ? ' is-over' : ''}` }, strip);
    placers.push((X, weekW) => {
      const a = X(load.week) + 4;
      const b = X(addDays(load.week, 7)) - 4;
      const hB = (load.booked / peak) * maxH;
      const hC = (load.capacity / peak) * maxH;
      set(bar, { x: a, width: Math.max(0, b - a), y: base - hB, height: hB });
      set(cap, { x1: a - 2, x2: b + 2, y1: base - hC, y2: base - hC });
      set(value, { x: (a + b) / 2, y: base - Math.max(hB, hC) - 6 });
      const inside = a >= TR.labelW && b <= W - TR.padR;
      value.textContent = inside && weekW >= 40 && load.booked > 0 ? `${load.booked} h${load.over ? ' · over' : ''}` : '';
    });
  }

  // Today
  const today = s('g', { class: 'tr-today', 'data-part': 'today' }, plot);
  const line = s('line', { y1: TR.axis.tiers + 4, y2: H }, today);
  // The pill sits on the axis rule, below the week dates.
  const pill = s('rect', { y: TR.axis.h - 9, width: 52, height: 18, rx: 9 }, today);
  const text = s('text', { y: TR.axis.h + 4 }, today, 'Today');
  placers.push(X => {
    const x = X(TODAY) + 0.5 * (X(addDays(TODAY, 1)) - X(TODAY));
    set(line, { x1: x, x2: x });
    set(pill, { x: x - 26 });
    set(text, { x });
  });
}

/** Items in a lane. Bars stack in rows; points alternate above and below a centre line. */
function mountLaneItems(group, laneId, top, h) {
  const items = GROUPED[laneId] ?? [];
  const bars = items.filter(item => item.shape === 'bar');
  bars.forEach((item, row) => {
    const y = top + 12 + row * (TR.bar.h + TR.bar.gap);
    const rect = s('rect', {
      class: `tr-bar k-${laneId}`,
      y,
      height: TR.bar.h,
      rx: TR.bar.rx,
      tabindex: 0,
      role: 'button',
      'data-part': 'item',
      'data-id': item.id,
      'aria-label': `${item.title}, ${dd(item.from)} – ${dd(item.to)}`
    }, group);
    const text = s('text', { class: 'tr-t-bar', y: y + 13 }, group);
    placers.push(X => {
      const a = X(item.from);
      const b = X(addDays(item.to, 1));
      set(rect, { x: a, width: Math.max(0, b - a) });
      const vis = Math.max(a, TR.labelW) + 8;
      set(text, { x: vis });
      text.textContent = fitText(item.title, Math.min(b, W - TR.padR) - vis - 8, TR.barFont);
    });
  });

  const points = items
    .filter(item => item.shape !== 'bar')
    .sort((a, b) => String(a.date ?? a.from ?? '').localeCompare(String(b.date ?? b.from ?? '')));
  const cy = top + (bars.length ? 12 + bars.length * (TR.bar.h + TR.bar.gap) + 22 : h / 2 + 2);
  const labelled = points.filter(point => !point.sample && point.shape !== 'hum');
  points.forEach(item => {
    if (item.shape === 'hum') {
      const line = s('line', { class: 'tr-hum', y1: cy, y2: cy }, group);
      const text = s('text', { class: 'tr-t-hum', y: cy + 18 }, group);
      const below = labelled.filter((_, k) => k % 2 === 1 && labelled[k].date);
      placers.push(X => {
        const a = Math.max(X(item.from), TR.labelW);
        set(line, { x1: a, x2: X(addDays(item.to, 1)) });
        set(text, { x: a + 8 });
        // The hum's label runs until the first label below the line, or the plot edge.
        const limit = Math.min(W - TR.padR, ...below.map(point => X(point.date)).filter(x => x > a + 8).map(x => x - 10));
        text.textContent = fitText(`${item.title} · ${item.sub}`, limit - (a + 8), HUM_FONT);
      });
      return;
    }
    const ghost = Boolean(item.ghost);
    const cls = [
      'tr-point',
      `k-${laneId}`,
      item.shape === 'diamond' ? 'is-diamond' : '',
      item.shape === 'marker' ? 'is-marker' : '',
      ghost ? 'is-ghost' : '',
      item.sample ? 'is-sample' : '',
      item.sub === 'held' ? 'is-held' : ''
    ].join(' ');
    const node = item.shape === 'marker'
      ? s('line', { class: cls, y1: cy - 10, y2: cy + 10, 'data-part': 'item', 'data-id': item.id }, group)
      : item.shape === 'diamond'
        ? s('rect', {
          class: cls,
          width: 12,
          height: 12,
          rx: 2,
          tabindex: 0,
          role: 'button',
          'data-part': 'item',
          'data-id': item.id,
          'aria-label': item.title
        }, group)
        : s('circle', {
          class: cls,
          r: item.sample ? 3.5 : TR.point + (ghost ? 1 : 0),
          cy,
          tabindex: item.sample ? -1 : 0,
          role: 'button',
          'data-part': ghost ? 'ghost' : 'item',
          'data-id': item.id,
          'aria-label': `${item.title}${item.date ? `, ${dd(item.date)}` : ''}${ghost ? '. Proposal from Hammond.' : ''}`
        }, group);
    const chip = ghost ? s('g', { class: 'tr-agent' }, group) : null;
    if (chip) {
      s('circle', { r: 7 }, chip);
      s('text', { y: 3.5 }, chip, 'H');
    }
    let label = null;
    const k = labelled.indexOf(item);
    const above = k % 2 === 0;
    if (k >= 0) {
      label = s('text', {
        class: `tr-t-point${item.shape === 'diamond' ? ' is-gold' : ''}${laneId === 'corey' ? ' is-corey' : ''}`,
        y: above ? cy - 19 : cy + 20
      }, group);
    }
    placers.push(X => {
      const x = X(item.date) + 0.5 * (X(addDays(item.date, 1)) - X(item.date));
      if (item.shape === 'marker') set(node, { x1: x, x2: x });
      else if (item.shape === 'diamond') set(node, { x: x - 6, y: cy - 6, transform: `rotate(45 ${x.toFixed(1)} ${cy})` });
      else set(node, { cx: x });
      if (chip) {
        // Two proposals days apart share one badge: the later one hides rather than stacking.
        const prev = points.slice(0, points.indexOf(item)).reverse().find(point => point.ghost && point.date);
        const crowded = prev && x - X(prev.date) < 18;
        set(chip, { transform: `translate(${(x + 9).toFixed(1)} ${(cy - 8).toFixed(1)})`, opacity: crowded ? 0 : 1 });
      }
      if (label) {
        // Budget: up to the next labelled point on the same side, or the plot edge.
        const next = labelled.slice(k + 2).find(Boolean);
        // Labels above sit higher than the agent badge, so a badge never cuts a label.
        const limit = next?.date ? X(next.date) - 10 : W - TR.padR;
        set(label, { x: x + (item.shape === 'marker' ? 5 : 9) });
        label.textContent = fitText(item.title, limit - (x + 9));
      }
    });
  });
}

/** Body: the capacity line (logged solid, forecast dashed with its band) and the 40% line. */
function mountBody(group, top, h) {
  const base = top + h - 12;
  const Y = value => base - (value / 100) * (h - 26);
  const band = s('path', { class: 'tr-band' }, group);
  const past = s('path', { class: 'tr-line' }, group);
  const future = s('path', { class: 'tr-line is-forecast' }, group);
  const soften = s('line', { class: 'tr-soften', y1: Y(40), y2: Y(40) }, group);
  const label = s('text', { class: 'tr-t-soften', y: Y(40) - 4, 'text-anchor': 'end' }, group, '40%');
  // With nothing logged there is no forecast to draw: the whole line stays solid.
  const cut = lastLogged ?? ALL_DAYS[ALL_DAYS.length - 1] ?? YEAR.to;
  placers.push(X => {
    const mid = date => X(date) + 0.5 * (X(addDays(date, 1)) - X(date));
    const points = ALL_DAYS.map(date => [mid(date), Y(capFor(date)), CAP.get(date)]);
    const p = points
      .filter((_, i) => ALL_DAYS[i] <= cut)
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
    const fIdx = ALL_DAYS.findIndex(date => date >= cut);
    const f = points.slice(fIdx).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const fut = points.slice(fIdx + 1);
    const up = fut.map(([x, , c], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${Y(c?.high ?? 0).toFixed(1)}`).join(' ');
    const down = [...fut].reverse().map(([x, , c]) => `L${x.toFixed(1)} ${Y(c?.low ?? 0).toFixed(1)}`).join(' ');
    set(past, { d: p });
    set(future, { d: fut.length ? f : '' });
    set(band, { d: fut.length ? `${up} ${down} Z` : '' });
    set(soften, { x1: TR.labelW, x2: W - TR.padR });
    set(label, { x: W - TR.padR - 2 });
  });
}

function mountLegend(card) {
  el('div', 'tr-legend', '<span><i class="lg-school"></i>School day</span><span><i class="lg-wall"></i>Wall (trips)</span>'
    + '<span><i class="lg-ghost"></i>Agent proposal</span><span><i class="lg-over"></i>Over capacity</span>'
    + '<span class="tr-legend__note">Holidays are shown narrower, not squashed: they\u2019re where your life happens.</span>',
  card, { 'data-part': 'legend' });
}

/** Phone: the same lanes as lists, this range's items in date order. Never the wide chart. */
function mountList(card) {
  const list = el('div', 'tr-list', undefined, card, { 'data-part': 'lane-list' });
  const z = ZOOMS[state.zoom] ?? YEAR;
  for (const lane of LANES) {
    const items = (GROUPED[lane.id] ?? []).filter(item => !item.sample && item.shape !== 'hum'
      && ((item.date && item.date >= z.from && item.date <= z.to)
        || (item.from && item.to && item.to >= z.from && item.from <= z.to)));
    const section = el('section', `tr-list__lane is-${lane.id}`,
      `<h3>${escapeHtml(lane.label)}</h3><p>${escapeHtml(lane.sub)}</p>`, list,
      { 'data-part': 'lane', 'data-lane': lane.id });
    if (lane.id === 'body') {
      el('p', 'tr-list__body', `Today ${capFor(TODAY)}% · forecast ${capFor(addDays(TODAY, 7))}% next week`, section);
    }
    for (const item of items) {
      const ghost = Boolean(item.ghost);
      const when = item.date ? dd(item.date) : `${dd(item.from)} – ${dd(item.to)}`;
      el('button', `tr-list__item${ghost ? ' is-ghost' : ''}`,
        `<span class="tr-list__t">${escapeHtml(item.title)}</span><span class="tr-list__d">${escapeHtml(when)}</span>`,
        section, { type: 'button', 'data-part': ghost ? 'ghost' : 'item', 'data-id': item.id });
    }
  }
}

/* ======================================================================== 4. Render */

/** The only function that writes geometry or motion values. */
function apply(id, props) {
  if (id === '__zoom') {
    blendT = props.t;
    if (state.phone) return;
    const A = scaleFor('term');
    const B = scaleFor('year');
    const X = date => A(date) + (B(date) - A(date)) * blendT;
    // A school week's width decides weeks vs months (today's week can run into compressed holidays).
    const weekW = X(addDays(SCHOOL_WEEK, 7)) - X(SCHOOL_WEEK);
    for (const place of placers) place(X, weekW);
    return;
  }
  if (id === '__reveal') {
    const rect = nodes.get('plotclip');
    if (rect) set(rect, { width: Math.max(0, Math.min(props.w, W - TR.padR) - TR.labelW) });
    return;
  }
  if (id === '__toast' || id === '__pop') {
    const node = nodes.get(id);
    if (!node) return;
    node.style.opacity = String(props.opacity);
    node.style.transform = `translateY(${props.y}px)`;
  }
}

/** The term a date sits in, else the term it is heading toward, else the one behind it. */
function termNear(date) {
  const sorted = [...TERMS].sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
  return sorted.find(term => date >= term.starts_on && date <= term.ends_on)
    ?? sorted.find(term => term.starts_on > date)
    ?? sorted[sorted.length - 1]
    ?? null;
}

function periodTitle() {
  const z = ZOOMS[state.zoom] ?? YEAR;
  const from = termNear(z.from);
  const to = termNear(z.to);
  if (state.zoom !== 'year') {
    if (from && to && from.term !== to.term) return `Term ${from.term} → Term ${to.term}`;
    return from ? `Term ${from.term}` : formatDisplayDate(z.from);
  }
  // The year ends where you come home: the wall that runs to the far edge names it.
  const trip = WALLS.find(wall => wall.to >= z.to);
  const place = trip ? String(trip.title ?? '').split(/\s*·\s*/)[0].trim() : '';
  const start = from ? ` · Term ${from.term}` : '';
  return `${z.from.slice(0, 4)}${start}${place ? ` to home from ${place}` : ` → ${formatDisplayDate(z.to)}`}`;
}

function updatePeriod() {
  const z = ZOOMS[state.zoom] ?? YEAR;
  const node = nodes.get('period');
  if (!node) return;
  const span = `${riverWeekLabel(weeksBetween(z.from, z.from)[0], TERMS)} – ${riverWeekLabel(weeksBetween(z.to, z.to)[0], TERMS)}`
    + ` · ${formatDisplayDate(z.from)} – ${formatDisplayDate(z.to)}`;
  node.innerHTML = `<b>${escapeHtml(periodTitle())}</b><span>${escapeHtml(span)}</span>`;
}

/* ======================================================================== 5. Interaction */

function setZoom(next) {
  if (next !== 'term' && next !== 'year') return;
  if (next === state.zoom) return;
  state.zoom = next;
  const zoom = nodes.get('zoom');
  if (zoom) {
    for (const button of zoom.querySelectorAll('.hub-pills__btn')) {
      const on = button.getAttribute('data-zoom') === next;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    }
    zoom.classList.add('is-animated');
    applyHubPillsThumb(zoom);
  }
  root?.setAttribute('aria-label', next === 'year' ? 'Year' : 'Term');
  if (state.phone) {
    mount({ entrance: false });
    return;
  }
  engine.to('__zoom', { t: next === 'year' ? 1 : 0 }, { duration: TR.zoomMs, easing: EASE });
  updatePeriod();
  announce(next === 'year' ? 'Year view.' : 'Term view.');
}

function announce(text) {
  const live = nodes.get('__live');
  if (live) live.textContent = text;
}

function showToast(html, { resume = false } = {}) {
  const toast = nodes.get('__toast');
  if (!toast || !engine) return;
  toast.innerHTML = html;
  if (!resume) state.toast = { html, until: Date.now() + TR.toastHoldMs };
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: TR.toastInMs });
  clearTimeout(toastTimer);
  const remaining = state.toast ? Math.max(0, state.toast.until - Date.now()) : TR.toastHoldMs;
  toastTimer = setTimeout(() => {
    state.toast = null;
    engine?.to('__toast', { opacity: 0, y: TR.toastRise }, { duration: TR.toastInMs });
  }, remaining);
}

/** Display only: the receipt the server will write if this is accepted. */
function writePreview(ghost) {
  try {
    return acceptPlan(ghost, { today: TODAY }).receipt;
  } catch {
    return null;
  }
}

function openPop(itemId) {
  const item = itemById(itemId);
  const pop = nodes.get('__pop');
  const target = root?.querySelector(`[data-id="${itemId}"]`);
  if (!item || !pop || !target || !engine) return;
  const when = item.date ? dd(item.date) : `${dd(item.from)} – ${dd(item.to)}`;
  const lane = LANES.find(entry => (GROUPED[entry.id] ?? []).includes(item));
  const sub = item.sub && item.sub !== 'held' ? ` · ${item.sub}` : '';
  let html = `<b>${escapeHtml(item.title)}</b><p class="tr-pop__meta">${escapeHtml(when)} · ${escapeHtml(lane?.label ?? '')}${escapeHtml(sub)}</p>`;
  const ghost = ghostFor(item);
  const receipt = ghost ? writePreview(ghost) : null;
  if (ghost && receipt) {
    html += `<p class="tr-pop__label">Hammond suggests · Accept writes</p>`
      + `<p class="tr-pop__writes" data-part="write-preview">${escapeHtml(receipt)}</p>`
      + `<div class="tr-pop__acts">`
      + `<button type="button" class="btn btn--primary" data-accept="${escapeHtml(item.id)}" data-label="Accept">Accept</button>`
      + `<button type="button" class="btn btn--ghost" data-dismiss="${escapeHtml(item.id)}">Dismiss</button></div>`;
  }
  pop.innerHTML = html;
  pop.hidden = false;
  pop.removeAttribute('hidden');
  const bounds = root.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const left = bounds.right - box.right > TR.popWidth + TR.popGap
    ? box.right - bounds.left + TR.popGap
    : box.left - bounds.left - TR.popWidth - TR.popGap;
  pop.style.left = `${Math.max(0, left)}px`;
  pop.style.top = `${box.bottom - bounds.top + 6}px`;
  popFor = itemId;
  engine.place('__pop', { opacity: 0, y: TR.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: TR.popMs });
}

function closePop() {
  if (!popFor || !engine) return;
  popFor = null;
  engine.to('__pop', { opacity: 0, y: TR.popRise }, { duration: TR.popMs });
  setTimeout(() => {
    if (popFor) return;
    const pop = nodes.get('__pop');
    if (!pop) return;
    pop.hidden = true;
    pop.setAttribute('hidden', '');
  }, TR.popMs);
}

function decisionButtons(id) {
  return [...(root?.querySelectorAll?.(`[data-accept="${id}"],[data-dismiss="${id}"]`) ?? [])];
}

function armButtons(id, disabled, { saving = false } = {}) {
  for (const button of decisionButtons(id)) {
    button.disabled = disabled;
    if (!button.hasAttribute('data-accept')) continue;
    button.textContent = saving ? 'Saving…' : button.getAttribute('data-label') ?? 'Accept';
  }
}

function request() {
  return input?.apiFetch ?? doc?.defaultView?.fetch ?? globalThis.fetch;
}

/** The only body that leaves the browser. The server loads the ghost and builds the writes. */
async function postDecision(id, decision) {
  const response = await request()('/api/calendar-ghosts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, decision })
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

/** Re-read the queue so the river draws what the server now holds, not what we hoped. */
async function refreshGhosts() {
  try {
    const year = ZOOMS.year;
    const qs = year?.from && year?.to
      ? `?from=${encodeURIComponent(year.from)}&to=${encodeURIComponent(year.to)}`
      : '';
    const response = await request()(`/api/calendar-ghosts${qs}`);
    const payload = await response.json().catch(() => null);
    // A failed read leaves the queue as it was: this session's decision still stands.
    if (response.ok && Array.isArray(payload?.ghosts)) fetchedGhosts = payload.ghosts;
  } catch {
    // Same: the decision is already recorded in state, so nothing is faked here.
  }
}

/** Never optimistic: the server writes first, then the river re-lays out from its answer. */
async function decide(itemId, decision) {
  const item = itemById(itemId);
  const ghost = item && ghostFor(item);
  if (!ghost || busy.has(itemId)) return;
  busy.add(itemId);
  armButtons(itemId, true, { saving: decision === 'accept' });
  let result;
  try {
    result = await postDecision(itemId, decision);
  } catch (error) {
    busy.delete(itemId);
    armButtons(itemId, false);
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
    return;
  }
  busy.delete(itemId);
  if (result.status !== 200 || result.payload?.ok === false) {
    armButtons(itemId, false);
    const message = result.payload?.error?.message;
    showToast(`<b>Not saved.</b> ${escapeHtml(typeof message === 'string' && message ? message : 'Could not save that change.')}`);
    return;
  }
  closePop();
  (decision === 'accept' ? state.accepted : state.dismissed).add(itemId);
  const receipt = typeof result.payload?.receipt === 'string' ? result.payload.receipt : '';
  await refreshGhosts();
  // Re-lay out from the (new) data without replaying the reveal, then show the receipt.
  mount({ entrance: false });
  const text = receipt || (decision === 'accept' ? 'Written.' : 'Dismissed. Nothing written.');
  showToast(decision === 'accept' ? `<b>Written.</b> ${escapeHtml(text)}` : `<b>${escapeHtml(text)}</b>`);
  announce(text);
  void input?.onSourcesChanged?.();
}

function wire(section) {
  section.addEventListener('click', event => {
    const target = event.target;
    const accept = target.closest?.('[data-accept]');
    if (accept) return void decide(accept.getAttribute('data-accept'), 'accept');
    const dismiss = target.closest?.('[data-dismiss]');
    if (dismiss) return void decide(dismiss.getAttribute('data-dismiss'), 'dismiss');
    const zoom = target.closest?.('[data-zoom]');
    if (zoom) {
      const name = zoom.getAttribute('data-zoom');
      if (name === 'term' || name === 'year') return setZoom(name);
      input?.onSwitchView?.(name);
      return;
    }
    const stepper = target.closest?.('[data-step]');
    if (stepper) return void input?.onShiftRange?.(Number(stepper.getAttribute('data-step')));
    if (target.closest?.('[data-today]')) return void input?.onSelectDate?.(input.today);
    const item = target.closest?.('[data-part="item"],[data-part="ghost"]');
    if (item && !item.classList?.contains?.('is-sample')) {
      const id = item.getAttribute('data-id');
      return id === popFor ? closePop() : openPop(id);
    }
    if (!target.closest?.('[data-part="popover"]')) closePop();
  });
  section.addEventListener('keydown', event => {
    const target = event.target;
    if (event.key === 'Escape') closePop();
    const part = target?.getAttribute?.('data-part');
    if ((event.key === 'Enter' || event.key === ' ') && (part === 'item' || part === 'ghost')) {
      openPop(target.getAttribute('data-id'));
      event.preventDefault();
    }
    if (target?.closest?.('input, textarea')) return;
    if (event.key === '+') setZoom('term');
    if (event.key === '-') setZoom('year');
  });
}

function publish(view) {
  const hostname = view?.location?.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
  view.__termRiver = {
    state,
    TR,
    loads: LOADS,
    lanes: () => Object.fromEntries(Object.entries(GROUPED).map(([lane, items]) => [lane, items.map(item => item.id)])),
    setZoom,
    decide,
    openPop,
    closePop,
    finish: () => engine?.finish(),
    stats: () => engine?.stats(),
    blend: () => blendT
  };
}

/** Late data waits for the reveal (and any running zoom) rather than cutting it short. */
function repaintAfter(ms) {
  if (repaintTimer) return;
  repaintTimer = setTimeout(() => {
    repaintTimer = 0;
    if (mountedFor !== host) return;
    if (engine?.busy()) return repaintAfter(120);
    mount({ entrance: false });
  }, ms);
}

function observe() {
  const view = doc.defaultView;
  if (typeof view?.ResizeObserver !== 'function') return;
  observer = new view.ResizeObserver(entries => {
    const width = Math.round(entries[0].contentRect.width);
    // Never tear down mid-reveal (paint noise, or a real resize during the entrance).
    if (skipResize || perfNow() < entranceGuardUntil || engine?.busy()) {
      lastHostW = width;
      return;
    }
    if (lastHostW && Math.abs(width - lastHostW) > 2) {
      lastHostW = width;
      // Re-layout settled — never replay the reveal.
      view.requestAnimationFrame(() => {
        if (mountedFor === host) mount({ entrance: false });
      });
      return;
    }
    lastHostW = width;
  });
  observer.observe(host);
}

export function isTermRiverMounted() {
  return mountedFor != null;
}

export function renderTermRiver(nextDoc, riverHost, nextInput) {
  doc = nextDoc;
  input = nextInput;
  const fresh = mountedFor !== riverHost;
  host = riverHost;
  if (fresh || input.zoom !== lastZoomInput) state.zoom = input.zoom === 'year' ? 'year' : 'term';
  lastZoomInput = input.zoom;
  if (fresh) {
    observer?.disconnect();
    observer = null;
    fetchedGhosts = null;
    playedEntrance = false;
    entranceGuardUntil = 0;
    mountedFor = riverHost;
    observe();
  }
  const entrance = !playedEntrance;
  if (!entrance && (perfNow() < entranceGuardUntil || engine?.busy())) {
    // The reveal or a zoom owns the chart: paint this data once it has finished.
    repaintAfter(Math.max(16, entranceGuardUntil - perfNow() + 16));
    return;
  }
  playedEntrance = true;
  mount({ entrance });
}

export function unmountTermRiver() {
  clearTimeout(toastTimer);
  clearTimeout(repaintTimer);
  toastTimer = 0;
  repaintTimer = 0;
  observer?.disconnect();
  observer = null;
  engine?.dispose();
  engine = null;
  nodes.clear();
  placers = [];
  busy.clear();
  state.accepted.clear();
  state.dismissed.clear();
  state.toast = null;
  state.zoom = 'term';
  mountedFor = null;
  playedEntrance = false;
  entranceGuardUntil = 0;
  lastHostW = 0;
  lastZoomInput = null;
  fetchedGhosts = null;
  popFor = null;
  root = null;
  svg = null;
  input = null;
  host = null;
}
