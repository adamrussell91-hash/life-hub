import { navigate } from '@/app/router';
import { stripAppBase } from '@/app/base-path';
import {
  chooseNetworkOrientation,
  layoutNetwork,
  verticalWidth,
  type LabelView,
  type MarkerView,
  type NetInput,
  type NetLayout,
  type NetTarget,
  type Orientation,
  type PathView,
  type Pt
} from './layout';
import './network.css';

const NS = 'http://www.w3.org/2000/svg';
const INK = 'var(--navy, #17375e)';
const MUTED = 'var(--muted, #6b7788)';
const PAPER = 'var(--paper, #fbf8f2)';
const DARK = 'var(--marine, #142b51)';
const FONT = 'Inter, ui-sans-serif, sans-serif';
const FONT_LABEL = `500 13px ${FONT}`;
const FONT_UNIT = `650 14px ${FONT}`;
const FONT_SMALL = `500 12px ${FONT}`;
const FONT_BADGE = `700 10px ${FONT}`;

/* Same text fitting as the Tasks Lines chart kit. */
const measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

export function measureText(value: string, font: string): number {
  if (!measureCtx) return value.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(value).width;
}

export function fitText(value: string, font: string, max: number): string {
  if (measureText(value, font) <= max) return value;
  let next = value;
  while (next.length > 1 && measureText(`${next}…`, font) > max) next = next.slice(0, -1);
  return `${next}…`;
}

function wrapTwo(value: string, font: string, max: number): string[] {
  if (measureText(value, font) <= max) return [value];
  const words = value.split(/\s+/);
  let first = '';
  for (const word of words) {
    const next = first ? `${first} ${word}` : word;
    if (measureText(next, font) > max && first) break;
    first = next;
  }
  const rest = value.slice(first.length).trim();
  return [fitText(first, font, max), ...(rest ? [fitText(rest, font, max)] : [])];
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

function linkOrGroup(parent: Element, target: NetTarget, label: string): SVGElement {
  if (!target.href) {
    const g = s('g', {}, parent);
    s('title', {}, g).textContent = label;
    return g;
  }
  const a = s('a', { href: target.href, class: 'net-link', 'aria-label': label }, parent);
  a.addEventListener('click', (e) => followLink(e as MouseEvent, target.href!));
  return a;
}

function pathD(points: Pt[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function drawPath(parent: Element, path: PathView): void {
  const d = pathD(path.points);
  const base = 'fill:none;stroke-linecap:round;stroke-linejoin:round';
  const attrs = { d, 'data-line': path.lineId, class: `net-path net-path--${path.mode}` };
  if (path.mode === 'metro') {
    s('path', { ...attrs, style: `${base};stroke:${path.colour};stroke-width:9` }, parent);
    s('path', { d, style: `${base};stroke:${PAPER};stroke-width:3.6` }, parent);
  } else if (path.mode === 'train') {
    s('path', { ...attrs, style: `${base};stroke:${path.colour};stroke-width:7` }, parent);
  } else {
    const dash = path.style === 'spur' ? ';stroke-dasharray:5 5' : '';
    s('path', { ...attrs, style: `${base};stroke:${path.colour};stroke-width:${path.style === 'main' ? 3.6 : 3};opacity:.88${dash}` }, parent);
  }
}

const LEVEL_WORD = { introduced: 'introduced', reinforced: 'reinforced', mastered: 'mastered' } as const;

function marker(parent: Element, m: MarkerView): void {
  const { x: cx, y: cy, colour } = m;
  if (m.level === 'introduced') {
    s('circle', { cx, cy, r: 6, style: `fill:${PAPER};stroke:${colour};stroke-width:3` }, parent);
  } else if (m.level === 'reinforced') {
    s('circle', { cx, cy, r: 6, style: `fill:${colour};stroke:${PAPER};stroke-width:1.5` }, parent);
  } else {
    s('circle', { cx, cy, r: 10, style: `fill:none;stroke:${colour};stroke-width:1.4;opacity:.5` }, parent);
    s('circle', { cx, cy, r: 7, style: `fill:${PAPER};stroke:${colour};stroke-width:3.4` }, parent);
    s('circle', { cx, cy, r: 2.6, style: `fill:${colour}` }, parent);
  }
}

function label(parent: Element, view: LabelView, font: string, fill: string, extraClass = ''): void {
  if (!view.text) return;
  const parts = view.wrap ? wrapTwo(view.text, font, view.maxW) : [fitText(view.text, font, view.maxW)];
  parts.forEach((part, i) => {
    text(parent, part, {
      x: view.x, y: view.down ? view.y + i * 15 : view.y - (parts.length - 1 - i) * 15, 'text-anchor': view.anchor,
      class: `net-halo ${extraClass}`.trim(), style: `font:${font};fill:${fill}`
    });
  });
}

function badge(parent: Element, x: number, y: number, short: string, name: string, colour: string, mode: string, anchor: 'middle' | 'end'): void {
  const g = s('g', { class: 'net-badge' }, parent);
  s('title', {}, g).textContent = name;
  const w = Math.max(22, Math.ceil(measureText(short, FONT_BADGE)) + 8);
  const left = anchor === 'middle' ? x - w / 2 : x - w;
  const style = mode === 'metro'
    ? `fill:${PAPER};stroke:${colour};stroke-width:2.4`
    : mode === 'light_rail' ? `fill:${colour};opacity:.85` : `fill:${colour}`;
  s('rect', { x: left, y: y - 9, width: w, height: 18, rx: mode === 'light_rail' ? 9 : 4, style }, g);
  text(g, short, { x: left + w / 2, y: y + 3.8, 'text-anchor': 'middle', style: `font:${FONT_BADGE};fill:${mode === 'metro' ? colour : '#fff'};letter-spacing:.04em` });
}

export type DrawOptions = {
  /** Editors: drag a stop, gate or unit; the delta is across/along the lines. */
  onNudge?: (key: string, across: number, along: number) => void;
  /** Stations (lessons or units) are draggable by row id. */
  nudgeRows?: boolean;
  label?: string;
};

export function drawNetwork(L: NetLayout, options: DrawOptions = {}): SVGSVGElement {
  const vertical = L.orientation === 'vertical';
  const svg = s('svg', {
    viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height,
    class: `net-svg net-svg--${L.orientation} net-svg--${L.rowKind}`, role: 'img',
    'aria-label': options.label ?? 'Curriculum network'
  });

  for (const band of L.bands) {
    if (band.shade) s('rect', { x: band.x, y: band.y, width: band.w, height: band.h, class: 'net-band' }, svg);
    text(svg, band.label, { x: band.labelX, y: band.labelY, class: 'net-band__label', style: `font:650 12px ${FONT};fill:${MUTED};letter-spacing:.04em` });
  }
  for (const path of L.paths) drawPath(svg, path);

  const unit = L.rowKind === 'unit';
  for (const pill of L.pills) {
    const g = linkOrGroup(svg, pill.target, `${pill.target.text}${pill.markers.length ? `: ${pill.markers.map((m) => LEVEL_WORD[m.level]).join(', ')}` : ''}`);
    g.classList.add('net-station');
    if (options.onNudge && options.nudgeRows) g.dataset.nudgeKey = pill.rowId;
    const r = Math.min(14, Math.min(pill.w, pill.h) / 2);
    s('rect', { x: pill.x, y: pill.y, width: pill.w, height: pill.h, rx: r, class: 'net-pill',
      style: unit
        ? `fill:${PAPER};stroke:${DARK};stroke-width:2.4`
        : `fill:${PAPER};stroke:color-mix(in srgb, ${INK} 40%, transparent);stroke-width:1.6` }, g);
    for (const m of pill.markers) marker(g, m);
    label(g, pill.label, unit ? FONT_UNIT : FONT_LABEL, INK, pill.target.href ? 'net-label--link' : '');
  }

  for (const gate of L.gates) {
    const g = linkOrGroup(svg, gate.target, `Gate: ${gate.target.text}`);
    g.classList.add('net-gate');
    if (options.onNudge) g.dataset.nudgeKey = gate.id;
    s('rect', { x: gate.x, y: gate.y, width: gate.w, height: gate.h, rx: Math.min(gate.w, gate.h) / 2,
      style: `fill:${PAPER};stroke:${DARK};stroke-width:3.2` }, g);
    label(g, gate.label, `650 12.5px ${FONT}`, DARK, gate.target.href ? 'net-label--link' : '');
  }

  const t = L.terminus;
  const term = linkOrGroup(svg, t.target, `Terminus: ${t.target.text}`);
  term.classList.add('net-terminus');
  s('rect', { x: t.x, y: t.y, width: t.w, height: t.h, rx: Math.min(t.w, t.h) / 2, style: `fill:${DARK}` }, term);
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  const long = vertical ? t.w : t.h;
  const titleFont = `700 12.5px ${FONT}`;
  const title = fitText(t.target.text.toUpperCase(), titleFont, long - 30);
  if (vertical) {
    text(term, title, { x: cx, y: t.detail ? cy - 2 : cy + 4.5, 'text-anchor': 'middle', style: `font:${titleFont};fill:#fff;letter-spacing:.12em` });
    if (t.detail) text(term, fitText(t.detail, `400 12px ${FONT}`, long - 30), { x: cx, y: cy + 14, 'text-anchor': 'middle', style: `font:400 12px ${FONT};fill:var(--on-dark-muted, rgba(255,255,255,.7))` });
  } else {
    text(term, title, { x: cx, y: cy, 'text-anchor': 'middle', transform: `rotate(-90 ${cx} ${cy}) translate(0 4.5)`, style: `font:${titleFont};fill:#fff;letter-spacing:.12em` });
  }

  for (const dot of L.dots) {
    const g = linkOrGroup(svg, dot.target, `${dot.kind === 'extension' ? 'Extension' : dot.kind === 'support' ? 'Support' : 'Stop'}: ${dot.target.text || 'untitled'}`);
    g.classList.add('net-dot', `net-dot--${dot.kind}`);
    if (options.onNudge) g.dataset.nudgeKey = dot.id;
    s('circle', { cx: dot.x, cy: dot.y, r: 5.5,
      style: dot.kind === 'support'
        ? `fill:${dot.colour};stroke:${PAPER};stroke-width:1.5`
        : `fill:${PAPER};stroke:${dot.colour};stroke-width:2.6${dot.kind === 'extension' ? ';stroke-dasharray:3 2' : ''}` }, g);
    label(g, dot.label, FONT_SMALL, INK, dot.target.href ? 'net-label--link' : '');
  }

  for (const h of L.header) badge(svg, h.x, h.y, h.short, h.name, h.colour, h.mode, vertical ? 'middle' : 'end');

  if (L.now) {
    const g = s('g', { class: 'net-now' }, svg);
    s('circle', { cx: L.now.x, cy: L.now.y, r: 11, class: 'net-now__pulse', style: 'fill:var(--wave, #376fb7);opacity:.25' }, g);
    s('circle', { cx: L.now.x, cy: L.now.y, r: 6.5, style: `fill:var(--wave, #376fb7);stroke:${PAPER};stroke-width:2.5` }, g);
    label(g, L.now.label, `650 12px ${FONT}`, 'var(--wave, #376fb7)');
  }

  if (options.onNudge) enableDrag(svg, L.orientation, options.onNudge);
  return svg;
}

/** Pointer drag on anything with data-nudge-key. A drag swallows the click that follows it. */
function enableDrag(svg: SVGSVGElement, orientation: Orientation, onNudge: NonNullable<DrawOptions['onNudge']>): void {
  svg.classList.add('net-svg--editable');
  let drag: { el: SVGElement; key: string; x: number; y: number; dx: number; dy: number; scale: number; id: number } | null = null;
  let swallow = false;
  // Stations and stops are links: stop the browser starting its own link drag,
  // which cancels the pointer and made dragging do nothing.
  svg.addEventListener('dragstart', (event) => event.preventDefault());
  svg.addEventListener('pointerdown', (event) => {
    const el = (event.target as Element).closest<SVGElement>('[data-nudge-key]');
    if (!el || event.button !== 0) return;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const scale = rect.width ? Number(svg.getAttribute('width')) / rect.width : 1;
    drag = { el, key: el.dataset.nudgeKey!, x: event.clientX, y: event.clientY, dx: 0, dy: 0, scale, id: event.pointerId };
    svg.setPointerCapture?.(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.dx = (event.clientX - drag.x) * drag.scale;
    drag.dy = (event.clientY - drag.y) * drag.scale;
    if (Math.hypot(drag.dx, drag.dy) > 3) {
      event.preventDefault();
      drag.el.setAttribute('transform', `translate(${drag.dx} ${drag.dy})`);
      drag.el.classList.add('net-dragging');
    }
  });
  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { dx, dy, key, el } = drag;
    drag = null;
    el.classList.remove('net-dragging');
    if (Math.hypot(dx, dy) <= 3) return;
    swallow = true;
    setTimeout(() => { swallow = false; }, 0);
    const across = orientation === 'vertical' ? dx : dy;
    const along = orientation === 'vertical' ? dy : dx;
    onNudge(key, Math.round(across), Math.round(along));
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', (event) => {
    if (drag?.el) { drag.el.removeAttribute('transform'); drag.el.classList.remove('net-dragging'); }
    if (drag && event.pointerId === drag.id) drag = null;
  });
  svg.addEventListener('click', (event) => {
    if (!swallow) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

/**
 * A map that picks its orientation from the room it has: vertical when every
 * lane fits, otherwise horizontal, swiped sideways inside its own box.
 */
/** Station names measured in the font the map draws them in. */
export function measureStations(input: NetInput): (value: string) => number {
  const font = input.rowKind === 'unit' ? FONT_UNIT : FONT_LABEL;
  return (value) => measureText(value, font);
}

export function mountNetworkStage(input: NetInput, options: DrawOptions & { print?: boolean } = {}): HTMLElement {
  const stage = document.createElement('div');
  stage.className = 'net-stage';
  let drawn = '';
  const measure = measureStations(input);
  const draw = (width: number) => {
    const orientation = chooseNetworkOrientation(width, input, { measure });
    // A vertical map is centred in its width, so it redraws as the width changes.
    const key = orientation === 'vertical' ? `v${Math.round(width / 24)}` : 'h';
    if (key === drawn) return;
    drawn = key;
    stage.dataset.orientation = orientation;
    const svg = drawNetwork(layoutNetwork(input, orientation, { width: Math.floor(width), measure }), options);
    if (orientation === 'vertical') {
      stage.replaceChildren(svg);
      return;
    }
    const scroller = document.createElement('div');
    scroller.className = 'net-scroll';
    scroller.tabIndex = 0;
    scroller.setAttribute('aria-label', `${options.label ?? 'Curriculum network'}, scroll sideways for more`);
    scroller.append(svg);
    stage.replaceChildren(scroller);
  };
  if (options.print || typeof ResizeObserver === 'undefined') {
    draw(Math.max(verticalWidth(input, { measure }), 900));
    return stage;
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
  return stage;
}

/** Legend for both zoom levels. */
export function networkLegend(kind: 'unit' | 'year'): HTMLElement {
  const items: Array<[string, string]> = [
    ['train', 'Train · syllabus grouping'],
    ['metro', 'Metro · concept, runs underneath'],
    ['light_rail', 'Light rail · skill'],
    ['introduced', 'Introduced'],
    ['reinforced', 'Reinforced'],
    ['mastered', 'Mastered'],
    ...(kind === 'unit'
      ? ([['extension', 'Extension (optional)'], ['support', 'Support loop'], ['gate', 'Gate · diagnostic or quiz']] as Array<[string, string]>)
      : ([['now', 'Class now']] as Array<[string, string]>)),
    ['terminus', kind === 'unit' ? 'Terminus · assessed' : 'HSC']
  ];
  const list = document.createElement('ul');
  list.className = 'net-legend';
  for (const [key, text] of items) {
    const item = document.createElement('li');
    const mark = document.createElement('span');
    mark.className = `net-legend__mark net-legend__mark--${key}`;
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, document.createTextNode(text));
    list.append(item);
  }
  return list;
}
