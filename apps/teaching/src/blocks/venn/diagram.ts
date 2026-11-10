import { el } from '@/blocks/peer-feedback-ui';
import {
  byRegion, depthCounts, isShared, pointGapsLabelled, regionLabel, regionTexts, regionsFor, textLabel,
  TEXT_KEYS, type Region, type TextKey, type VennPoint
} from './model';

/**
 * The drawn Venn and the read-only pieces shared by the student, teacher,
 * Display and print views. Circles are SVG; each region is an HTML button
 * laid over its spot, so it is a real, focusable button.
 */

const SVG = 'http://www.w3.org/2000/svg';

type Geometry = {
  viewBox: [number, number];
  r: number;
  circles: Record<TextKey, [number, number]>;
  /** Where each region's count sits, in viewBox units. */
  spots: Partial<Record<Region, [number, number]>>;
  /** Where each circle's letter sits. */
  letters: Record<TextKey, [number, number]>;
};

const TWO: Geometry = {
  viewBox: [300, 200], r: 80,
  circles: { a: [115, 100], b: [185, 100], c: [0, 0] },
  spots: { a: [72, 100], ab: [150, 100], b: [228, 100] },
  letters: { a: [62, 42], b: [238, 42], c: [0, 0] }
};

const THREE: Geometry = {
  viewBox: [300, 262], r: 76,
  circles: { a: [114, 104], b: [186, 104], c: [150, 166] },
  spots: { a: [80, 86], b: [220, 86], c: [150, 216], ab: [150, 74], ac: [108, 152], bc: [192, 152], abc: [150, 126] },
  letters: { a: [52, 46], b: [248, 46], c: [150, 252] }
};

export function geometry(count: number): Geometry {
  return count >= 3 ? THREE : TWO;
}

/** Short tag for a region: A, B, A+B, A+B+C. */
export function regionTag(region: Region): string {
  return regionTexts(region).map((k) => k.toUpperCase()).join('+');
}

export type DiagramOptions = {
  count: number;
  labels: readonly string[];
  counts?: ReadonlyMap<Region, number>;
  /** Regions become buttons that call this. */
  onPick?: (region: Region) => void;
  picked?: Region | null;
  /** Print: region names written in, no counts. */
  print?: boolean;
  size?: 'normal' | 'large';
};

export function drawDiagram(options: DiagramOptions): HTMLElement {
  const { count, labels } = options;
  const g = geometry(count);
  const [w, h] = g.viewBox;
  const wrap = el('div', `venn-diagram venn-diagram--${count >= 3 ? 'three' : 'two'}${options.size === 'large' ? ' venn-diagram--large' : ''}`);
  wrap.style.setProperty('--venn-ratio', `${w} / ${h}`);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'venn-diagram__svg');
  svg.setAttribute('role', 'img');
  const keys = TEXT_KEYS.slice(0, count);
  svg.setAttribute('aria-label', `Venn diagram of ${keys.map((k) => textLabel(k, labels)).join(', ')}`);
  for (const k of keys) {
    const [cx, cy] = g.circles[k];
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(g.r));
    c.setAttribute('class', `venn-circle venn-circle--${k}`);
    svg.append(c);
    const [lx, ly] = g.letters[k];
    const t = document.createElementNS(SVG, 'text');
    t.setAttribute('x', String(lx));
    t.setAttribute('y', String(ly));
    t.setAttribute('class', `venn-letter venn-letter--${k}`);
    t.setAttribute('text-anchor', 'middle');
    t.textContent = k.toUpperCase();
    svg.append(t);
  }
  wrap.append(svg);

  for (const region of regionsFor(count)) {
    const [x, y] = g.spots[region]!;
    const name = regionLabel(region, labels, count);
    const n = options.counts?.get(region) ?? 0;
    const spot = options.onPick ? el('button', 'venn-spot') : el('span', 'venn-spot');
    spot.dataset.region = region;
    spot.style.left = `${(x / w) * 100}%`;
    spot.style.top = `${(y / h) * 100}%`;
    if (options.print) {
      spot.append(el('span', 'venn-spot__tag', regionTag(region)));
    } else {
      spot.append(el('span', 'venn-spot__count', String(n)), el('span', 'venn-spot__tag', regionTag(region)));
    }
    const said = options.print ? name : `${name}: ${n} ${n === 1 ? 'point' : 'points'}`;
    if (spot instanceof HTMLButtonElement) {
      spot.type = 'button';
      spot.setAttribute('aria-label', said);
      spot.setAttribute('aria-pressed', String(options.picked === region));
      spot.addEventListener('click', () => options.onPick!(region));
    } else {
      spot.setAttribute('aria-hidden', 'true');
    }
    wrap.append(spot);
  }
  return wrap;
}

/** Which letter is which text, with the circle colours. */
export function legend(count: number, labels: readonly string[]): HTMLElement {
  const row = el('ul', 'venn-legend');
  for (const k of TEXT_KEYS.slice(0, count)) {
    const item = el('li', `venn-legend__item venn-legend__item--${k}`);
    item.append(el('b', 'venn-legend__letter', k.toUpperCase()), el('span', '', textLabel(k, labels)));
    row.append(item);
  }
  return row;
}

export function depthTally(points: readonly VennPoint[]): HTMLElement {
  const { deep, surface } = depthCounts(points);
  const tally = el('p', 'venn-tally');
  tally.append(el('span', 'venn-depth venn-depth--deep', `Deep ${deep}`), el('span', 'venn-tally__dot', '·'), el('span', 'venn-depth venn-depth--surface', `Surface ${surface}`));
  return tally;
}

export function regionCounts(points: readonly VennPoint[], count: number): Map<Region, number> {
  const out = new Map<Region, number>();
  for (const [region, list] of byRegion(points, count)) out.set(region, list.length);
  return out;
}

/** A point's notes, read-only: depth, the quotations and how each text treats a shared point. */
export function pointBody(point: VennPoint, labels: readonly string[]): HTMLElement[] {
  const parts: HTMLElement[] = [];
  const top = el('div', 'venn-point__top');
  top.append(el('p', 'venn-point__text', point.text || '…'));
  if (point.depth) top.append(el('span', `venn-depth venn-depth--${point.depth}`, point.depth === 'deep' ? 'Deep' : 'Surface'));
  parts.push(top);
  const keys = point.region ? regionTexts(point.region) : [];
  const notes = el('dl', 'venn-point__notes');
  for (const k of keys) {
    const how = point.differs[k]?.trim();
    const quote = point.quotes[k]?.trim();
    if (isShared(point.region) && how) notes.append(el('dt', '', `How ${textLabel(k, labels)} treats it`), el('dd', '', how));
    if (quote) notes.append(el('dt', '', `Quotation from ${textLabel(k, labels)}`), el('dd', 'venn-point__quote', `“${quote}”`));
  }
  if (notes.childElementCount) parts.push(notes);
  return parts;
}

/** The still-to-do list on a point, worded as next steps. */
export function gapList(point: VennPoint, labels: readonly string[]): HTMLElement | null {
  const gaps = pointGapsLabelled(point, labels).filter((g) => g !== 'Place it in the Venn');
  if (!gaps.length) return null;
  const box = el('div', 'venn-point__gaps');
  box.append(el('span', 'venn-point__gaps-mark', 'Next'));
  const list = el('ul');
  for (const g of gaps) list.append(el('li', '', g));
  box.append(list);
  return box;
}

/** Region columns of read-only point cards (teacher's expanded view, Display). */
export function readOnlyColumns(points: readonly VennPoint[], count: number, labels: readonly string[]): HTMLElement {
  const grid = el('div', `venn-columns venn-columns--${count >= 3 ? 'three' : 'two'}`);
  for (const [region, list] of byRegion(points, count)) {
    const col = el('section', `venn-column venn-column--${region.length > 1 ? 'shared' : region}`);
    col.dataset.region = region;
    const head = el('h4', 'venn-column__head');
    head.append(el('span', 'venn-column__tag', regionTag(region)), document.createTextNode(` ${regionLabel(region, labels, count)}`));
    col.append(head);
    if (!list.length) col.append(el('p', 'venn-column__empty block-secondary', 'No points here yet.'));
    for (const p of list) {
      const card = el('article', 'venn-point');
      card.append(...pointBody(p, labels));
      col.append(card);
    }
    grid.append(col);
  }
  return grid;
}
