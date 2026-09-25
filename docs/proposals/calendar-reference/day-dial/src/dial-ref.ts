/**
 * Day Dial reference implementation (Concept C, the Day zoom stop).
 *
 * THIS FILE IS THE DESIGN. Port its structure, constants, class names and data-part
 * attributes. Sections: 1 Constants · 2 Model · 3 Mount · 4 Render · 5 Interaction.
 *
 * Real modules, never re-implemented:
 *   packages/design-kit/js/dial-geometry.js      angles, arcs, radii, callout layout
 *   packages/design-kit/js/calendar-bands.js     the day's bands (context ring)
 *   apps/life/js/app/day-brief.js                Tonight and Tomorrow
 *   apps/life/js/app/capacity-model.js           the centre gauge and the week of dials
 *   apps/life/js/app/ghost-writes.js             what Accept writes (and the receipt)
 *   packages/design-kit/js/hub-motion-engine.js  the one animation engine
 *
 * Data: the Tideline fixture week (../../src/fixture.ts), Thursday 24/09/26 at 6:05 pm.
 */
import { createMotion, EASE, OVERSHOOT, MOTION, type Clock, type MotionEngine, type Props } from '../../../../../packages/design-kit/js/hub-motion-engine.js';
import { arcPath, calloutRoom, layoutCallouts, point, ringRadii, visibleSpan, angleForHour, type Rings } from '../../../../../packages/design-kit/js/dial-geometry.js';
import { bandsFromProfile } from '../../../../../packages/design-kit/js/calendar-bands.js';
import { capacityForDates } from '../../../../../apps/life/js/app/capacity-model.js';
import { holidayRun, tomorrow as tomorrowBrief, tonight as tonightBrief, clock12 } from '../../../../../apps/life/js/app/day-brief.js';
import { acceptPlan } from '../../../../../apps/life/js/app/ghost-writes.js';
import { applyHubPillsThumb } from '../../../../../packages/design-kit/js/hub-motion.js';
import * as F from '../../src/fixture';

/* ======================================================================== 1. Constants */

/** Port exactly into packages/design-kit/js/day-dial-geometry.js. */
export const DD = {
  maxSize: 620, // the dial never grows past this, however wide the column
  sidePanel: 340,
  sweepMs: 900, // entrance: the day is revealed clockwise from noon
  handMs: 700, // the now hand swings from noon to now (OVERSHOOT), starting at handDelay
  handDelay: 260,
  gaugeMs: 700,
  daySwitchMs: 480, // choosing another day re-sweeps, faster
  weekStagger: 40,
  toastInMs: 220, toastRise: 6, toastHoldMs: 5200,
  popMs: 180, popRise: 4, popWidth: 300, popGap: 10,
  acceptMs: 320,
  saveLatencyMs: 350, // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
  calloutGap: 6,
  miniSize: 68,
  callFont: '600 12px Inter, ui-sans-serif, sans-serif',
  subFont: '400 11px Inter, ui-sans-serif, sans-serif'
};

/** Text is measured once through a cache, never in the frame loop. */
const measureCtx = document.createElement('canvas').getContext('2d')!;
const measured = new Map<string, number>();
function textW(t: string, font: string) {
  const k = `${font}|${t}`;
  let w = measured.get(k);
  if (w == null) { measureCtx.font = font; w = measureCtx.measureText(t).width; measured.set(k, w); }
  return w;
}
/** Longest prefix that fits `max` px, ending in "…". The full text stays in the popover and aria-label. */
function fitText(t: string, max: number, font: string) {
  if (textW(t, font) <= max) return t;
  let lo = 0, hi = t.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (textW(t.slice(0, mid).trimEnd() + '…', font) <= max) lo = mid; else hi = mid - 1; }
  return lo > 0 ? t.slice(0, lo).trimEnd() + '…' : '';
}

/* ======================================================================== 2. Model */

const toH = (hhmm: string) => Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60;
const NOW_H = toH(F.NOW.time);
const isHoliday = (d: string) => d >= F.HOLIDAY_FROM;
const CAP = capacityForDates(F.LOGS, F.WEEK, { isHoliday });
const TERMS = [{ starts_on: '2026-07-21', ends_on: '2026-09-25' }, { starts_on: '2026-10-13', ends_on: '2026-12-17' }];

type Chip = { id: string; start: number; end: number; kind: string; title: string; meta: string; isClass?: boolean; protected?: boolean; skipped?: boolean };
type Ghost = F.Ghost & { status?: string };

const state = { day: F.NOW.date, accepted: new Set<string>(), dismissed: new Set<string>(), phone: false };
const ghostsNow = (): Ghost[] => F.GHOSTS.map(g => ({ ...g, status: state.accepted.has(g.id) ? 'accepted' : state.dismissed.has(g.id) ? 'dismissed' : 'pending' }));

function chipsFor(date: string): Chip[] {
  return F.ITEMS.filter(i => i.date === date).map(i => ({
    id: i.id, start: toH(i.start), end: toH(i.end), kind: i.kind, title: i.title, meta: i.meta,
    isClass: i.isClass, protected: i.protected,
    skipped: F.GHOSTS.some(g => g.overItem === i.id && state.accepted.has(g.id))
  }));
}
const logsFor = (date: string) => F.LOGS.filter(l => l.record.date === date).map(l => ({ ...l.record }));
const dayLabel = (d: string) => new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
const capColour = (pct: number) => (pct >= 60 ? 'var(--pastel-sage-ink)' : pct >= 40 ? 'var(--pastel-gold-ink)' : 'var(--high-sea)');
const AGENT_INITIAL: Record<string, string> = { sara: 'S', hammond: 'H', clare: 'C' };

/* ======================================================================== 3. Mount */

const NS = 'http://www.w3.org/2000/svg';
const nodes = new Map<string, Element>();
let engine: MotionEngine;
let root: HTMLElement;
let svg: SVGSVGElement;
let rings: Rings;
let toastTimer = 0;
let popFor: string | null = null;
let mountOptions: { clock?: Clock; reducedMotion?: () => boolean } = {};
let arcs: { id: string; h1: number; h2: number; r1: number; r2: number }[] = [];

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

export function mount(host: HTMLElement, options = mountOptions, { entrance = true } = {}) {
  mountOptions = options;
  engine?.dispose();
  nodes.clear();
  host.replaceChildren(); // first mount (and day switch / resize re-layout)
  state.phone = matchMedia('(max-width: 719px)').matches;
  root = el('section', 'dd', undefined, host, { 'data-part': 'day-dial', 'aria-label': 'Day' });

  const nav = el('header', 'dd__nav', undefined, root, { 'data-part': 'nav' });
  el('button', 'dd__round', '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>', nav, { type: 'button', 'aria-label': 'Previous day', 'data-step': '-1' });
  el('div', 'dd__period', `<b>${dayLabel(state.day)} ${dd(state.day)} · T3 W10</b><span>${state.day === F.NOW.date ? `${clock12(NOW_H)} · ${F.DAY_TAGS['2026-09-25'] ? 'second-last school day of term' : ''}` : F.DAY_TAGS[state.day]?.text ?? ''}</span>`, nav, { 'data-part': 'period' });
  el('button', 'dd__round', '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>', nav, { type: 'button', 'aria-label': 'Next day', 'data-step': '1' });
  el('button', 'btn btn--secondary', 'Today', nav, { type: 'button', 'data-today': '' });
  const zoom = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'Zoom', 'data-part': 'zoom-pills' });
  for (const z of ['Day', 'Week', 'Term', 'Year', 'Almanac']) el('button', `hub-pills__btn${z === 'Day' ? ' is-active' : ''}`, z, zoom, { type: 'button', 'aria-pressed': String(z === 'Day') });
  el('div', 'dd__spacer', undefined, nav);
  const view = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'View', 'data-part': 'view-pills' });
  el('button', 'hub-pills__btn is-active', 'Dial', view, { type: 'button', 'aria-pressed': 'true' });
  el('button', 'hub-pills__btn', 'Linear', view, { type: 'button', 'aria-pressed': 'false', title: 'In the hub: the Tideline one-day view', 'data-linear': '' });

  const card = el('div', 'dd__card', undefined, root, { 'data-part': 'card' });
  const body = el('div', 'dd__body', undefined, card);
  const cell = el('div', 'dd__dialcell', undefined, body, { 'data-part': 'dial-cell' });
  const side = el('div', 'dd__side', undefined, body, { 'data-part': 'side' });
  mountWeek(card);

  // The dial is laid out at its cell's real width (1 unit = 1px). Never scaled.
  const size = Math.min(DD.maxSize, Math.floor(cell.clientWidth));
  rings = ringRadii(size);
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'dd-dial');
  svg.setAttribute('viewBox', `0 0 ${size} ${rings.height}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(rings.height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('data-part', 'dial');
  svg.setAttribute('aria-label', `${dayLabel(state.day)}: a 24-hour dial with noon at the top`);
  cell.appendChild(svg);
  mountDial(size);
  mountSide(side);

  nodes.set('__toast', el('div', 'dd-toast', '', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'dd-pop', '', root, { role: 'dialog', 'data-part': 'popover', hidden: '' }));
  nodes.set('__live', el('div', 'dd-sr', '', root, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: options.clock, reducedMotion: options.reducedMotion });
  engine.place('__toast', { opacity: 0, y: DD.toastRise });
  engine.place('__pop', { opacity: 0, y: DD.popRise });
  for (const a of arcs) if (nodes.get(`arc:${a.id}`)?.classList.contains('is-ghost')) engine.place(`arc:${a.id}`, { solid: 0 });
  const pct = CAP.get(state.day)!.pct;
  if (entrance) {
    engine.place('__sweep', { h: 0 });
    engine.to('__sweep', { h: 24 }, { duration: DD.sweepMs, easing: EASE });
    engine.place('__hand', { h: 12, o: 0 });
    engine.to('__hand', { h: 12 + ((((NOW_H - 12) % 24) + 24) % 24), o: 1 }, { duration: DD.handMs, delay: DD.handDelay, easing: OVERSHOOT });
    engine.place('__gauge', { v: 0 });
    engine.to('__gauge', { v: pct }, { duration: DD.gaugeMs, easing: EASE });
    F.WEEK.forEach((d, i) => engine.enter(`wd:${d}`, { opacity: 1, y: 0 }, { from: { opacity: 0, y: 6 }, delay: i * DD.weekStagger, duration: MOTION.enter }));
  } else {
    engine.place('__sweep', { h: 24 });
    engine.place('__hand', { h: 12 + ((((NOW_H - 12) % 24) + 24) % 24), o: 1 });
    engine.place('__gauge', { v: pct });
  }
  requestAnimationFrame(() => { applyHubPillsThumb(zoom); applyHubPillsThumb(view); });
  wire(root);
}

function mountDial(size: number) {
  const { cx, cy, R } = rings;
  const date = state.day;
  const isToday = date === F.NOW.date;
  s('circle', { class: 'dd-disc', cx, cy, r: R + 8 }, svg);
  // Context ring: the day's bands, plus the sleep wall.
  const bands = bandsFromProfile({}, { school: !isHoliday(date) && new Date(`${date}T00:00:00Z`).getUTCDay() % 6 !== 0 });
  const ctx = s('g', { 'data-part': 'context-ring' }, svg);
  const [c1, c2] = rings.context;
  const segs = [{ id: 'sleep', h1: 22, h2: 6.25 }, ...bands.map(b => ({ id: b.id, h1: b.from, h2: b.to }))];
  for (const g of segs) nodes.set(`ctx:${g.id}`, s('path', { class: `dd-ctx dd-ctx--${g.id}`, 'data-h1': g.h1, 'data-h2': g.h2 }, ctx));
  // Ring labels, only when there's room.
  if (!rings.compact) {
    const lab = (h: number, t: string, cls: string) => { const p = point(cx, cy, (c1 + c2) / 2, h); s('text', { class: `dd-t-ring ${cls}`, x: p.x.toFixed(1), y: (p.y + 4).toFixed(1) }, ctx, t); };
    lab(3, 'sleep wall', 'is-sleep');
    if (bands.some(b => b.id === 'school')) lab(11.7, 'school', 'is-school');
    lab(19.75, 'yours', 'is-yours');
  }
  // Event ring
  const [e1, e2] = rings.event;
  s('circle', { class: 'dd-track', cx, cy, r: (e1 + e2) / 2, 'stroke-width': e2 - e1 }, svg);
  const ev = s('g', { 'data-part': 'event-ring' }, svg);
  arcs = [];
  const ghosts = ghostsNow();
  for (const c of chipsFor(date)) {
    const proposal = ghosts.find(g => g.overItem === c.id && g.status === 'pending');
    const inset = c.isClass ? 4 : 2;
    const cls = ['dd-arc', `k-${c.kind}`, c.isClass ? 'is-class' : '', proposal ? 'is-proposal' : '', c.skipped ? 'is-skipped' : ''].join(' ');
    const n = s('path', { class: cls, tabindex: 0, role: 'button', 'data-part': c.isClass ? 'class-arc' : 'arc', 'data-id': c.id, 'aria-label': `${c.title}. ${c.meta}` }, ev);
    nodes.set(`arc:${c.id}`, n);
    arcs.push({ id: c.id, h1: c.start, h2: c.end, r1: e1 + inset, r2: e2 - inset });
  }
  for (const g of ghosts) {
    if (!g.chip || g.chip.date !== date || g.overItem || g.status === 'dismissed') continue;
    const pending = g.status === 'pending';
    const n = s('path', { class: `dd-arc k-${g.chip.kind}${pending ? ' is-ghost' : ''}`, tabindex: 0, role: 'button', 'data-part': pending ? 'ghost-arc' : 'arc', 'data-id': g.id, 'aria-label': pending ? `${g.label}. Proposal from ${g.agent}.` : g.label }, ev);
    nodes.set(`arc:${g.id}`, n);
    arcs.push({ id: g.id, h1: toH(g.chip.start), h2: toH(g.chip.end), r1: e1 + 4, r2: e2 - 4 });
  }
  // Time left tonight: a lip outside the event ring.
  if (isToday) nodes.set('left', s('path', { class: 'dd-left', 'data-part': 'time-left' }, svg));
  // Log ring
  const logs = logsFor(date);
  s('circle', { class: 'dd-logring', cx, cy, r: rings.log }, svg);
  const logG = s('g', { 'data-part': 'log-ring' }, svg);
  const logDots: { id: string; h: number; cls: string; label: string }[] = [];
  for (const l of logs) {
    if (!l.time) continue;
    if (l.type === 'meal') logDots.push({ id: `log-${l.meal}`, h: toH(l.time), cls: 'is-meal', label: l.meal });
    if (l.type === 'diary') logDots.push({ id: 'log-symptom', h: toH(l.time), cls: 'is-symptom', label: CAP.get(date)!.factors.find((f: any) => f.id === 'symptoms')?.symptoms?.[0] ?? 'diary' });
  }
  const meals = logs.filter(l => l.type === 'meal' && l.time).map(l => toH(l.time));
  if ((!isToday || NOW_H > 15) && logs.length && !meals.some(h => h >= 11 && h < 15)) logDots.push({ id: 'log-nolunch', h: 12.75, cls: 'is-missing', label: 'no lunch' });
  for (const d of logDots) {
    const p = point(cx, cy, rings.log, d.h);
    s('circle', { class: `dd-log ${d.cls}`, cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5, 'data-part': 'log-dot', 'data-id': d.id }, logG);
  }
  // Hour ticks and labels
  for (let h = 0; h < 24; h++) {
    const a = point(cx, cy, R - 2, h), b = point(cx, cy, R + (h % 6 === 0 ? 6 : 3), h);
    s('line', { class: `dd-tick${h % 6 === 0 ? ' is-major' : ''}`, x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1) }, svg);
  }
  const hourLab = (h: number, t: string) => { const p = point(cx, cy, R + 18, h); s('text', { class: 'dd-t-hour', x: p.x.toFixed(1), y: (p.y + 4).toFixed(1) }, svg, t); };
  hourLab(12, 'noon'); hourLab(18, '6 pm'); hourLab(0, 'midnight'); hourLab(6, '6 am');
  // Callouts (not on a compact dial: the side list carries them)
  if (!rings.compact) {
    const calls: { id: string; hour: number; height: number; text: string; sub?: string; cls: string }[] = [];
    for (const c of chipsFor(date)) {
      if (c.isClass) continue;
      const proposal = ghosts.find(g => g.overItem === c.id && g.status === 'pending');
      calls.push({ id: c.id, hour: (c.start + c.end) / 2, height: 28, text: c.kind === 'corey' ? 'Corey' : c.title.replace(/ · Dr .*$/, ''), sub: proposal ? `${proposal.agent === 'sara' ? 'Sara' : 'Hammond'}: ${proposal.label.toLowerCase()}` : c.kind === 'corey' ? c.title.replace(/ with Corey$/, '') : c.meta.split(' · ')[0], cls: c.kind === 'corey' ? 'is-corey' : '' });
    }
    for (const d of logDots) calls.push({ id: d.id, hour: d.h, height: 14, text: d.label, cls: d.cls === 'is-symptom' ? 'is-symptom' : 'is-meal' });
    const room = calloutRoom(size);
    const pos = layoutCallouts(calls.map(c => ({ id: c.id, hour: c.hour, height: c.height })), { cx, cy, r: room.r, gap: DD.calloutGap, top: 8, bottom: rings.height - 8, reach: room.reach });
    const cg = s('g', { 'data-part': 'callouts' }, svg);
    for (const c of calls) {
      const p = pos.get(c.id)!;
      const a = point(cx, cy, c.height === 14 ? rings.log + 7 : rings.event[1] + 2, c.hour);
      s('path', { class: 'dd-lead', d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${p.lead.x2.toFixed(1)} ${p.lead.y2.toFixed(1)}` }, cg);
      s('text', { class: `dd-t-call ${c.cls}`, x: p.x.toFixed(1), y: (p.y + 11).toFixed(1), 'text-anchor': p.anchor, 'data-part': 'callout', 'data-id': c.id }, cg, fitText(c.text, room.width, DD.callFont));
      if (c.sub) s('text', { class: 'dd-t-sub', x: p.x.toFixed(1), y: (p.y + 25).toFixed(1), 'text-anchor': p.anchor }, cg, fitText(c.sub, room.width, DD.subFont));
    }
  }
  // Centre: capacity gauge
  const cap = CAP.get(date)!;
  const g = s('g', { 'data-part': 'gauge', 'data-pct': cap.pct }, svg);
  s('circle', { class: 'dd-gauge-track', cx, cy, r: rings.gauge, 'stroke-width': rings.gaugeWidth }, g);
  const arc = s('circle', { class: 'dd-gauge', cx, cy, r: rings.gauge, 'stroke-width': rings.gaugeWidth, stroke: capColour(cap.pct), transform: `rotate(-90 ${cx} ${cy})` }, g);
  nodes.set('gauge', arc);
  const big = Math.max(28, Math.min(48, rings.gauge * 0.42));
  // Text boxes (what a reader's eye and the spec measure) reach 1em above the baseline and ~0.25em below.
  // So the caps line's baseline sits big + 6px above the % baseline: the two boxes never touch.
  s('text', { class: 'dd-t-caps', x: cx, y: (cy + big * 0.35 - big - 6).toFixed(1) }, g, cap.forecast ? 'FORECAST' : 'CAPACITY');
  nodes.set('pct', s('text', { class: 'dd-t-pct', x: cx, y: (cy + big * 0.35).toFixed(1), 'font-size': big, fill: capColour(cap.pct) }, g, `${cap.pct}%`));
  const noteRoom = rings.gauge * 1.6; // inside the gauge ring, with air
  s('text', { class: 'dd-t-note', x: cx, y: cy + big * 0.38 + 22 }, g, fitText(cap.note, noteRoom, '400 12px Inter, ui-sans-serif, sans-serif'));
  const streak = cap.factors.find((f: any) => f.id === 'streak');
  if (streak && !rings.compact) s('text', { class: 'dd-t-note', x: cx, y: cy + big * 0.38 + 38 }, g, fitText(streak.label, noteRoom, '400 12px Inter, ui-sans-serif, sans-serif'));
  // Now hand (today only)
  if (isToday) {
    nodes.set('hand', s('line', { class: 'dd-hand', 'data-part': 'now-hand' }, svg));
    nodes.set('hand-dot', s('circle', { class: 'dd-hand-dot', r: 5 }, svg));
    // On a compact dial the time is in the Tonight heading; no label outside the ring.
    if (!rings.compact) nodes.set('hand-label', s('text', { class: 'dd-t-now' }, svg, `now ${clock12(NOW_H).replace(' pm', '').replace(' am', '')}`));
  }
}

const short = (t: string) => (t.length > 22 ? `${t.slice(0, 21).trimEnd()}…` : t).replace(' · Dr Chris Keily', '');

function mountSide(side: HTMLElement) {
  const date = state.day;
  const ghosts = ghostsNow();
  const isToday = date === F.NOW.date;
  if (isToday) {
    const t = tonightBrief({ date, now: NOW_H, chips: chipsFor(date), ghosts, logs: logsFor(date) });
    const sec = el('section', '', undefined, side, { 'data-part': 'tonight' });
    el('h4', 'dd-h', 'Tonight', sec);
    el('div', 'dd-big', `${t.timeLeft.label}<small>Now ${clock12(NOW_H)} · lights out ${t.timeLeft.until}${t.timeLeft.by ? ` (${t.timeLeft.by})` : ''}</small>`, sec, { 'data-part': 'time-left-label' });
    renderRows(el('div', 'dd-rows', undefined, sec), t.rows, ghosts);
  }
  const next = F.WEEK[F.WEEK.indexOf(date) + 1];
  if (next) {
    const tm = tomorrowBrief({
      date: next,
      chips: chipsFor(next),
      due: F.DUE.filter(d => d.date === next).map(d => ({ id: d.id, title: d.title })),
      ghosts,
      capacity: CAP.get(next),
      tag: F.DAY_TAGS[next] ?? null,
      holidayDaysAfter: holidayRun(F.WEEK[F.WEEK.indexOf(next) + 1] ?? next, TERMS)
    });
    const sec = el('section', '', undefined, side, { 'data-part': 'tomorrow' });
    el('h4', 'dd-h', `Tomorrow · ${dayLabel(next).slice(0, 3)} ${next.slice(8)}`, sec);
    el('div', 'dd-big', `${tm.headline}${tm.tag ? `<span class="dd-tag">${tm.tag}</span>` : ''}<small>${tm.note}</small>`, sec, { 'data-part': 'tomorrow-headline' });
    renderRows(el('div', 'dd-rows', undefined, sec), tm.rows, ghosts);
  }
}

function renderRows(wrap: HTMLElement, rows: any[], ghosts: Ghost[]) {
  for (const r of rows) {
    const row = el('div', `dd-row k-${r.kind}${r.struck ? ' is-struck' : ''}`, undefined, wrap, { 'data-part': 'row', 'data-title': r.title });
    el('div', 'dd-row__t', r.time, row);
    const w = el('div', 'dd-row__w', `<b>${r.kind === 'corey' ? '<span class="dd-mark"></span>' : ''}${r.title}</b><span>${r.note}</span>`, row);
    if (r.ghostId) {
      const g = ghosts.find(x => x.id === r.ghostId)!;
      if (r.suggestion) el('div', 'dd-suggest', `<span class="dd-av ${g.agent === 'sara' ? 'dd-av--sara' : ''}">${AGENT_INITIAL[g.agent]}</span><span>${r.suggestion}</span>`, w);
      el('div', 'dd-acts', `<button type="button" class="btn btn--primary" data-accept="${g.id}">${g.kind === 'skip_workout' ? 'Skip' : g.kind === 'move_task' ? 'Move' : 'Accept'}</button>${g.kind === 'bedtime' ? '' : `<button type="button" class="btn btn--ghost" data-dismiss="${g.id}">${g.kind === 'skip_workout' ? 'Keep' : 'Dismiss'}</button>`}`, w);
    }
  }
}

function mountWeek(card: HTMLElement) {
  const wk = el('div', 'dd-week', undefined, card, { 'data-part': 'week', role: 'group', 'aria-label': 'Week' });
  for (const d of F.WEEK) {
    const cap = CAP.get(d)!;
    const b = el('button', 'dd-wd', undefined, wk, { type: 'button', 'data-day': d, 'aria-pressed': String(d === state.day), 'aria-label': `${dayLabel(d)} ${d.slice(8)}, ${cap.pct}%` });
    const r = ringRadii(DD.miniSize);
    const m = 34, r1 = 18, r2 = 26, circ = 2 * Math.PI * 13;
    const school = !isHoliday(d) && new Date(`${d}T00:00:00Z`).getUTCDay() % 6 !== 0;
    let svgm = `<svg width="${DD.miniSize}" height="${DD.miniSize}" viewBox="0 0 68 68" aria-hidden="true">`;
    svgm += `<path class="dd-ctx dd-ctx--sleep" d="${arcPath(m, m, r1, r2, 22, 6.25)}"/>`;
    if (school) svgm += `<path class="dd-ctx dd-ctx--school" d="${arcPath(m, m, r1, r2, 8.25, 15 + 10 / 60)}"/>`;
    svgm += `<path class="dd-ctx dd-ctx--yours" d="${arcPath(m, m, r1, r2, 17.5, 22)}"/>`;
    for (const c of F.ITEMS.filter(i => i.date === d && !i.isClass)) svgm += `<path class="dd-arc k-${c.kind}" d="${arcPath(m, m, r2 - 2, r2 + 4, toH(c.start), toH(c.end))}"/>`;
    svgm += `<circle cx="34" cy="34" r="13" fill="none" stroke="var(--dd-track)" stroke-width="4"/><circle cx="34" cy="34" r="13" fill="none" stroke="${capColour(cap.pct)}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(circ * cap.pct / 100).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 34 34)"${cap.forecast ? ' opacity=".55"' : ''}/>`;
    svgm += `<text x="34" y="38" font-size="10" font-weight="600" fill="var(--ink)" text-anchor="middle">${cap.pct}</text></svg>`;
    void r;
    b.innerHTML = `${svgm}<b>${dayLabel(d).slice(0, 3)} ${Number(d.slice(8))}</b><span>${d === F.NOW.date ? 'today' : cap.forecast ? 'forecast' : cap.note}</span>`;
    nodes.set(`wd:${d}`, b);
  }
}

/* ======================================================================== 4. Render */

/** The only function that writes geometry or motion values. */
function apply(id: string, p: Readonly<Props>) {
  if (id === '__sweep') return renderSweep(p.h);
  if (id === '__gauge') {
    const circ = 2 * Math.PI * rings.gauge;
    nodes.get('gauge')?.setAttribute('stroke-dasharray', `${((circ * p.v) / 100).toFixed(1)} ${circ.toFixed(1)}`);
    return;
  }
  if (id === '__hand') {
    const hand = nodes.get('hand');
    if (!hand) return;
    const { cx, cy } = rings;
    const a = point(cx, cy, rings.gauge + 12, p.h), b = point(cx, cy, rings.event[1] + 10, p.h);
    hand.setAttribute('x1', a.x.toFixed(1)); hand.setAttribute('y1', a.y.toFixed(1));
    hand.setAttribute('x2', b.x.toFixed(1)); hand.setAttribute('y2', b.y.toFixed(1));
    (hand as SVGElement).style.opacity = String(p.o);
    const dot = nodes.get('hand-dot')!; dot.setAttribute('cx', b.x.toFixed(1)); dot.setAttribute('cy', b.y.toFixed(1)); (dot as SVGElement).style.opacity = String(p.o);
    const lab = nodes.get('hand-label');
    if (lab) { const l = point(cx, cy, rings.event[1] + 14, p.h); lab.setAttribute('x', (l.x + 8).toFixed(1)); lab.setAttribute('y', (l.y + 22).toFixed(1)); (lab as SVGElement).style.opacity = String(p.o); }
    return;
  }
  if (id === '__toast' || id === '__pop') {
    const n = nodes.get(id) as HTMLElement;
    n.style.opacity = String(p.opacity);
    n.style.transform = `translateY(${p.y}px)`;
    return;
  }
  if (id.startsWith('wd:')) {
    const n = nodes.get(id) as HTMLElement;
    n.style.opacity = String(p.opacity);
    n.style.transform = p.y ? `translateY(${p.y}px)` : '';
    return;
  }
  if (id.startsWith('arc:')) {
    const n = nodes.get(id) as SVGElement | undefined;
    if (n && p.solid != null) {
      n.style.strokeDasharray = p.solid >= 1 ? 'none' : '';
      n.style.fillOpacity = String(0.4 + 0.6 * p.solid);
    }
  }
}

/** Draw every arc clipped to the revealed part of the day. */
function renderSweep(sweep: number) {
  const { cx, cy } = rings;
  const [c1, c2] = rings.context;
  for (const [id, n] of nodes) {
    if (!id.startsWith('ctx:')) continue;
    const h1 = Number(n.getAttribute('data-h1')), h2 = Number(n.getAttribute('data-h2'));
    const v = visibleSpan(h1, h2, sweep);
    n.setAttribute('d', v ? arcPath(cx, cy, c1, c2, v[0], v[1]) : '');
  }
  for (const a of arcs) {
    const v = visibleSpan(a.h1, a.h2, sweep);
    nodes.get(`arc:${a.id}`)?.setAttribute('d', v ? arcPath(cx, cy, a.r1, a.r2, v[0], v[1]) : '');
  }
  const left = nodes.get('left');
  if (left) {
    const lights = ghostsNow().some(g => g.kind === 'bedtime' && g.date === state.day && g.status !== 'dismissed') ? Math.min(22, toH(F.GHOSTS.find(g => g.kind === 'bedtime')!.time!)) : 22;
    const v = visibleSpan(NOW_H, lights, sweep);
    left.setAttribute('d', v ? arcPath(cx, cy, rings.event[1] + 3, rings.event[1] + 7, v[0], v[1]) : '');
  }
}

/* ======================================================================== 5. Interaction */

function showToast(html: string) {
  const t = nodes.get('__toast') as HTMLElement;
  t.innerHTML = html;
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: DD.toastInMs });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => engine.to('__toast', { opacity: 0, y: DD.toastRise }, { duration: DD.toastInMs }), DD.toastHoldMs);
}
function ghostInput(g: Ghost) {
  const { label, meta, chip, overItem, status, ...rest } = g as any;
  return rest;
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function openPop(arcId: string) {
  const pop = nodes.get('__pop') as HTMLElement;
  const item = F.ITEMS.find(i => i.id === arcId);
  const g = ghostsNow().find(x => (x.id === arcId || x.overItem === arcId) && x.status === 'pending');
  let html = `<b>${item?.title ?? g?.label ?? ''}</b><p class="dd-pop__meta">${item?.meta ?? g?.meta ?? ''}</p>`;
  if (g) {
    if (g.overItem) html += `<p class="dd-pop__label">${g.agent === 'sara' ? 'Sara' : 'Hammond'} suggests</p><p class="dd-pop__meta">${g.label} · ${g.meta}</p>`;
    html += `<p class="dd-pop__label">Accept writes</p><p class="dd-pop__writes" data-part="write-preview">${acceptPlan(ghostInput(g), { today: F.NOW.date }).receipt}</p>`;
    html += `<div class="dd-pop__acts"><button type="button" class="btn btn--primary" data-accept="${g.id}">Accept</button>${g.kind === 'bedtime' ? '' : `<button type="button" class="btn btn--ghost" data-dismiss="${g.id}">Dismiss</button>`}</div>`;
  }
  pop.innerHTML = html;
  pop.hidden = false;
  const r = root.getBoundingClientRect();
  const b = nodes.get(`arc:${arcId}`)!.getBoundingClientRect();
  const room = r.right - b.right;
  pop.style.left = `${Math.max(0, room > DD.popWidth + DD.popGap ? b.right - r.left + DD.popGap : b.left - r.left - DD.popWidth - DD.popGap)}px`;
  pop.style.top = `${b.top - r.top}px`;
  popFor = arcId;
  engine.place('__pop', { opacity: 0, y: DD.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: DD.popMs });
}
function closePop() {
  if (!popFor) return;
  popFor = null;
  engine.to('__pop', { opacity: 0, y: DD.popRise }, { duration: DD.popMs });
  window.setTimeout(() => { if (!popFor) (nodes.get('__pop') as HTMLElement).hidden = true; }, DD.popMs);
}

async function decide(ghostId: string, decision: 'accept' | 'dismiss') {
  const g = F.GHOSTS.find(x => x.id === ghostId);
  if (!g || state.accepted.has(ghostId) || state.dismissed.has(ghostId)) return;
  closePop();
  root.querySelectorAll<HTMLButtonElement>(`[data-accept="${ghostId}"],[data-dismiss="${ghostId}"]`).forEach(b => { b.disabled = true; if (b.dataset.accept) b.textContent = 'Saving…'; });
  const plan = decision === 'accept' ? acceptPlan(ghostInput(g as Ghost), { today: F.NOW.date }) : null;
  await wait(DD.saveLatencyMs); // In the hub: POST /api/calendar-ghosts { id, decision }. Never optimistic.
  (decision === 'accept' ? state.accepted : state.dismissed).add(ghostId);
  // Re-lay out from the (new) data without replaying the entrance, then settle the arc.
  const host = root.parentElement!;
  mount(host, mountOptions, { entrance: false });
  showToast(plan ? `<b>Written.</b> ${plan.receipt}` : '<b>Dismissed.</b> Nothing written.');
  (nodes.get('__live') as HTMLElement).textContent = plan ? plan.receipt : 'Dismissed. Nothing written.';
}

function setDay(date: string) {
  if (!F.WEEK.includes(date) || date === state.day) return;
  state.day = date;
  const host = root.parentElement!;
  mount(host, mountOptions, { entrance: false });
  engine.place('__sweep', { h: 0 });
  engine.to('__sweep', { h: 24 }, { duration: DD.daySwitchMs, easing: EASE });
  engine.place('__gauge', { v: 0 });
  engine.to('__gauge', { v: CAP.get(date)!.pct }, { duration: DD.daySwitchMs, easing: EASE });
  (nodes.get('__live') as HTMLElement).textContent = `${dayLabel(date)}, capacity ${CAP.get(date)!.pct}%`;
  // The re-layout replaced the DOM: put focus back on the chosen day so arrow keys keep working.
  (nodes.get(`wd:${date}`) as HTMLElement | undefined)?.focus({ preventScroll: true });
}

function wire(r: HTMLElement) {
  r.addEventListener('click', e => {
    const t = e.target as Element;
    const acc = t.closest<HTMLElement>('[data-accept]');
    if (acc) return void decide(acc.dataset.accept!, 'accept');
    const dis = t.closest<HTMLElement>('[data-dismiss]');
    if (dis) return void decide(dis.dataset.dismiss!, 'dismiss');
    const day = t.closest<HTMLElement>('[data-day]');
    if (day) return setDay(day.dataset.day!);
    const step = t.closest<HTMLElement>('[data-step]');
    if (step) return setDay(F.WEEK[F.WEEK.indexOf(state.day) + Number(step.dataset.step)]);
    if (t.closest('[data-today]')) return setDay(F.NOW.date);
    if (t.closest('[data-linear]')) return showToast('<b>Linear</b> opens the Tideline one-day view in the hub.');
    const arc = t.closest<Element>('.dd-arc[data-id]');
    if (arc) { const id = arc.getAttribute('data-id')!; return id === popFor ? closePop() : openPop(id); }
    if (!t.closest('[data-part="popover"]')) closePop();
  });
  r.addEventListener('keydown', e => {
    const t = e.target as Element;
    if (e.key === 'Escape') closePop();
    if ((e.key === 'Enter' || e.key === ' ') && t.classList?.contains('dd-arc')) { openPop(t.getAttribute('data-id')!); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && !t.closest('input')) setDay(F.WEEK[F.WEEK.indexOf(state.day) - 1]);
    if (e.key === 'ArrowRight' && !t.closest('input')) setDay(F.WEEK[F.WEEK.indexOf(state.day) + 1]);
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
  document.getElementById('ref-reset')?.addEventListener('click', () => { state.accepted.clear(); state.dismissed.clear(); state.day = F.NOW.date; start(true); });
  document.getElementById('ref-slow')?.addEventListener('click', e => { slow = slow === 1 ? 5 : 1; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(slow === 5)); });
  document.getElementById('ref-reduced')?.addEventListener('click', e => { reduced = !reduced; (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(reduced)); });
  // Re-lay out (without the entrance) when the column width changes. Never scale.
  let lastW = 0;
  new ResizeObserver(entries => {
    const w = Math.round(entries[0].contentRect.width);
    if (lastW && Math.abs(w - lastW) > 2) requestAnimationFrame(() => start(false));
    lastW = w;
  }).observe(host);
  (window as any).__dayDial = {
    state, DD, capacity: Object.fromEntries([...CAP].map(([d, c]) => [d, c.pct])),
    rings: () => rings, setDay, decide, openPop, closePop, finish: () => engine.finish(), stats: () => engine.stats()
  };
}
boot();
