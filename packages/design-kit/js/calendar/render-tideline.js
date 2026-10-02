/**
 * Tideline week view. Structure follows tideline-ref.ts:
 * mount creates the DOM once per paint, layout(heights) is pure,
 * apply(id, props) is the only function that writes geometry.
 */
import { createMotion, EASE } from '../hub-motion-engine.js';
import { CAL } from '../calendar-tideline-geometry.js';
import { applyHubPillsThumb } from '../hub-motion.js';
import { buildZoomPills, settleZoomPills } from './zoom-pills.js';
import {
  bandTargets,
  baseHeights,
  blockGeometry,
  hourForY,
  SLEEP_STRIP_PX,
  yForHour
} from '../calendar-bands.js';
import { hoursToDueTime, snapHours } from '../time-grid.js';
import { acceptPlan, GHOST_AGENTS } from './ghost-writes.js';
import { buildTidelineModel, movedCaption, toHour } from './tideline-model.js';
import { getSydneyMinutesOfDay } from '../sydney-clock.js';
import {
  applyItemVisibility,
  countByFilterKey,
  countHidden,
  defaultFilterForHub,
  isItemVisible,
  paintSourceFilter,
  readFilterState,
  writeFilterState
} from './calendar-filter.js';
import { bindItemCard, itemCardHtml } from './calendar-item-card.js';
import { canMoveItem, canResizeItem, dragPatch, saveCalendarItem } from './calendar-item-actions.js';
import { formatDisplayDate } from '../format-display-date.js';
import { openRescueSheet } from './rescue-sheet.js';
import { captureChips, morphPairs, playChips } from './rescue-morph.js';

const AGENT_INITIAL = { sara: 'S', hammond: 'H', clare: 'C', chadwick: 'Ch' };
/** Site-root portraits used across hubs (umbrella `dist/assets/agents/`). */
const AGENT_AVATAR_SRC = {
  hammond: '/assets/agents/hammond.jpg',
  sara: '/assets/agents/sara.jpg',
  clare: '/assets/agents/clare.png',
  chadwick: '/assets/agents/chadwick.jpg'
};
/** Design spec: expanded band remembered per session. Life default; other hubs pass `hub` later. */
export const BAND_SESSION_KEY = 'life.calendar.band';
const ICON = {
  prev: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>',
  moon: '<svg viewBox="0 0 12 12"><path d="M8.8 8.3A4.3 4.3 0 0 1 4 2.1a4.3 4.3 0 1 0 4.8 6.2z"/></svg>',
  bolt: '<svg viewBox="0 0 12 12"><path d="M6.8 1 3 7h3l-.8 4L9 5H6z"/></svg>',
  fork: '<svg viewBox="0 0 12 12"><path d="M3.5 1v4a1.5 1.5 0 0 0 3 0V1M5 5.5V11M9 1c-1 .5-1.5 2-1.5 3.5S8 6.5 9 6.5V11"/></svg>',
  lock: '<svg viewBox="0 0 10 10"><rect x="1.5" y="4.5" width="7" height="5" rx="1"/><path d="M3 4.5V3a2 2 0 0 1 4 0v1.5"/></svg>',
  chev: '<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4"/></svg>',
  pill: '<svg viewBox="0 0 12 12"><rect x="1.5" y="4" width="9" height="4" rx="2" transform="rotate(-35 6 6)"/><path d="M6 3.6 4.9 7.9" transform="rotate(-35 6 6)"/></svg>'
};

function readBandSession() {
  try {
    const raw = globalThis.sessionStorage?.getItem?.(BAND_SESSION_KEY);
    if (raw == null || raw === '' || raw === 'none') return null;
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 ? index : null;
  } catch {
    return null;
  }
}

function writeBandSession(next) {
  try {
    const store = globalThis.sessionStorage;
    if (!store) return;
    if (next == null) store.removeItem(BAND_SESSION_KEY);
    else store.setItem(BAND_SESSION_KEY, String(next));
  } catch {
    /* private mode / unavailable */
  }
}

/** Test hooks for session band memory (design key life.calendar.band). */
export { readBandSession, writeBandSession };

/** Open the next Tideline paint with this band expanded (Day Dial ring → Linear). */
export function presetBand(index) {
  const next = Number.isInteger(index) && index >= 0 ? index : null;
  state.expanded = next;
  writeBandSession(next);
}

const state = {
  expanded: readBandSession(),
  settled: new Map(),
  busy: new Set(),
  phone: false,
  phoneDay: '',
  toast: null
};
const nodes = new Map();
let engine = null;
let heights = [];
let bands = [];
let model = null;
let root = null;
let host = null;
let input = null;
let toastTimer = 0;
let popFor = null;
let nowHour = 18;
let wired = false;
let filterState = null;
/** Host this session is mounted on — data refresh reuses it without replaying entrance. */
let mountedFor = null;
let playedEntrance = false;
let entranceGuardUntil = 0;
let lastPaintKey = null;
let repaintTimer = 0;

const ENTRANCE_GUARD_MS = 7 * CAL.enterStagger + CAL.enterMs + 120;
const perfNow = () => root?.defaultView?.performance?.now?.() ?? Date.now();

/** Stamp of inputs that require a re-layout (not a soft echo). */
function paintKey(inp) {
  const week = Array.isArray(inp?.week) ? inp.week.join(',') : '';
  const ghosts = Array.isArray(inp?.ghosts)
    ? inp.ghosts.map((ghost) => `${ghost?.id}:${ghost?.settled ?? ghost?.status ?? ''}`).join(',')
    : '';
  const events = Array.isArray(inp?.events)
    ? inp.events.map((event) => {
      const record = event?.record && typeof event.record === 'object' ? event.record : event;
      return `${record?.id ?? event?.id ?? ''}:${record?.date ?? event?.date ?? ''}:${record?.title ?? event?.title ?? ''}`;
    }).join(',')
    : '';
  const terms = Array.isArray(inp?.terms)
    ? inp.terms.map((term) => `${term?.term ?? ''}:${term?.starts_on ?? ''}:${term?.ends_on ?? ''}`).join(',')
    : '';
  return [
    week,
    inp?.today ?? '',
    ghosts,
    events,
    terms,
    inp?.dayProfile ? JSON.stringify(inp.dayProfile) : '',
    inp?.lifeLogStatus ?? 'live',
    state.phone ? state.phoneDay : 'desk'
  ].join('|');
}

function repaintAfter(ms) {
  clearTimeout(repaintTimer);
  repaintTimer = setTimeout(() => {
    repaintTimer = 0;
    if (mountedFor === host && input) mount({ entrance: false });
  }, Math.max(0, ms));
}

const clamp01 = value => Math.min(1, Math.max(0, value));
const fadeIn = (height, [from, to]) => clamp01((height - from) / (to - from));
const DOW = date => new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)).toUpperCase();
const DOM_NUM = date => String(Number(date.slice(8, 10)));

function capColour(pct) {
  return pct >= 60 ? 'var(--pastel-sage-ink)' : pct >= 40 ? 'var(--pastel-gold-ink)' : 'var(--high-sea)';
}

function nowLabel(hour) {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  const suffix = whole >= 12 ? 'pm' : 'am';
  return `${whole % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function css(node, name, value) {
  if (!node?.style) return;
  if (typeof node.style.setProperty === 'function') node.style.setProperty(name, value);
  else node.style[name] = value;
}

function markup(node, html) {
  if (html == null || !node) return;
  // Prefer innerHTML. Do not use `instanceof HTMLElement` — happy-dom / multi-realm
  // documents fail that check and used to strip tags into textContent (Review no-ops).
  if (typeof node.innerHTML === 'string' || 'innerHTML' in node) {
    node.innerHTML = html;
    return;
  }
  node.textContent = String(html).replace(/<[^>]*>/g, '');
}

function setAttrs(node, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) continue;
    node.setAttribute?.(key, String(value));
    if (key.startsWith('data-') && node.dataset) {
      const prop = key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      node.dataset[prop] = String(value);
    }
  }
}

function el(tag, cls, html, parent, attributes = {}) {
  const node = root.createElement(tag);
  if (cls) node.className = cls;
  setAttrs(node, attributes);
  if (html != null) markup(node, html);
  parent?.append(node);
  return node;
}

function clockFor(view) {
  const raf = view?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  if (typeof raf === 'function') return undefined;
  return { now: () => 0, request: () => 1, cancel: () => {} };
}

function ghostInput(ghost) {
  const { label, meta, chip, overItem, settled, created_at, status, tasks_pending, ...rest } = ghost;
  return rest;
}

function agentName(agent) {
  return GHOST_AGENTS[agent] || 'Hammond';
}

function agentAvatarClass(agent, sizeClass = '') {
  const parts = ['cal-av'];
  if (sizeClass) parts.push(sizeClass);
  if (agent === 'sara') parts.push('cal-av--sara');
  else if (agent === 'clare') parts.push('cal-av--clare');
  return parts.join(' ');
}

/** Portrait when the hub ships the asset; letter fallback only if missing. */
function agentAvatarNode(agent, sizeClass = '') {
  const cls = agentAvatarClass(agent, sizeClass);
  const src = AGENT_AVATAR_SRC[agent];
  if (!src) {
    return el('span', cls, AGENT_INITIAL[agent] || '?', null, { 'aria-hidden': 'true' });
  }
  const img = el('img', cls, undefined, null, {
    src,
    alt: '',
    'aria-hidden': 'true',
    decoding: 'async'
  });
  img.addEventListener?.('error', () => {
    img.replaceWith?.(el('span', cls, AGENT_INITIAL[agent] || '?', null, { 'aria-hidden': 'true' }));
  });
  return img;
}

/** Pending ghosts split by current filter — shared by tray label, Apply, Review, Dismiss. */
function pendingGhostPartition() {
  const visible = [];
  let hidden = 0;
  if (!model) return { visible, hidden };
  for (const ghost of model.ghosts) {
    if (state.settled.has(ghost.id) || ghost.settled === 'accepted') continue;
    if (isItemVisible(ghost.chip || ghost, filterState)) visible.push(ghost);
    else hidden += 1;
  }
  return { visible, hidden };
}

function pendingVisibleGhosts() {
  return pendingGhostPartition().visible;
}

/** All unsettled ghosts (ignores source filter) — Review fallback when every pending item is filtered off. */
function allPendingGhosts() {
  if (!model) return [];
  return model.ghosts.filter(
    (ghost) => !state.settled.has(ghost.id) && ghost.settled !== 'accepted'
  );
}

function applyAllLabel(visibleCount, hiddenCount) {
  return hiddenCount ? `Apply ${visibleCount} · ${hiddenCount} hidden` : 'Apply all';
}

/** Safe accept preview — never throw from Review / popover paint. */
function writePreview(ghost) {
  try {
    return acceptPlan(ghostInput(ghost), { today: model.today }).receipt;
  } catch {
    return null;
  }
}

function resolveGhostAnchor(ghost) {
  if (!ghost) return null;
  const chipId = ghost.overItem || ghost.id;
  return (
    nodes.get(`chip:${chipId}`) ||
    nodes.get(`due:${ghost.taskId}`) ||
    nodes.get(`due:${chipId}`) ||
    nodes.get(`chip:${ghost.id}`) ||
    null
  );
}

function closeReview() {
  const panel = nodes.get('__review');
  if (!panel) return;
  panel.hidden = true;
  panel.setAttribute?.('hidden', '');
  markup(panel, '');
}

function showReviewPanel(panel) {
  panel.hidden = false;
  panel.removeAttribute?.('hidden');
  panel.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

/** After Accept/Dismiss: rebuild Review if it is still open. */
function refreshOpenReview(result) {
  const panel = nodes.get('__review');
  if (result && panel && !panel.hidden) openReviewPanel();
}

function reviewRowHtml(ghost) {
  const preview = writePreview(ghost);
  const who = agentName(ghost.agent);
  const title = escapeHtml(ghost.label || ghost.title || 'Proposed change');
  const meta = escapeHtml([who, ghost.meta, ghost.date].filter(Boolean).join(' · '));
  const avClass = agentAvatarClass(ghost.agent, 'cal-av--sm');
  const initial = AGENT_INITIAL[ghost.agent] || '?';
  const id = escapeHtml(ghost.id);
  const dismiss =
    ghost.kind === 'bedtime'
      ? ''
      : `<button type="button" class="btn btn--ghost" data-dismiss="${id}">Dismiss</button>`;
  return (
    `<li class="cal-review__row" data-review-ghost="${id}">` +
    `<div class="cal-review__row-head"><span class="${avClass}" aria-hidden="true">${initial}</span><div><b>${title}</b><p class="cal-review__meta">${meta}</p></div></div>` +
    (preview
      ? `<p class="cal-review__label">Accept writes</p><p class="cal-review__writes" data-part="write-preview">${escapeHtml(preview)}</p>`
      : '') +
    `<div class="cal-review__acts">` +
    `<button type="button" class="btn btn--primary" data-accept="${id}" data-label="Accept">Accept</button>${dismiss}` +
    `<button type="button" class="btn btn--secondary" data-action="reveal-ghost" data-ghost-id="${id}">Show on calendar</button>` +
    `</div></li>`
  );
}

/**
 * Review opens the pending-changes panel (what is waiting), not a silent chip cycle.
 * Chip popovers still work from “Show on calendar” / chip click.
 */
function openReviewPanel() {
  const { visible, hidden } = pendingGhostPartition();
  // Prefer filter-visible ghosts; if the tray count is all filter-hidden, still list them
  // so Review never looks like a no-op while the strip says changes are waiting.
  const pending = visible.length ? visible : allPendingGhosts();
  closePop();
  if (!pending.length) {
    closeReview();
    showToast('<b>Nothing to review.</b> No pending proposals.');
    return;
  }
  const panel = nodes.get('__review');
  if (!panel) return;
  const filterNote = hidden
    ? ` · ${hidden} hidden by source filter`
    : visible.length < pending.length
      ? ' · currently filtered off — listed so you can still decide'
      : '';
  const html =
    '<div class="cal-review__head"><div><p class="cal-review__eyebrow">Hammond</p><b>Waiting for review</b></div>' +
    '<button type="button" class="btn btn--ghost" data-action="close-review">Close</button></div>' +
    `<p class="cal-review__summary">${pending.length} change${pending.length === 1 ? '' : 's'}${filterNote} · nothing is written until you accept</p>` +
    `<ul class="cal-review__list">${pending.map(reviewRowHtml).join('')}</ul>`;
  markup(panel, html);
  showReviewPanel(panel);
  const live = nodes.get('__live');
  if (live) live.textContent = `${pending.length} change${pending.length === 1 ? '' : 's'} waiting for review`;
}

/** Reveal one pending ghost on the grid (chip / due popover) after the panel lists it. */
function revealGhost(ghostId) {
  const ghost = pendingVisibleGhosts().find((item) => item.id === ghostId);
  if (!ghost) {
    showToast('<b>Nothing to review.</b> That proposal is no longer pending.');
    return;
  }
  const anchor = resolveGhostAnchor(ghost);
  const chipId = ghost.overItem || ghost.id;
  anchor?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  if (anchor && !nodes.get(`chip:${chipId}`)) nodes.set(`chip:${chipId}`, anchor);
  openPop(chipId);
}

async function dismissAll() {
  const pending = pendingVisibleGhosts().filter((ghost) => ghost.kind !== 'bedtime');
  const plans = await Promise.all(
    pending.map(async (ghost, index) => {
      await wait(index * CAL.applyAllStagger);
      return dismiss(ghost.id, { quiet: true });
    })
  );
  const done = plans.filter(Boolean);
  if (done.length) {
    showToast(
      `<b>${done.length} proposal${done.length === 1 ? '' : 's'} dismissed.</b> Nothing written.`
    );
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The only body that leaves the browser. The server loads the ghost and builds the writes. */
export function ghostDecisionBody(id, decision, reason) {
  const body = { id, decision };
  if (typeof reason === 'string' && reason) body.reason = reason;
  return body;
}

function ghostsForPaint(list) {
  const source = Array.isArray(list) ? list : null;
  if (!source) return null;
  const out = [];
  for (const ghost of source) {
    const decision = state.settled.get(ghost.id);
    if (decision?.outcome === 'dismissed') continue;
    if (decision?.outcome === 'accepted' && (ghost.overItem || ghost.kind === 'move_task')) continue;
    out.push(decision?.outcome === 'accepted' ? { ...ghost, settled: 'accepted' } : ghost);
  }
  for (const entry of state.settled.values()) {
    if (entry.outcome !== 'accepted' || entry.ghost.overItem || entry.ghost.kind === 'move_task') continue;
    if (out.some(ghost => ghost.id === entry.ghost.id)) continue;
    out.push({ ...entry.ghost, settled: 'accepted' });
  }
  return out;
}

export function renderTideline(doc, calendarHost, nextInput) {
  root = doc;
  input = nextInput;
  // Prefer a direct child check — happy-dom does not support `:scope > …`.
  const shellAlive = Boolean(
    calendarHost?.firstElementChild?.getAttribute?.('data-part') === 'tideline' ||
      calendarHost?.querySelector?.('[data-part="tideline"]')
  );
  const fresh = mountedFor !== calendarHost || !shellAlive;
  host = calendarHost;
  const key = paintKey(input);

  if (fresh) {
    clearTimeout(repaintTimer);
    repaintTimer = 0;
    mountedFor = calendarHost;
    playedEntrance = false;
    entranceGuardUntil = 0;
    lastPaintKey = key;
    playedEntrance = true;
    mount({ entrance: true });
    return;
  }

  // Soft echo (hashchange / unchanged sources): keep the chart.
  if (key === lastPaintKey) return;

  if (perfNow() < entranceGuardUntil || engine?.busy?.()) {
    // Entrance owns the grid — paint this data once it has finished.
    repaintAfter(Math.max(16, entranceGuardUntil - perfNow() + 16));
    return;
  }

  lastPaintKey = key;
  mount({ entrance: false });
}

function mount({ entrance = false } = {}) {
  engine?.dispose();
  nodes.clear();
  popFor = null;
  const view = root.defaultView;
  state.phone = view?.matchMedia?.('(max-width: 719px)')?.matches === true;
  nowHour = Number.isFinite(input.nowHour) ? input.nowHour : getSydneyMinutesOfDay(input.now ?? new Date()) / 60;
  model = buildTidelineModel({
    events: input.events ?? [],
    visual: input.visual ?? null,
    ghosts: ghostsForPaint(input.ghosts),
    week: input.week,
    today: input.today,
    nowHour,
    dayProfile: input.dayProfile ?? null,
    terms: input.terms ?? null,
    lifeLogStatus: input.lifeLogStatus ?? 'live'
  });
  bands = model.bands;
  if (!input.week.includes(state.phoneDay)) state.phoneDay = input.week.includes(input.today) ? input.today : input.week[0];
  const days = state.phone ? [state.phoneDay] : model.week;
  host.replaceChildren();
  const section = el('section', 'cal', undefined, host, { 'data-part': 'tideline', 'aria-label': 'Week calendar' });
  css(section, '--cal-days', String(days.length));

  const nav = el('header', 'cal__nav', undefined, section, { 'data-part': 'nav' });
  el('button', 'cal__round', ICON.prev, nav, { type: 'button', 'aria-label': 'Previous week', 'data-shift': '-1' });
  el('div', 'cal__period', `<b>${model.period.title}</b><span>${model.period.range}</span>`, nav, { 'data-part': 'period' });
  el('button', 'cal__round', ICON.next, nav, { type: 'button', 'aria-label': 'Next week', 'data-shift': '1' });
  el('button', 'btn btn--secondary', 'Today', nav, { type: 'button', 'data-today': '1' });
  if (input.week.includes(input.today)) el('button', 'btn btn--secondary cal__rescue', 'Day changed', nav, { type: 'button', 'data-rescue-open': '', 'aria-haspopup': 'dialog' });
  if (typeof input.onQuickAdd === 'function') {
    el('button', 'icon-plus-btn cal__quick-add', '+', nav, {
      type: 'button',
      'aria-label': input.quickAddLabel || 'Add',
      'data-part': 'quick-add',
      'data-calendar-quick-add': ''
    });
  }
  // Zoom and Focus are one matched pair: same size, same row, wrap together.
  const views = el('div', 'cal__views', undefined, nav, { 'data-part': 'view-controls' });
  // The one-day Linear layout is the Day zoom, not Week.
  const zoom = buildZoomPills(root, input.zoom === 'day' ? 'day' : 'week');
  views.append(zoom);
  const focusWrap = el('div', 'cal__focus', '<span class="cal__focus-label">Focus</span>', views);
  const focus = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', focusWrap, { role: 'group', 'aria-label': 'Focus band', 'data-part': 'focus-pills' });
  if (state.expanded != null && (state.expanded < 0 || state.expanded >= bands.length)) {
    state.expanded = null;
    writeBandSession(null);
  }
  el('button', `hub-pills__btn${state.expanded == null ? ' is-active' : ''}`, 'Balanced', focus, {
    type: 'button',
    'data-band': 'none',
    'aria-pressed': String(state.expanded == null)
  });
  bands.forEach((band, index) => el('button', `hub-pills__btn${state.expanded === index ? ' is-active' : ''}`, band.label, focus, {
    type: 'button',
    'data-band': String(index),
    'aria-pressed': String(state.expanded === index)
  }));

  filterState = readFilterState(input?.hub || 'life');
  if (model.tray) {
    const tray = el('div', 'cal__tray', undefined, section, { 'data-part': 'tray' });
    tray.append(agentAvatarNode(model.tray.agent));
    el('span', '', `<b>${model.tray.headline}</b> <span class="cal__tray-detail">· ${model.tray.detail}</span>`, tray);
    el('span', 'cal__spacer', undefined, tray);
    const { visible, hidden } = pendingGhostPartition();
    el('button', 'btn btn--primary', applyAllLabel(visible.length, hidden), tray, {
      type: 'button',
      'data-action': 'apply-all',
      'data-part': 'apply-all'
    });
    el('button', 'btn btn--secondary', 'Review', tray, { type: 'button', 'data-action': 'review', 'data-part': 'review' });
    el('button', 'btn btn--ghost', 'Dismiss', tray, { type: 'button', 'data-action': 'dismiss-all', 'data-part': 'dismiss-all' });
  }

  // Phone week strip. One-day (Linear) has nothing to pick between.
  const strip = model.days.length > 1
    ? el('div', 'cal-strip', undefined, section, { 'data-part': 'day-strip', role: 'group', 'aria-label': 'Day' })
    : null;
  for (const day of strip ? model.days : []) {
    const button = el('button', '', `<small>${DOW(day.date)}</small><b>${DOM_NUM(day.date)}</b><i></i>`, strip, {
      type: 'button',
      'data-day': day.date,
      'aria-pressed': String(day.date === state.phoneDay),
      'aria-label': `${DOW(day.date)} ${DOM_NUM(day.date)}, ${day.cap?.pct ?? ''}%`
    });
    css(button, '--cap', capColour(day.cap?.pct ?? 0));
    css(button, '--pct', `${day.cap?.pct ?? 0}%`);
  }

  const sources = el('div', 'cal__sources', undefined, section, { 'data-part': 'sources' });
  nodes.set('__sources', sources);
  paintTidelineSources(sources);

  const card = el('div', 'cal__card', undefined, section, { 'data-part': 'card' });
  const grid = el('div', 'cal__grid', undefined, card);
  const capCorner = el('div', 'cal-corner', 'Capacity from your logs', grid);
  capCorner.style.gridColumn = '1';
  capCorner.style.gridRow = '1';
  for (const date of days) mountHead(grid, date);
  const dueCorner = el('div', 'cal-allday cal-corner', 'Due · all day', grid);
  dueCorner.style.gridColumn = '1';
  dueCorner.style.gridRow = '2';
  for (const date of days) mountAllDay(grid, date);
  mountBandLabels(grid);
  for (const date of days) mountBody(grid, date);

  nodes.set('__toast', el('div', 'cal-toast', '', section, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'cal-pop', '', section, { role: 'dialog', 'aria-modal': 'false', 'data-part': 'chip-popover', hidden: '' }));
  nodes.set('__review', el('div', 'cal-review', '', section, { role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Waiting for review', 'data-part': 'review-panel', hidden: '' }));
  nodes.set('__live', el('div', 'cal-sr', '', section, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: clockFor(view) });
  heights = state.expanded == null ? baseHeights(bands) : bandTargets(bands, state.expanded);
  engine.place('__bands', Object.fromEntries(heights.map((height, index) => [`h${index}`, height])));
  engine.place('__toast', { opacity: 0, y: CAL.toastRise });
  engine.place('__pop', { opacity: 0, y: CAL.popRise });
  for (const [id, node] of nodes) {
    if (id.startsWith('chip:')) engine.place(id, { opacity: 1, scale: 1, solid: node.classList?.contains?.('is-ghost') ? 0 : 1 });
  }
  if (entrance) {
    days.forEach((date, index) => engine.enter(`col:${date}`, { opacity: 1, y: 0 }, {
      from: { opacity: 0, y: CAL.enterRise },
      delay: index * CAL.enterStagger,
      duration: CAL.enterMs
    }));
    entranceGuardUntil = perfNow() + ENTRANCE_GUARD_MS;
  } else {
    days.forEach((date) => engine.place(`col:${date}`, { opacity: 1, y: 0 }));
  }
  const raf = view?.requestAnimationFrame;
  if (typeof raf === 'function') raf(() => { settleZoomPills(zoom); applyHubPillsThumb(focus); });
  if (!wired) {
    wired = true;
    wire(section);
  } else {
    wire(section);
  }
  applySettled();
  applyTidelineFilter({ replay: false });
  lastPaintKey = paintKey(input);
  publish(view);
  watchPhone(view);
}

function tidelineFilterItems() {
  const chips = model.days.flatMap((day) => day.chips);
  const dues = model.days.flatMap((day) => day.due.map((due) => ({ ...due, kind: due.kind ?? 'task', filterKey: due.filterKey ?? 'tasks' })));
  const ghosts = model.ghosts.filter((ghost) => !ghost.overItem).map((ghost) => ghost.chip || ghost);
  return [...chips, ...dues, ...ghosts];
}

function paintTidelineSources(host = nodes.get('__sources')) {
  if (!host || !model) return;
  const items = tidelineFilterItems();
  const counts = countByFilterKey(items);
  const hidden = countHidden(items, filterState);
  paintSourceFilter(root, host, {
    hub: input?.hub || 'life',
    state: filterState,
    counts,
    hidden,
    ambient: model.ambient,
    feedNote: input?.icalFeedNote ?? null,
    onChange: (next) => {
      filterState = next;
      applyTidelineFilter({ replay: true });
      paintTidelineSources(host);
      const apply = host.parentElement?.querySelector?.('[data-part="apply-all"]');
      if (apply) {
        const { visible, hidden } = pendingGhostPartition();
        apply.textContent = applyAllLabel(visible.length, hidden);
      }
    }
  });
}

function applyTidelineFilter({ replay = false } = {}) {
  if (!model) return;
  const reduced = root?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const entries = [];
  for (const day of model.days) {
    for (const chip of day.chips) entries.push({ id: `chip:${chip.id}`, item: chip });
    for (const due of day.due) entries.push({ id: `due:${due.id}`, item: { ...due, kind: due.kind ?? 'task', filterKey: due.filterKey ?? 'tasks' } });
  }
  applyItemVisibility(nodes, entries, filterState, {
    reducedMotion: reduced || !replay,
    engine: replay ? engine : null
  });
  const visibleChips = model.days.flatMap((day) => day.chips).filter((chip) => isItemVisible(chip, filterState));
  const empty = nodes.get('__empty-filter');
  const card = host?.querySelector?.('[data-part="card"]');
  if (!visibleChips.length && countHidden(tidelineFilterItems(), filterState) > 0) {
    if (!empty && card) {
      const note = el(
        'p',
        'cal-empty-filter',
        `Nothing shown · ${countHidden(tidelineFilterItems(), filterState)} hidden by your filter · Show all`,
        card,
        { 'data-part': 'empty-filter' }
      );
      note.addEventListener('click', () => {
        const all = defaultFilterForHub('life');
        filterState = all;
        writeFilterState(input?.hub || 'life', all);
        applyTidelineFilter({ replay: true });
        paintTidelineSources();
      });
      nodes.set('__empty-filter', note);
    } else if (empty) {
      empty.hidden = false;
      empty.textContent = `Nothing shown · ${countHidden(tidelineFilterItems(), filterState)} hidden by your filter · Show all`;
    }
  } else if (empty) {
    empty.hidden = true;
  }
}

function dayByDate(date) {
  return model.days.find(day => day.date === date);
}

/** 1-based grid column for a day (column 1 is the band/label gutter). */
function dayGridColumn(date) {
  const days = state.phone ? [state.phoneDay] : model.week;
  const index = days.indexOf(date);
  return index >= 0 ? index + 2 : 2;
}

function mountHead(grid, date) {
  const day = dayByDate(date);
  const tag = day.tag;
  const head = el('div', `cal-head${date === model.today ? ' is-today' : ''}${day.over ? ' is-over' : ''}`, undefined, grid, { 'data-part': 'day-head', 'data-date': date });
  // Headers own their day column — never auto-place under a neighbour when a row is sparse.
  head.style.gridColumn = String(dayGridColumn(date));
  head.style.gridRow = '1';
  // Date stays above the capacity bar so bars align across the week.
  // over / tags / vitals sit in .cal-head__chips at the bottom of the square.
  el('div', 'cal-head__name', `<span class="cal-head__dow">${DOW(date)}</span><span class="cal-head__num">${DOM_NUM(date)}</span>`, head);
  const cap = el('div', `cal-cap${day.cap?.forecast ? ' is-forecast' : ''}`, undefined, head, { 'data-part': 'capacity', 'data-pct': String(day.cap?.pct ?? '') });
  css(cap, '--cap', capColour(day.cap?.pct ?? 0));
  el('div', 'cal-cap__bar', `<span class="cal-cap__fill" style="width:${day.cap?.pct ?? 0}%"></span>`, cap);
  el('div', 'cal-cap__text', `<b>${day.cap?.pct ?? ''}%</b> · ${day.cap?.note ?? ''}`, cap);
  // What this day costs you: booked hours, and one concrete move when it is over.
  if (day.cost?.text) {
    const move = day.cost.move;
    const cost = el('div', `cal-cost${day.cost.over ? ' is-over' : ''}`, escapeHtml(day.cost.text), head, { 'data-part': 'day-cost' });
    if (move) {
      el('button', 'cal-cost__move', `move ${escapeHtml(move.title)} to ${DOW(move.to).charAt(0)}${DOW(move.to).slice(1, 3).toLowerCase()} (${move.toPct}%)`, cost, {
        type: 'button',
        'data-cost-move': move.id,
        'data-cost-to': move.to,
        title: `Move ${move.title} to ${formatDisplayDate(move.to)}, the best day this week with room`
      });
    }
  }
  const chips = el('div', 'cal-head__chips', undefined, head, { 'data-part': 'day-chips' });
  if (day.over) el('span', 'cal-over', 'over', chips, { 'data-part': 'over-flag' });
  if (tag) el('span', `cal-tag${tag.tone === 'term' ? ' cal-tag--term' : ''}`, tag.text, chips);
  const bits = [];
  if (day.sleep != null) bits.push(`<span>${ICON.moon}${day.sleep}h</span>`);
  if (day.energy) bits.push(`<span class="${day.energy === 'low' ? 'is-low' : ''}">${ICON.bolt}${day.energy}</span>`);
  if (day.meals) bits.push(`<span>${ICON.fork}${day.meals}</span>`);
  if (day.symptom) bits.push(`<span class="is-symptom">● ${day.symptom}</span>`);
  if (day.med?.summary) {
    const flagged = day.med.doses.some((dose) => dose.status === 'skipped' || dose.late);
    bits.push(`<span class="cal-vit__med${flagged ? ' is-flag' : ''}" title="Dexy · ${escapeHtml(day.med.summary)}">${ICON.pill}${escapeHtml(day.med.summary)}</span>`);
  }
  el('div', 'cal-vit', bits.join('') || '<span>nothing logged yet</span>', chips, { 'data-part': 'vitals' });
  nodes.set(`colhead:${date}`, head);
}

function mountAllDay(grid, date) {
  const day = dayByDate(date);
  const cell = el('div', 'cal-allday', undefined, grid, { 'data-part': 'all-day', 'data-date': date });
  cell.style.gridColumn = String(dayGridColumn(date));
  cell.style.gridRow = '2';
  for (const due of day.due) {
    const ghost = model.ghosts.find(item => item.id === due.ghostId);
    const moved = state.settled.get(due.ghostId);
    const allDayClass = due.kind === 'allday' ? ` is-allday k-${due.filterKey === 'events' ? 'event' : due.filterKey}${due.ambient ? ' is-ambient' : ''}` : '';
    const promiseClass = allDayClass || due.kind === 'promise'
      ? ` is-promise ${due.direction === 'they_owe' ? 'is-them' : 'is-you'}${due.late ? ' is-late' : ''}`
      : '';
    const kindLabel = due.kind === 'promise' ? 'Promise' : due.kind === 'allday' ? 'All day' : 'Task';
    const hint = [kindLabel, due.meta].filter(Boolean).join(' · ');
    const progress = due.progress ? `${due.progress.done} of ${due.progress.total} ${due.progress.unit}` : '';
    const left = due.range?.kind === 'range' ? due.range.text.replace(/ \(.*\)$/, '') : '';
    const dueMeta = [due.meta, progress, left].filter(Boolean).join(' · ');
    const bookmarkHtml = due.bookmark?.note ? `<span class="cal-due__bm" title="Where you left it">↳ ${escapeHtml(due.bookmark.note)}</span>` : '';
    const after = due.record?.blocked_by?.length ? `<span class="cal-due__after">after ${escapeHtml(due.record.blocked_by.map(b => b.title).join(', '))}</span>` : '';
    const frag = due.fragility && due.fragility.status !== 'fits'
      ? `<span class="cal-due__flag is-${due.fragility.status}" title="${escapeHtml(due.fragility.text)}">${due.fragility.status === 'short' ? 'won’t fit' : 'fragile'}</span>`
      : '';
    const chip = el('div', `cal-due${promiseClass}`, `<b>${escapeHtml(due.title)}</b>${frag}${dueMeta ? `<span class="cal-due__meta">${escapeHtml(dueMeta)}</span>` : ''}${after}${bookmarkHtml}`, cell, {
      'data-part': 'due',
      'data-id': due.id,
      tabindex: '0',
      role: 'button',
      title: `${due.title}\n${hint} · click for details`,
      'aria-label': `${due.title}. ${hint}. Open for details.`,
      ...(due.kind === 'promise' ? { 'data-kind': 'promise' } : {})
    });
    if (chipIsMovable(due) && !due.moved) chip.dataset.movable = '1';
    const movedTo = due.movedTo || (moved?.outcome === 'accepted' && moved.ghost.kind === 'move_task' ? moved.ghost.to : null);
    if (ghost && ghost.kind === 'move_task' && !due.moved) {
      el('span', 'cal-due__move', `<span class="cal-av cal-av--sm">${AGENT_INITIAL[ghost.agent] || ''}</span>${escapeHtml(ghost.label)}<button type="button" data-accept="${ghost.id}" data-label="Move">Move</button>`, chip, { 'data-ghost': ghost.id });
    } else if (movedTo) {
      chip.classList?.add?.('is-moved');
      el('span', 'cal-due__move', movedCaption(movedTo, model.terms), chip);
    }
    nodes.set(`due:${due.id}`, chip);
  }
  nodes.set(`colallday:${date}`, cell);
}

function mountBandLabels(grid) {
  const column = el('div', 'cal-bands', undefined, grid, { 'data-part': 'band-labels' });
  column.style.gridColumn = '1';
  column.style.gridRow = '3';
  column.style.height = `${model.total + SLEEP_STRIP_PX}px`;
  bands.forEach((band, index) => {
    const button = el('button', 'cal-band', `<b>${band.label}${ICON.chev}</b><span>${model.subs[band.id] ?? ''}</span>`, column, {
      type: 'button',
      'data-band': String(index),
      'aria-expanded': String(state.expanded === index),
      'data-part': `band-${band.id}`,
      'aria-label': `${band.label} band. Press to expand.`
    });
    nodes.set(`band:${index}`, button);
  });
  const sleep = el('div', 'cal-sleeplab', 'Sleep', column);
  sleep.style.top = `${model.total}px`;
  sleep.style.height = `${SLEEP_STRIP_PX}px`;
}

function mountBody(grid, date) {
  const day = dayByDate(date);
  const body = el('div', `cal-body${day.past ? ' is-past' : ''}`, undefined, grid, { 'data-part': 'day-body', 'data-date': date });
  body.style.gridColumn = String(dayGridColumn(date));
  body.style.gridRow = '3';
  body.style.height = `${model.total + SLEEP_STRIP_PX}px`;
  nodes.set(`colbody:${date}`, body);
  bands.forEach((band, index) => {
    if (band.id === 'school' && day.school) {
      const attrs = { 'data-band': String(index) };
      if (input?.fills?.school) attrs['data-fill'] = String(input.fills.school);
      nodes.set(`bg:${date}:${index}`, el('div', 'cal-bg cal-bg--school', undefined, body, attrs));
    }
    if (band.id === 'yours') nodes.set(`bg:${date}:${index}`, el('div', 'cal-bg cal-bg--yours', undefined, body, { 'data-band': String(index) }));
    nodes.set(`line:${date}:${index}`, el('div', 'cal-line', undefined, body));
  });
  const sleep = el('div', 'cal-sleep', `${ICON.moon}${day.sleepText}`, body, { 'data-part': 'sleep-strip' });
  sleep.style.top = `${model.total}px`;
  sleep.style.height = `${SLEEP_STRIP_PX}px`;
  for (const free of day.free) {
    const node = el('div', 'cal-free', `<div><b>${free.title}</b>${free.sub ?? ''}</div>`, body, {
      'data-part': 'free',
      'data-start': String(toHour(free.start)),
      'data-end': String(toHour(free.end))
    });
    nodes.set(`free:${date}`, node);
  }
  // Availability textures under the chips: interruptible school time, freed slots.
  (day.textures ?? []).forEach((span, index) => {
    nodes.set(`tex:${date}:${index}`, el('div', `cal-tex tx-${span.kind}`, undefined, body, {
      'data-part': 'texture',
      'data-start': String(span.start),
      'data-end': String(span.end),
      title: 'Interruptible: school time between classes'
    }));
  });
  (day.freed ?? []).forEach((span, index) => {
    const label = `Freed: ${span.title}${span.reason ? ` (${span.reason})` : ''}`;
    nodes.set(`tex:${date}:f${index}`, el('div', 'cal-tex tx-regained', `<span>${escapeHtml(label)}</span>`, body, {
      'data-part': 'freed',
      'data-start': String(span.start),
      'data-end': String(span.end),
      title: label
    }));
  });
  for (const chip of day.chips) mountChip(body, chip);
  if (date === model.today) nodes.set('now', el('div', 'cal-now', `<span>${nowLabel(nowHour)}</span>`, body, { 'data-part': 'now-line' }));
  for (const wall of day.walls) {
    const [first, ...rest] = wall.label.split(' · ');
    const more = rest.length ? `<span class="cal-wall__more"> · ${rest.join(' · ')}</span>` : '';
    const node = el('div', 'cal-wall', `<span class="cal-wall__pill" title="${wall.label}" aria-label="${wall.label}">${ICON.lock}<span class="cal-wall__first">${first}</span>${more}</span>`, body, { 'data-part': 'wall' });
    node.style.height = `${model.total}px`;
  }
}

function chipIsMovable(chip) {
  if (!chip || chip.ghost) return false;
  if (typeof input?.onReschedule !== 'function' && typeof input?.apiFetch !== 'function') return false;
  return canMoveItem(chip);
}

function mountChip(body, chip) {
  const ghost = chip.ghost?.settled === 'accepted' ? null : chip.ghost;
  const classes = ['cal-chip', `k-${chip.kind}`];
  if (chip.isClass) classes.push('is-class');
  if (chip.skipped) classes.push('is-skipped');
  if (chip.kind === 'corey') classes.push('is-corey');
  if (chip.pin) classes.push('is-pin');
  if (chip.ambient) classes.push('is-ambient');
  if (chip.texture && !['fixed', 'focus', 'protected'].includes(chip.texture)) classes.push(`tx-${chip.texture}`);
  if (chip.regained) classes.push('is-regained');
  if (ghost) classes.push('is-ghost');
  if (chip.ghost?.settled === 'accepted') classes.push('is-accepted');
  const title = `${chip.kind === 'corey' ? '<span class="cal-mark"></span>' : ''}${chip.title}`;
  const agent = ghost ? `<span class="cal-chip__agent"><span class="cal-av cal-av--sm ${ghost.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[ghost.agent]}</span></span>` : '';
  const acts = ghost && ghost.kind !== 'bedtime'
    ? `<div class="cal-chip__acts"><button type="button" class="is-yes" data-accept="${ghost.id}" data-label="Accept">Accept</button><button type="button" data-dismiss="${ghost.id}">Dismiss</button></div>`
    : ghost ? `<div class="cal-chip__acts"><button type="button" class="is-yes" data-accept="${ghost.id}" data-label="Accept">Accept</button></div>` : '';
  const progress = chip.progress ? ` · ${chip.progress.done}/${chip.progress.total}` : '';
  const bookmark = chip.bookmark?.note ? `<div class="cal-chip__bm" title="Where you left it">↳ ${escapeHtml(chip.bookmark.note)}</div>` : '';
  const node = el('div', classes.join(' '), `${agent}<div class="cal-chip__title">${title}</div><div class="cal-chip__meta">${escapeHtml(chip.meta ?? '')}${progress}</div>${bookmark}${acts}`, body, {
    'data-part': ghost ? 'ghost' : chip.isClass ? 'class' : 'chip',
    'data-id': chip.id,
    'data-kind': chip.kind,
    title: chip.meta ? `${chip.title} · ${chip.meta}` : chip.title,
    tabindex: '0',
    role: 'button',
    'aria-label': `${chip.title}. ${chip.meta}`,
    'data-start': String(chip.start),
    'data-end': String(chip.end),
    'data-has-actions': acts ? '1' : '',
    ...(chip.source ? { 'data-source': chip.source } : {}),
    ...(chip.lesson_id ? { 'data-lesson-id': chip.lesson_id } : {}),
    ...(chip.class_id ? { 'data-class-id': chip.class_id } : {})
  });
  if (chipIsMovable(chip)) {
    node.dataset.movable = '1';
    if (canResizeItem(chip) && typeof node.insertAdjacentHTML === 'function') {
      node.dataset.resizable = '1';
      node.insertAdjacentHTML('beforeend', '<span class="cal-chip__grip is-start" data-grip="start" aria-hidden="true"></span><span class="cal-chip__grip is-end" data-grip="end" aria-hidden="true"></span>');
    }
  }
  const proposal = model.ghosts.find(item => item.overItem === chip.id && !state.settled.has(item.id));
  if (proposal && typeof node.insertAdjacentHTML === 'function') {
    node.classList.add('has-proposal');
    node.dataset.ghost = proposal.id;
    node.insertAdjacentHTML('afterbegin', `<span class="cal-chip__agent"><span class="cal-av cal-av--sm ${proposal.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[proposal.agent]}</span></span>`);
    node.insertAdjacentHTML('beforeend', `<div class="cal-chip__proposal" data-part="proposal">${agentName(proposal.agent)} suggests: ${escapeHtml(proposal.label).toLowerCase()}</div>`);
    node.setAttribute('aria-label', `${chip.title}. ${chip.meta}. Proposal: ${proposal.label}. Open for details.`);
  }
  nodes.set(`chip:${chip.id}`, node);
}

export function layout(nextHeights) {
  const out = new Map();
  bands.forEach((band, index) => {
    const top = yForHour(bands, nextHeights, band.from);
    out.set(`band:${index}`, { top, height: yForHour(bands, nextHeights, band.to) - top });
  });
  for (const [id, node] of nodes) {
    const [type, , bandIndex] = id.split(':');
    if (type === 'bg' || type === 'line') {
      const band = bands[Number(bandIndex)];
      const top = yForHour(bands, nextHeights, band.from);
      out.set(id, type === 'bg' ? { top, height: yForHour(bands, nextHeights, band.to) - top } : { top });
    } else if (type === 'chip') {
      out.set(id, blockGeometry(bands, nextHeights, Number(node.dataset.start), Number(node.dataset.end)));
    } else if (type === 'tex') {
      const top = yForHour(bands, nextHeights, Number(node.dataset.start));
      out.set(id, { top, height: Math.max(0, yForHour(bands, nextHeights, Number(node.dataset.end)) - top) });
    } else if (type === 'free') {
      const top = yForHour(bands, nextHeights, Number(node.dataset.start));
      const raw = yForHour(bands, nextHeights, Number(node.dataset.end)) - top;
      out.set(id, { top: top + 8, height: Math.max(0, raw - 16), fade: clamp01((raw - 90) / 40) });
    } else if (id === 'now') {
      out.set(id, { top: yForHour(bands, nextHeights, nowHour) });
    }
  }
  return out;
}

function apply(id, props) {
  if (id === '__bands') {
    heights = bands.map((_, index) => props[`h${index}`]);
    for (const [entityId, next] of layout(heights)) engine.place(entityId, next);
    return;
  }
  if (id === '__toast') {
    const toast = nodes.get('__toast');
    css(toast, '--o', String(props.opacity));
    css(toast, '--y', String(props.y));
    return;
  }
  if (id === '__pop') {
    const pop = nodes.get('__pop');
    if (!pop) return;
    pop.style.opacity = String(props.opacity);
    pop.style.transform = `translateY(${props.y}px)`;
    return;
  }
  if (id.startsWith('col:')) {
    const date = id.slice(4);
    for (const part of ['colhead', 'colallday', 'colbody']) {
      const node = nodes.get(`${part}:${date}`);
      if (!node) continue;
      node.style.opacity = String(props.opacity);
      node.style.transform = props.y ? `translateY(${props.y}px)` : '';
    }
    return;
  }
  const node = nodes.get(id);
  if (!node) return;
  if (props.top != null) node.style.top = `${props.top}px`;
  if (props.height != null) node.style.height = `${props.height}px`;
  if (id.startsWith('band:')) {
    css(node, '--sub', String(fadeIn(props.height, [38, 48])));
    return;
  }
  if (id.startsWith('free:')) {
    node.style.opacity = String(props.fade);
    return;
  }
  if (id.startsWith('chip:')) {
    const height = props.height;
    css(node, '--t', String(fadeIn(height, CAL.fade.title)));
    css(node, '--m', String(fadeIn(height, CAL.fade.meta)));
    css(node, '--lines', height >= CAL.twoLinesAt ? '2' : '1');
    css(node, '--py', `${height >= CAL.cardAt ? 5 : Math.max(0, (height - 2 - CAL.lineBox) / 2)}px`);
    const acts = node.querySelector?.('.cal-chip__acts');
    if (acts) {
      const amount = fadeIn(height, CAL.fade.actions);
      css(acts, '--a', String(amount));
      if (amount < 0.5) acts.setAttribute?.('data-off', '');
      else acts.removeAttribute?.('data-off');
    }
    if (props.solid != null) css(node, '--solid', String(props.solid));
    if (props.opacity != null) css(node, '--o', String(props.opacity));
    if (props.scale != null) css(node, '--s', String(props.scale));
    node.dataset.density = height < 14 ? 'sliver' : height < 38 ? 'line' : 'card';
  }
}

function setBand(next) {
  state.expanded = next;
  writeBandSession(next);
  const target = bandTargets(bands, next);
  engine.to('__bands', Object.fromEntries(target.map((height, index) => [`h${index}`, height])), { duration: CAL.bandMs, easing: EASE });
  host.querySelectorAll?.('.cal-band')?.forEach(button => {
    button.setAttribute('aria-expanded', String(Number(button.dataset.band) === next));
  });
  const focus = host.querySelector?.('[data-part="focus-pills"]');
  focus?.querySelectorAll?.('.hub-pills__btn')?.forEach(button => {
    const on = (button.dataset.band === 'none' && next == null) || Number(button.dataset.band) === next;
    button.classList?.toggle?.('is-active', on);
    button.setAttribute('aria-pressed', String(on));
  });
  if (focus) {
    focus.classList?.add?.('is-animated');
    applyHubPillsThumb(focus);
  }
  const live = nodes.get('__live');
  if (live) live.textContent = next == null ? 'All bands balanced.' : `${bands[next].label} expanded.`;
}

function toggleBand(index) {
  setBand(state.expanded === index ? null : index);
}

function showToast(html) {
  const toast = nodes.get('__toast');
  if (!toast) return;
  state.toast = { html, until: Date.now() + CAL.toastHoldMs };
  markup(toast, html);
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: CAL.toastInMs });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => engine.to('__toast', { opacity: 0, y: CAL.toastRise }, { duration: CAL.toastInMs }), CAL.toastHoldMs);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function decisionButtons(ghostId) {
  return [...(host?.querySelectorAll?.(`[data-accept="${ghostId}"],[data-dismiss="${ghostId}"]`) ?? [])];
}

function armButtons(ghostId, busy, { saving = false } = {}) {
  for (const button of decisionButtons(ghostId)) {
    if (button.dataset.accept && !button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    if (!button.dataset.accept) continue;
    button.textContent = saving ? 'Saving…' : button.dataset.label;
  }
}

function markRetry(ghostId) {
  for (const button of decisionButtons(ghostId)) {
    button.disabled = false;
    if (!button.dataset.accept) continue;
    button.dataset.label = 'Retry';
    button.textContent = 'Retry';
  }
}

async function postDecision(id, decision, reason) {
  const request = input?.apiFetch ?? globalThis.fetch;
  const response = await request('/api/calendar-ghosts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ghostDecisionBody(id, decision, reason))
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

function errorText(payload, fallback) {
  const message = payload?.error?.message;
  return typeof message === 'string' && message ? message : fallback;
}

function paintAccepted(ghost) {
  if (ghost.kind === 'move_task') {
    const due = nodes.get(`due:${ghost.taskId}`);
    if (!due) return;
    due.classList?.add?.('is-moved');
    let move = due.querySelector?.('.cal-due__move');
    if (!move) move = el('span', 'cal-due__move', '', due);
    markup(move, movedCaption(ghost.to, model.terms));
    return;
  }
  if (ghost.overItem) {
    const item = nodes.get(`chip:${ghost.overItem}`);
    if (!item) return;
    item.classList?.remove?.('has-proposal');
    item.classList?.add?.('is-skipped');
    item.querySelector?.('.cal-chip__agent')?.remove();
    item.querySelector?.('.cal-chip__proposal')?.remove();
    const meta = item.querySelector?.('.cal-chip__meta');
    if (meta) meta.textContent = `Skipped · ${agentName(ghost.agent)}`;
    return;
  }
  const chip = nodes.get(`chip:${ghost.id}`);
  if (!chip) return;
  chip.classList?.add?.('is-accepted');
  chip.querySelector?.('.cal-chip__acts')?.remove();
  chip.dataset.part = 'chip';
  engine.to(`chip:${ghost.id}`, { solid: 1 }, { duration: CAL.acceptMs });
}

function paintDismissed(ghost) {
  if (ghost.overItem) {
    const item = nodes.get(`chip:${ghost.overItem}`);
    item?.classList?.remove?.('has-proposal');
    item?.querySelector?.('.cal-chip__agent')?.remove();
    item?.querySelector?.('.cal-chip__proposal')?.remove();
    return;
  }
  engine.to(`chip:${ghost.id}`, { scale: 0.96 }, { duration: CAL.exitMs });
  engine.exit(`chip:${ghost.id}`, () => {
    nodes.get(`chip:${ghost.id}`)?.remove();
    nodes.delete(`chip:${ghost.id}`);
  }, { duration: CAL.exitMs });
}

function applySettled() {
  for (const entry of state.settled.values()) {
    if (entry.outcome === 'accepted') paintAccepted(entry.ghost);
  }
  if (state.toast && Date.now() < state.toast.until) showToast(state.toast.html);
}

function pendingGhost(ghostId) {
  if (state.settled.has(ghostId) || state.busy.has(ghostId)) return null;
  return model?.ghosts?.find(item => item.id === ghostId && item.settled !== 'accepted') ?? null;
}

async function accept(ghostId, { quiet = false } = {}) {
  const ghost = pendingGhost(ghostId);
  if (!ghost) return null;
  state.busy.add(ghostId);
  armButtons(ghostId, true, { saving: true });
  let result;
  try {
    result = await postDecision(ghostId, 'accept');
  } catch (error) {
    state.busy.delete(ghostId);
    armButtons(ghostId, false);
    if (!quiet) showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
    return null;
  }
  state.busy.delete(ghostId);
  const receipt = typeof result.payload?.receipt === 'string' ? result.payload.receipt : '';
  if (result.status === 207 || result.payload?.writes === 'partial' || result.payload?.retry === 'tasks') {
    markRetry(ghostId);
    if (!quiet) showToast(`<b>Tasks will retry.</b> ${escapeHtml(receipt)} <button type="button" data-accept="${ghostId}" data-label="Retry">Retry</button>`);
    return null;
  }
  if (result.status !== 200 || result.payload?.ok === false) {
    armButtons(ghostId, false);
    if (!quiet) showToast(`<b>Not saved.</b> ${escapeHtml(errorText(result.payload, 'Could not save that change.'))}`);
    return null;
  }
  state.settled.set(ghostId, { outcome: 'accepted', ghost });
  paintAccepted(ghost);
  if (!quiet) showToast(`<b>Written.</b> ${escapeHtml(receipt)}`);
  const live = nodes.get('__live');
  if (live) live.textContent = receipt;
  if (!quiet) void input?.onSourcesChanged?.();
  return { receipt };
}

async function dismiss(ghostId, { quiet = false } = {}) {
  const ghost = pendingGhost(ghostId);
  if (!ghost) return null;
  state.busy.add(ghostId);
  armButtons(ghostId, true);
  let result;
  try {
    result = await postDecision(ghostId, 'dismiss');
  } catch (error) {
    state.busy.delete(ghostId);
    armButtons(ghostId, false);
    if (!quiet) showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
    return null;
  }
  state.busy.delete(ghostId);
  if (result.status !== 200 || result.payload?.ok === false) {
    armButtons(ghostId, false);
    if (!quiet) showToast(`<b>Not saved.</b> ${escapeHtml(errorText(result.payload, 'Could not dismiss that change.'))}`);
    return null;
  }
  state.settled.set(ghostId, { outcome: 'dismissed', ghost });
  paintDismissed(ghost);
  const receipt = typeof result.payload?.receipt === 'string' ? result.payload.receipt : 'Dismissed. Nothing written.';
  const who = agentName(ghost.agent);
  const note = ghost.overItem && ghost.agent === 'sara'
    ? 'Sara notes the “no”, so she asks less often.'
    : `${who} notes the “no”, so it asks less often.`;
  if (!quiet) showToast(`<b>${escapeHtml(receipt)}</b> ${note}`);
  const live = nodes.get('__live');
  if (live) live.textContent = receipt;
  return { receipt };
}

async function applyAll() {
  const pending = pendingVisibleGhosts();
  const plans = await Promise.all(pending.map(async (ghost, index) => {
    await wait(index * CAL.applyAllStagger);
    return accept(ghost.id, { quiet: true });
  }));
  const done = plans.filter(Boolean);
  if (done.length) showToast(`<b>${done.length} change${done.length === 1 ? '' : 's'} written.</b> Receipts are in Central Node › Recent Agent Actions.`);
  if (done.length) void input?.onSourcesChanged?.();
}

function openPop(chipId) {
  const chip = nodes.get(`chip:${chipId}`) || nodes.get(`due:${chipId}`);
  const pop = nodes.get('__pop');
  if (!chip || !pop) return;
  const ghost = model.ghosts.find(
    (item) =>
      (item.id === chipId || item.overItem === chipId || item.taskId === chipId) &&
      !state.settled.has(item.id) &&
      item.settled !== 'accepted'
  );
  const item = model.days.flatMap((day) => day.chips).find((chipItem) => chipItem.id === chipId);
  const due = model.days.flatMap((day) => day.due).find((row) => row.id === chipId);
  // Standalone proposal owns the popover title; overlays / move_task keep the calendar item title.
  const ghostOwnsCopy = Boolean(ghost && !ghost.overItem && ghost.kind !== 'move_task');
  const title = ghostOwnsCopy
    ? ghost.label
    : item?.title ?? due?.title ?? chip.title ?? ghost?.label ?? '';
  const meta = ghostOwnsCopy ? ghost.meta : item?.meta ?? due?.meta ?? '';
  let html = `<div class="cal-pop__head">${ghost ? `<span class="cal-av cal-av--sm ${ghost.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[ghost.agent] || ''}</span>` : `<i class="cal-pop__dot k-${chip.dataset.kind || 'task'}"></i>`}<b>${escapeHtml(title)}</b></div><p class="cal-pop__meta">${escapeHtml(meta)}</p>`;
  if (ghost) {
    const preview = writePreview(ghost);
    if (ghost.overItem || ghost.kind === 'move_task') {
      html += `<p class="cal-pop__label">${agentName(ghost.agent)} suggests</p><p class="cal-pop__meta cal-pop__meta--strong">${escapeHtml(ghost.label)} · ${escapeHtml(ghost.meta)}</p>`;
    }
    if (preview) {
      html += `<p class="cal-pop__label">Accept writes</p><p class="cal-pop__writes" data-part="write-preview">${escapeHtml(preview)}</p>`;
    }
    html += `<div class="cal-pop__acts"><button type="button" class="btn btn--primary" data-accept="${ghost.id}" data-label="Accept">Accept</button>${ghost.kind === 'bedtime' ? '' : `<button type="button" class="btn btn--ghost" data-dismiss="${ghost.id}">Dismiss</button>`}</div>`;
  }
  const cardItem = ghost ? null : (item || due || { kind: chip.dataset.kind, source: chip.dataset.source, id: chipId, title: chip.title });
  if (cardItem) {
    html = itemCardHtml(cardItem, {
      kind: item?.kind ?? (due?.kind === 'promise' ? 'promise' : due?.kind === 'allday' ? (due.filterKey === 'events' ? 'event' : due.filterKey) : 'task'),
      routeFor: input?.routeFor,
      location: root.defaultView?.location ?? null
    });
  }
  markup(pop, html);
  pop.classList?.toggle?.('cal-pop--card', Boolean(cardItem));
  if (cardItem) {
    bindItemCard(pop, cardItem, {
      onSave: (patch) => persistItem(cardItem, patch),
      onClose: () => closePop()
    });
  }
  pop.hidden = false;
  pop.removeAttribute?.('hidden');
  const section = host.querySelector?.('.cal') ?? host;
  const bounds = section.getBoundingClientRect?.() ?? { left: 0, right: 0, top: 0 };
  const chipBounds = chip.getBoundingClientRect?.() ?? { left: 0, right: 0, top: 0 };
  const roomRight = bounds.right - chipBounds.right;
  const left = roomRight >= CAL.popWidth + CAL.popGap ? chipBounds.right - bounds.left + CAL.popGap : chipBounds.left - bounds.left - CAL.popWidth - CAL.popGap;
  pop.style.left = `${Math.max(0, left)}px`;
  pop.style.top = `${chipBounds.top - bounds.top}px`;
  popFor = chipId;
  engine.place('__pop', { opacity: 0, y: CAL.popRise });
  engine.to('__pop', { opacity: 1, y: 0 }, { duration: CAL.popMs });
  // First button (Accept on proposals, Close on the item card) — never pop the phone keyboard on open.
  pop.querySelector?.('button')?.focus?.({ preventScroll: true });
}

function closePop() {
  if (!popFor) return;
  popFor = null;
  engine.to('__pop', { opacity: 0, y: CAL.popRise }, { duration: CAL.popMs });
  setTimeout(() => {
    if (!popFor) {
      const pop = nodes.get('__pop');
      if (pop) {
        pop.hidden = true;
        pop.setAttribute?.('hidden', '');
      }
    }
  }, CAL.popMs);
}

function wire(section) {
  if (section.dataset.tidelineWired) return;
  section.dataset.tidelineWired = '1';
  section.addEventListener?.('click', event => {
    const raw = event.target;
    const target = raw && typeof raw.closest === 'function' ? raw : raw?.parentElement;
    if (!target || typeof target.closest !== 'function') return;

    const action = target.closest('[data-action]')?.dataset?.action;
    if (action === 'close-review') {
      closeReview();
      return;
    }
    if (action === 'reveal-ghost') {
      const ghostId = target.closest('[data-action="reveal-ghost"]')?.dataset?.ghostId;
      if (ghostId) revealGhost(ghostId);
      return;
    }
    if (action === 'apply-all') {
      closeReview();
      void applyAll();
      return;
    }
    if (action === 'review') {
      openReviewPanel();
      return;
    }
    if (action === 'dismiss-all') {
      closeReview();
      void dismissAll();
      return;
    }

    const acceptButton = target.closest('[data-accept]');
    if (acceptButton) {
      closePop();
      void accept(acceptButton.dataset.accept).then(refreshOpenReview);
      return;
    }
    const dismissButton = target.closest('[data-dismiss]');
    if (dismissButton) {
      closePop();
      void dismiss(dismissButton.dataset.dismiss).then((result) => {
        if (result && nodes.get('__review') && !nodes.get('__review').hidden) openReviewPanel();
        else if (!pendingVisibleGhosts().length) closeReview();
      });
      return;
    }
    if (target.closest('[data-part="quick-add"]')) {
      input?.onQuickAdd?.();
      return;
    }
    if (target.closest('[data-rescue-open]')) {
      openRescueSheet({
        doc: root,
        model,
        today: input.today,
        nowHour,
        lightsOut: bands[bands.length - 1]?.to ?? 22,
        apiFetch: input?.apiFetch,
        onQueued: (queued) => {
          // Rescue morph: blocks glide from where they were to the proposed places.
          const pairs = morphPairs(queued);
          const rects = captureChips(host, pairs);
          input = { ...input, ghosts: [...(input.ghosts ?? []), ...queued] };
          mount({ entrance: false });
          playChips(host, pairs, rects, { view: root.defaultView });
        },
        onDone: () => { void input?.onSourcesChanged?.(); }
      });
      return;
    }
    const costMove = target.closest('[data-cost-move]');
    if (costMove) {
      void moveFromCostLine(costMove.dataset.costMove, costMove.dataset.costTo, costMove);
      return;
    }
    // Every chip and Due row opens the item card (context, edit, ↗ new tab).
    const chip = target.closest('.cal-chip') || target.closest('.cal-due');
    if (chip && !target.closest('[data-part="chip-popover"]')) {
      if (perfNow() < suppressClickUntil) return;
      if (chip.dataset.id === popFor) closePop();
      else openPop(chip.dataset.id);
      return;
    }
    if (!target.closest('[data-part="chip-popover"]') && !target.closest('[data-part="review-panel"]')) {
      closePop();
    }
    const day = target.closest('[data-day]');
    if (day) {
      state.phoneDay = day.dataset.day;
      mount({ entrance: false });
      return;
    }
    const shift = target.closest('[data-shift]');
    if (shift) {
      input.onShiftRange?.(Number(shift.dataset.shift));
      return;
    }
    if (target.closest('[data-today]')) {
      input.onSelectDate?.(input.today);
      return;
    }
    const zoom = target.closest('[data-zoom]');
    if (zoom) {
      const name = zoom.dataset.zoom;
      if (name === 'day' || name === 'week' || name === 'term' || name === 'year' || name === 'almanac') {
        input.onSwitchView?.(name);
      }
      return;
    }
    const band = target.closest?.('[data-band]');
    if (band && !target.closest?.('.cal-chip')) {
      if (band.dataset.band === 'none') setBand(null);
      else if (band.closest?.('[data-part="focus-pills"]')) setBand(Number(band.dataset.band));
      else toggleBand(Number(band.dataset.band));
    }
  });
  section.addEventListener?.('keydown', event => {
    if (event.target?.closest?.('input,textarea')) return;
    if (event.target?.closest?.('[data-part="chip-popover"]')) {
      if (event.key === 'Escape') closePop();
      return;
    }
    if (/^[1-4]$/.test(event.key)) {
      toggleBand(Number(event.key) - 1);
      event.preventDefault();
    } else if (event.key === 'Escape' && popFor) closePop();
    else if (event.key === '0' || event.key === 'Escape') setBand(null);
    else if ((event.key === 'Enter' || event.key === ' ') && (event.target?.classList?.contains?.('cal-chip') || event.target?.classList?.contains?.('cal-due'))) {
      openPop(event.target.dataset.id);
      event.preventDefault();
    }
  });
  section.addEventListener?.('pointerdown', onDragPointerDown);
}

/* ---------- item writes (drag, resize, item card) ---------- */

/** Save through the hub adapter for moves (Tasks plan-work rules), else straight to the owning API. */
async function persistItem(item, patch) {
  const moveOnly = Object.keys(patch).every((key) => key === 'date' || key === 'start_time' || key === 'duration_min');
  if (moveOnly && typeof input?.onReschedule === 'function') await input.onReschedule(item, patch);
  else await saveCalendarItem(input?.apiFetch, item, patch);
  void input?.onSourcesChanged?.();
}

/*
 * Pointer drag, same model as the Tasks sprint board: a 4px threshold so a click
 * still opens the card, a floating copy under the pointer, the target day lit.
 * Mouse only — on touch the grid scrolls, and the item card edits date and time.
 *   chip body  → another day and/or time (snaps to the grid)
 *   chip edge  → new start or end (work blocks)
 *   Due row    → another day
 */
const DRAG_THRESHOLD_PX = 4;
const MIN_SPAN_H = 0.25;
let drag = null;
let suppressClickUntil = 0;

function chipById(id) {
  for (const day of model?.days ?? []) {
    const hit = day.chips.find((chip) => chip.id === id);
    if (hit) return hit;
  }
  return null;
}

function dueById(id) {
  for (const day of model?.days ?? []) {
    const hit = day.due.find((row) => row.id === id);
    if (hit) return hit;
  }
  return null;
}

function spanText(start, end) {
  return `${nowLabel(start)} – ${nowLabel(end)}`;
}

function dayText(date) {
  return `${DOW(date).charAt(0)}${DOW(date).slice(1).toLowerCase()} ${formatDisplayDate(date)}`;
}

function setDropTarget(cell) {
  host?.querySelectorAll?.('.is-drop-target')?.forEach((node) => {
    if (node !== cell) node.classList.remove('is-drop-target');
  });
  cell?.classList?.add('is-drop-target');
}

function onDragPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
  const target = event.target;
  if (!target?.closest || target.closest('button, a, input, textarea, select')) return;
  const node = target.closest('.cal-chip[data-movable="1"], .cal-due[data-movable="1"]');
  if (!node || !host?.contains?.(node)) return;
  const isDue = node.classList.contains('cal-due');
  const item = isDue ? dueById(node.dataset.id) : chipById(node.dataset.id);
  if (!item) return;
  const grip = target.closest('[data-grip]')?.dataset?.grip;
  const view = root.defaultView;
  if (!view) return;
  drag = {
    node,
    item,
    isDue,
    mode: grip === 'start' || grip === 'end' ? `resize-${grip}` : 'move',
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    float: null,
    when: null,
    target: null,
    orig: { date: item.date, start: item.start, end: item.end }
  };
  if (grip) event.preventDefault();
  view.addEventListener('pointermove', onDragMove, { passive: false });
  view.addEventListener('pointerup', onDragEnd);
  view.addEventListener('pointercancel', onDragCancel);
  view.addEventListener('keydown', onDragKey, true);
}

function activateDrag() {
  const rect = drag.node.getBoundingClientRect();
  drag.active = true;
  drag.offsetX = drag.startX - rect.left;
  drag.offsetY = drag.startY - rect.top;
  closePop();
  host.querySelector?.('.cal')?.classList?.add('is-dragging-item');
  if (drag.mode !== 'move') {
    drag.node.classList.add('is-resizing');
    return;
  }
  const float = drag.node.cloneNode(true);
  float.classList.add('cal-drag-float');
  float.classList.remove('is-filter-hidden');
  float.removeAttribute('data-part');
  float.removeAttribute('tabindex');
  float.setAttribute('aria-hidden', 'true');
  float.style.width = `${rect.width}px`;
  float.style.height = `${rect.height}px`;
  float.style.left = `${rect.left}px`;
  float.style.top = `${rect.top}px`;
  const when = root.createElement('span');
  when.className = 'cal-drag-float__when';
  float.append(when);
  // Inside .cal so the --cal-* surface tokens still apply; position:fixed keeps it under the pointer.
  (host.querySelector?.('.cal') ?? host).append(float);
  drag.float = float;
  drag.when = when;
  drag.node.classList.add('is-dragging');
}

function onDragMove(event) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
    activateDrag();
  }
  event.preventDefault();
  const { item } = drag;
  if (drag.mode === 'move') {
    drag.float.style.left = `${event.clientX - drag.offsetX}px`;
    drag.float.style.top = `${event.clientY - drag.offsetY}px`;
    const under = root.elementFromPoint?.(event.clientX, event.clientY);
    const cell = under?.closest?.('.cal-body[data-date], .cal-allday[data-date]');
    if (!cell || !host.contains(cell)) {
      setDropTarget(null);
      drag.target = null;
      drag.when.textContent = '';
      return;
    }
    setDropTarget(cell);
    const date = cell.dataset.date;
    if (!drag.isDue && cell.classList.contains('cal-body')) {
      const length = Math.max(MIN_SPAN_H, item.end - item.start);
      const top = cell.getBoundingClientRect().top;
      let start = snapHours(hourForY(bands, heights, event.clientY - drag.offsetY - top));
      start = Math.min(Math.max(0, start), 24 - length);
      drag.target = { date, start, end: start + length, start_time: hoursToDueTime(start), end_time: hoursToDueTime(start + length) };
      drag.when.textContent = `${dayText(date)} · ${nowLabel(start)}`;
    } else {
      drag.target = { date };
      drag.when.textContent = dayText(date);
    }
    return;
  }
  const body = drag.node.closest('.cal-body');
  if (!body) return;
  const hour = snapHours(hourForY(bands, heights, event.clientY - body.getBoundingClientRect().top));
  let { start, end } = drag.orig;
  if (drag.mode === 'resize-end') end = Math.min(24, Math.max(start + MIN_SPAN_H, hour));
  else start = Math.max(0, Math.min(end - MIN_SPAN_H, hour));
  drag.target = { date: item.date, start, end, start_time: hoursToDueTime(start), end_time: hoursToDueTime(end) };
  engine.place(`chip:${item.id}`, blockGeometry(bands, heights, start, end));
  const meta = drag.node.querySelector('.cal-chip__meta');
  if (meta) meta.textContent = spanText(start, end);
}

function stopDrag() {
  const view = root?.defaultView;
  view?.removeEventListener('pointermove', onDragMove);
  view?.removeEventListener('pointerup', onDragEnd);
  view?.removeEventListener('pointercancel', onDragCancel);
  view?.removeEventListener('keydown', onDragKey, true);
  const current = drag;
  drag = null;
  if (!current) return null;
  current.float?.remove();
  current.node.classList.remove('is-dragging', 'is-resizing');
  host?.querySelector?.('.cal')?.classList?.remove('is-dragging-item');
  setDropTarget(null);
  return current;
}

function restoreResize(current) {
  if (!current || current.mode === 'move' || current.isDue) return;
  const { item, orig, node } = current;
  engine.place(`chip:${item.id}`, blockGeometry(bands, heights, orig.start, orig.end));
  const meta = node.querySelector('.cal-chip__meta');
  if (meta && !item.isClass) meta.textContent = item.meta;
}

function onDragCancel() {
  restoreResize(stopDrag());
}

function onDragKey(event) {
  if (event.key !== 'Escape' || !drag) return;
  event.preventDefault();
  event.stopPropagation();
  if (drag.active) suppressClickUntil = perfNow() + 350;
  onDragCancel();
}

/** Paint the move now; the returned function puts it back if the save fails. */
function applyOptimistic(current, target) {
  const { node, item, isDue } = current;
  const parent = node.parentElement;
  const next = node.nextSibling;
  const before = { date: item.date, start: item.start, end: item.end, record: item.record, meta: item.meta };
  item.date = target.date;
  if (target.start != null) {
    item.start = target.start;
    item.end = target.end;
  }
  item.record = {
    ...(item.record ?? {}),
    date: target.date,
    ...(target.start_time ? { time: target.start_time, duration_min: Math.round((item.end - item.start) * 60) } : {})
  };
  const destination = nodes.get(`${isDue ? 'colallday' : 'colbody'}:${target.date}`);
  if (destination && destination !== parent) destination.append(node);
  if (!isDue) {
    node.dataset.start = String(item.start);
    node.dataset.end = String(item.end);
    engine.place(`chip:${item.id}`, blockGeometry(bands, heights, item.start, item.end));
    if (!item.isClass) {
      item.meta = spanText(item.start, item.end);
      const meta = node.querySelector('.cal-chip__meta');
      if (meta) meta.textContent = item.meta;
    }
  }
  return () => {
    Object.assign(item, before);
    if (parent) parent.insertBefore(node, next && next.parentNode === parent ? next : null);
    if (!isDue) {
      node.dataset.start = String(item.start);
      node.dataset.end = String(item.end);
      engine.place(`chip:${item.id}`, blockGeometry(bands, heights, item.start, item.end));
      const meta = node.querySelector('.cal-chip__meta');
      if (meta) meta.textContent = item.meta;
    }
  };
}

/** The "costs you" line's one-click move: same time, the suggested day. */
async function moveFromCostLine(id, to, button) {
  const item = chipById(id);
  const node = nodes.get(`chip:${id}`);
  if (!item || !node || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) return;
  const target = { date: to, start: item.start, end: item.end, start_time: hoursToDueTime(item.start), end_time: hoursToDueTime(item.end) };
  const patch = dragPatch(item, { date: to, start_time: target.start_time, end_time: target.end_time });
  if (button) button.disabled = true;
  const undo = applyOptimistic({ node, item, isDue: false }, target);
  try {
    await persistItem(item, patch);
    showToast(`<b>Moved.</b> ${escapeHtml(item.title)} → ${escapeHtml(dayText(to))} · ${escapeHtml(nowLabel(item.start))}`);
  } catch (error) {
    undo();
    if (button) button.disabled = false;
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
  }
}

async function onDragEnd() {
  const current = stopDrag();
  if (!current?.active) return;
  suppressClickUntil = perfNow() + 350;
  const { item, orig, mode } = current;
  const target = current.target;
  if (!target) {
    restoreResize(current);
    return;
  }
  const sameTime = target.start == null || Math.abs(target.start - orig.start) < 1e-6;
  const sameEnd = target.end == null || Math.abs(target.end - orig.end) < 1e-6;
  if (target.date === orig.date && sameTime && sameEnd) return;
  const patch = dragPatch(item, {
    date: target.date,
    ...(target.start_time ? { start_time: target.start_time, end_time: target.end_time } : {})
  });
  const undo = applyOptimistic(current, target);
  const when = target.start != null
    ? `${dayText(target.date)} · ${mode === 'move' ? nowLabel(target.start) : spanText(target.start, target.end)}`
    : dayText(target.date);
  const live = nodes.get('__live');
  try {
    await persistItem(item, patch);
    showToast(`<b>${mode === 'move' ? 'Moved' : 'Retimed'}.</b> ${escapeHtml(item.title)} → ${escapeHtml(when)}`);
    if (live) live.textContent = `${item.title} moved to ${when}`;
  } catch (error) {
    undo();
    showToast(`<b>Not saved.</b> ${escapeHtml(error?.message || 'Could not reach the server.')}`);
  }
}

function publish(view) {
  const hostname = view?.location?.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
  view.__tideline = {
    state,
    CAL,
    heights: () => heights.slice(),
    total: model.total,
    capacity: Object.fromEntries(model.days.map(day => [day.date, day.cap?.pct])),
    setBand,
    accept,
    dismiss,
    openPop,
    closePop,
    finish: () => engine.finish(),
    stats: () => engine.stats()
  };
}

function watchPhone(view) {
  const query = view?.matchMedia?.('(max-width: 719px)');
  if (!query || typeof query.addEventListener !== 'function' || host.dataset.tidelineMq) return;
  host.dataset.tidelineMq = '1';
  query.addEventListener('change', () => {
    if (host.isConnected !== false) mount({ entrance: false });
  });
}
