// packages/problem-solver/render/pareto.ts
// Pareto analysis (toolkit, Decide), drawn as the book draws it: a red field with paper rules
// every tenth, a figure axis on the left and a cumulative percent axis on the right; yellow bars
// standing side by side, largest first, each with its figure inside the top and a letter code
// (A, B, C...) under it; a blue cumulative line with dots rising left to right through the bar
// centres; and a dashed guide from 80% on the right axis across to the line, then straight down.
// Under the chart sits the 80/20 square: a red rim round a yellow field holding the vital few's
// share, with a blue inset in its lower right holding "3 of 4".
// The chart is HTML over an SVG line, so every label keeps its real size at any width. Before the
// figures arrive the bars stand at zero in slot order and a note says the chart is waiting; an
// "Add the data" form takes one figure per item. A new snapshot grows the bars from the last one,
// glides re-ordered bars to their new place and draws the line in again. The key list (code,
// title, figure, share) is the reading surface and the 44px target on a phone. The renderer
// never calls the API: the page wires `onScore`.
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { pareto, paretoRows } from '../tools/pareto.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';
import { createChoiceCard } from './choice-card';

export type ParetoScores = { counts: number[] };
export type ParetoView = {
  el: HTMLDivElement;
  update(run: PsToolRun): void;
  onScore(cb: (scores: ParetoScores) => void): void;
  destroy(): void;
};

type Row = { node: PsNode; count: number; percent: number; cumulative: number; vital: boolean };
type Bar = {
  node: PsNode;
  item: HTMLDivElement;
  fill: HTMLButtonElement;
  value: HTMLSpanElement;
  code: HTMLSpanElement;
  card: HTMLDivElement;
  key: HTMLButtonElement;
  keyCode: HTMLSpanElement;
  keyWords: HTMLSpanElement;
  keyTitle: HTMLSpanElement;
  keyFigure: HTMLSpanElement;
  keyShare: HTMLSpanElement;
  dot: HTMLSpanElement | null;
  /** Where the bar stands now, in percent of the field (centre across, height up). */
  centre: number;
  height: number;
};
type Before = { centre: number; height: number; rect: DOMRect | null; inside: boolean };
type Composed = { item: HTMLDivElement; head: HTMLDivElement; text: HTMLParagraphElement; more: HTMLButtonElement; id: string };

const SVG = 'http://www.w3.org/2000/svg';
const CUT = 80;
const MORPH_MS = 600;
/** A figure needs about this many pixels of bar to sit inside it; shorter bars carry it on top. */
const LABEL_PX = 22;
/** Before the field has been measured (not yet attached), the same rule as a share of its height. */
const LABEL_FALLBACK = 8;
/** Room a figure needs either side inside its bar. */
const LABEL_PAD = 4;
/** The figures' font where the computed style does not say (the CSS sets 13px serif, 11px on a phone). */
const FIGURE_FONT = "600 13px Georgia, 'Times New Roman', serif";
/** Each bar fills this share of its slot; the rest is the red gap either side, as in the book. */
const BAR_FILL = 0.84;
const letter = (i: number): string => String.fromCharCode(65 + i);

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}

function setText(target: Element, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

function setAttr(target: Element, name: string, value: string): void {
  if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

function setStyle(target: HTMLElement, prop: 'left' | 'width' | 'height' | 'bottom', value: string): void {
  if (target.style[prop] !== value) target.style[prop] = value;
}

/** A figure as it reads on the chart: whole numbers plain, otherwise one decimal; thousands as k. */
export function formatFigure(value: number): string {
  if (Math.abs(value) >= 10000) return `${+(value / 1000).toFixed(1)}k`;
  if (Number.isInteger(value)) return String(value);
  return String(+value.toFixed(Math.abs(value) < 10 ? 2 : 1));
}

/** Decimals a number needs to be written exactly (up to four). */
function decimalsOf(value: number): number {
  let d = 0;
  while (d < 4 && Math.abs(value * 10 ** d - Math.round(value * 10 ** d)) > 1e-9) d += 1;
  return d;
}

/** An axis tick, with as many decimals as the step needs, so no two ticks read the same. */
export function formatTick(value: number, step: number): string {
  if (Math.abs(value) >= 10000) return `${+(value / 1000).toFixed(decimalsOf(step / 1000))}k`;
  return String(+value.toFixed(decimalsOf(step)));
}

/** Text width in px for a CSS font, where a canvas can measure it (null otherwise). */
let measurer: CanvasRenderingContext2D | null = null;
function textWidth(doc: Document, text: string, font: string): number | null {
  if (!font) return null;
  if (!measurer) {
    try {
      measurer = doc.createElement('canvas').getContext('2d');
    } catch {
      measurer = null;
    }
  }
  if (!measurer || !font) return null;
  measurer.font = font;
  return measurer.measureText(text).width;
}

/** A tidy top for the figure axis: ten equal steps of 1, 2, 2.5 or 5 times a power of ten. */
export function axisTop(max: number): number {
  if (!(max > 0)) return 10;
  const raw = max / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw - 1e-9) ?? 10 * power;
  return step * 10;
}

/** Items in slot order. */
function itemsOf(run: PsToolRun): PsNode[] {
  return run.nodes
    .filter((node) => parseSlot(node.slot)?.name === 'item')
    .sort((a, b) => (parseSlot(a.slot)?.index ?? 0) - (parseSlot(b.slot)?.index ?? 0));
}

/** The latest figures, only while they cover exactly the items now placed. */
function currentCounts(run: PsToolRun, n: number): number[] | null {
  const counts = run.scores?.snapshots?.at(-1)?.counts;
  return Array.isArray(counts) && counts.length === n ? (counts as number[]) : null;
}

/** Where the cumulative line first reaches 80%, in percent across the field. */
function cutAt(points: Array<{ x: number; y: number }>): number | null {
  const i = points.findIndex((p) => p.y >= CUT);
  if (i < 0) return null;
  if (i === 0) return points[0].x;
  const a = points[i - 1];
  const b = points[i];
  return a.x + ((CUT - a.y) / (b.y - a.y)) * (b.x - a.x);
}

export function createParetoView(doc: Document = document): ParetoView {
  const root = el(doc, 'div', 'ps-pareto');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Pareto analysis');
  // Key rows mirror their bar's open state, however it opened or closed.
  const group = createDisclosureGroup({ onChange: () => syncKeyState() });
  const choice = createChoiceCard(doc, group);

  let target: Composed | null = null;
  let frame: {
    chart: HTMLDivElement;
    field: HTMLDivElement;
    bars: HTMLDivElement;
    overlay: SVGSVGElement;
    halo: SVGPolylineElement;
    line: SVGPolylineElement;
    dots: HTMLDivElement;
    cutDown: HTMLDivElement;
    cutAcross: HTMLDivElement;
    countTicks: HTMLSpanElement[];
    codes: HTMLDivElement;
    note: HTMLParagraphElement;
    below: HTMLDivElement;
    key: HTMLDivElement;
  } | null = null;
  let summary: { box: HTMLDivElement; share: HTMLSpanElement; few: HTMLSpanElement } | null = null;
  const panel = el(doc, 'div', 'ps-pareto__panel');
  const after = el(doc, 'div', 'ps-pareto__after');

  const bars = new Map<string, Bar>();
  let order: PsNode[] = [];
  let rows: Row[] = [];
  let top = 10;
  let lastRun: PsToolRun | null = null;
  /** What the chart last drew (items and figures), so motion runs only on change. */
  let drawnKey = '';
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;
  let fieldHeight = 0;
  let fieldWidth = 0;
  /** Bars whose figure waits for their shrink to finish before it moves. */
  const pending = new Set<Bar>();
  /** The control that opened the card now open (a key row or a bar), for Escape to return to. */
  let openedBy: HTMLButtonElement | null = null;
  let viaKey = false;

  // Data form.
  let handler: ((scores: ParetoScores) => void) | null = null;
  let scoring: HTMLDivElement | null = null;
  let toggle: HTMLButtonElement | null = null;
  let form: HTMLFormElement | null = null;
  let formBody: HTMLDivElement | null = null;
  let message: HTMLParagraphElement | null = null;
  let save: HTMLButtonElement | null = null;
  let formKey = '';

  // ---------------------------------------------------------------- helpers

  function arrange(): void {
    const want = [target?.item, frame?.chart, frame?.note, frame?.below, frame ? panel : null, order.length >= 3 ? scoring : null, after.childElementCount ? after : null].filter(Boolean) as HTMLElement[];
    want.forEach((child, i) => {
      if (root.children[i] !== child) root.insertBefore(child, root.children[i] ?? null);
    });
    for (const child of [...root.children]) if (!want.includes(child as HTMLElement)) child.remove();
  }

  function rise(target: HTMLElement, delay = 0): void {
    if (!canAnimate(target)) return;
    target.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay, easing: EASE, fill: 'backwards' });
  }

  function fade(target: Element, delay = 0): void {
    if (!canAnimate(target)) return;
    (target as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay, easing: EASE, fill: 'backwards' });
  }

  const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

  function syncKeyState(): void {
    if (destroyed) return;
    for (const bar of bars.values()) setAttr(bar.key, 'aria-expanded', bar.fill.getAttribute('aria-expanded') ?? 'false');
  }

  // ---------------------------------------------------------------- target card

  function syncTarget(node: PsNode | undefined, fresh: HTMLElement[]): void {
    if (target && target.id !== node?.id) {
      group.unregister(target.item);
      target.item.remove();
      target = null;
    }
    if (!node) return;
    if (!target) {
      const detailsId = nextId('ps-pareto-details');
      const item = el(doc, 'div', 'ps-pareto__card');
      item.setAttribute('data-node', node.id);
      const head = el(doc, 'div', 'ps-pareto__card-head');
      head.append(el(doc, 'span', 'ps-pareto__card-meta', 'Target'));
      const text = el(doc, 'p', 'ps-pareto__card-text');
      const more = el(doc, 'button', 'ps-pareto__more', 'Details');
      more.type = 'button';
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-controls', detailsId);
      more.setAttribute('aria-label', 'Target. Show details');
      const details = detailsCard(doc, node, 'red', detailsId);
      details.setAttribute('data-for', node.id);
      // The card shows the answer in full, so its details carry only skills and any objection.
      details.querySelector('.ps-details__text')?.remove();
      item.append(head, text, more, details);
      group.register(item, more);
      target = { item, head, text, more, id: node.id };
      fresh.push(item);
    }
    setText(target.text, node.text);
    syncContested(target.item, node, target.head, target.more);
  }

  // ---------------------------------------------------------------- frame

  function ensureFrame(): boolean {
    if (frame) return false;
    const chart = el(doc, 'div', 'ps-pareto__chart');
    const titleCount = el(doc, 'span', 'ps-pareto__axis-title ps-pareto__axis-title--count ps-pareto__meta', 'Figure');
    const titleShare = el(doc, 'span', 'ps-pareto__axis-title ps-pareto__axis-title--share ps-pareto__meta', 'Cumulative');
    const axisCount = el(doc, 'div', 'ps-pareto__axis ps-pareto__axis--count');
    const axisShare = el(doc, 'div', 'ps-pareto__axis ps-pareto__axis--share');
    for (const axis of [axisCount, axisShare]) axis.setAttribute('aria-hidden', 'true');
    const countTicks: HTMLSpanElement[] = [];
    // Ticks at every tenth above the floor, as in the book (no zero).
    for (let k = 1; k <= 10; k += 1) {
      const count = el(doc, 'span', 'ps-pareto__tick ps-pareto__meta');
      count.style.bottom = `${k * 10}%`;
      countTicks.push(count);
      axisCount.append(count);
      const share = el(doc, 'span', 'ps-pareto__tick ps-pareto__meta', `${k * 10}%`);
      share.style.bottom = `${k * 10}%`;
      axisShare.append(share);
    }
    const field = el(doc, 'div', 'ps-pareto__field');
    field.setAttribute('data-shape', '');
    field.setAttribute('data-fill', 'red');
    const barsEl = el(doc, 'div', 'ps-pareto__bars');
    barsEl.setAttribute('role', 'list');
    barsEl.setAttribute('aria-label', 'Items, largest first');
    const overlay = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
    overlay.setAttribute('class', 'ps-pareto__overlay');
    overlay.setAttribute('viewBox', '0 0 100 100');
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.setAttribute('aria-hidden', 'true');
    const halo = doc.createElementNS(SVG, 'polyline') as SVGPolylineElement;
    halo.setAttribute('class', 'ps-pareto__halo');
    const line = doc.createElementNS(SVG, 'polyline') as SVGPolylineElement;
    line.setAttribute('class', 'ps-pareto__line');
    line.setAttribute('data-cumulative-line', '');
    for (const p of [halo, line]) p.setAttribute('vector-effect', 'non-scaling-stroke');
    overlay.append(halo, line);
    overlay.setAttribute('hidden', '');
    const dots = el(doc, 'div', 'ps-pareto__dots');
    dots.setAttribute('aria-hidden', 'true');
    const cutDown = el(doc, 'div', 'ps-pareto__cut ps-pareto__cut--down');
    const cutAcross = el(doc, 'div', 'ps-pareto__cut ps-pareto__cut--across');
    for (const cut of [cutDown, cutAcross]) {
      cut.setAttribute('aria-hidden', 'true');
      cut.hidden = true;
    }
    field.append(barsEl, cutDown, cutAcross, overlay, dots);
    const codes = el(doc, 'div', 'ps-pareto__codes');
    codes.setAttribute('aria-hidden', 'true');
    const foot = el(doc, 'span', 'ps-pareto__axis-foot ps-pareto__meta', 'Largest first');
    chart.append(titleCount, titleShare, axisCount, field, axisShare, codes, foot);
    const note = el(doc, 'p', 'ps-pareto__note');
    note.setAttribute('role', 'status');
    const below = el(doc, 'div', 'ps-pareto__below');
    const key = el(doc, 'div', 'ps-pareto__key');
    key.setAttribute('role', 'group');
    key.setAttribute('aria-label', 'Key: each item with its figure and share');
    below.append(key);
    frame = { chart, field, bars: barsEl, overlay, halo, line, dots, cutDown, cutAcross, countTicks, codes, note, below, key };
    observer?.observe(field);
    if (painted && canAnimate(field)) {
      field.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 460, easing: EASE, fill: 'backwards' });
      for (const axis of [axisCount, axisShare, titleCount, titleShare]) fade(axis, 200);
    }
    return true;
  }

  function teardown(): void {
    for (const bar of bars.values()) group.unregister(bar.card);
    choice.reset();
    if (frame) observer?.unobserve(frame.field);
    cancelAnimations(root);
    panel.replaceChildren();
    frame = null;
    summary = null;
    bars.clear();
    order = [];
    rows = [];
    drawnKey = '';
    fieldHeight = 0;
    fieldWidth = 0;
    pending.clear();
    if (form) {
      form.hidden = true;
      toggle!.setAttribute('aria-expanded', 'false');
    }
  }

  // ---------------------------------------------------------------- bars

  function addBar(node: PsNode): Bar {
    const detailsId = nextId('ps-pareto-details');
    const item = el(doc, 'div', 'ps-pareto__bar');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-bar-height', '0');
    const fill = el(doc, 'button', 'ps-pareto__fill');
    fill.type = 'button';
    fill.setAttribute('aria-expanded', 'false');
    fill.setAttribute('aria-controls', detailsId);
    fill.setAttribute('data-shape', '');
    fill.setAttribute('data-fill', 'yellow');
    // The key row beside the chart is this bar's 44px target.
    fill.setAttribute('data-target-ok', '');
    fill.style.height = '0%';
    const value = el(doc, 'span', 'ps-pareto__value ps-pareto__meta');
    fill.append(value);
    item.append(fill);
    const code = el(doc, 'span', 'ps-pareto__code ps-pareto__meta');
    code.setAttribute('data-for', node.id);
    frame!.codes.append(code);
    const card = detailsCard(doc, node, 'yellow', detailsId);
    card.setAttribute('data-for', node.id);
    panel.append(card);
    group.register(card, fill);

    const key = el(doc, 'button', 'ps-pareto__key-row');
    key.type = 'button';
    key.setAttribute('data-for', node.id);
    key.setAttribute('aria-expanded', 'false');
    key.setAttribute('aria-controls', detailsId);
    const keyCode = el(doc, 'span', 'ps-pareto__key-code');
    const keyWords = el(doc, 'span', 'ps-pareto__key-words');
    const keyTitle = el(doc, 'span', 'ps-pareto__key-title');
    keyWords.append(keyTitle);
    const keyFigure = el(doc, 'span', 'ps-pareto__key-figure');
    const keyShare = el(doc, 'span', 'ps-pareto__key-share');
    key.append(keyCode, keyWords, keyFigure, keyShare);
    key.addEventListener('click', () => {
      const bar = bars.get(node.id);
      if (destroyed || !bar) return;
      viaKey = true;
      bar.fill.click();
      viaKey = false;
      openedBy = bar.card.classList.contains('is-open') ? key : null;
    });
    fill.addEventListener('click', () => {
      if (!viaKey && !destroyed) openedBy = card.classList.contains('is-open') ? fill : null;
    });
    frame!.key.append(key);

    const bar: Bar = { node, item, fill, value, code, card, key, keyCode, keyWords, keyTitle, keyFigure, keyShare, dot: null, centre: -1, height: 0 };
    bars.set(node.id, bar);
    return bar;
  }

  function removeBar(id: string): void {
    const bar = bars.get(id);
    if (!bar) return;
    group.unregister(bar.card);
    for (const part of [bar.item, bar.code, bar.card, bar.key, bar.dot]) part?.remove();
    bars.delete(id);
  }

  // ---------------------------------------------------------------- geometry

  /** Put each figure inside its bar's top, or on top of a bar too short to hold it. */
  function placeLabels(): void {
    // Reads first: the figures' font and each figure's width (canvas text metrics, no layout).
    const sample = [...bars.values()][0]?.value;
    const font = sample && fieldWidth > 0 ? (typeof getComputedStyle === 'function' ? getComputedStyle(sample).font : '') || FIGURE_FONT : '';
    const slot = order.length ? (fieldWidth * BAR_FILL) / order.length : 0;
    const fits = new Map<Bar, boolean>();
    for (const bar of bars.values()) {
      const w = bar.value.textContent ? textWidth(doc, bar.value.textContent, font) : null;
      fits.set(bar, w === null || w + LABEL_PAD <= slot);
    }
    for (const bar of bars.values()) {
      // A narrow bar's figure stays off the chart; its key row carries it.
      bar.value.classList.toggle('is-hidden', !fits.get(bar));
      // A shrinking bar keeps its figure where it was until its height animation ends.
      if (pending.has(bar)) continue;
      const tall = fieldHeight > 0 ? (bar.height / 100) * fieldHeight >= LABEL_PX : bar.height >= LABEL_FALLBACK;
      const inside = tall || !bar.value.textContent;
      const host = inside ? bar.fill : bar.item;
      if (bar.value.parentElement !== host) host.append(bar.value);
      bar.value.classList.toggle('is-above', !inside);
      if (!inside) setStyle(bar.value, 'bottom', `${bar.height}%`);
      else bar.value.style.removeProperty('bottom');
    }
  }

  function measure(): void {
    if (!frame) return;
    const rect = frame.field.getBoundingClientRect();
    if (rect.height && Math.abs(rect.height - fieldHeight) >= 0.5) fieldHeight = rect.height;
    if (rect.width && Math.abs(rect.width - fieldWidth) >= 0.5) fieldWidth = rect.width;
  }

  /** Lay the bars, codes, line, dots and guide out for the current rows (no motion here). */
  function draw(scored: boolean): void {
    const f = frame!;
    const n = order.length;
    const slot = 100 / Math.max(n, 1);
    const shown = scored ? rows.map((row) => row.node) : order;
    const byId = new Map(rows.map((row) => [row.node.id, row]));
    shown.forEach((node, i) => {
      const bar = bars.get(node.id)!;
      const row = byId.get(node.id);
      const centre = (i + 0.5) * slot;
      const height = row ? Math.min(100, (row.count / top) * 100) : 0;
      bar.centre = centre;
      bar.height = height;
      setStyle(bar.item, 'left', `${i * slot + (slot * (1 - BAR_FILL)) / 2}%`);
      setStyle(bar.item, 'width', `${slot * BAR_FILL}%`);
      setStyle(bar.fill, 'height', `${height}%`);
      setAttr(bar.item, 'data-bar-height', String(+height.toFixed(2)));
      setAttr(bar.item, 'data-center', String(+centre.toFixed(2)));
      setStyle(bar.code, 'left', `${centre}%`);
      if (row) setAttr(bar.item, 'data-vital', String(row.vital));
      else bar.item.removeAttribute('data-vital');
      // DOM order follows the reading order (rank once scored), so the list reads largest first.
      if (f.bars.children[i] !== bar.item) f.bars.insertBefore(bar.item, f.bars.children[i] ?? null);
      if (f.key.children[i] !== bar.key) f.key.insertBefore(bar.key, f.key.children[i] ?? null);
      if (f.codes.children[i] !== bar.code) f.codes.insertBefore(bar.code, f.codes.children[i] ?? null);

      const code = letter(i);
      setText(bar.code, code);
      setText(bar.keyCode, code);
      setText(bar.keyTitle, nodeTitle(node));
      setText(bar.value, row ? formatFigure(row.count) : '');
      setText(bar.keyFigure, row ? formatFigure(row.count) : '–');
      setText(bar.keyShare, row ? `${row.percent}%` : '');
      bar.key.classList.toggle('is-vital', !!row?.vital);
      const facts = row ? `, ${formatFigure(row.count)}, ${row.percent}% of the total${row.vital ? ', one of the vital few' : ''}` : '';
      setAttr(bar.fill, 'aria-label', `${code}: ${nodeTitle(node)}${facts}${contested(node)}. Show details`);
      setAttr(bar.key, 'aria-label', `${code}: ${nodeTitle(node)}${facts}${contested(node)}. Show details`);
      syncContested(bar.item, node, null, bar.fill);
      syncContested(bar.key, node, bar.keyWords, bar.key);

      // The dot on the cumulative line, one per bar once scored.
      if (row && !bar.dot) {
        bar.dot = el(doc, 'span', 'ps-pareto__dot');
        bar.dot.setAttribute('data-for', node.id);
      } else if (!row && bar.dot) {
        bar.dot.remove();
        bar.dot = null;
      }
      if (bar.dot && row) {
        setStyle(bar.dot, 'left', `${centre}%`);
        setStyle(bar.dot, 'bottom', `${row.cumulative}%`);
        if (f.dots.children[i] !== bar.dot) f.dots.insertBefore(bar.dot, f.dots.children[i] ?? null);
      }
    });

    // Axis ticks for the figures, in ten tidy steps.
    f.countTicks.forEach((tick, k) => setText(tick, scored ? formatTick(((k + 1) * top) / 10, top / 10) : ''));

    // The cumulative line and the 80% guide.
    const points = scored ? rows.map((row) => ({ x: bars.get(row.node.id)!.centre, y: row.cumulative })) : [];
    const pts = points.map((p) => `${+p.x.toFixed(3)},${+(100 - p.y).toFixed(3)}`).join(' ');
    for (const p of [f.halo, f.line]) setAttr(p, 'points', pts);
    f.overlay.toggleAttribute('hidden', !points.length);
    const cut = cutAt(points);
    f.cutDown.hidden = f.cutAcross.hidden = cut === null;
    if (cut !== null) {
      setAttr(f.cutDown, 'data-cut', String(+cut.toFixed(2)));
      setStyle(f.cutDown, 'left', `${cut}%`);
      setStyle(f.cutDown, 'height', `${CUT}%`);
      setStyle(f.cutAcross, 'left', `${cut}%`);
      setStyle(f.cutAcross, 'width', `${100 - cut}%`);
      setStyle(f.cutAcross, 'bottom', `${CUT}%`);
    } else f.cutDown.removeAttribute('data-cut');
    placeLabels();
  }

  // ---------------------------------------------------------------- summary (the 80/20 square)

  function syncSummary(scored: boolean, fresh: HTMLElement[]): void {
    if (!scored) {
      summary?.box.remove();
      summary = null;
      return;
    }
    if (!summary) {
      const box = el(doc, 'div', 'ps-pareto__summary');
      box.setAttribute('data-summary', '');
      const rim = el(doc, 'div', 'ps-pareto__square');
      const field = el(doc, 'div', 'ps-pareto__square-field');
      field.setAttribute('data-shape', '');
      field.setAttribute('data-fill', 'yellow');
      const share = el(doc, 'span', 'ps-pareto__share');
      const inset = el(doc, 'div', 'ps-pareto__inset');
      inset.setAttribute('data-shape', '');
      inset.setAttribute('data-fill', 'blue');
      const few = el(doc, 'span', 'ps-pareto__few');
      inset.append(few);
      field.append(share, inset);
      rim.append(field);
      const caption = el(doc, 'p', 'ps-pareto__caption', 'The vital few');
      box.append(rim, caption);
      summary = { box, share, few };
      fresh.push(box);
    }
    const vital = rows.filter((row) => row.vital);
    const share = `${Math.round(vital.at(-1)?.cumulative ?? 0)}%`;
    const few = `${vital.length} of ${rows.length}`;
    setText(summary.share, share);
    setText(summary.few, few);
    setAttr(summary.box, 'aria-label', `The vital few: ${few} items give ${share} of the total`);
    setAttr(summary.box, 'role', 'img');
    if (frame!.below.firstElementChild !== summary.box) frame!.below.prepend(summary.box);
  }

  // ---------------------------------------------------------------- motion

  /** Grow the bars from where they stood, glide moved bars (FLIP by measured centres), redraw the line. */
  function morph(before: Map<string, Before>, fieldRect: DOMRect | null): void {
    for (const bar of bars.values()) {
      const was = before.get(bar.node.id);
      if (!was) continue;
      cancelAnimations(bar.item);
      if (canAnimate(bar.fill) && Math.abs(was.height - bar.height) > 0.01) {
        const grow = bar.fill.animate([{ height: `${was.height}%` }, { height: `${bar.height}%` }], { duration: MORPH_MS, easing: EASE });
        // Shrinking: the figure stays inside (where it was) until the bar has shrunk, then moves.
        if (bar.height < was.height && was.inside && grow) {
          pending.add(bar);
          if (bar.value.parentElement !== bar.fill) bar.fill.append(bar.value);
          bar.value.classList.remove('is-above');
          bar.value.style.removeProperty('bottom');
          grow.onfinish = () => {
            pending.delete(bar);
            if (!destroyed && bars.get(bar.node.id) === bar) placeLabels();
          };
        }
      }
      // The new centre comes from the measured field and the bar's percent place; the old one was measured.
      if (was.rect && fieldRect && fieldRect.width && Math.abs(was.centre - bar.centre) > 0.01 && canAnimate(bar.item)) {
        const oldX = was.rect.left + was.rect.width / 2;
        const newX = fieldRect.left + (bar.centre / 100) * fieldRect.width;
        bar.item.animate([{ transform: `translateX(${oldX - newX}px)` }, { transform: 'none' }], { duration: MORPH_MS, easing: EASE });
      }
    }
    drawLineIn();
  }

  /** The line and its dots draw in left to right; the guide follows. */
  function drawLineIn(): void {
    const f = frame!;
    if (f.overlay.hasAttribute('hidden')) return;
    for (const part of [f.overlay, f.dots, f.cutDown, f.cutAcross]) cancelAnimations(part);
    if (canAnimate(f.overlay)) {
      (f.overlay as unknown as HTMLElement).animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 700, delay: 200, easing: EASE, fill: 'backwards' });
    }
    [...f.dots.children].forEach((dot, i, all) => fade(dot, 200 + (700 * i) / Math.max(all.length, 1)));
    if (!f.cutDown.hidden) for (const cut of [f.cutDown, f.cutAcross]) fade(cut, 820);
  }

  // ---------------------------------------------------------------- data form

  function readForm(): number[] {
    return order.map((node) => {
      const input = form!.querySelector<HTMLInputElement>(`input[data-count="${node.id}"]`)!;
      const raw = input.value.trim();
      return raw === '' ? Number.NaN : Number(raw);
    });
  }

  function validate(): void {
    if (!form || !lastRun) return;
    const counts = readForm();
    const problem = counts.some((v) => Number.isNaN(v)) ? 'Give a figure for every item.' : ((pareto.validateScores!(lastRun, { counts }) as string | null) ?? null);
    setText(message!, problem ?? '');
    message!.hidden = !problem;
    save!.disabled = !!problem;
  }

  const keyOf = (): string => order.map((n) => n.id).join();

  function buildForm(keep: Map<string, string> | null): void {
    if (!form || !formBody) return;
    const prior = lastRun?.scores?.snapshots?.at(-1)?.counts as number[] | undefined;
    // Earlier figures fill in by slot while they cannot have shifted (none removed since).
    const usable = Array.isArray(prior) && prior.length <= order.length ? prior : [];
    const fields = order.map((node, i) => {
      const wrap = el(doc, 'label', 'ps-pareto__field-row');
      const name = el(doc, 'span', 'ps-pareto__field-name', nodeTitle(node));
      const input = el(doc, 'input', 'ps-pareto__input');
      input.type = 'number';
      input.inputMode = 'decimal';
      input.min = '0';
      input.step = 'any';
      input.setAttribute('aria-label', `Figure for ${nodeTitle(node)}`);
      input.setAttribute('data-count', node.id);
      const was = keep?.get(node.id) ?? (typeof usable[i] === 'number' ? String(usable[i]) : '');
      input.value = was;
      wrap.append(name, input);
      return wrap;
    });
    formBody.replaceChildren(...fields);
    formKey = keyOf();
    validate();
  }

  function keepTyped(): Map<string, string> {
    const keep = new Map<string, string>();
    for (const input of form!.querySelectorAll<HTMLInputElement>('input[data-count]')) keep.set(input.getAttribute('data-count')!, input.value);
    return keep;
  }

  function setOpen(open: boolean): void {
    if (!form || !toggle) return;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      buildForm(null);
      form.querySelector<HTMLInputElement>('input')?.focus();
    } else toggle.focus();
  }

  function ensureScoring(): void {
    if (scoring) return;
    scoring = el(doc, 'div', 'ps-pareto__scoring');
    toggle = el(doc, 'button', 'ps-pareto__data');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    form = el(doc, 'form', 'ps-pareto__form');
    form.id = nextId('ps-pareto-form');
    form.setAttribute('aria-label', 'A figure for each item');
    form.hidden = true;
    form.noValidate = true;
    toggle.setAttribute('aria-controls', form.id);
    formBody = el(doc, 'div', 'ps-pareto__form-body');
    message = el(doc, 'p', 'ps-pareto__message');
    message.setAttribute('aria-live', 'polite');
    const actions = el(doc, 'div', 'ps-pareto__form-actions');
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Data actions');
    const cancel = el(doc, 'button', 'ps-pareto__cancel', 'Cancel');
    cancel.type = 'button';
    save = el(doc, 'button', 'ps-pareto__save', 'Save the figures');
    save.type = 'submit';
    actions.append(cancel, save);
    form.append(formBody, message, actions);
    toggle.addEventListener('click', () => {
      if (!destroyed) setOpen(form!.hidden);
    });
    cancel.addEventListener('click', () => setOpen(false));
    form.addEventListener('input', validate);
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || destroyed) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (destroyed) return;
      validate();
      if (save!.disabled) return;
      handler?.({ counts: readForm() });
      setOpen(false);
    });
    scoring.append(toggle, form);
  }

  function syncScoring(): void {
    if (order.length >= 3) {
      ensureScoring();
      setText(toggle!, run0HasData() ? 'Update the data' : 'Add the data');
      if (!form!.hidden && formKey !== keyOf()) {
        const active = doc.activeElement as HTMLElement | null;
        const focused = active?.closest('form') === form ? active!.getAttribute('data-count') : null;
        buildForm(keepTyped());
        if (focused) (form!.querySelector<HTMLInputElement>(`input[data-count="${focused}"]`) ?? form!.querySelector<HTMLInputElement>('input'))?.focus();
      } else if (!form!.hidden) validate();
    } else if (scoring && !form!.hidden) {
      // An undo took the data form away: close it without stealing focus.
      form!.hidden = true;
      toggle!.setAttribute('aria-expanded', 'false');
    }
  }

  /** If focus sits in the form an undo is about to take away, move it to the target card or the chart. */
  function rescueFocus(): void {
    const active = doc.activeElement;
    if (!scoring || !active || !scoring.contains(active)) return;
    const next = target?.more ?? null;
    if (next && root.contains(next)) next.focus({ preventScroll: true });
    else {
      root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
  }

  const run0HasData = (): boolean => (lastRun?.scores?.snapshots?.length ?? 0) > 0;

  // Escape on a key row, or in a card a key row opened, closes the card and returns to that row.
  // (A card the bar opened is closed by the disclosure group, which returns focus to the bar.)
  root.addEventListener(
    'keydown',
    (event) => {
      if (destroyed || event.key !== 'Escape') return;
      const at = event.target as Node;
      for (const bar of bars.values()) {
        if (!bar.card.classList.contains('is-open')) continue;
        if (at !== bar.key && !(openedBy === bar.key && bar.card.contains(at))) continue;
        event.preventDefault();
        event.stopPropagation();
        group.close();
        openedBy = null;
        bar.key.focus({ preventScroll: true });
        return;
      }
    },
    true
  );

  // ---------------------------------------------------------------- size watch

  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (destroyed || !frame) return;
          const before = `${fieldHeight}x${fieldWidth}`;
          measure();
          if (`${fieldHeight}x${fieldWidth}` !== before) placeLabels();
        })
      : null;

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    if (destroyed) return;
    lastRun = run;
    const items = itemsOf(run);
    const targetNode = run.nodes.find((node) => node.slot === 'target');
    const fresh: HTMLElement[] = [];

    // Reads first: the field and where every bar stands now, before anything is written.
    measure();
    const fieldRect = items.length && frame && painted ? frame.field.getBoundingClientRect() : null;
    const before = new Map<string, Before>();
    if (items.length && frame && painted) {
      for (const bar of bars.values()) before.set(bar.node.id, { centre: bar.centre, height: bar.height, rect: bar.item.getBoundingClientRect(), inside: bar.value.parentElement === bar.fill });
    }

    // An undo that takes the focused form away sends focus somewhere sensible first.
    if (items.length < 3) rescueFocus();
    syncTarget(targetNode, fresh);
    pending.clear();
    if (!items.length) {
      if (frame) teardown();
    } else {

      const newFrame = ensureFrame();
      const ids = new Set(items.map((n) => n.id));
      for (const id of [...bars.keys()]) if (!ids.has(id)) removeBar(id);
      order = items;
      const newBars: Bar[] = [];
      for (const node of items) {
        let bar = bars.get(node.id);
        if (!bar) {
          bar = addBar(node);
          newBars.push(bar);
        }
        bar.node = node;
      }

      const counts = currentCounts(run, items.length);
      rows = counts ? (paretoRows(run) as Row[]) : [];
      const scored = rows.length > 0;
      top = scored ? axisTop(Math.max(...rows.map((row) => row.count))) : 10;
      draw(scored);
      setText(frame!.note, scored ? '' : 'Waiting for the figures');
      frame!.note.hidden = scored;
      syncSummary(scored, fresh);

      const key = `${items.map((n) => n.id).join()}|${counts?.join() ?? ''}`;
      const changed = key !== drawnKey;
      drawnKey = key;
      if (painted) {
        if (newFrame) fresh.push(frame!.note);
        newBars.forEach((bar, i) => {
          fade(bar.item, 120 + i * 50);
          fade(bar.code, 120 + i * 50);
          fade(bar.key, 120 + i * 50);
        });
        if (changed && scored) morph(before, fieldRect);
      }
    }

    syncScoring();
    choice.sync(run, after, painted);
    arrange();
    if (painted) fresh.forEach((part, i) => rise(part, i * 80));
    painted = true;
  }

  return {
    el: root,
    update,
    onScore(cb) {
      handler = cb;
    },
    /** Stop the size watch and any motion once the canvas drops this view. */
    destroy() {
      destroyed = true;
      observer?.disconnect();
      cancelAnimations(root);
    }
  };
}
