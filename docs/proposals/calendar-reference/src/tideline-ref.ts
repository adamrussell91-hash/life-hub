/**
 * Tideline reference implementation (Concept A).
 *
 * THIS FILE IS THE DESIGN. Port its structure, constants, class names and data-part
 * attributes. Do not reinterpret it. Sections:
 *   1. Constants (port exactly)
 *   2. Model (derived from fixture through the real modules)
 *   3. Mount (creates DOM once)
 *   4. Layout (pure: heights -> Map<entityId, Props>)
 *   5. Render (engine apply: the ONLY place geometry is written)
 *   6. Interaction (bands, ghosts, keyboard)
 *
 * Real modules used, never re-implemented:
 *   packages/design-kit/js/calendar-bands.js   band geometry and chip density
 *   apps/life/js/app/capacity-model.js         capacity %, note, over flag
 *   apps/life/js/app/ghost-writes.js           what Accept writes (and the receipt text)
 *   apps/tasks/src/views/timeline-motion.ts    the one animation engine
 */
import { createMotion, EASE, MOTION, type Clock, type MotionEngine, type Props } from '../../../../apps/tasks/src/views/timeline-motion.ts';
import { bandTargets, bandsFromProfile, baseHeights, blockGeometry, SLEEP_STRIP_PX, totalHeight, yForHour } from '../../../../packages/design-kit/js/calendar-bands.js';
import { capacityForDates, dayLoadHours, isOverCapacity } from '../../../../apps/life/js/app/capacity-model.js';
import { acceptPlan, dismissPlan } from '../../../../apps/life/js/app/ghost-writes.js';
import { applyHubPillsThumb } from '../../../../packages/design-kit/js/hub-motion.js';
import * as F from './fixture';

/* ======================================================================== 1. Constants */

/** Port exactly into packages/design-kit/js/calendar-tideline-geometry.js. */
export const CAL = {
  bandMs: 420, // band expand / fold. One tween of the band heights, EASE.
  acceptMs: 320, // ghost dashed -> solid
  exitMs: MOTION.exit, // dismissed ghost fades out
  enterMs: MOTION.enter, // first mount: columns rise in
  enterStagger: 30, // per column
  enterRise: 8, // px
  toastInMs: 220,
  toastRise: 6,
  toastHoldMs: 5200,
  applyAllStagger: 90, // ms between ghosts on Apply all
  saveLatencyMs: 350, // PROTOTYPE ONLY: stands in for POST /api/calendar-ghosts
  fade: { title: [14, 20], meta: [38, 46], actions: [62, 70] } as Record<string, [number, number]>,
  lineBox: 15, // one title line: 12px text x 1.25 line height
  cardAt: 38, // at or above: card padding and a meta line
  twoLinesAt: 56, // at or above: title may take 2 lines (2 x 15 + meta 13 + padding 12 + border 2 = 57)
  popMs: 180, // chip popover in / out
  popRise: 4,
  popWidth: 288,
  popGap: 8
};

const BANDS = bandsFromProfile(); // week view: every column shares the school-day stack
const SUBS: Record<string, string> = {
  morning: 'up 6:15',
  school: '8:15 – bell 3:10',
  after: 'work window to 5:30',
  yours: 'home ~5:30 · the hours that count'
};
const TOTAL = totalHeight(baseHeights(BANDS));
const BODY_H = TOTAL + SLEEP_STRIP_PX;
const AGENT_INITIAL: Record<string, string> = { sara: 'S', hammond: 'H', clare: 'C', chadwick: 'Ch' };

/* ======================================================================== 2. Model */

const toH = (hhmm: string) => Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60;
const isHoliday = (d: string) => d >= F.HOLIDAY_FROM;
const CAP = capacityForDates(F.LOGS, F.WEEK, { isHoliday });

type Chip = {
  id: string; date: string; start: number; end: number; kind: F.Kind; title: string; meta: string;
  isClass?: boolean; protected?: boolean; ghost?: F.Ghost; overItem?: string;
};
function chipsFor(date: string): Chip[] {
  const items: Chip[] = F.ITEMS.filter(i => i.date === date).map(i => ({ ...i, start: toH(i.start), end: toH(i.end) }));
  for (const g of F.GHOSTS) {
    if (!g.chip || g.chip.date !== date || g.overItem) continue;
    items.push({ id: g.id, date, start: toH(g.chip.start), end: toH(g.chip.end), kind: g.chip.kind, title: g.label, meta: g.meta, ghost: g, overItem: g.overItem });
  }
  return items;
}
function dayInfo(date: string) {
  const cap = CAP.get(date)!;
  const load = dayLoadHours(chipsFor(date).map(c => ({ start: c.start, end: c.end, kind: c.kind, isClass: c.isClass, protected: c.protected, ghost: !!c.ghost })));
  const over = !cap.forecast && isOverCapacity(cap.pct, load);
  const logs = F.LOGS.filter(l => l.record.date === date);
  const sleep = logs.find(l => l.record.type === 'sleep')?.record.duration_h as number | undefined;
  const energy = logs.find(l => l.record.type === 'diary' && l.record.energy)?.record.energy as string | undefined;
  const meals = logs.filter(l => l.record.type === 'meal').length;
  const symptom = cap.factors.find((f: any) => f.id === 'symptoms')?.symptoms?.[0] as string | undefined;
  return { cap, over, sleep, energy, meals, symptom };
}
function capColour(pct: number) {
  return pct >= 60 ? 'var(--pastel-sage-ink)' : pct >= 40 ? 'var(--pastel-gold-ink)' : 'var(--high-sea)';
}
/** The ghost as ghost-writes.js expects it (display fields stripped). */
function ghostInput(g: F.Ghost) {
  const { label, meta, chip, overItem, ...rest } = g;
  return rest;
}

/* ======================================================================== 3. Mount */

type State = {
  expanded: number | null;
  accepted: Set<string>;
  dismissed: Set<string>;
  busy: Set<string>;
  phone: boolean;
  phoneDay: string;
};
const state: State = { expanded: null, accepted: new Set(), dismissed: new Set(), busy: new Set(), phone: false, phoneDay: F.NOW.date };
const nodes = new Map<string, HTMLElement>(); // entityId -> element
let engine: MotionEngine;
let heights = baseHeights(BANDS);
let root: HTMLElement;
let toastTimer = 0;
let mountOptions: { clock?: Clock; reducedMotion?: () => boolean } = {};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string, parent?: HTMLElement, attrs: Record<string, string> = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
}
const ICON = {
  prev: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>',
  moon: '<svg viewBox="0 0 12 12"><path d="M8.8 8.3A4.3 4.3 0 0 1 4 2.1a4.3 4.3 0 1 0 4.8 6.2z"/></svg>',
  bolt: '<svg viewBox="0 0 12 12"><path d="M6.8 1 3 7h3l-.8 4L9 5H6z"/></svg>',
  fork: '<svg viewBox="0 0 12 12"><path d="M3.5 1v4a1.5 1.5 0 0 0 3 0V1M5 5.5V11M9 1c-1 .5-1.5 2-1.5 3.5S8 6.5 9 6.5V11"/></svg>',
  lock: '<svg viewBox="0 0 10 10"><rect x="1.5" y="4.5" width="7" height="5" rx="1"/><path d="M3 4.5V3a2 2 0 0 1 4 0v1.5"/></svg>',
  chev: '<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4"/></svg>'
};
const DOW = (d: string) => new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)).toUpperCase();
const DOM_NUM = (d: string) => String(Number(d.slice(8, 10)));

export function mount(host: HTMLElement, options: { clock?: Clock; reducedMotion?: () => boolean } = mountOptions) {
  mountOptions = options;
  engine?.dispose();
  nodes.clear();
  host.replaceChildren(); // first mount only
  root = el('section', 'cal', undefined, host, { 'data-part': 'tideline', 'aria-label': 'Week calendar' });
  state.phone = matchMedia('(max-width: 719px)').matches;
  const days = state.phone ? [state.phoneDay] : F.WEEK;
  root.style.setProperty('--cal-days', String(days.length));

  // Nav
  const nav = el('header', 'cal__nav', undefined, root, { 'data-part': 'nav' });
  el('button', 'cal__round', ICON.prev, nav, { type: 'button', 'aria-label': 'Previous week' });
  el('div', 'cal__period', `<b>${F.WEEK_LABEL.title}</b><span>${F.WEEK_LABEL.range}</span>`, nav, { 'data-part': 'period' });
  el('button', 'cal__round', ICON.next, nav, { type: 'button', 'aria-label': 'Next week' });
  el('button', 'btn btn--secondary', 'Today', nav, { type: 'button' });
  const zoom = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'Zoom', 'data-part': 'zoom-pills' });
  for (const z of ['Day', 'Week', 'Term', 'Year', 'Almanac']) {
    el('button', `hub-pills__btn${z === 'Week' ? ' is-active' : ''}`, z, zoom, { type: 'button', 'aria-pressed': String(z === 'Week') });
  }
  el('div', 'cal__spacer', undefined, nav);
  const focusWrap = el('div', 'cal__focus', 'Focus', nav);
  const focus = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', focusWrap, { role: 'group', 'aria-label': 'Focus band', 'data-part': 'focus-pills' });
  el('button', 'hub-pills__btn is-active', 'Balanced', focus, { type: 'button', 'data-band': 'none', 'aria-pressed': 'true' });
  BANDS.forEach((b, i) => el('button', 'hub-pills__btn', b.label, focus, { type: 'button', 'data-band': String(i), 'aria-pressed': 'false' }));

  // Tray
  const tray = el('div', 'cal__tray', undefined, root, { 'data-part': 'tray' });
  el('span', 'cal-av', 'H', tray, { 'aria-hidden': 'true' });
  el('span', '', `<b>${F.TRAY.headline}</b> <span class="cal__tray-detail">· ${F.TRAY.detail}</span>`, tray);
  el('span', 'cal__spacer', undefined, tray);
  el('button', 'btn btn--primary', 'Apply all', tray, { type: 'button', 'data-action': 'apply-all', 'data-part': 'apply-all' });
  el('button', 'btn btn--secondary', 'Review', tray, { type: 'button' });
  el('button', 'btn btn--ghost', 'Dismiss', tray, { type: 'button' });

  // Phone week strip
  const strip = el('div', 'cal-strip', undefined, root, { 'data-part': 'day-strip', role: 'group', 'aria-label': 'Day' });
  for (const d of F.WEEK) {
    const c = CAP.get(d)!;
    const b = el('button', '', `<small>${DOW(d)}</small><b>${DOM_NUM(d)}</b><i></i>`, strip, { type: 'button', 'data-day': d, 'aria-pressed': String(d === state.phoneDay), 'aria-label': `${DOW(d)} ${DOM_NUM(d)}, ${c.pct}%` });
    b.style.setProperty('--cap', capColour(c.pct));
    b.style.setProperty('--pct', `${c.pct}%`);
  }

  // Sources
  const src = el('div', 'cal__sources', undefined, root, { 'data-part': 'sources' });
  for (const s of F.SOURCES) {
    el('span', `cal-src k-${s.id}${s.id === 'corey' ? ' cal-src--corey' : ''}`, `${s.id === 'corey' ? '<span class="cal-mark"></span>' : '<i></i>'}${s.label} ${s.count}`, src);
  }
  el('span', 'cal-src cal-src--ambient', `Ambient: ${F.AMBIENT}`, src, { 'data-part': 'ambient' });

  // Card + grid
  const card = el('div', 'cal__card', undefined, root, { 'data-part': 'card' });
  const grid = el('div', 'cal__grid', undefined, card);
  el('div', 'cal-corner', 'Capacity from your logs', grid);
  days.forEach(d => mountHead(grid, d));
  el('div', 'cal-allday cal-corner', 'Due', grid);
  days.forEach(d => mountAllDay(grid, d));
  mountBandLabels(grid);
  days.forEach(d => mountBody(grid, d));

  const toast = el('div', 'cal-toast', '', root, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' });
  nodes.set('__toast', toast);
  const pop = el('div', 'cal-pop', '', root, { role: 'dialog', 'aria-modal': 'false', 'data-part': 'chip-popover', hidden: '' });
  nodes.set('__pop', pop);
  const live = el('div', 'cal-sr', '', root, { 'aria-live': 'polite', 'data-part': 'announcer' });
  nodes.set('__live', live);

  engine = createMotion({ apply, clock: options.clock, reducedMotion: options.reducedMotion });
  heights = state.expanded == null ? baseHeights(BANDS) : bandTargets(BANDS, state.expanded);
  engine.place('__bands', Object.fromEntries(heights.map((h, i) => [`h${i}`, h])));
  engine.place('__toast', { opacity: 0, y: CAL.toastRise });
  engine.place('__pop', { opacity: 0, y: CAL.popRise });
  // Motion props every chip owns from the start, so exit/accept tweens have a value to leave from.
  for (const [id, n] of nodes) {
    if (id.startsWith('chip:')) engine.place(id, { opacity: 1, scale: 1, solid: n.classList.contains('is-ghost') ? 0 : 1 });
  }
  // Entrance: columns rise in, left to right. The only one-off motion.
  days.forEach((d, i) => engine.enter(`col:${d}`, { opacity: 1, y: 0 }, { from: { opacity: 0, y: CAL.enterRise }, delay: i * CAL.enterStagger, duration: CAL.enterMs }));
  requestAnimationFrame(() => {
    applyHubPillsThumb(zoom);
    applyHubPillsThumb(focus);
  });
  wire(root);
}

function mountHead(grid: HTMLElement, d: string) {
  const info = dayInfo(d);
  const tag = F.DAY_TAGS[d];
  const head = el('div', `cal-head${d === F.NOW.date ? ' is-today' : ''}${info.over ? ' is-over' : ''}`, undefined, grid, { 'data-part': 'day-head', 'data-date': d });
  el('div', 'cal-head__name', `<span class="cal-head__dow">${DOW(d)}</span><span class="cal-head__num">${DOM_NUM(d)}</span>${info.over ? '<span class="cal-over" data-part="over-flag">over</span>' : ''}${tag ? `<span class="cal-tag${tag.tone === 'term' ? ' cal-tag--term' : ''}">${tag.text}</span>` : ''}`, head);
  const cap = el('div', `cal-cap${info.cap.forecast ? ' is-forecast' : ''}`, undefined, head, { 'data-part': 'capacity', 'data-pct': String(info.cap.pct) });
  cap.style.setProperty('--cap', capColour(info.cap.pct));
  el('div', 'cal-cap__bar', `<span class="cal-cap__fill" style="width:${info.cap.pct}%"></span>`, cap);
  el('div', 'cal-cap__text', `<b>${info.cap.pct}%</b> · ${info.cap.note}`, cap);
  const vit: string[] = [];
  if (info.sleep != null) vit.push(`<span>${ICON.moon}${info.sleep}h</span>`);
  if (info.energy) vit.push(`<span class="${info.energy === 'low' ? 'is-low' : ''}">${ICON.bolt}${info.energy}</span>`);
  if (info.meals) vit.push(`<span>${ICON.fork}${info.meals}</span>`);
  if (info.symptom) vit.push(`<span class="is-symptom">● ${info.symptom}</span>`);
  el('div', 'cal-vit', vit.join('') || '<span>nothing logged yet</span>', head, { 'data-part': 'vitals' });
  nodes.set(`colhead:${d}`, head);
}

function mountAllDay(grid: HTMLElement, d: string) {
  const cell = el('div', 'cal-allday', undefined, grid, { 'data-part': 'all-day', 'data-date': d });
  for (const t of F.DUE.filter(x => x.date === d)) {
    const g = F.GHOSTS.find(x => x.id === t.ghostId);
    const chip = el('div', 'cal-due', `<b>${t.title}</b>`, cell, { 'data-part': 'due', 'data-id': t.id });
    if (g) {
      el('span', 'cal-due__move', `<span class="cal-av cal-av--sm">${AGENT_INITIAL[g.agent]}</span>${g.label}<button type="button" data-accept="${g.id}">Move</button>`, chip, { 'data-ghost': g.id });
    }
    nodes.set(`due:${t.id}`, chip);
  }
  nodes.set(`colallday:${d}`, cell);
}

function mountBandLabels(grid: HTMLElement) {
  const col = el('div', 'cal-bands', undefined, grid, { 'data-part': 'band-labels' });
  col.style.height = `${BODY_H}px`;
  BANDS.forEach((b, i) => {
    const btn = el('button', 'cal-band', `<b>${b.label}${ICON.chev}</b><span>${SUBS[b.id] ?? ''}</span>`, col, {
      type: 'button', 'data-band': String(i), 'aria-expanded': 'false', 'data-part': `band-${b.id}`,
      'aria-label': `${b.label} band. Press to ${'expand'}.`
    });
    nodes.set(`band:${i}`, btn);
  });
  const sleep = el('div', 'cal-sleeplab', 'Sleep', col);
  sleep.style.top = `${TOTAL}px`;
  sleep.style.height = `${SLEEP_STRIP_PX}px`;
}

function mountBody(grid: HTMLElement, d: string) {
  const past = d < F.NOW.date;
  const body = el('div', `cal-body${past ? ' is-past' : ''}`, undefined, grid, { 'data-part': 'day-body', 'data-date': d });
  body.style.height = `${BODY_H}px`;
  nodes.set(`colbody:${d}`, body);
  const school = F.SCHOOL_DAYS.has(d);
  BANDS.forEach((b, i) => {
    if (b.id === 'school' && school) nodes.set(`bg:${d}:${i}`, el('div', 'cal-bg cal-bg--school', undefined, body, { 'data-band': String(i) }));
    if (b.id === 'yours') nodes.set(`bg:${d}:${i}`, el('div', 'cal-bg cal-bg--yours', undefined, body, { 'data-band': String(i) }));
    nodes.set(`line:${d}:${i}`, el('div', 'cal-line', undefined, body));
  });
  const sleep = el('div', 'cal-sleep', `${ICON.moon}${sleepLabel(d)}`, body, { 'data-part': 'sleep-strip' });
  sleep.style.top = `${TOTAL}px`;
  sleep.style.height = `${SLEEP_STRIP_PX}px`;
  for (const f of F.FREE.filter(x => x.date === d)) {
    nodes.set(`free:${d}`, el('div', 'cal-free', `<div><b>${f.title}</b>${f.sub}</div>`, body, { 'data-part': 'free' }));
  }
  for (const c of chipsFor(d)) mountChip(body, c);
  if (d === F.NOW.date) nodes.set('now', el('div', 'cal-now', '<span>6:05 pm</span>', body, { 'data-part': 'now-line' }));
  for (const w of F.WALLS.filter(x => x.date === d)) {
    const [first, ...rest] = w.label.split(' · ');
    const more = rest.length ? `<span class="cal-wall__more"> · ${rest.join(' · ')}</span>` : '';
    const wall = el('div', 'cal-wall', `<span class="cal-wall__pill" title="${w.label}" aria-label="${w.label}">${ICON.lock}<span class="cal-wall__first">${first}</span>${more}</span>`, body, { 'data-part': 'wall' });
    wall.style.height = `${TOTAL}px`;
  }
}

function sleepLabel(d: string) {
  const next = F.WEEK[F.WEEK.indexOf(d) + 1];
  const slept = F.LOGS.find(l => l.record.type === 'sleep' && l.record.date === next)?.record.duration_h;
  if (slept != null) return `slept ${slept} h`;
  return d === F.NOW.date ? 'aim 10:00 tonight' : isHoliday(d) ? 'aim 11:00' : 'aim 10:30';
}

function mountChip(body: HTMLElement, c: Chip) {
  const g = c.ghost;
  const classes = ['cal-chip', `k-${c.kind}`];
  if (c.isClass) classes.push('is-class');
  if (c.kind === 'corey') classes.push('is-corey');
  if (g) classes.push('is-ghost');
  const title = `${c.kind === 'corey' ? '<span class="cal-mark"></span>' : ''}${c.title}`;
  const agent = g ? `<span class="cal-chip__agent"><span class="cal-av cal-av--sm ${g.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[g.agent]}</span></span>` : '';
  const acts = g && g.kind !== 'bedtime'
    ? `<div class="cal-chip__acts"><button type="button" class="is-yes" data-accept="${g.id}">Accept</button><button type="button" data-dismiss="${g.id}">Dismiss</button></div>`
    : g ? `<div class="cal-chip__acts"><button type="button" class="is-yes" data-accept="${g.id}">Accept</button></div>` : '';
  const chip = el('div', classes.join(' '), `${agent}<div class="cal-chip__title">${title}</div><div class="cal-chip__meta">${c.meta}</div>${acts}`, body, {
    'data-part': g ? 'ghost' : c.isClass ? 'class' : 'chip',
    'data-id': c.id,
    'data-kind': c.kind,
    title: c.title,
    tabindex: '0',
    role: 'button',
    'aria-label': `${c.title}. ${c.meta}`
  });
  const proposal = F.GHOSTS.find(x => x.overItem === c.id);
  if (proposal) {
    chip.classList.add('has-proposal');
    chip.dataset.ghost = proposal.id;
    chip.insertAdjacentHTML('afterbegin', `<span class="cal-chip__agent"><span class="cal-av cal-av--sm ${proposal.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[proposal.agent]}</span></span>`);
    chip.insertAdjacentHTML('beforeend', `<div class="cal-chip__proposal" data-part="proposal">${proposal.agent === 'sara' ? 'Sara' : 'Hammond'} suggests: ${proposal.label.toLowerCase()}</div>`);
    chip.setAttribute('aria-label', `${c.title}. ${c.meta}. Proposal: ${proposal.label}. Open for details.`);
  }
  chip.dataset.start = String(c.start);
  chip.dataset.end = String(c.end);
  chip.dataset.hasActions = acts ? '1' : '';
  nodes.set(`chip:${c.id}`, chip);
}

/* ======================================================================== 4. Layout */

/** Pure. Geometry for every positioned entity at the given band heights. */
export function layout(h: number[]): Map<string, Props> {
  const out = new Map<string, Props>();
  BANDS.forEach((b, i) => {
    const top = yForHour(BANDS, h, b.from);
    const height = yForHour(BANDS, h, b.to) - top;
    out.set(`band:${i}`, { top, height });
  });
  for (const [id, node] of nodes) {
    const [type, a, b] = id.split(':');
    if (type === 'bg' || type === 'line') {
      const band = BANDS[Number(b)];
      const top = yForHour(BANDS, h, band.from);
      out.set(id, type === 'bg' ? { top, height: yForHour(BANDS, h, band.to) - top } : { top });
    } else if (type === 'chip') {
      out.set(id, blockGeometry(BANDS, h, Number(node.dataset.start), Number(node.dataset.end)));
    } else if (type === 'free') {
      const f = F.FREE.find(x => x.date === a)!;
      const top = yForHour(BANDS, h, toH(f.start));
      const raw = yForHour(BANDS, h, toH(f.end)) - top;
      out.set(id, { top: top + 8, height: Math.max(0, raw - 16), fade: clamp01((raw - 90) / 40) });
    } else if (id === 'now') {
      out.set(id, { top: yForHour(BANDS, h, toH(F.NOW.time)) });
    }
  }
  return out;
}

/* ======================================================================== 5. Render */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fadeIn = (h: number, [a, b]: [number, number]) => clamp01((h - a) / (b - a));

/** The only function that writes geometry or motion values to the DOM. */
function apply(id: string, p: Readonly<Props>) {
  if (id === '__bands') {
    heights = BANDS.map((_, i) => p[`h${i}`]);
    for (const [eid, props] of layout(heights)) engine.place(eid, props);
    return;
  }
  if (id === '__toast') {
    const t = nodes.get('__toast')!;
    t.style.setProperty('--o', String(p.opacity));
    t.style.setProperty('--y', String(p.y));
    return;
  }
  if (id === '__pop') {
    const n = nodes.get('__pop')!;
    n.style.opacity = String(p.opacity);
    n.style.transform = `translateY(${p.y}px)`;
    return;
  }
  if (id.startsWith('col:')) {
    const d = id.slice(4);
    for (const part of ['colhead', 'colallday', 'colbody']) {
      const n = nodes.get(`${part}:${d}`);
      if (!n) continue;
      n.style.opacity = String(p.opacity);
      n.style.transform = p.y ? `translateY(${p.y}px)` : '';
    }
    return;
  }
  const n = nodes.get(id);
  if (!n) return;
  if (p.top != null) n.style.top = `${p.top}px`;
  if (p.height != null) n.style.height = `${p.height}px`;
  if (id.startsWith('band:')) {
    n.style.setProperty('--sub', String(fadeIn(p.height, [38, 48])));
    return;
  }
  if (id.startsWith('free:')) {
    n.style.opacity = String(p.fade);
    return;
  }
  if (id.startsWith('chip:')) {
    const h = p.height;
    n.style.setProperty('--t', String(fadeIn(h, CAL.fade.title)));
    n.style.setProperty('--m', String(fadeIn(h, CAL.fade.meta)));
    n.style.setProperty('--lines', h >= CAL.twoLinesAt ? '2' : '1');
    // One-line chips centre their title; cards keep 5px. Never clip a glyph.
    n.style.setProperty('--py', `${h >= CAL.cardAt ? 5 : Math.max(0, (h - 2 - CAL.lineBox) / 2)}px`);
    const acts = n.querySelector<HTMLElement>('.cal-chip__acts');
    if (acts) {
      const a = fadeIn(h, CAL.fade.actions);
      acts.style.setProperty('--a', String(a));
      acts.toggleAttribute('data-off', a < 0.5);
    }
    if (p.solid != null) n.style.setProperty('--solid', String(p.solid));
    if (p.opacity != null) n.style.setProperty('--o', String(p.opacity));
    if (p.scale != null) n.style.setProperty('--s', String(p.scale));
    n.dataset.density = h < 14 ? 'sliver' : h < 38 ? 'line' : 'card';
  }
}

/* ======================================================================== 6. Interaction */

function setBand(next: number | null) {
  state.expanded = next;
  const target = bandTargets(BANDS, next);
  engine.to('__bands', Object.fromEntries(target.map((h, i) => [`h${i}`, h])), { duration: CAL.bandMs, easing: EASE });
  root.querySelectorAll<HTMLElement>('.cal-band').forEach(b => b.setAttribute('aria-expanded', String(Number(b.dataset.band) === next)));
  const focus = root.querySelector<HTMLElement>('[data-part="focus-pills"]')!;
  focus.querySelectorAll<HTMLElement>('.hub-pills__btn').forEach(b => {
    const on = (b.dataset.band === 'none' && next == null) || Number(b.dataset.band) === next;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  focus.classList.add('is-animated');
  applyHubPillsThumb(focus);
  nodes.get('__live')!.textContent = next == null ? 'All bands balanced.' : `${BANDS[next].label} expanded.`;
}
function toggleBand(i: number) {
  setBand(state.expanded === i ? null : i);
}

function showToast(html: string) {
  const t = nodes.get('__toast')!;
  t.innerHTML = html;
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: CAL.toastInMs });
  clearTimeout(toastTimer);
  // Timer is for how long the receipt stays, not for motion.
  toastTimer = window.setTimeout(() => engine.to('__toast', { opacity: 0, y: CAL.toastRise }, { duration: CAL.toastInMs }), CAL.toastHoldMs);
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Accept: build the real write plan, "POST" it, then show the result and the receipt. */
async function accept(ghostId: string, { quiet = false } = {}) {
  const g = F.GHOSTS.find(x => x.id === ghostId);
  if (!g || state.accepted.has(ghostId) || state.dismissed.has(ghostId) || state.busy.has(ghostId)) return null;
  const plan = acceptPlan(ghostInput(g), { today: F.NOW.date });
  state.busy.add(ghostId);
  const buttons = root.querySelectorAll<HTMLButtonElement>(`[data-accept="${ghostId}"],[data-dismiss="${ghostId}"]`);
  buttons.forEach(b => { b.disabled = true; if (b.dataset.accept) b.textContent = 'Saving…'; });
  await wait(CAL.saveLatencyMs); // In the hub: await api.calendarGhosts.accept(ghostId). See the design spec.
  state.busy.delete(ghostId);
  state.accepted.add(ghostId);
  if (g.kind === 'move_task') {
    const due = nodes.get(`due:${g.taskId}`)!;
    due.classList.add('is-moved');
    due.querySelector('.cal-due__move')!.innerHTML = 'Moved to T4 W1 Tue';
  } else if (g.overItem) {
    const item = nodes.get(`chip:${g.overItem}`)!;
    item.classList.remove('has-proposal');
    item.classList.add('is-skipped');
    item.querySelector('.cal-chip__agent')?.remove();
    item.querySelector('.cal-chip__proposal')?.remove();
    item.querySelector('.cal-chip__meta')!.textContent = 'Skipped · Sara';
  } else {
    const chip = nodes.get(`chip:${ghostId}`)!;
    chip.classList.add('is-accepted');
    chip.querySelector('.cal-chip__acts')?.remove();
    chip.dataset.part = 'chip';
    engine.to(`chip:${ghostId}`, { solid: 1 }, { duration: CAL.acceptMs });
  }
  if (!quiet) showToast(`<b>Written.</b> ${plan.receipt}`);
  nodes.get('__live')!.textContent = plan.receipt;
  return plan;
}

function dismiss(ghostId: string) {
  const g = F.GHOSTS.find(x => x.id === ghostId);
  if (!g || state.accepted.has(ghostId) || state.dismissed.has(ghostId)) return;
  const plan = dismissPlan(ghostInput(g));
  state.dismissed.add(ghostId);
  if (g.overItem) {
    const item = nodes.get(`chip:${g.overItem}`)!;
    item.classList.remove('has-proposal');
    item.querySelector('.cal-chip__agent')?.remove();
    item.querySelector('.cal-chip__proposal')?.remove();
    showToast(`<b>${plan.receipt}</b> Sara notes the “no”, so she asks less often.`);
    return;
  }
  engine.to(`chip:${ghostId}`, { scale: 0.96 }, { duration: CAL.exitMs });
  engine.exit(`chip:${ghostId}`, () => { nodes.get(`chip:${ghostId}`)?.remove(); nodes.delete(`chip:${ghostId}`); }, { duration: CAL.exitMs });
  showToast(`<b>${plan.receipt}</b> ${g.agent === 'sara' ? 'Sara' : 'Hammond'} notes the “no”, so it asks less often.`);
}

async function applyAll() {
  const pending = F.GHOSTS.filter(g => !state.accepted.has(g.id) && !state.dismissed.has(g.id));
  const plans = await Promise.all(pending.map(async (g, i) => { await wait(i * CAL.applyAllStagger); return accept(g.id, { quiet: true }); }));
  const done = plans.filter(Boolean);
  if (done.length) showToast(`<b>${done.length} change${done.length === 1 ? '' : 's'} written.</b> Receipts are in Central Node › Recent Agent Actions.`);
}

let popFor: string | null = null;
/** Chip popover: details for any chip; for a ghost, a preview of exactly what Accept writes. */
function openPop(chipId: string) {
  const chip = nodes.get(`chip:${chipId}`);
  const pop = nodes.get('__pop')!;
  if (!chip) return;
  const g = F.GHOSTS.find(x => (x.id === chipId || x.overItem === chipId) && !state.accepted.has(x.id) && !state.dismissed.has(x.id));
  const item = F.ITEMS.find(x => x.id === chipId);
  const title = g && !g.overItem ? g.label : item?.title ?? chip.title;
  const meta = g && !g.overItem ? g.meta : item?.meta ?? '';
  let html = `<div class="cal-pop__head">${g ? `<span class="cal-av cal-av--sm ${g.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[g.agent]}</span>` : `<i class="cal-pop__dot k-${chip.dataset.kind}"></i>`}<b>${title}</b></div><p class="cal-pop__meta">${meta}</p>`;
  if (g) {
    if (g.overItem) html += `<p class="cal-pop__label">${g.agent === 'sara' ? 'Sara' : 'Hammond'} suggests</p><p class="cal-pop__meta cal-pop__meta--strong">${g.label} · ${g.meta}</p>`;
    html += `<p class="cal-pop__label">Accept writes</p><p class="cal-pop__writes" data-part="write-preview">${acceptPlan(ghostInput(g), { today: F.NOW.date }).receipt}</p>`;
    html += `<div class="cal-pop__acts"><button type="button" class="btn btn--primary" data-accept="${g.id}">Accept</button>${g.kind === 'bedtime' ? '' : `<button type="button" class="btn btn--ghost" data-dismiss="${g.id}">Dismiss</button>`}</div>`;
  }
  pop.innerHTML = html;
  pop.hidden = false;
  const r = root.getBoundingClientRect();
  const c = chip.getBoundingClientRect();
  const roomRight = r.right - c.right;
  const left = roomRight >= CAL.popWidth + CAL.popGap ? c.right - r.left + CAL.popGap : c.left - r.left - CAL.popWidth - CAL.popGap;
  pop.style.left = `${Math.max(0, left)}px`;
  pop.style.top = `${c.top - r.top}px`;
  popFor = chipId;
  engine.place('__pop', { opacity: 0, y: CAL.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: CAL.popMs });
  pop.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
}
function closePop() {
  if (!popFor) return;
  popFor = null;
  engine.to('__pop', { opacity: 0, y: CAL.popRise }, { duration: CAL.popMs });
  // Hidden once faded so it can't catch clicks.
  window.setTimeout(() => { if (!popFor) nodes.get('__pop')!.hidden = true; }, CAL.popMs);
}

function wire(r: HTMLElement) {
  r.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const acc = t.closest<HTMLElement>('[data-accept]');
    if (acc) { closePop(); return void accept(acc.dataset.accept!); }
    const dis = t.closest<HTMLElement>('[data-dismiss]');
    if (dis) { closePop(); return dismiss(dis.dataset.dismiss!); }
    const chip = t.closest<HTMLElement>('.cal-chip');
    if (chip) return chip.dataset.id === popFor ? closePop() : openPop(chip.dataset.id!);
    if (!t.closest('[data-part="chip-popover"]')) closePop();
    if (t.closest('[data-action="apply-all"]')) return void applyAll();
    const day = t.closest<HTMLElement>('[data-day]');
    if (day) { state.phoneDay = day.dataset.day!; return mount(r.parentElement!); }
    const band = t.closest<HTMLElement>('[data-band]');
    if (band && !t.closest('.cal-chip')) {
      if (band.dataset.band === 'none') return setBand(null);
      return band.closest('[data-part="focus-pills"]') ? setBand(Number(band.dataset.band)) : toggleBand(Number(band.dataset.band));
    }
  });
  r.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).closest('input,textarea')) return;
    if (/^[1-4]$/.test(e.key)) { toggleBand(Number(e.key) - 1); e.preventDefault(); }
    if (e.key === 'Escape' && popFor) { closePop(); return; }
    if (e.key === '0' || e.key === 'Escape') { setBand(null); }
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).classList.contains('cal-chip')) { openPop((e.target as HTMLElement).dataset.id!); e.preventDefault(); }
  });
}

/* ======================================================================== Reference harness (not product) */

let slow = 1;
let reduced = false;
const clock: Clock = {
  now: () => performance.now() / slow,
  request: cb => requestAnimationFrame(cb),
  cancel: id => cancelAnimationFrame(id)
};
function boot() {
  const host = document.getElementById('app')!;
  const start = () => mount(host, { clock, reducedMotion: () => reduced || matchMedia('(prefers-reduced-motion: reduce)').matches });
  (document.fonts?.ready ?? Promise.resolve()).then(start);
  document.getElementById('ref-reset')?.addEventListener('click', () => {
    state.expanded = null; state.accepted.clear(); state.dismissed.clear(); state.phoneDay = F.NOW.date; start();
  });
  document.getElementById('ref-slow')?.addEventListener('click', e => {
    slow = slow === 1 ? 5 : 1;
    (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(slow === 5));
  });
  document.getElementById('ref-reduced')?.addEventListener('click', e => {
    reduced = !reduced;
    (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(reduced));
  });
  let wasPhone = matchMedia('(max-width: 719px)').matches;
  matchMedia('(max-width: 719px)').addEventListener('change', ev => { if (ev.matches !== wasPhone) { wasPhone = ev.matches; start(); } });
  // Test hooks (Playwright): read state without scraping the DOM.
  (window as any).__tideline = {
    state, CAL, heights: () => heights.slice(), total: TOTAL,
    capacity: Object.fromEntries([...CAP].map(([d, c]) => [d, c.pct])),
    setBand, accept, dismiss, openPop, closePop, finish: () => engine.finish(), stats: () => engine.stats()
  };
}
boot();
