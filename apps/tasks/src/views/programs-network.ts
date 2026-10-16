/**
 * Programs catalogue as a network, in the personal line's Sydney Trains look:
 * - Platforms: one platform per line (or format), its format mix, a "next service" board that rolls
 *   in once and steps on with Later, and a card per entry.
 * - Timetable: the catalogue as one calendar year, rows grouped by format, line or nothing.
 * Both open the departure-board card through `onOpen`.
 */
import { LINES, type LineKey } from '@/personal-line/lines';
import type { LineItem } from '@/personal-line/model';
import { ensureFonts, itemWhen, roundel } from '@/personal-line/render';
import {
  OFF_LINE_TITLE,
  UNCLASSIFIED,
  monthEdges,
  yearPercent,
  type Platform,
  type TimetableGroup,
  type TimetableMark
} from '@/domain/catalogue-network';
import type { TermSpan } from '@/personal-line/model';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OFF_LINE = { color: '#1d2633', fill: '#ecebe6', ink: '#ffffff' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** 24px line icons. Paths only, drawn in currentColor. */
const FORMAT_ICONS: Record<string, string> = {
  Exam: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  'Written entry': '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  Speaking: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
  Simulation: '<path d="M3 9l9-5 9 5z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>',
  Project:
    '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  'Creative work':
    '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  'Day event': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  Program: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  [UNCLASSIFIED]: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16v.5"/>'
};

const SETTING_ICONS: Record<string, string> = {
  'At school': '<path d="M3 10l9-6 9 6"/><path d="M5 9v11h14V9M10 20v-5h4v5"/>',
  Online: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  Away: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
};

/** Format colours: distinct from the four line colours. */
export const FORMAT_COLORS: Record<string, string> = {
  Exam: '#0b4f9c',
  'Written entry': '#8a5a00',
  Speaking: '#c2410c',
  Simulation: '#7c3aed',
  Project: '#0e7490',
  'Creative work': '#be185d',
  'Day event': '#15803d',
  Program: '#475569',
  [UNCLASSIFIED]: '#8a94a3'
};

function icon(paths: string, size = 18): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}

function lineColor(line: LineKey | null | undefined) {
  return line ? LINES[line] : OFF_LINE;
}

function formatBadge(item: LineItem): HTMLElement {
  const format = item.format || UNCLASSIFIED;
  const badge = el('span', 'pn-fi');
  badge.style.background = FORMAT_COLORS[format] ?? FORMAT_COLORS[UNCLASSIFIED]!;
  badge.append(icon(FORMAT_ICONS[format] ?? FORMAT_ICONS[UNCLASSIFIED]!, 16));
  return badge;
}

/** Years 7–12 as six small carriages: eligible ones in the line colour, the chosen year ringed green. */
function miniCars(item: LineItem, studentYear: number | null): HTMLElement {
  const row = el('span', 'pn-cars');
  row.setAttribute('role', 'img');
  const ys = item.years.filter((y) => y >= 7 && y <= 12);
  row.setAttribute('aria-label', ys.length ? `Years ${ys.join(', ')}` : 'No year levels listed');
  for (let y = 7; y <= 12; y += 1) {
    const car = el('span', `pn-car${item.years.includes(y) ? ' is-in' : ''}${y === studentYear ? ' is-you' : ''}`);
    car.title = `Year ${y}${item.years.includes(y) ? '' : ', not eligible'}`;
    row.append(car);
  }
  return row;
}

function placeMarks(item: LineItem): HTMLElement {
  const wrap = el('span', 'pn-where');
  for (const setting of item.settings ?? []) {
    const mark = el('span', 'pn-si');
    mark.title = setting;
    mark.append(icon(SETTING_ICONS[setting] ?? '', 15), el('span', 'sr-only', setting));
    wrap.append(mark);
  }
  if (item.entry) {
    const ring = el('span', `pn-entry pn-entry--${item.entry.toLowerCase()}`);
    ring.title = item.entry === 'Either' ? 'Individual or team' : item.entry;
    ring.append(el('span', 'sr-only', ring.title));
    wrap.append(ring);
  }
  return wrap;
}

function itemColorVars(node: HTMLElement, item: LineItem): void {
  const color = lineColor(item.on[0]);
  node.style.setProperty('--pn-line', color.color);
  node.style.setProperty('--pn-fill', color.fill);
}

export type NetworkOptions = {
  studentYear: number | null;
  onOpen: (item: LineItem, from: HTMLElement) => void;
};

// ---------------------------------------------------------------- platforms

function platformCard(item: LineItem, options: NetworkOptions): HTMLElement {
  const card = el('button', 'pn-card');
  card.type = 'button';
  card.setAttribute('aria-label', `${item.name}, ${itemWhen(item)}`);
  itemColorVars(card, item);
  const stripe = el('span', 'pn-card__stripe');
  for (const line of item.on.length ? item.on : [null]) {
    const seg = el('i');
    seg.style.background = lineColor(line).color;
    stripe.append(seg);
  }
  const body = el('span', 'pn-card__in');
  const head = el('span', 'pn-card__head');
  head.append(formatBadge(item), el('span', 'pn-card__fmt', item.format ?? item.type));
  const rds = el('span', 'pn-card__rds');
  item.on.forEach((line) => rds.append(roundel(line, true)));
  head.append(rds);
  const foot = el('span', 'pn-card__foot');
  const cost = el('span', 'pn-card__cost', item.basis || 'Cost TBC');
  cost.title = item.cost || '';
  foot.append(el('span', 'pn-card__when', itemWhen(item)), placeMarks(item), cost);
  body.append(head, el('span', 'pn-card__name', item.name));
  if (item.organiser) body.append(el('span', 'pn-card__org', item.organiser));
  body.append(miniCars(item, options.studentYear), foot);
  card.append(stripe, body);
  card.addEventListener('click', () => options.onOpen(item, card));
  return card;
}

/** "Next service" board: rows roll up into the window once on mount; Later steps on one service. */
function nextBoard(platform: Platform, options: NetworkOptions, delay: number): HTMLElement {
  const board = el('div', 'pn-board');
  const label = el('span', 'pn-board__k', 'Next service');
  board.append(label);
  if (!platform.next.length) {
    board.append(el('span', 'pn-board__none', 'No more services this year'));
    return board;
  }
  const windowEl = el('div', 'pn-board__window');
  windowEl.setAttribute('aria-live', 'polite');
  const reel = el('div', 'pn-board__reel');
  platform.next.forEach((item, index) => {
    const row = el('button', 'pn-board__row');
    row.type = 'button';
    row.append(el('span', 'pn-board__when', itemWhen(item)), el('span', 'pn-board__name', item.name));
    if (index > 0) row.classList.add('is-then');
    row.addEventListener('click', () => options.onOpen(item, row));
    reel.append(row);
  });
  windowEl.append(reel);
  board.append(windowEl);
  let at = 0;
  const show = () => {
    reel.style.setProperty('--pn-at', String(at));
    reel.querySelectorAll<HTMLElement>('.pn-board__row').forEach((row, index) => {
      row.classList.toggle('is-then', index !== at);
      row.tabIndex = index === at || index === at + 1 ? 0 : -1;
    });
  };
  if (platform.next.length > 1) {
    const later = el('button', 'pn-board__later', 'Later ›');
    later.type = 'button';
    later.setAttribute('aria-label', `Later services on ${platform.title}`);
    later.addEventListener('click', () => {
      at = at + 1 >= platform.next.length ? 0 : at + 1;
      show();
    });
    board.append(later);
  }
  show();
  // Roll in once: start below the window, then settle on the next service.
  reel.classList.add('is-arriving');
  reel.style.transitionDelay = `${delay}ms`;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      reel.classList.remove('is-arriving');
      window.setTimeout(() => (reel.style.transitionDelay = ''), delay + 900);
    })
  );
  return board;
}

function mixBar(platform: Platform): HTMLElement {
  const wrap = el('div', 'pn-mix');
  const bar = el('div', 'pn-mix__bar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', platform.mix.map((m) => `${m.format} ${m.count}`).join(', '));
  const legend = el('div', 'pn-mix__key');
  for (const m of platform.mix) {
    const seg = el('span', 'pn-mix__seg');
    seg.style.flex = String(m.count);
    seg.style.background = FORMAT_COLORS[m.format] ?? FORMAT_COLORS[UNCLASSIFIED]!;
    seg.title = `${m.format}: ${m.count}`;
    seg.append(icon(FORMAT_ICONS[m.format] ?? FORMAT_ICONS[UNCLASSIFIED]!, 12), el('b', '', String(m.count)));
    bar.append(seg);
    const key = el('span', 'pn-mix__k');
    const dot = el('i');
    dot.style.background = seg.style.background;
    key.append(dot, document.createTextNode(`${m.format} ${m.count}`));
    legend.append(key);
  }
  wrap.append(bar, legend);
  return wrap;
}

const PLATFORM_PREVIEW = 8;
/** Platforms opened with "Show all", kept across repaints (filters, sort). */
const expanded = new Set<string>();

export function renderPlatforms(host: HTMLElement, platforms: Platform[], options: NetworkOptions): void {
  ensureFonts();
  host.replaceChildren();
  const root = el('div', 'pn pn-platforms');
  root.append(platformKey());
  platforms.forEach((platform, index) => {
    const section = el('section', 'pn-plat');
    section.setAttribute('aria-label', `${platform.title}, ${platform.items.length} entries`);
    const color = platform.line ? LINES[platform.line] : platform.format ? { color: FORMAT_COLORS[platform.format] ?? OFF_LINE.color } : OFF_LINE;
    section.style.setProperty('--pn-plat', color.color);
    const head = el('header', 'pn-plat__head');
    const title = el('div', 'pn-plat__title');
    if (platform.line) {
      const rd = roundel(platform.line);
      rd.classList.add('pn-plat__rd');
      title.append(rd);
    } else if (platform.format) {
      const fi = el('span', 'pn-fi pn-fi--lg');
      fi.style.background = color.color;
      fi.append(icon(FORMAT_ICONS[platform.format] ?? FORMAT_ICONS[UNCLASSIFIED]!, 22));
      title.append(fi);
    }
    title.append(el('h2', '', platform.title), el('span', 'pn-plat__n', `${platform.items.length} entries`));
    head.append(title, nextBoard(platform, options, index * 140), mixBar(platform));
    const grid = el('div', 'pn-grid');
    const open = expanded.has(platform.id) || platform.items.length <= PLATFORM_PREVIEW + 2;
    (open ? platform.items : platform.items.slice(0, PLATFORM_PREVIEW)).forEach((item) => grid.append(platformCard(item, options)));
    if (platform.items.length > PLATFORM_PREVIEW + 2) {
      const more = el('button', 'pn-more', open ? `Show fewer on ${platform.title}` : `Show all ${platform.items.length} on ${platform.title}`);
      more.type = 'button';
      more.setAttribute('aria-expanded', String(open));
      more.addEventListener('click', () => {
        if (expanded.has(platform.id)) expanded.delete(platform.id);
        else expanded.add(platform.id);
        renderPlatforms(host, platforms, options);
        host.querySelector<HTMLElement>(`[data-platform="${CSS.escape(platform.id)}"] .pn-more`)?.focus();
      });
      grid.append(more);
    }
    section.dataset.platform = platform.id;
    section.append(head, grid);
    root.append(section);
  });
  if (!platforms.length) root.append(el('p', 'pl-empty', 'No programs match those filters.'));
  host.append(root);
}

// ---------------------------------------------------------------- timetable

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Term bands, month rules and today's line as one background, shared by every timetable cell. */
function trackBackground(year: number, terms: TermSpan[], today: string): string {
  const layers: string[] = [];
  if (today.startsWith(`${year}-`)) {
    const x = yearPercent(today, year);
    layers.push(`linear-gradient(90deg, transparent calc(${x}% - 1px), var(--pl-orange) calc(${x}% - 1px) calc(${x}% + 1px), transparent calc(${x}% + 1px))`);
  }
  for (const edge of monthEdges(year).slice(1, 12)) {
    layers.push(`linear-gradient(90deg, transparent calc(${edge}% - .5px), var(--pl-rule) calc(${edge}% - .5px) calc(${edge}% + .5px), transparent calc(${edge}% + .5px))`);
  }
  for (const term of terms) {
    if (!term.start.startsWith(`${year}`)) continue;
    const a = yearPercent(term.start, year);
    const b = yearPercent(term.end, year, true);
    layers.push(`linear-gradient(90deg, transparent ${a}%, var(--pn-term) ${a}% ${b}%, transparent ${b}%)`);
  }
  return layers.join(', ');
}

function markEl(mark: TimetableMark, item: LineItem, month: string | null): HTMLElement {
  const when = item.run || item.due ? itemWhen(item) : month ? `${month}, dates TBC` : 'Dates TBC';
  if (mark.kind === 'none') return el('span', 'pn-tt__none', when);
  const node = el('span', `pn-mark pn-mark--${mark.kind}${mark.kind === 'run' && mark.approx ? ' is-approx' : ''}`);
  node.style.left = `${mark.left}%`;
  if ('width' in mark) node.style.width = `${mark.width}%`;
  if (mark.kind === 'month') node.textContent = 'TBC';
  node.title = when;
  return node;
}

export type TimetableOptions = NetworkOptions & { year: number; terms: TermSpan[]; today: string };

export function renderTimetable(host: HTMLElement, groups: TimetableGroup[], options: TimetableOptions): void {
  ensureFonts();
  host.replaceChildren();
  const root = el('div', 'pn pn-tt');
  root.style.setProperty('--pn-track', trackBackground(options.year, options.terms, options.today));
  const scroller = el('div', 'pn-tt__scroll');
  const table = el('div', 'pn-tt__table');
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', `Programs timetable, ${options.year}`);
  for (const group of groups) {
    const head = el('div', 'pn-tt__group');
    head.setAttribute('role', 'row');
    const title = el('div', 'pn-tt__gtitle');
    title.setAttribute('role', 'rowheader');
    if (group.line) title.append(roundel(group.line, true));
    else if (group.format) {
      const fi = el('span', 'pn-fi');
      fi.style.background = FORMAT_COLORS[group.format] ?? FORMAT_COLORS[UNCLASSIFIED]!;
      fi.append(icon(FORMAT_ICONS[group.format] ?? FORMAT_ICONS[UNCLASSIFIED]!, 15));
      title.append(fi);
    }
    title.append(el('span', '', group.title), el('em', '', String(group.rows.length)));
    const months = el('div', 'pn-tt__months');
    months.setAttribute('aria-hidden', 'true');
    const edges = monthEdges(options.year);
    MONTH_SHORT.forEach((m, i) => {
      const label = el('span', '', m);
      label.style.left = `${edges[i]}%`;
      months.append(label);
    });
    for (const term of options.terms) {
      if (!term.start.startsWith(`${options.year}`)) continue;
      const t = el('span', 'pn-tt__term', term.id);
      t.style.left = `${yearPercent(term.start, options.year)}%`;
      months.append(t);
    }
    head.append(title, el('div', 'pn-tt__colk', 'Years 7–12'), el('div', 'pn-tt__colk', 'Where'), months);
    table.append(head);
    for (const row of group.rows) {
      const tr = el('div', 'pn-tt__row');
      tr.setAttribute('role', 'row');
      itemColorVars(tr, row.item);
      const name = el('button', 'pn-tt__name');
      name.type = 'button';
      const rds = el('span', 'pn-tt__rds');
      row.item.on.forEach((line) => rds.append(roundel(line, true)));
      name.append(rds, el('span', 'pn-tt__label', row.item.name));
      name.title = row.item.name;
      name.addEventListener('click', () => options.onOpen(row.item, name));
      const nameCell = el('div', 'pn-tt__cell pn-tt__namecell');
      nameCell.setAttribute('role', 'rowheader');
      nameCell.append(name);
      const years = el('div', 'pn-tt__cell');
      years.setAttribute('role', 'cell');
      years.append(miniCars(row.item, options.studentYear));
      const where = el('div', 'pn-tt__cell');
      where.setAttribute('role', 'cell');
      where.append(placeMarks(row.item));
      const track = el('div', 'pn-tt__cell pn-tt__track');
      track.setAttribute('role', 'cell');
      track.append(markEl(row.mark, row.item, row.month));
      tr.append(nameCell, years, where, track);
      table.append(tr);
    }
  }
  if (!groups.length) table.append(el('p', 'pl-empty', 'No programs match those filters.'));
  scroller.append(table);
  root.append(scroller, timetableKey());
  host.append(root);
}

function sharedKey(key: HTMLElement): void {
  const add = (sample: Node, text: string) => {
    const item = el('span', 'pn-key__item');
    item.append(sample, document.createTextNode(text));
    key.append(item);
  };
  add(el('span', 'pn-entry pn-entry--individual'), 'Individual');
  add(el('span', 'pn-entry pn-entry--team'), 'Team');
  add(el('span', 'pn-entry pn-entry--either'), 'Either');
  for (const [name, paths] of Object.entries(SETTING_ICONS)) add(icon(paths, 15), name);
}

function platformKey(): HTMLElement {
  const key = el('div', 'pn-key pn-key--top');
  const cars = el('span', 'pn-key__item');
  const sample = el('span', 'pn-cars');
  for (let y = 7; y <= 12; y += 1) sample.append(el('span', `pn-car${y >= 9 ? ' is-in' : ''}`));
  sample.style.setProperty('--pn-line', '#0057b8');
  cars.append(sample, document.createTextNode('Years 7–12 (lit = can enter)'));
  key.append(cars);
  sharedKey(key);
  const board = el('span', 'pn-key__item', 'Next service: still running or still to come. Later steps on.');
  key.append(board);
  return key;
}

function timetableKey(): HTMLElement {
  const key = el('div', 'pn-key');
  const add = (sample: HTMLElement, text: string) => {
    const item = el('span', 'pn-key__item');
    item.append(sample, document.createTextNode(text));
    key.append(item);
  };
  const sample = (cls: string) => {
    const box = el('span', 'pn-key__sample');
    box.append(el('span', `pn-mark ${cls}`));
    return box;
  };
  add(sample('pn-mark--run'), 'Confirmed dates');
  add(sample('pn-mark--run is-approx'), 'Approx. (month or part of a month)');
  add(sample('pn-mark--day'), 'One day');
  add(sample('pn-mark--due'), 'Due date');
  add(sample('pn-mark--month'), 'Month only, dates TBC');
  sharedKey(key);
  const today = el('span', 'pn-key__today');
  add(today, 'Today');
  return key;
}

export { OFF_LINE_TITLE };
