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
import { createMotion, EASE } from '../hub-motion-engine.js';
import { mountCompactRiver } from './term-river-rows.js';
import { TR } from '../term-river-geometry.js';
import { addDaysKey, buildTimeScale } from '../school-time.js';
import { formatDisplayDate } from '../format-display-date.js';
import { buildZoomPills, settleZoomPills } from './zoom-pills.js';
import {
  LANES,
  byLane,
  deriveRiverZooms,
  mergeRiverItems,
  riverItemsFromHubEvents,
  riverWeekLabel,
  weeklyLoad,
  weeksBetween
} from './term-river.js';
import { buildRiverCapacity, buildRiverCommitments, riverInputFingerprint } from './term-river-capacity.js';
import { onCheckinsChange } from './readiness-checkins.js';
import { acceptPlan } from './ghost-writes.js';
import {
  countByFilterKey,
  countHidden,
  isItemVisible,
  paintSourceFilter,
  readFilterState,
  writeFilterState
} from './calendar-filter.js';
import { bindItemCard, itemCardHtml } from './calendar-item-card.js';
import { saveCalendarItem } from './calendar-item-actions.js';

/* ======================================================================== 1. Constants */

const NS = 'http://www.w3.org/2000/svg';
const ICON = {
  prev: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>'
};
const WEEK_FONT = '600 12px Inter, ui-sans-serif, sans-serif';
const DATE_FONT = '400 11px Inter, ui-sans-serif, sans-serif';
const TIER_FONT = '600 10.5px Inter, sans-serif';
const HUM_FONT = '400 11px Inter, ui-sans-serif, sans-serif';
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
let compact = null;
let compactScroll = 0;
let compactRange = null;
let popAnchor = null;
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
/** Skips no-op remounts when the controller re-renders with the same river inputs. */
let lastPaintKey = null;
let unsubCheckins = null;
/**
 * Nav ‹ › override of the term/year windows. Cleared by Today.
 * Seeded `RIVER.ZOOMS` still wins when this is null.
 */
let zoomOverride = null;
/** The pending queue re-read after a decision, until the app hands us a fresh one. */
let fetchedGhosts = null;
/** Both zoom scales for the current width. Rebuilt on mount, never inside the frame loop. */
let scaleCache = new Map();

// Resolved once per mount from `input`.
let ZOOMS = deriveRiverZooms([], null);
let YEAR = ZOOMS.year;
let TODAY = '';
let TERMS = [];
let ITEMS = [];
let WALLS = [];
let COMMITMENTS = [];
let TIERS = [];
let MONTHS = [];
let ALL_DAYS = [];
let CAP = new Map();
let LOADS = [];
let GROUPED = {};
/** Lead point id → every item on that lane-day; ids folded into a lead. Rebuilt each mount. */
const STACKS = new Map();
const STACKED = new Set();
let SCHOOL_WEEK = '';

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

/** Stamp of inputs that require a re-layout (not a Term↔Year tween). */
function paintKey(inp) {
  return [riverInputFingerprint(inp), JSON.stringify(zoomOverride)].join('|');
}

function shiftDateYear(key, delta) {
  const year = Number(key.slice(0, 4)) + delta;
  if (!Number.isFinite(year)) return key;
  return `${year}${key.slice(4)}`;
}

function buildModel() {
  const data = river();
  TERMS = input?.terms?.length ? input.terms : (data.TERMS ?? input?.visual?.school_terms ?? []);
  TODAY = input?.today ?? data.TODAY ?? TERMS[0]?.starts_on ?? '';
  const derived = deriveRiverZooms(TERMS, TODAY);
  ZOOMS = zoomOverride ?? data.ZOOMS ?? derived;
  YEAR = ZOOMS.year ?? derived.year;
  if (!TODAY) TODAY = YEAR.from;
  WALLS = data.WALLS ?? [];
  COMMITMENTS = buildRiverCommitments(input);
  // Visual RIVER.ITEMS alone left Term/Year blank while filter chips counted hub events.
  ITEMS = resolveItems(mergeRiverItems(data.ITEMS ?? [], riverItemsFromHubEvents(input?.events ?? [])));

  ALL_DAYS = [];
  for (let date = YEAR.from; date <= YEAR.to; date = addDays(date, 1)) ALL_DAYS.push(date);

  CAP = buildRiverCapacity({ ...input, today: TODAY, terms: TERMS }, ALL_DAYS);

  LOADS = weeklyLoad({ from: YEAR.from, to: YEAR.to, terms: TERMS, commitments: COMMITMENTS, capacityFor: capFor });
  GROUPED = byLane(ITEMS);
  STACKS.clear();
  STACKED.clear();
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
  compactScroll = compact?.scroll?.scrollLeft ?? compactScroll;
  compact?.dispose?.();
  compact = null;
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
  const zoom = buildZoomPills(doc, state.zoom);
  nav.append(zoom);
  nodes.set('zoom', zoom);

  const filterState = readFilterState(input?.hub || 'life');
  const riverItems = (input?.events ?? []).map((event) => event.record || event).filter(Boolean);
  const riverVisualItems = Array.isArray(input?.visual?.RIVER?.ITEMS)
    ? input.visual.RIVER.ITEMS
    : [];
  const filterItems = [
    ...riverItems,
    ...riverVisualItems,
    ...(input?.ghosts ?? []).map((g) => g.chip || g)
  ];
  const sources = el('div', 'cal__sources', undefined, root, { 'data-part': 'sources' });

  function applyRiverFilter(next) {
    writeFilterState(input?.hub || 'life', next);
    for (const [id, node] of nodes) {
      if (!id.startsWith('item:') && !id.startsWith('bar:') && !id.startsWith('pt:') && !id.startsWith('row:')) continue;
      const itemId = id.slice(id.indexOf(':') + 1);
      const item =
        filterItems.find((row) => row.id === itemId) ||
        ITEMS.find((row) => row.id === itemId) ||
        riverItems.find((record) => record.id === itemId);
      if (!item) continue;
      const visible = isItemVisible(item, next);
      node.setAttribute?.('visibility', visible ? 'visible' : 'hidden');
      if (node.style) node.style.opacity = visible ? '' : '0';
      node.classList?.toggle?.('is-filter-hidden', !visible);
    }
    paintSourceFilter(doc, sources, {
      hub: input?.hub || 'life',
      state: next,
      counts: countByFilterKey(filterItems),
      hidden: countHidden(filterItems, next),
      feedNote: input?.icalFeedNote ?? null,
      onChange: applyRiverFilter
    });
  }

  paintSourceFilter(doc, sources, {
    hub: input?.hub || 'life',
    state: filterState,
    counts: countByFilterKey(filterItems),
    hidden: countHidden(filterItems, filterState),
    feedNote: input?.icalFeedNote ?? null,
    onChange: applyRiverFilter
  });

  const card = el('div', 'tr__card', undefined, root, { 'data-part': 'card' });
  if (state.phone && state.zoom === 'year') mountList(card);
  else {
    const views = el('div', 'tr__views', undefined, card);
    if (!state.phone) mountChart(views);
    compact = mountCompactRiver({ doc, card: views, lanes: LANES, grouped: GROUPED, window: ZOOMS.term, terms: TERMS, today: TODAY, capacity: CAP, loads: LOADS, nodes, phone: state.phone });
    const rangeKey = `${ZOOMS.term.from}|${ZOOMS.term.to}`;
    if (compactRange === rangeKey) compact.scroll.scrollLeft = compactScroll;
    else centerCompactToday();
    compactRange = rangeKey;
  }
  mountLegend(card);
  for (const [id, node] of nodes) {
    if (!id.startsWith('item:') && !id.startsWith('bar:') && !id.startsWith('pt:') && !id.startsWith('row:')) continue;
    const itemId = id.slice(id.indexOf(':') + 1);
    const item =
      filterItems.find((row) => row.id === itemId) ||
      ITEMS.find((row) => row.id === itemId) ||
      riverItems.find((record) => record.id === itemId);
    if (item && !isItemVisible(item, filterState)) {
      node.setAttribute?.('visibility', 'hidden');
      if (node.style) node.style.opacity = '0';
      node.classList?.add?.('is-filter-hidden');
    }
  }

  nodes.set('__toast', el('div', 'tr-toast', '', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'tr-pop', '', root, { role: 'dialog', 'data-part': 'popover', hidden: '' }));
  nodes.set('__live', el('div', 'tr-sr', '', root, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: clockFor(view), reducedMotion: () => view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true });
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
    settleZoomPills(zoom);
  };
  if (typeof view?.requestAnimationFrame === 'function') view.requestAnimationFrame(settle);
  else settle();
  wire(root);
  publish(view);
  if (input) lastPaintKey = paintKey(input);
  if (state.toast && Date.now() < state.toast.until) showToast(state.toast.html, { resume: true });
}

function centerCompactToday() {
  if (!compact) return;
  const heading = compact.element.querySelector('.tr-rows__week-heading.is-current');
  if (!heading) { compact.scroll.scrollLeft = 0; return; }
  const box = heading.getBoundingClientRect();
  const viewport = compact.scroll.getBoundingClientRect();
  const label = compact.element.querySelector('.tr-rows__label')?.getBoundingClientRect().width ?? 0;
  const target = compact.scroll.scrollLeft + box.left - viewport.left - label - Math.max(0, (viewport.width - label - box.width) / 2);
  compact.scroll.scrollLeft = Math.max(0, target);
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

  // Today — clamp the pill so "Today" is never clipped to "oday" at the plot edge.
  const today = s('g', { class: 'tr-today', 'data-part': 'today' }, plot);
  const line = s('line', { y1: TR.axis.tiers + 4, y2: H }, today);
  // The pill sits on the axis rule, below the week dates.
  const pill = s('rect', { y: TR.axis.h - 9, width: 52, height: 18, rx: 9 }, today);
  const text = s('text', { y: TR.axis.h + 4 }, today, 'Today');
  placers.push(X => {
    const x = X(TODAY) + 0.5 * (X(addDays(TODAY, 1)) - X(TODAY));
    const pillW = 52;
    const minX = TR.labelW;
    const maxX = Math.max(minX, W - TR.padR - pillW);
    const pillX = Math.min(maxX, Math.max(minX, x - pillW / 2));
    set(line, { x1: x, x2: x });
    set(pill, { x: pillX });
    set(text, { x: pillX + pillW / 2 });
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
    nodes.set(`bar:${item.id}`, rect);
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
  // Same lane, same day: one dot and one label ("title +1"). Two dots drawn on one spot
  // used to carry two labels (one above, one below) and cut each other to "Re…".
  const leadByDate = new Map();
  for (const point of points) {
    if (point.sample || point.shape === 'hum' || !point.date) continue;
    const lead = leadByDate.get(point.date);
    if (!lead) {
      leadByDate.set(point.date, point);
      STACKS.set(point.id, [point]);
    } else {
      STACKS.get(lead.id).push(point);
      STACKED.add(point.id);
    }
  }
  const labelled = points.filter(point => !point.sample && point.shape !== 'hum' && !STACKED.has(point.id));
  points.forEach(item => {
    if (STACKED.has(item.id)) return;
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
    if (!item.sample) nodes.set(`item:${item.id}`, node);
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
        const more = (STACKS.get(item.id)?.length ?? 1) - 1;
        const tail = more ? ` +${more}` : '';
        label.textContent = `${fitText(item.title, limit - (x + 9) - (more ? 22 : 0))}${tail}`;
      }
    });
  });
}

/** Body: the capacity line (logged solid, forecast dashed with its band) and the 40% line. */
function mountBody(group, top, h) {
  const base = top + h - 12;
  const Y = value => base - (value / 100) * (h - 26);
  const segments = [];
  for (const date of ALL_DAYS) {
    const row = CAP.get(date);
    if (!row) continue;
    const previous = segments.at(-1);
    const forecast = row.forecast === true;
    const contiguous = previous && addDays(previous.dates.at(-1), 1) === date;
    if (!previous || previous.forecast !== forecast || !contiguous) {
      segments.push({ forecast, dates: contiguous ? [previous.dates.at(-1), date] : [date] });
    } else previous.dates.push(date);
  }
  const paths = segments.map(segment => ({ ...segment,
    line: s('path', { class: `tr-line${segment.forecast ? ' is-forecast' : ''}` }, group),
    band: segment.forecast ? s('path', { class: 'tr-band' }, group) : null
  }));
  const soften = s('line', { class: 'tr-soften', y1: Y(40), y2: Y(40) }, group);
  const label = s('text', { class: 'tr-t-soften', y: Y(40) - 4, 'text-anchor': 'end' }, group, '40%');
  placers.push(X => {
    const mid = date => X(date) + 0.5 * (X(addDays(date, 1)) - X(date));
    const coordinate = (date, pct) => `${mid(date).toFixed(1)} ${Y(pct).toFixed(1)}`;
    for (const segment of paths) {
      set(segment.line, { d: segment.dates.map((date, i) => `${i ? 'L' : 'M'}${coordinate(date, capFor(date))}`).join(' ') });
      if (!segment.band) continue;
      const rows = segment.dates.filter(date => {
        const row = CAP.get(date);
        return row?.forecast && Number.isFinite(row.low) && Number.isFinite(row.high);
      });
      const up = rows.map((date, i) => `${i ? 'L' : 'M'}${coordinate(date, CAP.get(date).high)}`).join(' ');
      const down = [...rows].reverse().map(date => `L${coordinate(date, CAP.get(date).low)}`).join(' ');
      set(segment.band, { d: rows.length ? `${up} ${down} Z` : '' });
    }
    set(soften, { x1: TR.labelW, x2: W - TR.padR });
    set(label, { x: W - TR.padR - 2 });
  });
}

function mountLegend(card) {
  el('div', 'tr-legend', '<span>○ Event</span><span>◇ Task deadline</span><span>▬ Project / multi-day event</span><span><i class="lg-capacity"></i>Logged capacity</span><span><i class="lg-forecast"></i>Forecast</span><span><i class="lg-band"></i>Forecast range</span><span><i class="lg-threshold"></i>40% · ease commitments</span><span><i class="lg-school"></i>School day</span><span><i class="lg-wall"></i>Wall (trips)</span>'
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
      const when = item.shape === 'bar' ? `${dd(item.from)} – ${dd(item.to)}` : dd(item.date);
      const button = el('button', `tr-list__item${ghost ? ' is-ghost' : ''}`,
        `<span class="tr-list__t">${escapeHtml(item.title)}</span><span class="tr-list__d">${escapeHtml(when)}</span>`,
        section, { type: 'button', 'data-part': ghost ? 'ghost' : 'item', 'data-id': item.id });
      nodes.set(`item:${item.id}`, button);
    }
  }
}

/* ======================================================================== 4. Render */

/** The only function that writes geometry or motion values. */
function apply(id, props) {
  if (id === '__zoom') {
    blendT = props.t;
    if (compact) {
      compact.element.style.opacity = String(1 - blendT);
      compact.element.style.display = blendT === 1 ? 'none' : '';
      compact.element.inert = state.zoom !== 'term';
      compact.element.style.pointerEvents = state.zoom === 'term' ? '' : 'none';
      compact.element.setAttribute('aria-hidden', String(state.zoom !== 'term'));
    }
    if (state.phone) return;
    svg.style.opacity = String(blendT);
    svg.style.display = blendT === 0 ? 'none' : '';
    svg.inert = state.zoom !== 'year';
    svg.style.pointerEvents = state.zoom === 'year' ? '' : 'none';
    svg.setAttribute('aria-hidden', String(state.zoom !== 'year'));
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
    settleZoomPills(zoom);
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

/** Switch Term↔Year via the app route when available so the hash stays in sync. */
function requestZoom(name) {
  if (name !== 'term' && name !== 'year') return;
  if (name === state.zoom) return;
  if (typeof input?.onSwitchView === 'function') {
    input.onSwitchView(name);
    return;
  }
  setZoom(name);
}

/**
 * ‹ › step the focused window: adjacent school terms, or the year window by ±1 calendar year.
 * Re-lays out without replaying the reveal. Today clears the override and restores seeded/derived zooms.
 */
function stepRiver(delta) {
  if (!delta) return;
  const sorted = [...TERMS].sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
  if (state.zoom === 'year') {
    const year = ZOOMS.year ?? YEAR;
    if (!year?.from || !year?.to) return;
    zoomOverride = {
      term: { ...(ZOOMS.term ?? deriveRiverZooms(TERMS, TODAY).term) },
      year: {
        from: shiftDateYear(year.from, delta),
        to: shiftDateYear(year.to, delta),
        holidayFactor: year.holidayFactor ?? 0.5
      }
    };
    mount({ entrance: false });
    announce(delta > 0 ? 'Later year.' : 'Earlier year.');
    return;
  }
  if (!sorted.length) return;
  const focus = termNear(ZOOMS.term?.from ?? TODAY);
  const index = focus ? sorted.findIndex(term => term.starts_on === focus.starts_on && term.ends_on === focus.ends_on) : -1;
  const next = sorted[index + delta];
  if (!next) return;
  const factor = ZOOMS.term?.holidayFactor ?? 0.65;
  zoomOverride = {
    term: { from: next.starts_on, to: next.ends_on, holidayFactor: factor },
    year: { ...(ZOOMS.year ?? YEAR) }
  };
  mount({ entrance: false });
  announce(`Term ${next.term}.`);
}

function riverToday() {
  zoomOverride = null;
  mount({ entrance: false });
  if (state.zoom === 'term') centerCompactToday();
  announce('Back to today.');
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

function openPop(itemId, anchorId = itemId) {
  const item = itemById(itemId);
  const pop = nodes.get('__pop');
  const target = (state.zoom === 'term' ? compact?.element?.querySelector(`[data-id="${anchorId}"]`) : null) ?? root?.querySelector(`[data-id="${anchorId}"]`);
  if (!item || !pop || !target || !engine) return;
  const stack = state.zoom === 'year' && anchorId === itemId ? STACKS.get(itemId) ?? [] : [];
  if (stack.length > 1) {
    // Several items share this day: list them, each opens its own card.
    pop.innerHTML = `<b>${escapeHtml(dd(item.date))} · ${stack.length} items</b>`
      + `<ul class="tr-stack">${stack.map(entry => `<li><button type="button" class="tr-stack__item" data-stack-item="${escapeHtml(entry.id)}" data-stack-anchor="${escapeHtml(itemId)}">${escapeHtml(entry.title)}</button></li>`).join('')}</ul>`;
    pop.classList.remove('cal-pop--card');
    showPopAt(pop, target, itemId);
    return;
  }
  const when = item.shape === 'bar' ? `${dd(item.from)} – ${dd(item.to)}` : dd(item.date);
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
  } else {
    html = itemCardHtml(item, { kind: item.kind, routeFor: input?.routeFor, location: root?.ownerDocument?.defaultView?.location ?? null });
  }
  pop.innerHTML = html;
  pop.classList.toggle('cal-pop--card', !(ghost && receipt));
  if (!(ghost && receipt)) {
    bindItemCard(pop, item, {
      onSave: async (patch) => {
        const moveOnly = Object.keys(patch).every(key => ['date', 'start_time', 'duration_min'].includes(key));
        if (moveOnly && typeof input?.onReschedule === 'function') await input.onReschedule(item, patch);
        else await saveCalendarItem(input?.apiFetch, item, patch);
        void input?.onSourcesChanged?.();
      },
      onClose: () => closePop()
    });
  }
  showPopAt(pop, target, itemId);
}

function showPopAt(pop, target, itemId) {
  pop.hidden = false;
  pop.removeAttribute('hidden');
  const bounds = root.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const left = bounds.right - box.right > TR.popWidth + TR.popGap
    ? box.right - bounds.left + TR.popGap
    : box.left - bounds.left - TR.popWidth - TR.popGap;
  pop.style.left = `${Math.max(0, Math.min(left, bounds.width - TR.popWidth))}px`;
  const height = pop.getBoundingClientRect().height;
  const top = Math.min(box.bottom + TR.popGap, (doc.defaultView?.innerHeight ?? box.bottom + height) - height - TR.popGap);
  pop.style.top = `${Math.max(TR.popGap - bounds.top, top - bounds.top)}px`;
  popAnchor = target;
  pop.setAttribute('aria-label', 'Calendar item');
  pop.querySelector('[data-card-close],button,input,a')?.focus({ preventScroll: true });
  popFor = itemId;
  engine.place('__pop', { opacity: 0, y: TR.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: TR.popMs });
}

function closePop() {
  if (!popFor || !engine) return;
  popFor = null;
  popAnchor?.focus?.({ preventScroll: true });
  popAnchor = null;
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
      if (name === 'term' || name === 'year') return requestZoom(name);
      input?.onSwitchView?.(name);
      return;
    }
    const stepper = target.closest?.('[data-step]');
    if (stepper) return void stepRiver(Number(stepper.getAttribute('data-step')));
    if (target.closest?.('[data-today]')) return void riverToday();
    const stacked = target.closest?.('[data-stack-item]');
    if (stacked) {
      openPop(stacked.getAttribute('data-stack-item'), stacked.getAttribute('data-stack-anchor'));
      return;
    }
    const item = target.closest?.('[data-part="item"],[data-part="ghost"]');
    if (item && !item.classList?.contains?.('is-sample')) {
      const id = item.getAttribute('data-id');
      // Every item opens the item card (context, ↗ new tab) — never a silent jump.
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
    if (event.key === '+') requestZoom('term');
    if (event.key === '-') requestZoom('year');
  });
}

function publish(view) {
  const hostname = view?.location?.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
  view.__termRiver = {
    state,
    TR,
    loads: LOADS,
    capacity: date => CAP.get(date)?.pct ?? null,
    lanes: () => Object.fromEntries(Object.entries(GROUPED).map(([lane, items]) => [lane, items.map(item => item.id)])),
    setZoom,
    stepRiver,
    riverToday,
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
      if (lastHostW && Math.abs(width - lastHostW) > 2) repaintAfter(Math.max(120, entranceGuardUntil - perfNow()));
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
  const nextZoom = input.zoom === 'year' ? 'year' : 'term';
  const key = paintKey(input);

  if (fresh) {
    observer?.disconnect();
    observer = null;
    fetchedGhosts = null;
    zoomOverride = null;
    playedEntrance = false;
    entranceGuardUntil = 0;
    mountedFor = riverHost;
    observe();
    unsubCheckins?.();
    unsubCheckins = onCheckinsChange(() => { if (mountedFor) repaintAfter(0); });
    state.zoom = nextZoom;
    lastZoomInput = input.zoom;
    lastPaintKey = key;
    playedEntrance = true;
    mount({ entrance: true });
    return;
  }

  // Route zoom change (pill / Back / Forward): tween in place — no remount, no reveal.
  if (input.zoom !== lastZoomInput) {
    lastZoomInput = input.zoom;
    const changed = lastPaintKey !== key;
    if (nextZoom !== state.zoom) setZoom(nextZoom);
    if (changed) repaintAfter(TR.zoomMs + 20);
    else lastPaintKey = key;
    return;
  }

  // Same zoom echo (hashchange after onSwitchView) or unchanged inputs: keep the chart.
  if (key === lastPaintKey) return;

  if (perfNow() < entranceGuardUntil || engine?.busy()) {
    // The reveal or a zoom owns the chart: paint this data once it has finished.
    repaintAfter(Math.max(16, entranceGuardUntil - perfNow() + 16));
    return;
  }
  lastPaintKey = key;
  mount({ entrance: false });
}

export function unmountTermRiver() {
  clearTimeout(toastTimer);
  clearTimeout(repaintTimer);
  toastTimer = 0;
  repaintTimer = 0;
  observer?.disconnect();
  observer = null;
  unsubCheckins?.();
  unsubCheckins = null;
  compact?.dispose?.();
  compact = null;
  compactScroll = 0;
  compactRange = null;
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
  lastPaintKey = null;
  zoomOverride = null;
  fetchedGhosts = null;
  popFor = null;
  root = null;
  svg = null;
  input = null;
  host = null;
}
