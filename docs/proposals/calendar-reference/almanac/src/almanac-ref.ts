/**
 * The Almanac reference implementation (Concept D).
 *
 * THIS FILE IS THE DESIGN. Port its structure, constants, class names and data-part
 * attributes. Sections: 1 Constants · 2 Model · 3 Mount · 4 Layout · 5 Render · 6 Interaction.
 *
 * Real modules, never re-implemented:
 *   packages/design-kit/js/lead-lines.js      last safe days, status, summary
 *   packages/design-kit/js/openings.js        free windows matched to wants
 *   apps/life/js/app/almanac-rules.js         Adam's lead-time rules and wants
 *   apps/life/js/app/capacity-model.js        forecastSeries (the tide chart)
 *   apps/life/js/app/ghost-writes.js          what every button writes (and the receipt)
 *   apps/tasks/src/views/timeline-motion.ts   the one animation engine
 */
import { createMotion, EASE, OVERSHOOT, MOTION, type Clock, type MotionEngine, type Props } from '../../../../../apps/tasks/src/views/timeline-motion.ts';
import { addDays, almanacSummary, daysBetween, leadLines } from '../../../../../packages/design-kit/js/lead-lines.js';
import { findOpenings } from '../../../../../packages/design-kit/js/openings.js';
import { ALMANAC_RULES, ALMANAC_WANTS } from '../../../../../apps/life/js/app/almanac-rules.js';
import { forecastSeries } from '../../../../../apps/life/js/app/capacity-model.js';
import { acceptPlan } from '../../../../../apps/life/js/app/ghost-writes.js';
import { applyHubPillsThumb } from '../../../../../packages/design-kit/js/hub-motion.js';
import { formatDisplayDate } from '../../../../../packages/design-kit/js/format-display-date.js';
import * as F from './fixture';

/* ======================================================================== 1. Constants */

/** Port exactly into packages/design-kit/js/almanac-geometry.js. */
export const ALM = {
  width: 1198, // SVG user units (card inner width)
  labelX: 18,
  x0: 222, // first day centre
  rightPad: 30,
  months: { y: 20 },
  tiers: { y: 30, h: 18 },
  world: { rows: [66, 92] },
  anchors: { rows: [122, 142] },
  wave: { base: 262, h: 96, softenPct: 40 },
  lanes: { divider: 284, label: 304, top: 318, rowH: 52 },
  bead: { r: 5.5, nowR: 6.5, haloR: 11, diamond: 6 },
  labelRoom: 240, // a bead label flips to the left of its bead inside this many units of the right edge
  enterDrawMs: 520, // lead lines draw back from their anchor
  enterStagger: 60, // per lead line
  beadPopMs: MOTION.enter,
  beadStagger: 40,
  waveRevealMs: 700,
  countMs: 420, // headline numbers count to their new value
  toastInMs: 220, toastRise: 6, toastHoldMs: 5200,
  popMs: 180, popRise: 4, popWidth: 300, popGap: 10,
  saveLatencyMs: 350 // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
};

/* ======================================================================== 2. Model */

const DATES: string[] = [];
for (let d = F.RANGE.from; d <= F.RANGE.to; d = addDays(d, 1)) DATES.push(d);
const N = DATES.length;
const DX = (ALM.width - ALM.rightPad - ALM.x0) / (N - 1);
const idx = (d: string) => daysBetween(F.RANGE.from, d);
const X = (d: string) => ALM.x0 + Math.max(0, Math.min(N - 1, idx(d))) * DX;
const inTerm = (d: string) => F.TERMS.some(t => d >= t.starts_on && d <= t.ends_on);
const pattern = (d: string) => F.PATTERN.filter(p => d >= p.from && d <= p.to).reduce((a, p) => a + p.delta, 0);
const SERIES = forecastSeries(DATES, { lastPct: F.LAST_LOG.pct, lastDate: F.LAST_LOG.date, isHoliday: d => !inTerm(d), pattern });
const WD = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const DOW = (d: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][WD(d)];
const dd = (d: string) => formatDisplayDate(d).slice(0, 5);

function openingDays() {
  return SERIES.map(s => {
    const wd = WD(s.date);
    const school = inTerm(s.date) && wd >= 1 && wd <= 5;
    const busy = F.BUSY.some(b => b.date === s.date);
    return {
      date: s.date, pct: s.pct, weekday: wd, holiday: !inTerm(s.date),
      walled: wd === 0 || F.WALLS.some(w => s.date >= w.from && s.date <= w.to),
      freeDay: school || busy ? 0 : 12,
      freeEvening: F.TAKEN_EVENINGS.includes(s.date) ? 0 : school && wd !== 5 ? 3 : 4.5,
      tags: F.DAY_TAGS[s.date] ?? []
    };
  });
}
const OPENINGS = findOpenings(openingDays(), ALMANAC_WANTS as any);
const WANT_WHY = Object.fromEntries(ALMANAC_WANTS.map(w => [w.id, w.why]));

type State = { done: Set<string>; tasked: Set<string>; held: Set<string>; phone: boolean };
const state: State = { done: new Set(), tasked: new Set(), held: new Set(), phone: false };
const lines = () => leadLines(F.ANCHORS as any, ALMANAC_RULES as any, { today: F.TODAY, terms: F.TERMS, done: state.done });
const summary = () => ({ ...almanacSummary(lines()), openings: OPENINGS.filter(o => o.dates.length).length });

function whenText(o: { dates: string[]; span: string }) {
  const [a, b] = o.dates;
  if (b) return `${DOW(a)} ${dd(a).slice(0, 2)} – ${DOW(b)} ${dd(b)}`;
  if (o.span === 'evening') return `${DOW(a)} ${dd(a)} · 6–10 pm`;
  if (o.span === 'lunch') return `${DOW(a)} ${dd(a)} · lunch`;
  return `${DOW(a)} ${dd(a)} · all day`;
}
function longDate(d: string) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
}

/* ======================================================================== 3. Mount */

const NS = 'http://www.w3.org/2000/svg';
const nodes = new Map<string, Element>();
let engine: MotionEngine;
let root: HTMLElement;
let svg: SVGSVGElement;
let toastTimer = 0;
let popFor: string | null = null;
let mountOptions: { clock?: Clock; reducedMotion?: () => boolean } = {};

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

export function mount(host: HTMLElement, options = mountOptions) {
  mountOptions = options;
  engine?.dispose();
  nodes.clear();
  host.replaceChildren(); // first mount only
  state.phone = matchMedia('(max-width: 719px)').matches;
  root = el('section', 'alm', undefined, host, { 'data-part': 'almanac', 'aria-label': 'Almanac' });

  const nav = el('header', 'alm__nav', undefined, root, { 'data-part': 'nav' });
  el('button', 'alm__round', '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>', nav, { type: 'button', 'aria-label': 'Earlier' });
  el('div', 'alm__period', '<b>The Almanac · until you’re home from Korea</b><span>24/09/26 → 10/01/27 · 15 weeks</span>', nav, { 'data-part': 'period' });
  el('button', 'alm__round', '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>', nav, { type: 'button', 'aria-label': 'Later' });
  el('button', 'btn btn--secondary', 'Today', nav, { type: 'button' });
  const zoom = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'Zoom', 'data-part': 'zoom-pills' });
  for (const z of ['Day', 'Week', 'Term', 'Year', 'Almanac']) el('button', `hub-pills__btn${z === 'Almanac' ? ' is-active' : ''}`, z, zoom, { type: 'button', 'aria-pressed': String(z === 'Almanac') });
  el('div', 'alm__spacer', undefined, nav);
  el('div', 'alm__ask', '<span class="alm-av">H</span>What am I forgetting?', nav);

  const card = el('div', 'alm__card', undefined, root, { 'data-part': 'card' });
  const top = el('div', 'alm-top', undefined, card, { 'data-part': 'summary' });
  el('div', 'alm-top__thesis', 'Every calendar remembers what you booked. This one remembers what you’ll wish you had.', top);
  const sum = summary();
  for (const [id, n, label, tone] of [
    ['unbooked', sum.unbooked, 'due now that nobody booked', 'warn'],
    ['soon', sum.lastSafeSoon, 'last safe days in the next 5 weeks', ''],
    ['openings', sum.openings, 'openings that fit you', 'ok']
  ] as const) {
    const cell = el('div', 'alm-top__stat', undefined, top, { 'data-part': `stat-${id}` });
    nodes.set(`stat:${id}`, el('div', `alm-top__n${tone ? ` is-${tone}` : ''}`, String(n), cell));
    el('small', '', label, cell);
  }

  if (state.phone) mountList(card);
  else {
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${ALM.width} ${ALM.lanes.top + F.ANCHORS.length * ALM.lanes.rowH + 8}`);
    svg.setAttribute('class', 'alm-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Almanac chart: world, anchors, capacity forecast and last safe days to 10/01/27');
    svg.setAttribute('data-part', 'chart');
    card.appendChild(svg);
    mountChart();
  }
  mountOpenings(card);

  nodes.set('__toast', el('div', 'alm-toast', '', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'alm-pop', '', root, { role: 'dialog', 'data-part': 'popover', hidden: '' }));
  nodes.set('__live', el('div', 'alm-sr', '', root, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: options.clock, reducedMotion: options.reducedMotion });
  engine.place('__toast', { opacity: 0, y: ALM.toastRise });
  engine.place('__pop', { opacity: 0, y: ALM.popRise });
  for (const id of ['unbooked', 'soon', 'openings']) engine.place(`stat:${id}`, { n: Number(nodes.get(`stat:${id}`)!.textContent) });
  entrance();
  requestAnimationFrame(() => applyHubPillsThumb(zoom));
  wire(root);
}

function mountChart() {
  const g = (cls: string) => s('g', { class: cls }, svg);
  const back = g('alm-layer-back');
  // holiday washes and the Korea wall
  s('rect', { class: 'alm-holiday', x: X('2026-09-26'), y: 30, width: X('2026-10-13') - X('2026-09-26'), height: 610 }, back);
  s('rect', { class: 'alm-holiday', x: X('2026-12-18'), y: 30, width: X('2026-12-23') - X('2026-12-18'), height: 610 }, back);
  for (const w of F.WALLS) s('rect', { class: 'alm-wall', x: X(w.from), y: 98, width: X(w.to) + 6 - X(w.from), height: 542, 'data-part': 'wall' }, back);
  // months
  for (const [d, l] of [['2026-10-01', 'Oct'], ['2026-11-01', 'Nov'], ['2026-12-01', 'Dec'], ['2027-01-01', 'Jan']]) {
    s('line', { class: 'alm-month', x1: X(d), x2: X(d), y1: 8, y2: 640 }, back);
    s('text', { class: 'alm-t-month', x: X(d) + 6, y: ALM.months.y }, back, l);
  }
  s('text', { class: 'alm-t-month', x: ALM.x0 + 30, y: ALM.months.y }, back, 'Sep');
  // tiers
  const tier = (a: string, b: string, label: string, cls: string) => {
    const x = X(a), w = X(b) - X(a);
    s('rect', { class: `alm-tier ${cls}`, x: x + 2, y: ALM.tiers.y, width: w - 4, height: ALM.tiers.h, rx: 6 }, back);
    if (w > 60) s('text', { class: `alm-t-tier ${cls}`, x: x + 10, y: ALM.tiers.y + 13 }, back, label);
  };
  tier('2026-09-26', '2026-10-13', 'HOLIDAYS', 'is-hol');
  tier('2026-10-13', '2026-12-18', 'TERM 4 · ONE CLASS', 'is-term');
  tier('2026-12-18', F.RANGE.to, 'SUMMER', 'is-hol');
  // label column
  s('line', { class: 'alm-labelrule', x1: ALM.x0 - 12, x2: ALM.x0 - 12, y1: 0, y2: 640 }, back);
  const lab = (y: number, t: string, sub: string) => {
    s('text', { class: 'alm-t-lab', x: ALM.labelX, y }, back, t);
    s('text', { class: 'alm-t-sub', x: ALM.labelX, y: y + 16 }, back, sub);
  };
  lab(72, 'The world', 'BOM · NSW · NESA · listings');
  lab(118, 'Anchors', 'things already fixed');
  lab(186, 'Forecast you', 'capacity from your logs');
  // world
  const world = g('alm-layer-world');
  F.WORLD.forEach(w => {
    const y = ALM.world.rows[w.row];
    s('circle', { class: 'alm-world-dot', cx: X(w.date), cy: y - 4, r: 3.5 }, world);
    s('text', { class: 'alm-t-world', x: X(w.date) + 8, y }, world, w.title);
    if (w.sub) s('text', { class: 'alm-t-sub', x: X(w.date) + 8, y: y + 13 }, world, `${w.sub}${w.example ? ' · example' : ''}`);
  });
  // anchors row
  const anc = g('alm-layer-anchors');
  const flag = (d: string, row: number, t: string, sub: string) => {
    const x = X(d), y = ALM.anchors.rows[row];
    s('path', { class: 'alm-flag', d: `M${x} ${y + 6} V${y - 12} l9 4 -9 4` }, anc);
    s('text', { class: 'alm-t-anchor', x: x + 13, y: y - 2 }, anc, t);
    s('text', { class: 'alm-t-sub', x: x + 13, y: y + 11 }, anc, sub);
  };
  flag('2026-09-30', 0, 'UNSW conferral', '30/09');
  flag('2026-10-13', 1, 'T4 starts', '13/10');
  flag('2026-12-01', 0, 'Solo travel', 'from 01/12');
  flag('2026-12-17', 1, 'T4 ends', '17/12');
  const pill = s('g', { transform: `translate(${X('2026-12-23') + 6} 106)` }, anc);
  s('rect', { class: 'alm-pill', width: 150, height: 20, rx: 10 }, pill);
  s('text', { class: 'alm-t-pill', x: 75, y: 14 }, pill, 'Korea · 23/12 – 10/01');
  // forecast wave (revealed by a clip that grows left to right)
  const clip = s('clipPath', { id: 'alm-reveal' }, s('defs', {}, svg));
  nodes.set('wave-clip', s('rect', { x: 0, y: 0, width: 0, height: 640 }, clip));
  const wave = s('g', { class: 'alm-layer-wave', 'clip-path': 'url(#alm-reveal)', 'data-part': 'forecast' }, svg);
  const Y = (v: number) => ALM.wave.base - (v / 100) * ALM.wave.h;
  const pt = (i: number, v: number) => `${(ALM.x0 + i * DX).toFixed(1)} ${Y(v).toFixed(1)}`;
  const up = SERIES.map((p, i) => `${i ? 'L' : 'M'}${pt(i, p.high)}`).join(' ');
  const dn = SERIES.map((p, i) => [i, p] as const).reverse().map(([i, p]) => `L${pt(i, p.low)}`).join(' ');
  const ln = SERIES.map((p, i) => `${i ? 'L' : 'M'}${pt(i, p.pct)}`).join(' ');
  s('path', { class: 'alm-wave-area', d: `${ln} L${pt(N - 1, 0)} L${pt(0, 0)} Z` }, wave);
  s('path', { class: 'alm-wave-band', d: `${up} ${dn} Z` }, wave);
  s('line', { class: 'alm-wave-soften', x1: ALM.x0, x2: X(F.RANGE.to), y1: Y(ALM.wave.softenPct), y2: Y(ALM.wave.softenPct) }, wave);
  s('text', { class: 'alm-t-soften', x: X(F.RANGE.to), y: Y(ALM.wave.softenPct) + 14 }, wave, '40%');
  s('path', { class: 'alm-wave-line', d: ln }, wave);
  s('line', { class: 'alm-wave-base', x1: ALM.x0, x2: X(F.RANGE.to), y1: ALM.wave.base, y2: ALM.wave.base }, wave);
  const note = (d: string, t: string, dy = -10) => s('text', { class: 'alm-t-wave', x: X(d), y: Y(SERIES[idx(d)].pct) + dy }, wave, t);
  note('2026-10-03', 'holidays refill you');
  note('2026-11-22', 'report-writing dip (your T2 pattern)', 20);
  note('2026-12-31', 'Korea');
  for (const o of OPENINGS) for (const d of o.dates) s('circle', { class: 'alm-open-dot', cx: X(d), cy: Y(SERIES[idx(d)].pct), r: 4.5, 'data-part': 'opening-dot' }, wave);
  // lead lines
  s('line', { class: 'alm-divider', x1: 0, x2: ALM.width, y1: ALM.lanes.divider, y2: ALM.lanes.divider }, svg);
  s('text', { class: 'alm-t-caps', x: ALM.labelX, y: ALM.lanes.label }, svg, 'LAST SAFE DAYS');
  const lanes = s('g', { class: 'alm-layer-lanes' }, svg);
  const anchorsById = Object.fromEntries(F.ANCHORS.map(a => [a.id, a]));
  lines().forEach((line, row) => {
    const a = anchorsById[line.anchor.id];
    const y = ALM.lanes.top + row * ALM.lanes.rowH;
    const cy = y + 22;
    const lane = s('g', { class: `alm-lane is-${a.kind}`, 'data-part': 'lead-line', 'data-anchor': a.id }, lanes);
    s('line', { class: 'alm-lane-rule', x1: 0, x2: ALM.width, y1: y + ALM.lanes.rowH - 2, y2: y + ALM.lanes.rowH - 2 }, lane);
    s('text', { class: 'alm-t-lab', x: ALM.labelX, y: cy - 2 }, lane, a.title);
    s('text', { class: 'alm-t-sub', x: ALM.labelX, y: cy + 13 }, lane, a.sub);
    if (a.window) {
      s('rect', { class: 'alm-window', x: X(a.window.opens), y: cy - 7, width: X(a.window.closes) - X(a.window.opens), height: 14, rx: 7 }, lane);
      s('text', { class: 'alm-t-sub', x: X(a.window.closes) + 8, y: cy + 4 }, lane, `window closes ${dd(a.window.closes)}`);
    } else if (a.kind === 'dream') {
      s('line', { class: 'alm-dream', x1: X(line.from!), x2: X(F.RANGE.to), y1: cy, y2: cy }, lane);
      s('text', { class: 'alm-t-dream', x: X(F.RANGE.to), y: cy + 18 }, lane, '→ 2027');
    } else {
      nodes.set(`rail:${a.id}`, s('line', { class: 'alm-rail', x1: X(a.date!), x2: X(a.date!), y1: cy, y2: cy, 'data-from': X(line.from!), 'data-to': X(a.date!) }, lane));
      const dx = X(a.date!);
      s('rect', { class: 'alm-anchor', x: dx - 6, y: cy - 6, width: 12, height: 12, rx: 2, transform: `rotate(45 ${dx} ${cy})` }, lane);
    }
    line.steps.forEach((st, k) => {
      const x = X(st.lastSafe);
      const bead = s('g', { class: `alm-bead is-${st.status}`, transform: `translate(${x} ${cy})`, tabindex: 0, role: 'button', 'data-part': 'bead', 'data-step': st.id, 'data-status': st.status, 'aria-label': `${st.title}. Last safe day ${formatDisplayDate(st.lastSafe)}.` }, lane);
      const inner = s('g', { class: 'alm-bead__shape' }, bead);
      s('circle', { class: 'alm-bead__halo', r: ALM.bead.haloR }, inner);
      s('rect', { class: 'alm-bead__diamond', x: -ALM.bead.diamond, y: -ALM.bead.diamond, width: ALM.bead.diamond * 2, height: ALM.bead.diamond * 2, rx: 2, transform: 'rotate(45)' }, inner);
      s('circle', { class: 'alm-bead__dot', r: st.status === 'now' ? ALM.bead.nowR : ALM.bead.r }, inner);
      s('path', { class: 'alm-bead__tick', d: 'M-3 0.2 -1 2.2 3.2 -2' }, inner);
      const above = k % 2 === 0;
      const right = x > ALM.width - ALM.rightPad - ALM.labelRoom;
      const lx = right ? x - 10 : x + (st.lastSafe === F.TODAY ? 12 : -4);
      s('text', { class: `alm-t-bead${right ? ' is-end' : ''}`, x: lx, y: above ? cy - 12 : cy + 21 }, lane, st.title);
      nodes.set(`bead:${st.id}`, inner);
      nodes.set(`beadg:${st.id}`, bead);
    });
  });
  // today
  const t = s('g', { class: 'alm-today', 'data-part': 'today' }, svg);
  s('line', { x1: X(F.TODAY), x2: X(F.TODAY), y1: 16, y2: 640 }, t);
  s('rect', { x: X(F.TODAY) - 26, y: 0, width: 52, height: 18, rx: 9 }, t);
  s('text', { x: X(F.TODAY), y: 13 }, t, 'Today');
}

/** Phone: the same data as lists. No sideways scroll, ever. */
function mountList(card: HTMLElement) {
  const list = el('div', 'alm-list', undefined, card, { 'data-part': 'lead-list' });
  el('p', 'alm-list__caps', 'Last safe days', list);
  for (const line of lines()) {
    const a = F.ANCHORS.find(x => x.id === line.anchor.id)!;
    const item = el('section', `alm-list__line is-${line.status}`, `<h3>${a.title}</h3><p>${a.sub}</p>`, list, { 'data-part': 'lead-line', 'data-anchor': a.id });
    for (const st of line.steps) {
      el('button', `alm-list__step is-${st.status}`, `<span class="alm-list__dot"></span><span class="alm-list__t">${st.title}</span><span class="alm-list__d">${st.status === 'now' ? 'now' : dd(st.lastSafe)}</span>`, item, { type: 'button', 'data-part': 'bead', 'data-step': st.id, 'data-status': st.status });
    }
  }
}

function mountOpenings(card: HTMLElement) {
  const wrap = el('div', 'alm-opens', '<h4>Openings · free, high-capacity windows held for you</h4>', card, { 'data-part': 'openings' });
  for (const o of OPENINGS) {
    if (!o.dates.length) continue;
    const corey = o.with === 'corey';
    const c = el('article', `alm-open${corey ? ' is-corey' : ''}`, undefined, wrap, { 'data-part': 'opening', 'data-want': o.wantId });
    el('div', 'alm-open__when', `<span>${whenText(o)}</span><b>${o.pct}%</b>`, c);
    el('h5', '', `${corey ? '<span class="alm-mark"></span>' : ''}${o.title}`, c);
    el('p', '', WANT_WHY[o.wantId] ?? '', c);
    const btns = el('div', 'alm-open__btns', undefined, c);
    if (o.wantId === 'good-night') el('button', 'btn btn--primary', 'Hold it', btns, { type: 'button', 'data-open': o.wantId, 'data-act': 'hold' });
    if (o.wantId === 'keep-empty') el('button', 'btn btn--primary', 'Wall it', btns, { type: 'button', 'data-open': o.wantId, 'data-act': 'hold' });
    if (o.wantId === 'newcastle') el('button', 'btn btn--primary', 'Hold both days', btns, { type: 'button', 'data-open': o.wantId, 'data-act': 'hold' });
    if (F.DRAFTS[o.wantId]) el('button', `btn ${o.wantId === 'bob' ? 'btn--primary' : 'btn--secondary'}`, 'Draft a message', btns, { type: 'button', 'data-open': o.wantId, 'data-act': 'draft' });
    nodes.set(`open:${o.wantId}`, c);
  }
  const weeks = daysBetween(F.HABIT.from, F.HABIT.until) / 7;
  const c = el('article', 'alm-open is-habit', undefined, wrap, { 'data-part': 'opening', 'data-want': F.HABIT.id });
  el('div', 'alm-open__when', `<span>Hol W1 → ${dd(F.HABIT.until)}</span><b>habit</b>`, c);
  el('h5', '', F.HABIT.title, c);
  el('p', '', `${F.HABIT.minutes} min, ${F.HABIT.perWeek} times a week is about ${Math.round(weeks * F.HABIT.perWeek)} sessions before Seoul. ${F.HABIT.why}`, c);
  el('div', 'alm-open__btns', '<button class="btn btn--secondary" type="button" data-open="korean" data-act="plan">Plan it with Hammond</button>', c);
}

/* ======================================================================== 4. Layout + 5. Render */

/** The only function that writes geometry or motion values. */
function apply(id: string, p: Readonly<Props>) {
  const n = nodes.get(id) as HTMLElement | SVGElement | undefined;
  if (id === '__toast' || id === '__pop') {
    (n as HTMLElement).style.opacity = String(p.opacity);
    (n as HTMLElement).style.transform = `translateY(${p.y}px)`;
    return;
  }
  if (id === 'wave') {
    (nodes.get('wave-clip') as SVGElement | undefined)?.setAttribute('width', String(p.w)); // no chart on phone
    return;
  }
  if (id.startsWith('stat:')) {
    (n as HTMLElement).textContent = String(Math.round(p.n));
    return;
  }
  if (id.startsWith('rail:')) {
    const r = n as SVGLineElement;
    const from = Number(r.dataset.from), to = Number(r.dataset.to);
    r.setAttribute('x1', String(to + (from - to) * p.draw));
    return;
  }
  if (id.startsWith('bead:')) {
    (n as SVGElement).setAttribute('transform', `scale(${p.scale})`);
    (n as SVGElement).style.opacity = String(p.opacity);
  }
  if (id.startsWith('open:')) {
    (n as HTMLElement).style.setProperty('--held', String(p.held));
  }
}

function entrance() {
  if (!state.phone) {
    engine.place('wave', { w: 0 });
    engine.to('wave', { w: ALM.width }, { duration: ALM.waveRevealMs, easing: EASE });
    lines().forEach((line, row) => {
      if (nodes.has(`rail:${line.anchor.id}`)) {
        engine.place(`rail:${line.anchor.id}`, { draw: 0 });
        engine.to(`rail:${line.anchor.id}`, { draw: 1 }, { duration: ALM.enterDrawMs, delay: row * ALM.enterStagger, easing: EASE });
      }
      line.steps.forEach((st, k) => {
        engine.enter(`bead:${st.id}`, { opacity: 1, scale: 1 }, { from: { opacity: 0, scale: 0.4 }, delay: row * ALM.enterStagger + ALM.enterDrawMs * 0.5 + k * ALM.beadStagger, duration: ALM.beadPopMs, easing: OVERSHOOT });
      });
    });
  } else {
    engine.place('wave', { w: ALM.width });
  }
  for (const o of OPENINGS) if (nodes.has(`open:${o.wantId}`)) engine.place(`open:${o.wantId}`, { held: 0 });
}

/* ======================================================================== 6. Interaction */

function showToast(html: string) {
  const t = nodes.get('__toast') as HTMLElement;
  t.innerHTML = html;
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: ALM.toastInMs });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => engine.to('__toast', { opacity: 0, y: ALM.toastRise }, { duration: ALM.toastInMs }), ALM.toastHoldMs);
}
function refreshStats() {
  const sum = summary();
  engine.to('stat:unbooked', { n: sum.unbooked }, { duration: ALM.countMs });
  engine.to('stat:soon', { n: sum.lastSafeSoon }, { duration: ALM.countMs });
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const findStep = (id: string) => lines().flatMap(l => l.steps.map(st => ({ st, line: l }))).find(x => x.st.id === id);

function taskGhost(stepId: string) {
  const { st } = findStep(stepId)!;
  return { id: `alm-${stepId}`, agent: 'hammond', kind: 'create_task', title: st.title, due: st.lastSafe, source: `almanac:${stepId}` };
}

function openPop(stepId: string) {
  const hit = findStep(stepId);
  const pop = nodes.get('__pop') as HTMLElement;
  if (!hit) return;
  const { st } = hit;
  const rule = ALMANAC_RULES.find(r => r.id === st.ruleId)!;
  const left = st.daysLeft < 0 ? `${-st.daysLeft} days late` : st.daysLeft === 0 ? 'today' : `${st.daysLeft} days left`;
  let html = `<div class="alm-pop__head"><b>${st.title}</b></div><p class="alm-pop__meta">Last safe day <b>${formatDisplayDate(st.lastSafe)}</b> · ${left}</p><p class="alm-pop__why">${rule.why ?? ''}</p>`;
  if (st.status !== 'done') {
    const receipt = state.tasked.has(stepId) ? 'Already on your task list.' : acceptPlan(taskGhost(stepId) as any, { today: F.TODAY }).receipt;
    html += `<p class="alm-pop__label">Add as task writes</p><p class="alm-pop__writes" data-part="write-preview">${receipt}</p>`;
    html += `<div class="alm-pop__acts">${state.tasked.has(stepId) ? '' : `<button type="button" class="btn btn--primary" data-task="${stepId}">Add as task</button>`}<button type="button" class="btn btn--secondary" data-done="${stepId}">Already done</button></div>`;
  }
  pop.innerHTML = html;
  pop.hidden = false;
  const r = root.getBoundingClientRect();
  const b = (nodes.get(`beadg:${stepId}`) ?? root.querySelector(`[data-step="${stepId}"]`))!.getBoundingClientRect();
  const x = b.right - r.left + ALM.popGap;
  pop.style.left = `${Math.min(x, r.width - ALM.popWidth - 8)}px`;
  pop.style.top = `${b.bottom - r.top + 6}px`;
  popFor = stepId;
  engine.place('__pop', { opacity: 0, y: ALM.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: ALM.popMs });
}
function closePop() {
  if (!popFor) return;
  popFor = null;
  engine.to('__pop', { opacity: 0, y: ALM.popRise }, { duration: ALM.popMs });
  window.setTimeout(() => { if (!popFor) (nodes.get('__pop') as HTMLElement).hidden = true; }, ALM.popMs);
}

function setBeadStatus(stepId: string, status: string) {
  root.querySelectorAll(`[data-step="${stepId}"]`).forEach(b => {
    b.setAttribute('class', (b.getAttribute('class') ?? '').replace(/is-(overdue|now|soon|later|done)/, `is-${status}`));
    b.setAttribute('data-status', status);
  });
  // A pulse: jump to 1.25, spring back. One tween, no timers.
  engine.place(`bead:${stepId}`, { scale: 1.25 });
  engine.to(`bead:${stepId}`, { scale: 1 }, { duration: 320, easing: OVERSHOOT });
}

async function addTask(stepId: string) {
  const plan = acceptPlan(taskGhost(stepId) as any, { today: F.TODAY });
  closePop();
  await wait(ALM.saveLatencyMs); // In the hub: POST /api/calendar-ghosts { id, decision: 'accept' }
  state.tasked.add(stepId);
  root.querySelectorAll(`[data-step="${stepId}"]`).forEach(b => b.classList.add('is-tasked'));
  showToast(`<b>Written.</b> ${plan.receipt}`);
  (nodes.get('__live') as HTMLElement).textContent = plan.receipt;
}
function markDone(stepId: string) {
  closePop();
  state.done.add(stepId);
  setBeadStatus(stepId, 'done');
  refreshStats();
  showToast('<b>Marked done.</b> The Almanac stops asking about it.');
}

async function openingAction(wantId: string, act: string, btn: HTMLButtonElement) {
  const o = OPENINGS.find(x => x.wantId === wantId);
  const card = nodes.get(`open:${wantId}`) as HTMLElement | undefined;
  if (act === 'plan') return showToast('<b>Nothing written yet.</b> Hammond will propose the slots as ghosts in your week, only on days forecast at 50% or more.');
  if (!o || !card) return;
  btn.disabled = true;
  if (act === 'draft') {
    const d = F.DRAFTS[wantId];
    const when = o.dates.length === 2 ? `${longDate(o.dates[0])} and ${longDate(o.dates[1])}` : longDate(o.dates[0]);
    const plan = acceptPlan({ id: `alm-draft-${wantId}`, agent: 'hammond', kind: 'draft_message', to: d.to, text: d.text.replace('{when}', when) } as any);
    const draft = plan.steps[0] as { text: string };
    const box = el('div', 'alm-draft', `<p>${draft.text}</p><button class="btn btn--secondary" type="button" data-copy>Copy</button>`, card, { 'data-part': 'draft' });
    box.querySelector<HTMLButtonElement>('[data-copy]')!.addEventListener('click', async e => {
      const b = e.currentTarget as HTMLButtonElement;
      try { await navigator.clipboard.writeText(draft.text); b.textContent = 'Copied'; } catch { const r = document.createRange(); r.selectNodeContents(box.querySelector('p')!); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); b.textContent = 'Selected'; }
    });
    showToast(`<b>${plan.receipt}</b>`);
    return;
  }
  const blocks = wantId === 'good-night'
    ? [{ date: o.dates[0], start: '18:00', end: '22:00', title: 'Good night: dinner out + a show', with: 'corey' }]
    : wantId === 'keep-empty'
      ? [{ date: o.dates[0], start: '06:00', end: '22:00', title: 'Keep empty (daylight saving)' }]
      : o.dates.map(date => ({ date, start: '08:00', end: '21:00', title: 'Newcastle · friends' }));
  const plans = blocks.map((b, i) => acceptPlan({ id: `alm-hold-${wantId}-${i}`, agent: 'hammond', kind: 'protect_block', ...b } as any, { today: F.TODAY }));
  btn.textContent = 'Saving…';
  await wait(ALM.saveLatencyMs);
  state.held.add(wantId);
  card.classList.add('is-held');
  btn.textContent = wantId === 'good-night' ? 'Held for you both' : wantId === 'keep-empty' ? 'Walled' : 'Held';
  engine.to(`open:${wantId}`, { held: 1 }, { duration: 320 });
  showToast(`<b>Written.</b> ${plans.map(p => p.receipt).join(' ')}`);
}

function wire(r: HTMLElement) {
  r.addEventListener('click', e => {
    const t = e.target as Element;
    const task = t.closest<HTMLElement>('[data-task]');
    if (task) return void addTask(task.dataset.task!);
    const done = t.closest<HTMLElement>('[data-done]');
    if (done) return markDone(done.dataset.done!);
    const act = t.closest<HTMLButtonElement>('[data-open]');
    if (act) return void openingAction(act.dataset.open!, act.dataset.act!, act);
    const bead = t.closest<Element>('[data-part="bead"]');
    if (bead) { const id = bead.getAttribute('data-step')!; return id === popFor ? closePop() : openPop(id); }
    if (!t.closest('[data-part="popover"]')) closePop();
  });
  r.addEventListener('keydown', e => {
    const t = e.target as Element;
    if (e.key === 'Escape') closePop();
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute('data-part') === 'bead' && t.tagName !== 'BUTTON') { openPop(t.getAttribute('data-step')!); e.preventDefault(); }
  });
}

/* ======================================================================== Reference harness (not product) */

let slow = 1;
let reduced = false;
const clock: Clock = { now: () => performance.now() / slow, request: cb => requestAnimationFrame(cb), cancel: id => cancelAnimationFrame(id) };
function boot() {
  const host = document.getElementById('app')!;
  const start = () => mount(host, { clock, reducedMotion: () => reduced || matchMedia('(prefers-reduced-motion: reduce)').matches });
  (document.fonts?.ready ?? Promise.resolve()).then(start);
  document.getElementById('ref-reset')?.addEventListener('click', () => { state.done.clear(); state.tasked.clear(); state.held.clear(); start(); });
  document.getElementById('ref-slow')?.addEventListener('click', e => { slow = slow === 1 ? 5 : 1; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(slow === 5)); });
  document.getElementById('ref-reduced')?.addEventListener('click', e => { reduced = !reduced; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(reduced)); });
  let wasPhone = matchMedia('(max-width: 719px)').matches;
  matchMedia('(max-width: 719px)').addEventListener('change', ev => { if (ev.matches !== wasPhone) { wasPhone = ev.matches; start(); } });
  (window as any).__almanac = {
    state, ALM, lines, summary, openings: OPENINGS, series: SERIES,
    openPop, closePop, addTask, markDone, finish: () => engine.finish(), stats: () => engine.stats()
  };
}
boot();
