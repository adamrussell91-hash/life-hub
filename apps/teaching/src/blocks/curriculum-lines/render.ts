import type { CurriculumLinesBlock } from '@/schemas/block';
import './curriculum-lines.css';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { navigate } from '@/app/router';
import { stripAppBase } from '@/app/base-path';
import {
  LEVEL_WORD,
  LINES_G,
  buildLinesModel,
  chipsByWeek,
  chooseOrientation,
  horizontalLayout,
  verticalLayout,
  type InterchangeView,
  type LinesLevel,
  type LinesModel,
  type LinesTarget,
  type StrandView
} from './model';

const NS = 'http://www.w3.org/2000/svg';
const INK = 'var(--navy, #17375e)';
const MUTED = 'var(--muted, #6b7788)';
const PAPER = 'var(--paper, #fbf8f2)';
const DARK = 'var(--marine, #142b51)';
const FONT_LABEL = '500 13px Inter, ui-sans-serif, sans-serif';
const FONT_CHIP = '600 12px Inter, ui-sans-serif, sans-serif';
const FONT_HEAD = '650 15px Inter, ui-sans-serif, sans-serif';

/* Same text fitting as the Tasks Lines chart kit (chart-kit/transit-lines.js). */
const measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

function measureText(value: string, font: string): number {
  if (!measureCtx) return value.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(value).width;
}

function fitText(value: string, font: string, max: number): string {
  if (measureText(value, font) <= max) return value;
  let next = value;
  while (next.length > 1 && measureText(`${next}…`, font) > max) next = next.slice(0, -1);
  return `${next}…`;
}

type Attrs = Record<string, string | number>;

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

function text(parent: Element, value: string, attrs: Attrs): SVGTextElement {
  const node = s('text', attrs, parent);
  node.textContent = value;
  return node;
}

/** Plain clicks on same-origin links stay inside the app. */
function followLink(event: MouseEvent, href: string): void {
  event.stopPropagation();
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  navigate(`${stripAppBase(url.pathname)}${url.search}${url.hash}`);
}

/** Wraps `children` in a link when the target is a lesson the viewer can open. */
function linkOrGroup(parent: Element, target: LinesTarget, label: string): SVGElement {
  if (!target.href) {
    const g = s('g', {}, parent);
    s('title', {}, g).textContent = label;
    return g;
  }
  const a = s('a', { href: target.href, class: 'cl-link', 'aria-label': label }, parent);
  a.addEventListener('click', (e) => followLink(e as MouseEvent, target.href!));
  return a;
}

function station(parent: Element, cx: number, cy: number, level: LinesLevel, colour: string): void {
  if (level === 'introduced') {
    s('circle', { cx, cy, r: LINES_G.r, style: `fill:${PAPER};stroke:${colour};stroke-width:${LINES_G.stroke.open}` }, parent);
  } else if (level === 'reinforced') {
    s('circle', { cx, cy, r: LINES_G.r, style: `fill:${colour};stroke:${PAPER};stroke-width:${LINES_G.stroke.filled}` }, parent);
  } else {
    s('circle', { cx, cy, r: LINES_G.rMastered + LINES_G.haloGap, style: `fill:none;stroke:${colour};stroke-width:1.6;opacity:.45` }, parent);
    s('circle', { cx, cy, r: LINES_G.rMastered, style: `fill:${PAPER};stroke:${colour};stroke-width:${LINES_G.stroke.mastered}` }, parent);
    s('circle', { cx, cy, r: 4, style: `fill:${colour}` }, parent);
  }
}

function stationLabels(parent: Element, cx: number, y: number, level: LinesLevel, colour: string, label: string, linked: boolean, max: number): void {
  text(parent, fitText(label || '—', FONT_LABEL, max), {
    x: cx, y, 'text-anchor': 'middle', class: `cl-label${linked ? ' cl-label--link' : ''}`,
    style: `font:${FONT_LABEL};fill:${INK}`
  });
  text(parent, LEVEL_WORD[level], {
    x: cx, y: y + 16, 'text-anchor': 'middle', class: 'cl-level',
    style: `font:${level === 'mastered' ? 650 : 450} 11.5px Inter, ui-sans-serif, sans-serif;fill:${level === 'mastered' ? colour : MUTED}`
  });
}

function chip(parent: Element, x: number, cy: number, ic: InterchangeView, maxW: number, anchor: 'start' | 'middle'): void {
  const label = fitText(ic.target.text || 'Checkpoint', FONT_CHIP, maxW - 24);
  const w = Math.ceil(measureText(label, FONT_CHIP)) + 24;
  const left = anchor === 'start' ? x : x - w / 2;
  const g = linkOrGroup(parent, ic.target, `${ic.kind === 'lesson' ? 'Taught together' : 'Checkpoint'}: ${ic.target.text}`);
  g.classList.add('cl-chip');
  s('rect', { x: left, y: cy - LINES_G.chipH / 2, width: w, height: LINES_G.chipH, rx: LINES_G.chipH / 2,
    style: `fill:${PAPER};stroke:color-mix(in srgb, ${INK} 28%, transparent);stroke-width:1.2` }, g);
  text(g, label, { x: left + w / 2, y: cy + 4.2, 'text-anchor': 'middle', style: `font:${FONT_CHIP};fill:${INK}` });
}

function stationLabel(strand: StrandView, st: StrandView['stations'][number]): string {
  return `${strand.name}, week ${st.week}, ${LEVEL_WORD[st.level]}: ${st.target.text || 'untitled'}`;
}

function pathText(strand: StrandView): string {
  if (strand.firstWeek === null) return 'No stations yet';
  return strand.masteredWeek === null ? `I wk ${strand.firstWeek} · not mastered` : `I wk ${strand.firstWeek} → M wk ${strand.masteredWeek}`;
}

function wrapName(name: string, max: number): string[] {
  if (measureText(name, FONT_HEAD) <= max) return [name];
  const words = name.split(/\s+/);
  let first = '';
  for (const word of words) {
    const next = first ? `${first} ${word}` : word;
    if (measureText(next, FONT_HEAD) > max && first) break;
    first = next;
  }
  const rest = name.slice(first.length).trim();
  return [fitText(first, FONT_HEAD, max), ...(rest ? [fitText(rest, FONT_HEAD, max)] : [])];
}

/* ── Vertical: weeks run down, strands are columns (desktop) ───────── */

function drawVertical(model: LinesModel, width: number): SVGSVGElement {
  const L = verticalLayout(model, width);
  const svg = s('svg', { viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, class: 'cl-svg cl-svg--vertical' });
  const chips = chipsByWeek(model);
  const colMax = L.colStep - 12;
  const lastX = L.colX[L.colX.length - 1] ?? L.width / 2;

  model.strands.forEach((strand, i) => {
    const cx = L.colX[i]!;
    s('rect', { x: cx - 6, y: 8, width: 12, height: 12, rx: 3, style: `fill:${strand.colour}` }, svg);
    wrapName(strand.name, colMax).forEach((part, k) =>
      text(svg, part, { x: cx, y: 40 + k * 18, 'text-anchor': 'middle', style: `font:${FONT_HEAD};fill:${INK}` }));
    text(svg, fitText(pathText(strand), '400 12px Inter, ui-sans-serif, sans-serif', colMax), {
      x: cx, y: 80, 'text-anchor': 'middle', style: `font:400 12px Inter, ui-sans-serif, sans-serif;fill:${MUTED}` });
  });

  for (let w = 1; w <= model.weeks; w++) {
    const y = L.rowY[w]!;
    s('line', { x1: 8, x2: L.width - 8, y1: y, y2: y, style: `stroke:color-mix(in srgb, ${INK} 8%, transparent);stroke-dasharray:2 5` }, svg);
    const list = chips.get(w) ?? [];
    text(svg, `Wk ${w}`, { x: 8, y: list.length ? y - 8 : y + 4.5, class: 'cl-halo',
      style: `font:650 13px Inter, ui-sans-serif, sans-serif;fill:${MUTED};letter-spacing:.04em` });
    list.forEach((ic, k) => chip(svg, 8, y + 16 + k * (LINES_G.chipH + LINES_G.chipGap), ic, LINES_G.gutter - 16, 'start'));
  }
  text(svg, model.terminus.when, { x: 8, y: L.termY + 4.5, style: `font:650 13px Inter, ui-sans-serif, sans-serif;fill:${MUTED};letter-spacing:.04em` });

  model.strands.forEach((strand, i) => {
    const cx = L.colX[i]!;
    if (strand.firstWeek === null) {
      s('line', { x1: cx, x2: cx, y1: L.rowY[1]!, y2: L.termY, style: `stroke:${strand.colour};stroke-width:3;stroke-dasharray:2 8;stroke-linecap:round;opacity:.5` }, svg);
      return;
    }
    s('line', { x1: cx, x2: cx, y1: L.rowY[strand.firstWeek]!, y2: L.termY, style: `stroke:${strand.colour};stroke-width:${LINES_G.trackW};stroke-linecap:round` }, svg);
  });

  for (const ic of model.interchanges) {
    const y = L.rowY[ic.week]!;
    const x1 = L.colX[ic.from]!, x2 = L.colX[ic.to]!;
    const c = LINES_G.capsule;
    s('rect', { x: x1 - c, y: y - c, width: x2 - x1 + 2 * c, height: 2 * c, rx: c, class: 'cl-capsule',
      style: `fill:${PAPER};stroke:${DARK};stroke-width:2.5` }, svg);
  }

  const termL = (L.colX[0] ?? L.width / 2) - Math.min(48, L.colStep / 2 - 4);
  const termR = lastX + Math.min(48, L.colStep / 2 - 4);
  const term = linkOrGroup(svg, model.terminus, `Assessment: ${model.terminus.text}`);
  term.classList.add('cl-terminus');
  s('rect', { x: termL, y: L.termY - LINES_G.termH / 2, width: termR - termL, height: LINES_G.termH, rx: LINES_G.termH / 2, style: `fill:${DARK}` }, term);
  const termMax = termR - termL - 40;
  text(term, fitText(model.terminus.text.toUpperCase(), '700 13px Inter, ui-sans-serif, sans-serif', termMax), {
    x: (termL + termR) / 2, y: model.terminus.detail ? L.termY - 3 : L.termY + 4.5, 'text-anchor': 'middle',
    style: 'font:700 13px Inter, ui-sans-serif, sans-serif;fill:#fff;letter-spacing:.12em' });
  if (model.terminus.detail) {
    text(term, fitText(model.terminus.detail, '400 12.5px Inter, ui-sans-serif, sans-serif', termMax), {
      x: (termL + termR) / 2, y: L.termY + 15, 'text-anchor': 'middle',
      style: 'font:400 12.5px Inter, ui-sans-serif, sans-serif;fill:var(--on-dark-muted, rgba(255,255,255,.66))' });
  }

  model.strands.forEach((strand, i) => {
    const cx = L.colX[i]!;
    for (const st of strand.stations) {
      const y = L.rowY[st.week]!;
      const g = linkOrGroup(svg, st.target, stationLabel(strand, st));
      g.classList.add('cl-station');
      station(g, cx, y, st.level, strand.colour);
      stationLabels(g, cx, y + 33, st.level, strand.colour, st.target.text, Boolean(st.target.href), colMax);
    }
  });
  return svg;
}

/* ── Horizontal: weeks run across, strands are rows (phone) ────────── */

function drawHorizontal(model: LinesModel): { svg: SVGSVGElement; rowY: number[] } {
  const L = horizontalLayout(model);
  const svg = s('svg', { viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, class: 'cl-svg cl-svg--horizontal' });
  const chips = chipsByWeek(model);
  const firstRow = L.rowY[0] ?? 100;
  const lastRow = L.rowY[L.rowY.length - 1] ?? firstRow;
  const labelMax = LINES_G.hStep - 10;

  for (let w = 1; w <= model.weeks; w++) {
    const x = L.colX[w]!;
    text(svg, `Wk ${w}`, { x, y: 18, 'text-anchor': 'middle', style: `font:600 12.5px Inter, ui-sans-serif, sans-serif;fill:${MUTED};letter-spacing:.04em` });
    s('line', { x1: x, x2: x, y1: 28, y2: lastRow + 40, style: `stroke:color-mix(in srgb, ${INK} 7%, transparent);stroke-dasharray:2 5` }, svg);
    (chips.get(w) ?? []).forEach((ic, k) => chip(svg, x, 28 + LINES_G.chipH / 2 + k * (LINES_G.chipH + LINES_G.chipGap) + 4, ic, LINES_G.hStep - 6, 'middle'));
  }
  text(svg, model.terminus.when, { x: L.termX, y: 18, 'text-anchor': 'middle', style: `font:600 12.5px Inter, ui-sans-serif, sans-serif;fill:${MUTED};letter-spacing:.04em` });

  model.strands.forEach((strand, i) => {
    const y = L.rowY[i]!;
    if (strand.firstWeek === null) {
      s('line', { x1: L.colX[1]!, x2: L.termX, y1: y, y2: y, style: `stroke:${strand.colour};stroke-width:3;stroke-dasharray:2 8;stroke-linecap:round;opacity:.5` }, svg);
      return;
    }
    s('line', { x1: L.colX[strand.firstWeek]!, x2: L.termX, y1: y, y2: y, style: `stroke:${strand.colour};stroke-width:${LINES_G.trackW};stroke-linecap:round` }, svg);
  });

  for (const ic of model.interchanges) {
    const x = L.colX[ic.week]!;
    const y1 = L.rowY[ic.from]!, y2 = L.rowY[ic.to]!;
    const c = LINES_G.capsule;
    s('rect', { x: x - c, y: y1 - c, width: 2 * c, height: y2 - y1 + 2 * c, rx: c, class: 'cl-capsule',
      style: `fill:${PAPER};stroke:${DARK};stroke-width:2.5` }, svg);
  }

  const term = linkOrGroup(svg, model.terminus, `Assessment: ${model.terminus.text}`);
  term.classList.add('cl-terminus');
  const tTop = firstRow - 26, tBot = lastRow + 26;
  s('rect', { x: L.termX - LINES_G.hTermW / 2, y: tTop, width: LINES_G.hTermW, height: tBot - tTop, rx: LINES_G.hTermW / 2, style: `fill:${DARK}` }, term);
  const mid = (tTop + tBot) / 2;
  text(term, fitText(model.terminus.text.toUpperCase(), '700 12.5px Inter, ui-sans-serif, sans-serif', tBot - tTop - 30), {
    x: L.termX, y: mid, 'text-anchor': 'middle', transform: `rotate(-90 ${L.termX} ${mid}) translate(0 4.5)`,
    style: 'font:700 12.5px Inter, ui-sans-serif, sans-serif;fill:#fff;letter-spacing:.12em' });

  model.strands.forEach((strand, i) => {
    const y = L.rowY[i]!;
    for (const st of strand.stations) {
      const x = L.colX[st.week]!;
      const g = linkOrGroup(svg, st.target, stationLabel(strand, st));
      g.classList.add('cl-station');
      station(g, x, y, st.level, strand.colour);
      text(g, fitText(st.target.text || '—', FONT_LABEL, labelMax), {
        x, y: y - 24, 'text-anchor': 'middle', class: `cl-label cl-halo${st.target.href ? ' cl-label--link' : ''}`,
        style: `font:${FONT_LABEL};fill:${INK}` });
      text(g, LEVEL_WORD[st.level], {
        x, y: y + 32, 'text-anchor': 'middle', class: 'cl-level cl-halo',
        style: `font:${st.level === 'mastered' ? 650 : 450} 11.5px Inter, ui-sans-serif, sans-serif;fill:${st.level === 'mastered' ? strand.colour : MUTED}` });
    }
  });
  return { svg, rowY: L.rowY };
}

function horizontalFrame(model: LinesModel): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'cl-h';
  const { svg, rowY } = drawHorizontal(model);
  const names = document.createElement('div');
  names.className = 'cl-h__names';
  names.style.height = `${svg.getAttribute('height')}px`;
  model.strands.forEach((strand, i) => {
    const row = document.createElement('div');
    row.className = 'cl-h__name';
    row.style.top = `${rowY[i]}px`;
    row.style.setProperty('--cl-colour', strand.colour);
    const name = document.createElement('span');
    name.className = 'cl-h__strand';
    name.textContent = strand.name;
    const path = document.createElement('span');
    path.className = 'cl-h__path';
    path.textContent = pathText(strand);
    row.append(name, path);
    names.append(row);
  });
  const scroller = document.createElement('div');
  scroller.className = 'cl-h__scroll';
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label', 'Curriculum map, scroll sideways for later weeks');
  scroller.append(svg);
  frame.append(names, scroller);
  return frame;
}

/* ── Block ─────────────────────────────────────────────────────────── */

const LEGEND: Array<[string, string]> = [
  ['introduced', 'Introduced'],
  ['reinforced', 'Reinforced'],
  ['mastered', 'Mastered'],
  ['capsule', 'Interchange · taught together'],
  ['terminus', 'Terminus · assessed']
];

function legend(): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'cl-legend';
  for (const [key, label] of LEGEND) {
    const item = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = `cl-legend__mark cl-legend__mark--${key}`;
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, document.createTextNode(label));
    list.append(item);
  }
  return list;
}

export function renderCurriculumLines(block: CurriculumLinesBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = document.createElement('section');
  root.className = 'block block-curriculum-lines';
  root.dataset.blockId = block.id;
  const title = block.content.title?.trim();
  if (title) {
    const h = document.createElement('h3');
    h.className = 'cl-title';
    h.textContent = title;
    root.append(h);
  }
  const model = buildLinesModel(block.content, ctx.unitLessons);
  const stage = document.createElement('div');
  stage.className = 'cl-stage';
  root.append(stage, legend());

  let drawnFor = '';
  const draw = (width: number) => {
    const orientation = chooseOrientation(width, model.strands.length);
    const key = orientation === 'vertical' ? `v${Math.round(width)}` : 'h';
    if (key === drawnFor) return;
    drawnFor = key;
    stage.dataset.orientation = orientation;
    stage.replaceChildren(orientation === 'vertical' ? drawVertical(model, Math.floor(width)) : horizontalFrame(model));
  };

  if (mode === 'print' || typeof ResizeObserver === 'undefined') {
    draw(880);
    return root;
  }
  let wasConnected = false;
  const observer = new ResizeObserver((entries) => {
    if (!stage.isConnected) {
      if (wasConnected) observer.disconnect();
      return;
    }
    wasConnected = true;
    const width = entries[0]?.contentRect.width ?? 0;
    if (width > 0) draw(width);
  });
  observer.observe(stage);
  return root;
}
