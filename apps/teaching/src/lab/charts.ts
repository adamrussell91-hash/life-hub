import { el } from '@/quiz/dom';

import { formatShift, mean, type LevelGroup } from './model';

/**
 * The lab's charts: bars, the dot readings, the findings chart and the level
 * bars.
 */

/** Grows every `[data-w]` bar under `root` to its width. Bars start at zero so the growth shows; reduced motion drops the transition in CSS. */
export function growBars(root: HTMLElement): void {
  const set = () => root.querySelectorAll<HTMLElement>('[data-w]').forEach((bar) => { bar.style.width = `${bar.dataset.w}%`; });
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(set));
  else set();
}

export type BarsInput = {
  labels: string[];
  values: number[];
  /** The index drawn in full lilac: the winner, or the most predicted. -1 for none (too close to call). */
  top?: number;
  /** The value a full-width bar stands for. Defaults to the largest value. */
  scaleMax?: number;
};

/** One row per option, largest first: label, bar, value. */
export function bars(input: BarsInput): HTMLElement {
  const { labels, values } = input;
  const max = input.scaleMax && input.scaleMax > 0 ? input.scaleMax : Math.max(...values, 1);
  const order = values.map((_, i) => i).sort((a, b) => values[b]! - values[a]! || a - b);
  const box = el('div', 'lab-bars');
  for (const i of order) {
    const row = el('div', `lab-bar${i === input.top ? ' is-top' : ''}`);
    const fill = el('i');
    fill.dataset.w = String(Math.max(0, Math.min(100, (values[i]! / max) * 100)));
    fill.style.width = '0';
    row.append(el('span', '', labels[i] ?? ''), fill, el('span', '', String(values[i])));
    box.append(row);
  }
  growBars(box);
  return box;
}

/** A thin progress bar: how many are in. */
export function meter(done: number, total: number): HTMLElement {
  const box = el('div', 'lab-meter');
  const fill = el('i');
  const share = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  fill.dataset.w = String(share);
  fill.style.width = `${share}%`;
  box.setAttribute('role', 'progressbar');
  box.setAttribute('aria-valuemin', '0');
  box.setAttribute('aria-valuemax', String(total));
  box.setAttribute('aria-valuenow', String(done));
  box.append(fill);
  return box;
}

const SVG = 'http://www.w3.org/2000/svg';
const svg = (name: string, attrs: Record<string, string | number>): SVGElement => {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};
const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export type ReadingInput = {
  /** Ratings from 0 to 10, one per reader. */
  values: number[];
  name: string;
  /** The control is drawn in grey; a version in lilac. */
  control?: boolean;
};

/** Where a rating sits across the 300-wide chart. */
export const readingX = (value: number): number => Math.round((14 + Math.max(0, Math.min(10, value)) * 27.2) * 10) / 10;

/**
 * Every rating as a dot on a 0 to 10 line, stacked where they bunch, with a
 * line at the average. Dots drop in one at a time; under reduced motion they
 * are simply there.
 */
export function reading(input: ReadingInput): HTMLElement {
  const { values, name } = input;
  const box = el('div', `lab-reading${input.control ? ' is-control' : ''}`);
  const average = mean(values);
  const title = el('p');
  title.append(el('b', '', name), ' ', el('span', 'lab-muted', values.length ? `average ${average.toFixed(1)}, ${values.length} ${values.length === 1 ? 'rating' : 'ratings'}` : 'no ratings yet'));
  box.append(title);
  const stacks = new Map<number, number>();
  for (const v of values) stacks.set(v, (stacks.get(v) ?? 0) + 1);
  const height = Math.max(1, ...stacks.values()) * 9 + 30;
  const base = height - 22;
  const chart = svg('svg', { viewBox: `0 0 300 ${height}`, role: 'img', 'aria-label': values.length ? `${name}: average ${average.toFixed(1)} from ${values.length} ${values.length === 1 ? 'rating' : 'ratings'}` : `${name}: no ratings yet` });
  const still = reducedMotion();
  const seen = new Map<number, number>();
  values.forEach((v, k) => {
    const at = (seen.get(v) ?? 0) + 1;
    seen.set(v, at);
    const dot = svg('circle', { cx: readingX(v), cy: base - (at - 1) * 9, r: 4 });
    if (!still) (dot as SVGElement & ElementCSSInlineStyle).style.animationDelay = `${k * 45}ms`;
    chart.append(dot);
  });
  chart.append(svg('line', { class: 'lab-reading__axis', x1: 14, y1: base + 8, x2: 286, y2: base + 8 }));
  if (values.length) chart.append(svg('line', { class: 'lab-reading__mean', x1: readingX(average), y1: 4, x2: readingX(average), y2: base + 8 }));
  for (const v of [0, 5, 10]) {
    const tick = svg('text', { x: readingX(v), y: height - 2, 'text-anchor': 'middle' });
    tick.textContent = String(v);
    chart.append(tick);
  }
  box.append(chart);
  return box;
}

export type FindingRow = {
  /** The change in words. */
  label: string;
  shift: number;
  /** How many readers the version had. */
  n: number;
  /** Under the threshold, or under four readers: drawn pale. */
  pale: boolean;
  /** Fewer than four readers: the row says how many. */
  thin?: boolean;
  mine?: boolean;
};
export type FindingsInput = {
  rows: FindingRow[];
  /** The two ends of the centre line: what a bar to the left and a bar to the right mean. */
  ends: [string, string];
  /** The index (into `rows`) of the open row, or -1. */
  open?: number;
  /** When given, each row is a button that opens that trial. */
  onOpen?: (index: number) => void;
};

/** A full-width bar stands for a shift of this many points. */
const FULL_SHIFT = 3;

/**
 * The findings chart: one row per trial, sorted from the biggest drop to the
 * biggest rise, each a bar running left or right of a centre line.
 */
export function findings(input: FindingsInput): HTMLElement {
  const box = el('div', 'lab-finds');
  const axis = el('div', 'lab-finds__axis');
  const ends = el('div');
  ends.append(el('span', '', input.ends[0]), el('span', '', input.ends[1]));
  axis.append(el('span'), ends, el('span'));
  box.append(axis);
  const order = input.rows.map((row, index) => ({ row, index })).sort((a, b) => a.row.shift - b.row.shift || a.index - b.index);
  for (const { row, index } of order) {
    const node = input.onOpen ? el('button', 'lab-find') : el('div', 'lab-find');
    if (node instanceof HTMLButtonElement) {
      node.type = 'button';
      node.setAttribute('aria-expanded', String(input.open === index));
      node.addEventListener('click', () => input.onOpen!(index));
    }
    node.dataset.row = String(index);
    if (row.mine) node.classList.add('is-mine');
    if (row.pale) node.classList.add('is-pale');
    if (input.open === index) node.classList.add('is-on');
    const label = el('span', 'lab-find__label', row.label);
    if (row.thin) label.append(' ', el('small', 'lab-muted', `${row.n} ${row.n === 1 ? 'reader' : 'readers'}`));
    const track = el('span', 'lab-find__track');
    const fill = el('i');
    fill.dataset.w = String(Math.min(50, (Math.abs(row.shift) / FULL_SHIFT) * 50));
    fill.style.width = '0';
    fill.style.setProperty(row.shift < 0 ? 'right' : 'left', '50%');
    track.append(fill);
    node.append(label, track, el('span', 'lab-find__value', formatShift(row.shift)));
    box.append(node);
  }
  growBars(box);
  return box;
}

/**
 * The level-of-language comparison: one bar per level (Form, Sentence, Word),
 * biggest average shift first, each with how many trials stand behind it.
 * The leading level is drawn in full lilac once a trial has moved readers.
 */
export function levelBars(groups: LevelGroup[]): HTMLElement {
  const box = el('div', 'lab-bars lab-levels');
  const lead = groups[0] && groups[0].trials > 0 && groups[0].meanAbsShift > 0 ? groups[0].level : null;
  for (const group of groups) {
    const row = el('div', `lab-bar${group.level === lead ? ' is-top' : ''}`);
    row.dataset.level = group.level;
    const label = el('span', '', group.level);
    label.append(' ', el('small', 'lab-muted', `${group.trials} ${group.trials === 1 ? 'trial' : 'trials'}`));
    const fill = el('i');
    fill.dataset.w = String(Math.max(0, Math.min(100, (group.meanAbsShift / FULL_SHIFT) * 100)));
    fill.style.width = '0';
    row.append(label, fill, el('span', '', group.meanAbsShift.toFixed(1)));
    box.append(row);
  }
  growBars(box);
  return box;
}
