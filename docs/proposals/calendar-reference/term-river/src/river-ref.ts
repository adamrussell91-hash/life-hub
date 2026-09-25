/**
 * Term River reference implementation (Concept B, the Term and Year stops).
 *
 * THIS FILE IS THE DESIGN. Port its structure, constants, class names and data-part
 * attributes. Sections: 1 Constants · 2 Model · 3 Mount · 4 Render · 5 Interaction.
 *
 * Real modules, never re-implemented:
 *   apps/tasks/src/domain/school-time.ts         term-aware scale (promote to the kit when building)
 *   apps/life/js/app/term-river.js               lanes, week labels, weekly load
 *   apps/life/js/app/capacity-model.js           forecastSeries (the body line)
 *   apps/life/js/app/ghost-writes.js             what Accept writes
 *   packages/design-kit/js/hub-motion-engine.js  the one animation engine
 */
import { createMotion, EASE, MOTION, type Clock, type MotionEngine, type Props } from '../../../../../packages/design-kit/js/hub-motion-engine.js';
import { buildTimeScale } from '../../../../../apps/tasks/src/domain/school-time.ts';
import { LANES, byLane, riverWeekLabel, weeklyLoad, weeksBetween } from '../../../../../apps/life/js/app/term-river.js';
import { forecastSeries } from '../../../../../apps/life/js/app/capacity-model.js';
import { acceptPlan } from '../../../../../apps/life/js/app/ghost-writes.js';
import { applyHubPillsThumb } from '../../../../../packages/design-kit/js/hub-motion.js';
import * as F from './fixture';

/* ======================================================================== 1. Constants */

/** Port exactly into packages/design-kit/js/term-river-geometry.js. */
export const TR = {
  labelW: 196, // label column
  padR: 24,
  axis: { tiers: 30, weekLabel: 50, weekDate: 63, h: 76 },
  lanes: { teacher: 160, corey: 76, scholar: 64, friends: 72, body: 104 } as Record<string, number>,
  load: 104,
  bar: { h: 18, rx: 7, gap: 6 },
  point: 5,
  minWeekLabel: 46, // below this week width, the axis shows months instead of weeks
  zoomMs: 520, // Term <-> Year: one tween of the zoom blend, EASE
  revealMs: 700,
  toastInMs: 220, toastRise: 6, toastHoldMs: 5200,
  popMs: 180, popRise: 4, popWidth: 300, popGap: 10,
  saveLatencyMs: 350, // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
  font: '500 11.5px Inter, ui-sans-serif, sans-serif',
  barFont: '600 12px Inter, ui-sans-serif, sans-serif'
};

/* ======================================================================== 2. Model */

const DAY = 86_400_000;
const ms = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const key = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (k: string, n: number) => key(ms(k) + n * DAY);
const inTerm = (d: string) => F.TERMS.some(t => d >= t.starts_on && d <= t.ends_on);
const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const YEAR = F.ZOOMS.year;
const ALL_DAYS: string[] = [];
for (let d = YEAR.from; d <= YEAR.to; d = addDays(d, 1)) ALL_DAYS.push(d);

// Capacity per day: logged where known, else the forecast (the Almanac's rule).
const lastLogged = Object.keys(F.LOGGED).sort().at(-1)!;
const pattern = (d: string) => F.PATTERN.filter(p => d >= p.from && d <= p.to).reduce((a, p) => a + p.delta, 0);
const FUTURE = forecastSeries(ALL_DAYS.filter(d => d > lastLogged), { lastPct: F.LOGGED[lastLogged], lastDate: lastLogged, isHoliday: d => !inTerm(d), pattern });
const CAP = new Map<string, { pct: number; low?: number; high?: number; forecast: boolean }>();
for (const d of ALL_DAYS) if (F.LOGGED[d] != null) CAP.set(d, { pct: F.LOGGED[d], forecast: false });
for (const p of FUTURE) CAP.set(p.date, { pct: p.pct, low: p.low, high: p.high, forecast: true });
const capFor = (d: string) => CAP.get(d)?.pct ?? 70;

const LOADS = weeklyLoad({ from: YEAR.from, to: YEAR.to, terms: F.TERMS, commitments: F.COMMITMENTS, capacityFor: capFor });
const GROUPED = byLane(F.ITEMS);
const WEEK_FONT = '600 12px Inter, ui-sans-serif, sans-serif';
const DATE_FONT = '400 11px Inter, ui-sans-serif, sans-serif';
const SCHOOL_WEEK = weeksBetween(F.TERMS[0].starts_on, F.TERMS[0].starts_on)[0];

type State = { zoom: 'term' | 'year'; accepted: Set<string>; dismissed: Set<string>; phone: boolean };
const state: State = { zoom: 'term', accepted: new Set(), dismissed: new Set(), phone: false };

/* ======================================================================== 3. Mount */

const NS = 'http://www.w3.org/2000/svg';
let engine: MotionEngine;
let root: HTMLElement;
let svg: SVGSVGElement;
let W = 1000;
let H = 600;
let toastTimer = 0;
let popFor: string | null = null;
let mountOptions: { clock?: Clock; reducedMotion?: () => boolean } = {};
const nodes = new Map<string, Element>();
/** Every positioned thing registers a placer; apply('__zoom') calls them all with the blended scale. */
type Placer = (X: (d: string) => number, weekW: number) => void;
let placers: Placer[] = [];

const measureCtx = document.createElement('canvas').getContext('2d')!;
const measured = new Map<string, number>();
function textW(t: string, font: string) {
  const k = `${font}|${t}`;
  let w = measured.get(k);
  if (w == null) { measureCtx.font = font; w = measureCtx.measureText(t).width; measured.set(k, w); }
  return w;
}
function fitText(t: string, max: number, font = TR.font) {
  if (max <= 12) return '';
  if (textW(t, font) <= max) return t;
  let lo = 0, hi = t.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (textW(t.slice(0, mid).trimEnd() + '…', font) <= max) lo = mid; else hi = mid - 1; }
  return lo > 0 ? t.slice(0, lo).trimEnd() + '…' : '';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string, parent?: Element, attrs: Record<string, string> = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
}
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element, text?: string) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  parent.appendChild(n);
  return n;
}
const set = (n: Element, a: Record<string, string | number>) => { for (const [k, v] of Object.entries(a)) n.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v); };

/** X for a zoom: its range fills the plot width; holidays compressed by that zoom's factor. */
function scaleFor(zoom: 'term' | 'year') {
  const z = F.ZOOMS[zoom];
  const unit = buildTimeScale({ start: YEAR.from, end: addDays(YEAR.to, 1), terms: F.TERMS, dayWidth: 1, holidayFactor: z.holidayFactor });
  const x0 = unit.x(z.from);
  const span = unit.x(addDays(z.to, 1)) - x0;
  const plot = W - TR.labelW - TR.padR;
  return (d: string) => TR.labelW + ((unit.x(d) - x0) / span) * plot;
}

export function mount(host: HTMLElement, options = mountOptions, { entrance = true } = {}) {
  mountOptions = options;
  engine?.dispose();
  nodes.clear();
  placers = [];
  host.replaceChildren();
  state.phone = matchMedia('(max-width: 719px)').matches;
  root = el('section', 'tr', undefined, host, { 'data-part': 'term-river', 'aria-label': 'Term' });

  const nav = el('header', 'tr__nav', undefined, root, { 'data-part': 'nav' });
  el('button', 'tr__round', '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>', nav, { type: 'button', 'aria-label': 'Earlier' });
  const period = el('div', 'tr__period', '', nav, { 'data-part': 'period' });
  nodes.set('period', period);
  el('button', 'tr__round', '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>', nav, { type: 'button', 'aria-label': 'Later' });
  el('button', 'btn btn--secondary', 'Today', nav, { type: 'button' });
  const zoom = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'Zoom', 'data-part': 'zoom-pills' });
  for (const z of ['Day', 'Week', 'Term', 'Year', 'Almanac']) {
    const on = z.toLowerCase() === state.zoom;
    el('button', `hub-pills__btn${on ? ' is-active' : ''}`, z, zoom, { type: 'button', 'aria-pressed': String(on), ...(z === 'Term' || z === 'Year' ? { 'data-zoom': z.toLowerCase() } : {}) });
  }
  nodes.set('zoom', zoom);

  const card = el('div', 'tr__card', undefined, root, { 'data-part': 'card' });
  if (state.phone) mountList(card);
  else mountChart(card);
  mountLegend(card);

  nodes.set('__toast', el('div', 'tr-toast', '', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'tr-pop', '', root, { role: 'dialog', 'data-part': 'popover', hidden: '' }));
  nodes.set('__live', el('div', 'tr-sr', '', root, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: options.clock, reducedMotion: options.reducedMotion });
  engine.place('__toast', { opacity: 0, y: TR.toastRise });
  engine.place('__pop', { opacity: 0, y: TR.popRise });
  engine.place('__zoom', { t: state.zoom === 'year' ? 1 : 0 });
  if (!state.phone) {
    if (entrance) { engine.place('__reveal', { w: 0 }); engine.to('__reveal', { w: W }, { duration: TR.revealMs, easing: EASE }); }
    else engine.place('__reveal', { w: W });
  }
  updatePeriod();
  requestAnimationFrame(() => applyHubPillsThumb(zoom));
  wire(root);
}

function mountChart(card: HTMLElement) {
  W = Math.round(card.clientWidth);
  const laneTops: Record<string, number> = {};
  let y = TR.axis.h;
  for (const l of LANES) { laneTops[l.id] = y; y += TR.lanes[l.id]; }
  const loadTop = y + 8;
  H = loadTop + TR.load;
  svg = document.createElementNS(NS, 'svg');
  set(svg, { class: 'tr-chart', viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), role: 'img', 'data-part': 'chart', 'aria-label': 'Term River: your identities as lanes across the term, with capacity and weekly load' });
  card.appendChild(svg);
  const defs = s('defs', {}, svg);
  const clip = s('clipPath', { id: 'tr-plot' }, defs);
  nodes.set('plotclip', s('rect', { x: TR.labelW, y: 0, width: 0, height: H }, clip));
  const plot = s('g', { 'clip-path': 'url(#tr-plot)' }, svg);
  const labels = s('g', {}, svg);

  // Holiday washes and walls (behind everything)
  const back = s('g', { class: 'tr-back' }, plot);
  const runs: { from: string; to: string }[] = [];
  let run: string | null = null;
  for (const d of ALL_DAYS) {
    if (!inTerm(d) && run == null) run = d;
    if (inTerm(d) && run != null) { runs.push({ from: run, to: addDays(d, -1) }); run = null; }
  }
  if (run) runs.push({ from: run, to: YEAR.to });
  for (const r of runs) {
    const n = s('rect', { class: 'tr-holiday', y: TR.axis.tiers - 2, height: H - TR.axis.tiers + 2 }, back);
    placers.push(X => set(n, { x: X(r.from), width: Math.max(0, X(addDays(r.to, 1)) - X(r.from)) }));
  }
  for (const w of F.WALLS) {
    const n = s('rect', { class: 'tr-wall', y: TR.axis.h, height: loadTop - TR.axis.h, 'data-part': 'wall' }, back);
    placers.push(X => set(n, { x: X(w.from), width: Math.max(0, X(addDays(w.to, 1)) - X(w.from)) }));
  }
  // Axis: tiers
  const tiers = [
    { from: '2026-07-21', to: '2026-09-25', label: 'TERM 3', cls: 'is-term' },
    { from: '2026-09-26', to: '2026-10-12', label: 'HOLIDAYS', cls: 'is-hol' },
    { from: '2026-10-13', to: '2026-12-17', label: 'TERM 4 · ONE CLASS', cls: 'is-term' },
    { from: '2026-12-18', to: YEAR.to, label: 'SUMMER', cls: 'is-hol' }
  ];
  for (const t of tiers) {
    const r = s('rect', { class: `tr-tier ${t.cls}`, y: TR.axis.tiers - 22, height: 18, rx: 6 }, plot);
    const tx = s('text', { class: `tr-t-tier ${t.cls}`, y: TR.axis.tiers - 9 }, plot);
    placers.push(X => {
      const a = X(t.from), b = X(addDays(t.to, 1));
      set(r, { x: a + 2, width: Math.max(0, b - a - 4) });
      const vis = Math.max(a, TR.labelW) + 10;
      set(tx, { x: vis });
      tx.textContent = fitText(t.label, Math.min(b, W - TR.padR) - vis - 8, '600 10.5px Inter, sans-serif');
    });
  }
  // Axis: weeks (and months when weeks get narrow)
  const weeks = weeksBetween(YEAR.from, YEAR.to);
  for (const wk of weeks) {
    const line = s('line', { class: 'tr-weekline', y1: TR.axis.tiers + 4, y2: H }, plot);
    const lab = s('text', { class: 'tr-t-week', y: TR.axis.weekLabel }, plot, riverWeekLabel(wk, F.TERMS));
    const date = s('text', { class: 'tr-t-sub', y: TR.axis.weekDate }, plot, dd(wk));
    placers.push((X, weekW) => {
      const x = X(wk);
      set(line, { x1: x, x2: x });
      // Week labels need room, and never run past the plot's right edge.
      // Full label ("Hol W1") if it fits its own week, else the short one ("H1"), else none.
      const own = X(addDays(wk, 7)) - x;
      const room = own - 8;
      const full = riverWeekLabel(wk, F.TERMS);
      const short = full.replace(/^Hol W/, 'H').replace(/^T\d /, '');
      const fits = (t: string, font: string) => textW(t, font) <= room;
      lab.textContent = fits(full, WEEK_FONT) ? full : short;
      const inPlot = weekW >= TR.minWeekLabel && x >= TR.labelW && x + own <= W - TR.padR + 1;
      const show = inPlot && fits(lab.textContent, WEEK_FONT);
      set(lab, { x: x + 6, opacity: show ? 1 : 0 });
      set(date, { x: x + 6, opacity: show && fits(date.textContent!, DATE_FONT) ? 1 : 0 });
    });
  }
  const months = ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01'];
  for (const m of months) {
    const name = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}T00:00:00Z`));
    const lab = s('text', { class: 'tr-t-week', y: TR.axis.weekLabel + 6 }, plot, name);
    placers.push((X, weekW) => set(lab, { x: X(m) + 4, opacity: weekW < TR.minWeekLabel && X(m) >= TR.labelW && X(m) + 30 <= W - TR.padR ? 1 : 0 }));
  }
  s('line', { class: 'tr-rule', x1: 0, x2: W, y1: TR.axis.h, y2: TR.axis.h }, svg);

  // Lanes
  for (const lane of LANES) {
    const top = laneTops[lane.id];
    const h = TR.lanes[lane.id];
    if (lane.id === 'corey') s('rect', { class: 'tr-lane-wash', x: 0, y: top, width: W, height: h }, svg).parentNode!.insertBefore(svg.lastChild!, svg.firstChild);
    s('line', { class: 'tr-rule', x1: 0, x2: W, y1: top + h, y2: top + h }, svg);
    s('text', { class: `tr-t-lane${lane.id === 'corey' ? ' is-corey' : ''}`, x: 18, y: top + 24 }, labels, lane.label);
    s('text', { class: 'tr-t-sub', x: 18, y: top + 40 }, labels, lane.sub);
    const g = s('g', { 'data-part': 'lane', 'data-lane': lane.id }, plot);
    if (lane.id === 'body') mountBody(g, top, h);
    mountLaneItems(g, lane.id, top, h);
  }
  // Load strip
  s('text', { class: 'tr-t-lane', x: 18, y: loadTop + 24 }, labels, 'Load');
  s('text', { class: 'tr-t-sub', x: 18, y: loadTop + 40 }, labels, 'booked h vs capacity');
  const lg = s('g', { 'data-part': 'load' }, plot);
  const base = loadTop + TR.load - 14;
  const maxH = TR.load - 34;
  const peak = Math.max(...LOADS.map(l => Math.max(l.booked, l.capacity)), 1);
  for (const l of LOADS) {
    const bar = s('rect', { class: `tr-load${l.over ? ' is-over' : ''}${l.holiday ? ' is-hol' : ''}`, rx: 4, 'data-part': 'load-week', 'data-week': l.week, 'data-over': String(l.over) }, lg);
    const cap = s('line', { class: 'tr-cap' }, lg);
    const val = s('text', { class: `tr-t-load${l.over ? ' is-over' : ''}` }, lg);
    placers.push((X, weekW) => {
      const a = X(l.week) + 4, b = X(addDays(l.week, 7)) - 4;
      const hB = (l.booked / peak) * maxH, hC = (l.capacity / peak) * maxH;
      set(bar, { x: a, width: Math.max(0, b - a), y: base - hB, height: hB });
      set(cap, { x1: a - 2, x2: b + 2, y1: base - hC, y2: base - hC });
      set(val, { x: (a + b) / 2, y: base - Math.max(hB, hC) - 6 });
      const inside = a >= TR.labelW && b <= W - TR.padR;
      val.textContent = inside && weekW >= 40 && l.booked > 0 ? `${l.booked} h${l.over ? ' · over' : ''}` : '';
    });
  }
  // Today
  const today = s('g', { class: 'tr-today', 'data-part': 'today' }, plot);
  const tl = s('line', { y1: TR.axis.tiers + 4, y2: H }, today);
  // The pill sits on the axis rule, below the week dates.
  const tr = s('rect', { y: TR.axis.h - 9, width: 52, height: 18, rx: 9 }, today);
  const tt = s('text', { y: TR.axis.h + 4 }, today, 'Today');
  placers.push(X => { const x = X(F.TODAY) + 0.5 * (X(addDays(F.TODAY, 1)) - X(F.TODAY)); set(tl, { x1: x, x2: x }); set(tr, { x: x - 26 }); set(tt, { x }); });
}

/** Items in a lane. Bars stack in rows; points alternate above and below a centre line. */
function mountLaneItems(g: Element, laneId: string, top: number, h: number) {
  const items = GROUPED[laneId].filter(i => !(i.ghost && state.dismissed.has(i.id)));
  const bars = items.filter(i => i.shape === 'bar');
  bars.forEach((it, row) => {
    const y = top + 12 + row * (TR.bar.h + TR.bar.gap);
    const r = s('rect', { class: `tr-bar k-${laneId}`, y, height: TR.bar.h, rx: TR.bar.rx, tabindex: 0, role: 'button', 'data-part': 'item', 'data-id': it.id, 'aria-label': `${it.title}, ${dd(it.from!)} – ${dd(it.to!)}` }, g);
    const t = s('text', { class: 'tr-t-bar', y: y + 13 }, g);
    placers.push(X => {
      const a = X(it.from!), b = X(addDays(it.to!, 1));
      set(r, { x: a, width: Math.max(0, b - a) });
      const vis = Math.max(a, TR.labelW) + 8;
      set(t, { x: vis });
      t.textContent = fitText(it.title, Math.min(b, W - TR.padR) - vis - 8, TR.barFont);
    });
  });
  const points = items.filter(i => i.shape !== 'bar').sort((a, b) => (a.date ?? a.from ?? '').localeCompare(b.date ?? b.from ?? ''));
  const cy = top + (bars.length ? 12 + bars.length * (TR.bar.h + TR.bar.gap) + 22 : h / 2 + 2);
  const labelled = points.filter(p => !p.sample && p.shape !== 'hum');
  points.forEach(it => {
    if (it.shape === 'hum') {
      const line = s('line', { class: 'tr-hum', y1: cy, y2: cy }, g);
      const t = s('text', { class: 'tr-t-hum', y: cy + 18 }, g);
      const below = labelled.filter((_, k) => k % 2 === 1);
      placers.push(X => {
        const a = Math.max(X(it.from!), TR.labelW);
        set(line, { x1: a, x2: X(addDays(it.to!, 1)) });
        set(t, { x: a + 8 });
        // The hum's label runs until the first label below the line, or the plot edge.
        const limit = Math.min(W - TR.padR, ...below.map(p => X(p.date!)).filter(x => x > a + 8).map(x => x - 10));
        t.textContent = fitText(`${it.title} · ${it.sub}`, limit - (a + 8), '400 11px Inter, ui-sans-serif, sans-serif');
      });
      return;
    }
    const ghost = it.ghost && !state.accepted.has(it.id);
    const cls = ['tr-point', `k-${laneId}`, it.shape === 'diamond' ? 'is-diamond' : '', it.shape === 'marker' ? 'is-marker' : '', ghost ? 'is-ghost' : '', it.sample ? 'is-sample' : '', it.sub === 'held' || (it.ghost && state.accepted.has(it.id)) ? 'is-held' : ''].join(' ');
    const n = it.shape === 'marker'
      ? s('line', { class: cls, y1: cy - 10, y2: cy + 10, 'data-part': 'item', 'data-id': it.id }, g)
      : it.shape === 'diamond'
        ? s('rect', { class: cls, width: 12, height: 12, rx: 2, tabindex: 0, role: 'button', 'data-part': 'item', 'data-id': it.id, 'aria-label': it.title }, g)
        : s('circle', { class: cls, r: it.sample ? 3.5 : TR.point + (ghost ? 1 : 0), cy, tabindex: it.sample ? -1 : 0, role: 'button', 'data-part': it.ghost && ghost ? 'ghost' : 'item', 'data-id': it.id, 'aria-label': `${it.title}${it.date ? `, ${dd(it.date)}` : ''}${ghost ? '. Proposal from Hammond.' : ''}` }, g);
    const chip = ghost ? s('g', { class: 'tr-agent' }, g) : null;
    if (chip) { s('circle', { r: 7 }, chip); s('text', { y: 3.5 }, chip, 'H'); }
    let label: SVGTextElement | null = null;
    const k = labelled.indexOf(it);
    const above = k % 2 === 0;
    if (k >= 0) label = s('text', { class: `tr-t-point${it.shape === 'diamond' ? ' is-gold' : ''}${laneId === 'corey' ? ' is-corey' : ''}`, y: above ? cy - 19 : cy + 20 }, g) as SVGTextElement;
    placers.push(X => {
      const x = X(it.date!) + 0.5 * (X(addDays(it.date!, 1)) - X(it.date!));
      if (it.shape === 'marker') set(n, { x1: x, x2: x });
      else if (it.shape === 'diamond') set(n, { x: x - 6, y: cy - 6, transform: `rotate(45 ${x.toFixed(1)} ${cy})` });
      else set(n, { cx: x });
      if (chip) {
        // Two proposals days apart share one badge: the later one hides rather than stacking.
        const prev = points.slice(0, points.indexOf(it)).reverse().find(p => p.ghost && !state.accepted.has(p.id) && p.date);
        const crowded = prev && x - X(prev.date!) < 18;
        set(chip, { transform: `translate(${(x + 9).toFixed(1)} ${(cy - 8).toFixed(1)})`, opacity: crowded ? 0 : 1 });
      }
      if (label) {
        // Budget: up to the next labelled point on the same side, or the plot edge.
        const next = labelled.slice(k + 2).find(Boolean);
        // Labels above sit higher than the agent badge, so a badge never cuts a label.
        const limit = next ? X(next.date!) - 10 : W - TR.padR;
        set(label, { x: x + (it.shape === 'marker' ? 5 : 9) });
        label.textContent = fitText(it.title, limit - (x + 9));
      }
    });
  });
}

/** Body: the capacity line (logged solid, forecast dashed with its band) and the 40% line. */
function mountBody(g: Element, top: number, h: number) {
  const base = top + h - 12;
  const Y = (v: number) => base - (v / 100) * (h - 26);
  const band = s('path', { class: 'tr-band' }, g);
  const past = s('path', { class: 'tr-line' }, g);
  const future = s('path', { class: 'tr-line is-forecast' }, g);
  const soften = s('line', { class: 'tr-soften', y1: Y(40), y2: Y(40) }, g);
  const lab = s('text', { class: 'tr-t-soften', y: Y(40) - 4, 'text-anchor': 'end' }, g, '40%');
  placers.push(X => {
    const mid = (d: string) => X(d) + 0.5 * (X(addDays(d, 1)) - X(d));
    const pts = ALL_DAYS.map(d => [mid(d), Y(capFor(d)), CAP.get(d)] as const);
    const p = pts.filter((_, i) => ALL_DAYS[i] <= lastLogged).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const fIdx = ALL_DAYS.findIndex(d => d >= lastLogged);
    const f = pts.slice(fIdx).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const fut = pts.slice(fIdx + 1);
    const up = fut.map(([x, , c], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${Y(c?.high ?? 0).toFixed(1)}`).join(' ');
    const dn = [...fut].reverse().map(([x, , c]) => `L${x.toFixed(1)} ${Y(c?.low ?? 0).toFixed(1)}`).join(' ');
    set(past, { d: p }); set(future, { d: f }); set(band, { d: fut.length ? `${up} ${dn} Z` : '' });
    set(soften, { x1: TR.labelW, x2: W - TR.padR }); set(lab, { x: W - TR.padR - 2 });
  });
}

function mountLegend(card: HTMLElement) {
  el('div', 'tr-legend', `<span><i class="lg-school"></i>School day</span><span><i class="lg-wall"></i>Wall (trips)</span><span><i class="lg-ghost"></i>Agent proposal</span><span><i class="lg-over"></i>Over capacity</span><span class="tr-legend__note">Holidays are shown narrower, not squashed: they're where your life happens.</span>`, card, { 'data-part': 'legend' });
}

/** Phone: the same lanes as lists, this term's items in date order. Never the wide chart. */
function mountList(card: HTMLElement) {
  const list = el('div', 'tr-list', undefined, card, { 'data-part': 'lane-list' });
  const z = F.ZOOMS[state.zoom];
  for (const lane of LANES) {
    const items = GROUPED[lane.id].filter(i => !i.sample && i.shape !== 'hum' && ((i.date && i.date >= z.from && i.date <= z.to) || (i.from && i.to && i.to >= z.from && i.from <= z.to)));
    const sec = el('section', `tr-list__lane is-${lane.id}`, `<h3>${lane.label}</h3><p>${lane.sub}</p>`, list, { 'data-part': 'lane', 'data-lane': lane.id });
    if (lane.id === 'body') {
      const now = capFor(F.TODAY);
      el('p', 'tr-list__body', `Today ${now}% · forecast ${capFor(addDays(F.TODAY, 7))}% next week`, sec);
    }
    for (const it of items) {
      const ghost = it.ghost && !state.accepted.has(it.id) && !state.dismissed.has(it.id);
      el('button', `tr-list__item${ghost ? ' is-ghost' : ''}`, `<span class="tr-list__t">${it.title}</span><span class="tr-list__d">${it.date ? dd(it.date) : `${dd(it.from!)} – ${dd(it.to!)}`}</span>`, sec, { type: 'button', 'data-part': ghost ? 'ghost' : 'item', 'data-id': it.id });
    }
  }
}

/* ======================================================================== 4. Render */

let blendT = 0;
/** The only function that writes geometry or motion values. */
function apply(id: string, p: Readonly<Props>) {
  if (id === '__zoom') {
    blendT = p.t;
    if (state.phone) return;
    const A = scaleFor('term'), B = scaleFor('year');
    const X = (d: string) => A(d) + (B(d) - A(d)) * blendT;
    // A school week's width decides weeks vs months (today's week can run into compressed holidays).
    const weekW = X(addDays(SCHOOL_WEEK, 7)) - X(SCHOOL_WEEK);
    for (const place of placers) place(X, weekW);
    return;
  }
  if (id === '__reveal') {
    const r = nodes.get('plotclip');
    if (r) set(r, { width: Math.max(0, Math.min(p.w, W - TR.padR) - TR.labelW) });
    return;
  }
  if (id === '__toast' || id === '__pop') {
    const n = nodes.get(id) as HTMLElement;
    n.style.opacity = String(p.opacity);
    n.style.transform = `translateY(${p.y}px)`;
  }
}

function updatePeriod() {
  const z = F.ZOOMS[state.zoom];
  const title = state.zoom === 'term' ? 'Term 3 → Term 4' : '2026 · Term 3 to home from Korea';
  (nodes.get('period') as HTMLElement).innerHTML = `<b>${title}</b><span>${riverWeekLabel(weeksBetween(z.from, z.from)[0], F.TERMS)} – ${riverWeekLabel(weeksBetween(z.to, z.to)[0], F.TERMS)} · ${dd(z.from)}/${z.from.slice(2, 4)} – ${dd(z.to)}/${z.to.slice(2, 4)}</span>`;
}

/* ======================================================================== 5. Interaction */

function setZoom(z: 'term' | 'year') {
  if (z === state.zoom) return;
  state.zoom = z;
  const zoom = nodes.get('zoom') as HTMLElement;
  zoom.querySelectorAll<HTMLElement>('.hub-pills__btn').forEach(b => { const on = b.dataset.zoom === z; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
  zoom.classList.add('is-animated');
  applyHubPillsThumb(zoom);
  if (state.phone) { mount(root.parentElement!, mountOptions, { entrance: false }); return; }
  engine.to('__zoom', { t: z === 'year' ? 1 : 0 }, { duration: TR.zoomMs, easing: EASE });
  updatePeriod();
  (nodes.get('__live') as HTMLElement).textContent = z === 'year' ? 'Year view.' : 'Term view.';
}

function showToast(html: string) {
  const t = nodes.get('__toast') as HTMLElement;
  t.innerHTML = html;
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: TR.toastInMs });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => engine.to('__toast', { opacity: 0, y: TR.toastRise }, { duration: TR.toastInMs }), TR.toastHoldMs);
}
const ghostFor = (it: F.Item) => it.ghost ? { id: it.id, ...it.ghost } : null;

function openPop(itemId: string) {
  const it = F.ITEMS.find(i => i.id === itemId);
  const pop = nodes.get('__pop') as HTMLElement;
  if (!it) return;
  const when = it.date ? dd(it.date) : `${dd(it.from!)} – ${dd(it.to!)}`;
  const lane = LANES.find(l => GROUPED[l.id].includes(it))!;
  let html = `<b>${it.title}</b><p class="tr-pop__meta">${when} · ${lane.label}${it.sub && it.sub !== 'held' ? ` · ${it.sub}` : ''}</p>`;
  const g = ghostFor(it);
  if (g && !state.accepted.has(it.id)) {
    html += `<p class="tr-pop__label">Hammond suggests · Accept writes</p><p class="tr-pop__writes" data-part="write-preview">${acceptPlan(g as any, { today: F.TODAY }).receipt}</p>`;
    html += `<div class="tr-pop__acts"><button type="button" class="btn btn--primary" data-accept="${it.id}">Accept</button><button type="button" class="btn btn--ghost" data-dismiss="${it.id}">Dismiss</button></div>`;
  }
  pop.innerHTML = html;
  pop.hidden = false;
  const r = root.getBoundingClientRect();
  const b = root.querySelector(`[data-id="${itemId}"]`)!.getBoundingClientRect();
  const left = r.right - b.right > TR.popWidth + TR.popGap ? b.right - r.left + TR.popGap : b.left - r.left - TR.popWidth - TR.popGap;
  pop.style.left = `${Math.max(0, left)}px`;
  pop.style.top = `${b.bottom - r.top + 6}px`;
  popFor = itemId;
  engine.place('__pop', { opacity: 0, y: TR.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: TR.popMs });
}
function closePop() {
  if (!popFor) return;
  popFor = null;
  engine.to('__pop', { opacity: 0, y: TR.popRise }, { duration: TR.popMs });
  window.setTimeout(() => { if (!popFor) (nodes.get('__pop') as HTMLElement).hidden = true; }, TR.popMs);
}
const wait = (n: number) => new Promise(r => setTimeout(r, n));
async function decide(itemId: string, decision: 'accept' | 'dismiss') {
  const it = F.ITEMS.find(i => i.id === itemId);
  const g = it && ghostFor(it);
  if (!g || state.accepted.has(itemId) || state.dismissed.has(itemId)) return;
  closePop();
  const plan = decision === 'accept' ? acceptPlan(g as any, { today: F.TODAY }) : null;
  await wait(TR.saveLatencyMs); // In the hub: POST /api/calendar-ghosts { id, decision }. Never optimistic.
  (decision === 'accept' ? state.accepted : state.dismissed).add(itemId);
  mount(root.parentElement!, mountOptions, { entrance: false });
  showToast(plan ? `<b>Written.</b> ${plan.receipt}` : '<b>Dismissed.</b> Nothing written.');
}

function wire(r: HTMLElement) {
  r.addEventListener('click', e => {
    const t = e.target as Element;
    const acc = t.closest<HTMLElement>('[data-accept]');
    if (acc) return void decide(acc.dataset.accept!, 'accept');
    const dis = t.closest<HTMLElement>('[data-dismiss]');
    if (dis) return void decide(dis.dataset.dismiss!, 'dismiss');
    const z = t.closest<HTMLElement>('[data-zoom]');
    if (z) return setZoom(z.dataset.zoom as 'term' | 'year');
    const item = t.closest<Element>('[data-part="item"],[data-part="ghost"]');
    if (item && !item.classList.contains('is-sample')) { const id = item.getAttribute('data-id')!; return id === popFor ? closePop() : openPop(id); }
    if (!t.closest('[data-part="popover"]')) closePop();
  });
  r.addEventListener('keydown', e => {
    const t = e.target as Element;
    if (e.key === 'Escape') closePop();
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute?.('data-part') && ['item', 'ghost'].includes(t.getAttribute('data-part')!)) { openPop(t.getAttribute('data-id')!); e.preventDefault(); }
    if (e.key === '+' ) setZoom('term');
    if (e.key === '-') setZoom('year');
  });
}

/* ======================================================================== Reference harness (not product) */

let slow = 1;
let reduced = false;
const clock: Clock = { now: () => performance.now() / slow, request: cb => requestAnimationFrame(cb), cancel: id => cancelAnimationFrame(id) };
function boot() {
  const host = document.getElementById('app')!;
  const start = (entrance = true) => mount(host, { clock, reducedMotion: () => reduced || matchMedia('(prefers-reduced-motion: reduce)').matches }, { entrance });
  (document.fonts?.ready ?? Promise.resolve()).then(() => start(true));
  document.getElementById('ref-reset')?.addEventListener('click', () => { state.accepted.clear(); state.dismissed.clear(); state.zoom = 'term'; start(true); });
  document.getElementById('ref-slow')?.addEventListener('click', e => { slow = slow === 1 ? 5 : 1; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(slow === 5)); });
  document.getElementById('ref-reduced')?.addEventListener('click', e => { reduced = !reduced; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(reduced)); });
  let lastW = 0;
  new ResizeObserver(entries => { const w = Math.round(entries[0].contentRect.width); if (lastW && Math.abs(w - lastW) > 2) requestAnimationFrame(() => start(false)); lastW = w; }).observe(host);
  (window as any).__termRiver = { state, TR, loads: LOADS, lanes: () => Object.fromEntries(Object.entries(GROUPED).map(([k, v]) => [k, v.map(i => i.id)])), setZoom, decide, openPop, closePop, finish: () => engine.finish(), stats: () => engine.stats(), blend: () => blendT };
}
boot();
