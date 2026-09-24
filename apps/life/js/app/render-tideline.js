/**
 * Tideline week view. Structure follows tideline-ref.ts:
 * mount creates the DOM once per paint, layout(heights) is pure,
 * apply(id, props) is the only function that writes geometry.
 */
import { createMotion, EASE } from '../../../../packages/design-kit/js/hub-motion-engine.js';
import { CAL } from '../../../../packages/design-kit/js/calendar-tideline-geometry.js';
import { applyHubPillsThumb } from '../../../../packages/design-kit/js/hub-motion.js';
import {
  bandTargets,
  baseHeights,
  blockGeometry,
  SLEEP_STRIP_PX,
  yForHour
} from '../../../../packages/design-kit/js/calendar-bands.js';
import { acceptPlan, dismissPlan } from './ghost-writes.js';
import { buildTidelineModel, toHour } from './tideline-model.js';
import { getSydneyMinutesOfDay } from '../core/time.js';

const AGENT_INITIAL = { sara: 'S', hammond: 'H', clare: 'C', chadwick: 'Ch' };
const ICON = {
  prev: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  next: '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>',
  moon: '<svg viewBox="0 0 12 12"><path d="M8.8 8.3A4.3 4.3 0 0 1 4 2.1a4.3 4.3 0 1 0 4.8 6.2z"/></svg>',
  bolt: '<svg viewBox="0 0 12 12"><path d="M6.8 1 3 7h3l-.8 4L9 5H6z"/></svg>',
  fork: '<svg viewBox="0 0 12 12"><path d="M3.5 1v4a1.5 1.5 0 0 0 3 0V1M5 5.5V11M9 1c-1 .5-1.5 2-1.5 3.5S8 6.5 9 6.5V11"/></svg>',
  lock: '<svg viewBox="0 0 10 10"><rect x="1.5" y="4.5" width="7" height="5" rx="1"/><path d="M3 4.5V3a2 2 0 0 1 4 0v1.5"/></svg>',
  chev: '<svg viewBox="0 0 10 10"><path d="M2.5 4 5 6.5 7.5 4"/></svg>'
};

const state = {
  expanded: null,
  accepted: new Set(),
  dismissed: new Set(),
  busy: new Set(),
  phone: false,
  phoneDay: ''
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
  if (html == null) return;
  if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) node.innerHTML = html;
  else node.textContent = String(html).replace(/<[^>]*>/g, '');
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
  const { label, meta, chip, overItem, ...rest } = ghost;
  return rest;
}

export function renderTideline(doc, calendarHost, nextInput) {
  root = doc;
  host = calendarHost;
  input = nextInput;
  mount();
}

function mount() {
  engine?.dispose();
  nodes.clear();
  popFor = null;
  const view = root.defaultView;
  state.phone = view?.matchMedia?.('(max-width: 719px)')?.matches === true;
  nowHour = Number.isFinite(input.nowHour) ? input.nowHour : getSydneyMinutesOfDay(input.now ?? new Date()) / 60;
  model = buildTidelineModel({
    events: input.events ?? [],
    visual: input.visual ?? null,
    week: input.week,
    today: input.today,
    nowHour,
    dayProfile: input.dayProfile ?? null,
    terms: input.terms ?? null
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
  const zoom = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', nav, { role: 'group', 'aria-label': 'Zoom', 'data-part': 'zoom-pills' });
  for (const name of ['Day', 'Week', 'Term', 'Year', 'Almanac']) {
    el('button', `hub-pills__btn${name === 'Week' ? ' is-active' : ''}`, name, zoom, {
      type: 'button',
      'aria-pressed': String(name === 'Week'),
      'data-zoom': name.toLowerCase()
    });
  }
  el('div', 'cal__spacer', undefined, nav);
  const focusWrap = el('div', 'cal__focus', 'Focus', nav);
  const focus = el('div', 'hub-pills', '<span class="hub-pills__thumb"></span>', focusWrap, { role: 'group', 'aria-label': 'Focus band', 'data-part': 'focus-pills' });
  el('button', 'hub-pills__btn is-active', 'Balanced', focus, { type: 'button', 'data-band': 'none', 'aria-pressed': 'true' });
  bands.forEach((band, index) => el('button', 'hub-pills__btn', band.label, focus, { type: 'button', 'data-band': String(index), 'aria-pressed': 'false' }));

  if (model.tray) {
    const tray = el('div', 'cal__tray', undefined, section, { 'data-part': 'tray' });
    el('span', 'cal-av', AGENT_INITIAL[model.tray.agent] || 'H', tray, { 'aria-hidden': 'true' });
    el('span', '', `<b>${model.tray.headline}</b> <span class="cal__tray-detail">· ${model.tray.detail}</span>`, tray);
    el('span', 'cal__spacer', undefined, tray);
    el('button', 'btn btn--primary', 'Apply all', tray, { type: 'button', 'data-action': 'apply-all', 'data-part': 'apply-all' });
    el('button', 'btn btn--secondary', 'Review', tray, { type: 'button' });
    el('button', 'btn btn--ghost', 'Dismiss', tray, { type: 'button' });
  }

  const strip = el('div', 'cal-strip', undefined, section, { 'data-part': 'day-strip', role: 'group', 'aria-label': 'Day' });
  for (const day of model.days) {
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
  for (const source of model.sources) {
    const mark = source.id === 'corey' ? '<span class="cal-mark"></span>' : '<i></i>';
    el('span', `cal-src k-${source.id}${source.id === 'corey' ? ' cal-src--corey' : ''}`, `${mark}${source.label} ${source.count}`, sources);
  }
  el('span', 'cal-src cal-src--ambient', `Ambient: ${model.ambient}`, sources, { 'data-part': 'ambient' });

  const card = el('div', 'cal__card', undefined, section, { 'data-part': 'card' });
  const grid = el('div', 'cal__grid', undefined, card);
  el('div', 'cal-corner', 'Capacity from your logs', grid);
  for (const date of days) mountHead(grid, date);
  el('div', 'cal-allday cal-corner', 'Due', grid);
  for (const date of days) mountAllDay(grid, date);
  mountBandLabels(grid);
  for (const date of days) mountBody(grid, date);

  nodes.set('__toast', el('div', 'cal-toast', '', section, { role: 'status', 'aria-live': 'polite', 'data-part': 'toast' }));
  nodes.set('__pop', el('div', 'cal-pop', '', section, { role: 'dialog', 'aria-modal': 'false', 'data-part': 'chip-popover', hidden: '' }));
  nodes.set('__live', el('div', 'cal-sr', '', section, { 'aria-live': 'polite', 'data-part': 'announcer' }));

  engine = createMotion({ apply, clock: clockFor(view) });
  heights = state.expanded == null ? baseHeights(bands) : bandTargets(bands, state.expanded);
  engine.place('__bands', Object.fromEntries(heights.map((height, index) => [`h${index}`, height])));
  engine.place('__toast', { opacity: 0, y: CAL.toastRise });
  engine.place('__pop', { opacity: 0, y: CAL.popRise });
  for (const [id, node] of nodes) {
    if (id.startsWith('chip:')) engine.place(id, { opacity: 1, scale: 1, solid: node.classList?.contains?.('is-ghost') ? 0 : 1 });
  }
  days.forEach((date, index) => engine.enter(`col:${date}`, { opacity: 1, y: 0 }, {
    from: { opacity: 0, y: CAL.enterRise },
    delay: index * CAL.enterStagger,
    duration: CAL.enterMs
  }));
  const raf = view?.requestAnimationFrame;
  if (typeof raf === 'function') raf(() => { applyHubPillsThumb(zoom); applyHubPillsThumb(focus); });
  if (!wired) {
    wired = true;
    wire(section);
  } else {
    wire(section);
  }
  publish(view);
  watchPhone(view);
}

function dayByDate(date) {
  return model.days.find(day => day.date === date);
}

function mountHead(grid, date) {
  const day = dayByDate(date);
  const tag = day.tag;
  const head = el('div', `cal-head${date === model.today ? ' is-today' : ''}${day.over ? ' is-over' : ''}`, undefined, grid, { 'data-part': 'day-head', 'data-date': date });
  const over = day.over ? '<span class="cal-over" data-part="over-flag">over</span>' : '';
  const tagHtml = tag ? `<span class="cal-tag${tag.tone === 'term' ? ' cal-tag--term' : ''}">${tag.text}</span>` : '';
  el('div', 'cal-head__name', `<span class="cal-head__dow">${DOW(date)}</span><span class="cal-head__num">${DOM_NUM(date)}</span>${over}${tagHtml}`, head);
  const cap = el('div', `cal-cap${day.cap?.forecast ? ' is-forecast' : ''}`, undefined, head, { 'data-part': 'capacity', 'data-pct': String(day.cap?.pct ?? '') });
  css(cap, '--cap', capColour(day.cap?.pct ?? 0));
  el('div', 'cal-cap__bar', `<span class="cal-cap__fill" style="width:${day.cap?.pct ?? 0}%"></span>`, cap);
  el('div', 'cal-cap__text', `<b>${day.cap?.pct ?? ''}%</b> · ${day.cap?.note ?? ''}`, cap);
  const bits = [];
  if (day.sleep != null) bits.push(`<span>${ICON.moon}${day.sleep}h</span>`);
  if (day.energy) bits.push(`<span class="${day.energy === 'low' ? 'is-low' : ''}">${ICON.bolt}${day.energy}</span>`);
  if (day.meals) bits.push(`<span>${ICON.fork}${day.meals}</span>`);
  if (day.symptom) bits.push(`<span class="is-symptom">● ${day.symptom}</span>`);
  el('div', 'cal-vit', bits.join('') || '<span>nothing logged yet</span>', head, { 'data-part': 'vitals' });
  nodes.set(`colhead:${date}`, head);
}

function mountAllDay(grid, date) {
  const day = dayByDate(date);
  const cell = el('div', 'cal-allday', undefined, grid, { 'data-part': 'all-day', 'data-date': date });
  for (const due of day.due) {
    const ghost = model.ghosts.find(item => item.id === due.ghostId);
    const chip = el('div', 'cal-due', `<b>${due.title}</b>`, cell, { 'data-part': 'due', 'data-id': due.id });
    if (ghost) {
      el('span', 'cal-due__move', `<span class="cal-av cal-av--sm">${AGENT_INITIAL[ghost.agent]}</span>${ghost.label}<button type="button" data-accept="${ghost.id}">Move</button>`, chip, { 'data-ghost': ghost.id });
    }
    nodes.set(`due:${due.id}`, chip);
  }
  nodes.set(`colallday:${date}`, cell);
}

function mountBandLabels(grid) {
  const column = el('div', 'cal-bands', undefined, grid, { 'data-part': 'band-labels' });
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
  body.style.height = `${model.total + SLEEP_STRIP_PX}px`;
  nodes.set(`colbody:${date}`, body);
  bands.forEach((band, index) => {
    if (band.id === 'school' && day.school) nodes.set(`bg:${date}:${index}`, el('div', 'cal-bg cal-bg--school', undefined, body, { 'data-band': String(index) }));
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
  for (const chip of day.chips) mountChip(body, chip);
  if (date === model.today) nodes.set('now', el('div', 'cal-now', `<span>${nowLabel(nowHour)}</span>`, body, { 'data-part': 'now-line' }));
  for (const wall of day.walls) {
    const [first, ...rest] = wall.label.split(' · ');
    const more = rest.length ? `<span class="cal-wall__more"> · ${rest.join(' · ')}</span>` : '';
    const node = el('div', 'cal-wall', `<span class="cal-wall__pill">${ICON.lock}${first}${more}</span>`, body, { 'data-part': 'wall' });
    node.style.height = `${model.total}px`;
  }
}

function mountChip(body, chip) {
  const ghost = chip.ghost;
  const classes = ['cal-chip', `k-${chip.kind}`];
  if (chip.isClass) classes.push('is-class');
  if (chip.kind === 'corey') classes.push('is-corey');
  if (ghost) classes.push('is-ghost');
  const title = `${chip.kind === 'corey' ? '<span class="cal-mark"></span>' : ''}${chip.title}`;
  const agent = ghost ? `<span class="cal-chip__agent"><span class="cal-av cal-av--sm ${ghost.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[ghost.agent]}</span></span>` : '';
  const acts = ghost && ghost.kind !== 'bedtime'
    ? `<div class="cal-chip__acts"><button type="button" class="is-yes" data-accept="${ghost.id}">Accept</button><button type="button" data-dismiss="${ghost.id}">Dismiss</button></div>`
    : ghost ? `<div class="cal-chip__acts"><button type="button" class="is-yes" data-accept="${ghost.id}">Accept</button></div>` : '';
  const node = el('div', classes.join(' '), `${agent}<div class="cal-chip__title">${title}</div><div class="cal-chip__meta">${chip.meta}</div>${acts}`, body, {
    'data-part': ghost ? 'ghost' : chip.isClass ? 'class' : 'chip',
    'data-id': chip.id,
    'data-kind': chip.kind,
    title: chip.title,
    tabindex: '0',
    role: 'button',
    'aria-label': `${chip.title}. ${chip.meta}`,
    'data-start': String(chip.start),
    'data-end': String(chip.end),
    'data-has-actions': acts ? '1' : ''
  });
  const proposal = model.ghosts.find(item => item.overItem === chip.id && !state.dismissed.has(item.id) && !state.accepted.has(item.id));
  if (proposal && typeof node.insertAdjacentHTML === 'function') {
    node.classList.add('has-proposal');
    node.dataset.ghost = proposal.id;
    node.insertAdjacentHTML('afterbegin', `<span class="cal-chip__agent"><span class="cal-av cal-av--sm ${proposal.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[proposal.agent]}</span></span>`);
    node.insertAdjacentHTML('beforeend', `<div class="cal-chip__proposal" data-part="proposal">${proposal.agent === 'sara' ? 'Sara' : 'Hammond'} suggests: ${proposal.label.toLowerCase()}</div>`);
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
  markup(toast, html);
  engine.to('__toast', { opacity: 1, y: 0 }, { duration: CAL.toastInMs });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => engine.to('__toast', { opacity: 0, y: CAL.toastRise }, { duration: CAL.toastInMs }), CAL.toastHoldMs);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function accept(ghostId, { quiet = false } = {}) {
  const ghost = model.ghosts.find(item => item.id === ghostId);
  if (!ghost || state.accepted.has(ghostId) || state.dismissed.has(ghostId) || state.busy.has(ghostId)) return null;
  const plan = acceptPlan(ghostInput(ghost), { today: model.today });
  state.busy.add(ghostId);
  host.querySelectorAll?.(`[data-accept="${ghostId}"],[data-dismiss="${ghostId}"]`)?.forEach(button => {
    button.disabled = true;
    if (button.dataset.accept) button.textContent = 'Saving…';
  });
  await wait(CAL.saveLatencyMs);
  state.busy.delete(ghostId);
  state.accepted.add(ghostId);
  if (ghost.kind === 'move_task') {
    const due = nodes.get(`due:${ghost.taskId}`);
    due?.classList?.add?.('is-moved');
    const move = due?.querySelector?.('.cal-due__move');
    if (move) markup(move, 'Moved to T4 W1 Tue');
  } else if (ghost.overItem) {
    const item = nodes.get(`chip:${ghost.overItem}`);
    item?.classList?.remove?.('has-proposal');
    item?.classList?.add?.('is-skipped');
    item?.querySelector?.('.cal-chip__agent')?.remove();
    item?.querySelector?.('.cal-chip__proposal')?.remove();
    const meta = item?.querySelector?.('.cal-chip__meta');
    if (meta) meta.textContent = 'Skipped · Sara';
  } else {
    const chip = nodes.get(`chip:${ghostId}`);
    chip?.classList?.add?.('is-accepted');
    chip?.querySelector?.('.cal-chip__acts')?.remove();
    if (chip) chip.dataset.part = 'chip';
    engine.to(`chip:${ghostId}`, { solid: 1 }, { duration: CAL.acceptMs });
  }
  if (!quiet) showToast(`<b>Written.</b> ${plan.receipt}`);
  const live = nodes.get('__live');
  if (live) live.textContent = plan.receipt;
  return plan;
}

function dismiss(ghostId) {
  const ghost = model.ghosts.find(item => item.id === ghostId);
  if (!ghost || state.accepted.has(ghostId) || state.dismissed.has(ghostId)) return;
  const plan = dismissPlan(ghostInput(ghost));
  state.dismissed.add(ghostId);
  if (ghost.overItem) {
    const item = nodes.get(`chip:${ghost.overItem}`);
    item?.classList?.remove?.('has-proposal');
    item?.querySelector?.('.cal-chip__agent')?.remove();
    item?.querySelector?.('.cal-chip__proposal')?.remove();
    showToast(`<b>${plan.receipt}</b> Sara notes the “no”, so she asks less often.`);
    return;
  }
  engine.to(`chip:${ghostId}`, { scale: 0.96 }, { duration: CAL.exitMs });
  engine.exit(`chip:${ghostId}`, () => {
    nodes.get(`chip:${ghostId}`)?.remove();
    nodes.delete(`chip:${ghostId}`);
  }, { duration: CAL.exitMs });
  const who = ghost.agent === 'sara' ? 'Sara' : 'Hammond';
  showToast(`<b>${plan.receipt}</b> ${who} notes the “no”, so it asks less often.`);
}

async function applyAll() {
  const pending = model.ghosts.filter(ghost => !state.accepted.has(ghost.id) && !state.dismissed.has(ghost.id));
  const plans = await Promise.all(pending.map(async (ghost, index) => {
    await wait(index * CAL.applyAllStagger);
    return accept(ghost.id, { quiet: true });
  }));
  const done = plans.filter(Boolean);
  if (done.length) showToast(`<b>${done.length} change${done.length === 1 ? '' : 's'} written.</b> Receipts are in Central Node › Recent Agent Actions.`);
}

function openPop(chipId) {
  const chip = nodes.get(`chip:${chipId}`);
  const pop = nodes.get('__pop');
  if (!chip || !pop) return;
  const ghost = model.ghosts.find(item => (item.id === chipId || item.overItem === chipId) && !state.accepted.has(item.id) && !state.dismissed.has(item.id));
  const item = model.days.flatMap(day => day.chips).find(chipItem => chipItem.id === chipId);
  const title = ghost && !ghost.overItem ? ghost.label : item?.title ?? chip.title;
  const meta = ghost && !ghost.overItem ? ghost.meta : item?.meta ?? '';
  let html = `<div class="cal-pop__head">${ghost ? `<span class="cal-av cal-av--sm ${ghost.agent === 'sara' ? 'cal-av--sara' : ''}">${AGENT_INITIAL[ghost.agent]}</span>` : `<i class="cal-pop__dot k-${chip.dataset.kind}"></i>`}<b>${title}</b></div><p class="cal-pop__meta">${meta}</p>`;
  if (ghost) {
    if (ghost.overItem) html += `<p class="cal-pop__label">${ghost.agent === 'sara' ? 'Sara' : 'Hammond'} suggests</p><p class="cal-pop__meta cal-pop__meta--strong">${ghost.label} · ${ghost.meta}</p>`;
    html += `<p class="cal-pop__label">Accept writes</p><p class="cal-pop__writes" data-part="write-preview">${acceptPlan(ghostInput(ghost), { today: model.today }).receipt}</p>`;
    html += `<div class="cal-pop__acts"><button type="button" class="btn btn--primary" data-accept="${ghost.id}">Accept</button>${ghost.kind === 'bedtime' ? '' : `<button type="button" class="btn btn--ghost" data-dismiss="${ghost.id}">Dismiss</button>`}</div>`;
  }
  markup(pop, html);
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
    const target = event.target;
    const acceptButton = target.closest?.('[data-accept]');
    if (acceptButton) {
      closePop();
      void accept(acceptButton.dataset.accept);
      return;
    }
    const dismissButton = target.closest?.('[data-dismiss]');
    if (dismissButton) {
      closePop();
      dismiss(dismissButton.dataset.dismiss);
      return;
    }
    const chip = target.closest?.('.cal-chip');
    if (chip) {
      if (chip.dataset.id === popFor) closePop();
      else openPop(chip.dataset.id);
      return;
    }
    if (!target.closest?.('[data-part="chip-popover"]')) closePop();
    if (target.closest?.('[data-action="apply-all"]')) {
      void applyAll();
      return;
    }
    const day = target.closest?.('[data-day]');
    if (day) {
      state.phoneDay = day.dataset.day;
      mount();
      return;
    }
    const shift = target.closest?.('[data-shift]');
    if (shift) {
      input.onShiftRange?.(Number(shift.dataset.shift));
      return;
    }
    if (target.closest?.('[data-today]')) {
      input.onSelectDate?.(input.today);
      return;
    }
    const zoom = target.closest?.('[data-zoom]');
    if (zoom) {
      const name = zoom.dataset.zoom;
      if (name === 'day' || name === 'week') input.onSwitchView?.(name);
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
    if (/^[1-4]$/.test(event.key)) {
      toggleBand(Number(event.key) - 1);
      event.preventDefault();
    } else if (event.key === 'Escape' && popFor) closePop();
    else if (event.key === '0' || event.key === 'Escape') setBand(null);
    else if ((event.key === 'Enter' || event.key === ' ') && event.target?.classList?.contains?.('cal-chip')) {
      openPop(event.target.dataset.id);
      event.preventDefault();
    }
  });
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
    if (host.isConnected !== false) mount();
  });
}
