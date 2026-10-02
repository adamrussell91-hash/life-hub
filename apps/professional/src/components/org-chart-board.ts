/**
 * The org chart drawing, shared by the Edit chart editor and the
 * organisation page. One renderer, so what you arrange in the editor is
 * exactly what the page shows: same box positions, same faculty / team
 * containers, same line styles. The editor adds dragging and selection on
 * top; the page draws it read-only.
 */

import type { OrgStructurePayload } from '@/api/org-structure';
import { el } from '@/components/org-ui';
import {
  BOARD_OFFSET,
  BOX_H,
  BOX_W,
  boardSize,
  boxLabel,
  buildChartModel,
  describeLine,
  linePath,
  resolveLayout,
  unitFrames,
  type ChartBox,
  type ChartLine,
  type ChartModel,
  type ChartPoint,
  type UnitFrame
} from '@/domain/org-chart-model';

const SVG_NS = 'http://www.w3.org/2000/svg';
let boardCount = 0;

export interface BoardDom {
  /** Sized to the scaled board; goes inside a scrolling viewport. */
  sizer: HTMLElement;
  board: HTMLElement;
  /** Origin of layout coordinates (shifted by BOARD_OFFSET inside the board). */
  inner: HTMLElement;
  unitLayer: HTMLElement;
  svg: SVGSVGElement;
  boxLayer: HTMLElement;
  arrowId: string;
}

export function createBoardDom(): BoardDom {
  boardCount += 1;
  const sizer = el('div', 'org-chart__sizer');
  const board = el('div', 'org-chart__board');
  const inner = el('div', 'org-chart__inner');
  inner.style.left = `${BOARD_OFFSET.x}px`;
  inner.style.top = `${BOARD_OFFSET.y}px`;
  const unitLayer = el('div', 'org-chart__units');
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'org-chart__lines');
  const boxLayer = el('div', 'org-chart__boxes');
  inner.append(unitLayer, svg, boxLayer);
  board.append(inner);
  sizer.append(board);
  return { sizer, board, inner, unitLayer, svg, boxLayer, arrowId: `org-chart-arrow-${boardCount}` };
}

/** Size the board for the boxes and containers, at a zoom level. */
export function sizeBoard(
  dom: BoardDom,
  positions: Record<string, ChartPoint>,
  frames: UnitFrame[],
  scale: number,
  pad?: number
): { width: number; height: number } {
  const { width, height } = boardSize(positions, frames, pad);
  dom.board.style.width = `${width}px`;
  dom.board.style.height = `${height}px`;
  dom.board.style.transform = `scale(${scale})`;
  dom.sizer.style.width = `${Math.ceil(width * scale)}px`;
  dom.sizer.style.height = `${Math.ceil(height * scale)}px`;
  dom.svg.setAttribute('width', String(width));
  dom.svg.setAttribute('height', String(height));
  return { width, height };
}

/** Zoom that fits the whole board into a box this wide (never above 100%). */
export function fitScale(
  positions: Record<string, ChartPoint>,
  frames: UnitFrame[],
  availableWidth: number,
  pad?: number
): number {
  const { width } = boardSize(positions, frames, pad);
  if (!availableWidth || width <= availableWidth) return 1;
  return Math.max(0.4, Math.floor((availableWidth / width) * 100) / 100);
}

/** Layout coordinates for a pointer position. */
export function boardPoint(dom: BoardDom, scale: number, ev: { clientX: number; clientY: number }): ChartPoint {
  const rect = dom.inner.getBoundingClientRect();
  return { x: (ev.clientX - rect.left) / scale, y: (ev.clientY - rect.top) / scale };
}

export interface PaintState {
  model: ChartModel;
  positions: Record<string, ChartPoint>;
  frames: UnitFrame[];
  readOnly: boolean;
  selectedBoxes?: Set<string>;
  selectedLine?: string | null;
  selectedUnit?: string | null;
  /** While dragging: the container the box would join if dropped now. */
  dropUnit?: string | null;
  /** "Your lines": boxes and line ids to emphasise; `self` are the boxes you hold. */
  mine?: { boxes: Set<string>; lines: Set<string>; self?: Set<string> } | null;
  /** Read-only: where a box links to (a person's page), or null. */
  boxHref?: (box: ChartBox) => string | null;
  /** Read-only: what a box without a link does when activated (e.g. open the editor). */
  onActivateBox?: (box: ChartBox) => void;
}

export function paintFrames(dom: BoardDom, state: PaintState): Map<string, HTMLElement> {
  dom.unitLayer.replaceChildren();
  const labels = new Map<string, HTMLElement>();
  for (const frame of state.frames) {
    const node = el('div', `org-chart__unit${frame.empty ? ' is-empty' : ''}`);
    node.dataset.unit = frame.ref;
    if (state.selectedUnit === frame.ref) node.classList.add('is-selected');
    if (state.dropUnit === frame.ref) node.classList.add('is-target');
    node.style.left = `${frame.x}px`;
    node.style.top = `${frame.y}px`;
    node.style.width = `${frame.width}px`;
    node.style.height = `${frame.height}px`;
    const label = el(state.readOnly ? 'span' : 'button', 'org-chart__unit-label', frame.name);
    if (!state.readOnly) {
      (label as HTMLButtonElement).type = 'button';
      label.setAttribute('aria-label', `${frame.name}. Drag to move, or press Enter to edit.`);
      label.title = 'Drag to move the whole group · click to rename or remove';
    }
    node.append(label);
    if (frame.empty) {
      node.append(
        el(
          'span',
          'org-chart__unit-empty',
          state.readOnly ? 'No one here yet' : 'Drag a box in here to add them'
        )
      );
    }
    if (frame.memberNames.length) {
      const names = el('span', 'org-chart__unit-members', `Also: ${frame.memberNames.join(', ')}`);
      names.title = 'In this group without a box of their own on the chart';
      node.append(names);
    }
    labels.set(frame.ref, label);
    dom.unitLayer.append(node);
  }
  return labels;
}

export function paintLines(dom: BoardDom, state: PaintState): Map<string, SVGPathElement> {
  const { svg, arrowId } = dom;
  svg.replaceChildren();
  const defs = document.createElementNS(SVG_NS, 'defs');
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', arrowId);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('orient', 'auto-start-reverse');
  const tip = document.createElementNS(SVG_NS, 'path');
  tip.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  tip.setAttribute('class', 'org-chart__arrow');
  marker.append(tip);
  defs.append(marker);
  svg.append(defs);

  const hits = new Map<string, SVGPathElement>();
  for (const line of state.model.lines) {
    const from = state.positions[line.source];
    const to = state.positions[line.target];
    if (!from || !to) continue;
    const d = linePath(line.kind, from, to);
    const group = document.createElementNS(SVG_NS, 'g');
    const classes = ['org-chart__line', `org-chart__line--${line.kind}`];
    if (state.selectedLine === line.id) classes.push('is-selected');
    if (state.mine?.lines.has(line.id)) classes.push('is-mine');
    group.setAttribute('class', classes.join(' '));
    const visible = document.createElementNS(SVG_NS, 'path');
    visible.setAttribute('d', d);
    visible.setAttribute('class', 'org-chart__line-stroke');
    if (line.kind === 'reports_to') visible.setAttribute('marker-start', `url(#${arrowId})`);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = describeLine(line, state.model.boxes);
    group.append(title, visible);
    if (!state.readOnly) {
      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'org-chart__line-hit');
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', describeLine(line, state.model.boxes));
      group.append(hit);
      hits.set(line.id, hit);
    }
    svg.append(group);
  }
  return hits;
}

export interface BoxNode {
  node: HTMLElement;
  handle: HTMLElement | null;
}

export function paintBoxes(dom: BoardDom, state: PaintState): Map<string, BoxNode> {
  dom.boxLayer.replaceChildren();
  const out = new Map<string, BoxNode>();
  for (const box of state.model.boxes) {
    const p = state.positions[box.ref];
    if (!p) continue;
    const href = state.readOnly ? state.boxHref?.(box) ?? null : null;
    const tag = state.readOnly ? (href ? 'a' : state.onActivateBox ? 'button' : 'div') : 'div';
    const node = el(tag as 'div', 'org-chart__box');
    if (href) (node as unknown as HTMLAnchorElement).href = href;
    if (tag === 'button') (node as unknown as HTMLButtonElement).type = 'button';
    node.dataset.box = box.ref;
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
    node.style.width = `${BOX_W}px`;
    node.style.height = `${BOX_H}px`;
    node.title = [box.holderName, box.title, box.unitName].filter(Boolean).join(' · ');
    if (!box.holderRef) node.classList.add('is-vacant');
    if (state.selectedBoxes?.has(box.ref)) node.classList.add('is-selected');
    if (state.mine?.boxes.has(box.ref)) node.classList.add('is-mine');
    if (state.mine?.self?.has(box.ref)) node.classList.add('is-self');
    if (state.readOnly) {
      node.classList.add('is-static');
      node.setAttribute(
        'aria-label',
        box.holderRef ? `${boxLabel(box)}. Open profile.` : `${box.title}, vacant. Open the chart editor to fill it.`
      );
      if (tag === 'button') node.addEventListener('click', () => state.onActivateBox?.(box));
    } else {
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `${boxLabel(box)}. Press Enter to edit.`);
    }
    node.append(
      el(
      'span',
      'org-chart__box-name',
      state.mine?.self?.has(box.ref) ? `${box.holderName} · You` : box.holderName ?? 'Vacant'
    ),
      el('span', 'org-chart__box-title', box.title)
    );
    let handle: HTMLElement | null = null;
    if (!state.readOnly) {
      handle = el('span', 'org-chart__handle');
      handle.title = 'Drag onto another box to connect';
      handle.setAttribute('aria-hidden', 'true');
      node.append(handle);
    }
    dom.boxLayer.append(node);
    out.set(box.ref, { node, handle });
  }
  return out;
}

/**
 * "Your lines": the boxes you hold, everyone above you on the reporting
 * chain, and every line that touches one of your boxes.
 */
export function yourLines(
  model: ChartModel,
  personRef: string | null
): { boxes: Set<string>; lines: Set<string>; self: Set<string> } | null {
  if (!personRef) return null;
  const own = model.boxes.filter((b) => b.holderRef === personRef).map((b) => b.ref);
  if (!own.length) return null;
  const boxes = new Set<string>(own);
  const lines = new Set<string>();
  const bossLine = new Map<string, ChartLine>();
  for (const line of model.lines) {
    if (line.kind === 'reports_to' && !bossLine.has(line.source)) bossLine.set(line.source, line);
    if (own.includes(line.source) || own.includes(line.target)) {
      lines.add(line.id);
      boxes.add(line.source);
      boxes.add(line.target);
    }
  }
  for (const start of own) {
    let cur = bossLine.get(start);
    const seen = new Set<string>([start]);
    while (cur && !seen.has(cur.target)) {
      lines.add(cur.id);
      boxes.add(cur.target);
      seen.add(cur.target);
      cur = bossLine.get(cur.target);
    }
  }
  return { boxes, lines, self: new Set(own) };
}

/** Plain-words key for the three line styles. */
export function lineLegend(): HTMLElement {
  const legend = el('div', 'org-chart__key');
  legend.setAttribute('aria-label', 'Key');
  for (const [kind, label] of [
    ['reports_to', 'Reports to (arrow points to the manager)'],
    ['works_with', 'Works with'],
    ['shares_authority_with', 'Shares authority']
  ] as const) {
    const row = el('span', `org-chart__key-row org-chart__legend-row--${kind}`);
    row.append(el('span', 'org-chart__legend-swatch'), el('span', undefined, label));
    legend.append(row);
  }
  const unit = el('span', 'org-chart__key-row');
  unit.append(el('span', 'org-chart__key-unit'), el('span', undefined, 'Faculty / team'));
  legend.append(unit);
  return legend;
}


export interface StaticChart {
  /** Scrolling viewport holding the board. */
  viewport: HTMLElement;
  dom: BoardDom;
  model: ChartModel;
  positions: Record<string, ChartPoint>;
  frames: UnitFrame[];
  /** Zoom to a level and resize; returns the board size. */
  zoom: (scale: number) => void;
  /** The zoom that fits the viewport's current width. */
  fit: () => number;
}

/**
 * The chart exactly as Edit chart lays it out (saved positions, containers,
 * line styles), drawn read-only. Used by the organisation page and Compare.
 */
export function staticChart(
  structure: OrgStructurePayload,
  peopleNames: Record<string, string>,
  options: {
    personRef?: string | null;
    highlight?: string | null;
    boxHref?: (box: ChartBox) => string | null;
    onActivateBox?: (box: ChartBox) => void;
  } = {}
): StaticChart {
  const model = buildChartModel(structure, peopleNames);
  const saved = structure.layout ?? {};
  const positions = resolveLayout(model.boxes, model.lines, saved);
  const frames = unitFrames(model.units, model.boxes, positions, saved);
  const highlight = options.highlight ?? 'your_lines';
  const mine =
    highlight === 'your_lines'
      ? yourLines(model, options.personRef ?? null)
      : highlight.startsWith('line:')
        ? {
            boxes: new Set(model.boxes.filter((b) => b.unitRef === highlight.slice(5)).map((b) => b.ref)),
            lines: new Set<string>()
          }
        : null;
  const viewport = el('div', 'orgs-board');
  const dom = createBoardDom();
  viewport.append(dom.sizer);
  const state: PaintState = {
    model,
    positions,
    frames,
    readOnly: true,
    mine,
    boxHref:
      options.boxHref ??
      ((box) => (box.holderRef ? `#/people/${encodeURIComponent(box.holderRef.split(':')[2] ?? '')}` : null)),
    onActivateBox: options.onActivateBox
  };
  paintFrames(dom, state);
  paintLines(dom, state);
  paintBoxes(dom, state);
  if (!model.boxes.length && !model.units.length) {
    viewport.append(el('p', 'people-pane__empty', 'No boxes on the chart yet.'));
  }
  const PAD = 32;
  return {
    viewport,
    dom,
    model,
    positions,
    frames,
    zoom: (scale) => void sizeBoard(dom, positions, frames, scale, PAD),
    fit: () => fitScale(positions, frames, viewport.clientWidth - 4, PAD)
  };
}

/**
 * Outline (phone default): the same chart as a list — each faculty / team
 * with the boxes in it, then everyone not in a group. Each row says who
 * they report to, so it reads like the chart.
 */
export function chartOutline(model: ChartModel, personRef: string | null): HTMLElement {
  const root = el('div', 'orgs-outline');
  const bossOf = new Map<string, string>();
  for (const line of model.lines) {
    if (line.kind === 'reports_to' && !bossOf.has(line.source)) bossOf.set(line.source, line.target);
  }
  const byRef = new Map(model.boxes.map((b) => [b.ref, b]));
  const row = (box: ChartBox): HTMLElement => {
    const r = el('div', 'orgs-outline__member');
    const you = Boolean(personRef && box.holderRef === personRef);
    const label = `${you ? 'You' : box.holderName ?? 'Vacant'} · ${box.title}`;
    if (box.holderRef) {
      const a = document.createElement('a');
      a.href = `#/people/${encodeURIComponent(box.holderRef.split(':')[2] ?? '')}`;
      a.textContent = label;
      r.append(a);
    } else {
      r.append(el('span', undefined, label));
    }
    const boss = byRef.get(bossOf.get(box.ref) ?? '');
    if (boss) r.append(el('span', 'orgs-outline__also', `reports to ${boss.holderName ?? boss.title}`));
    return r;
  };
  const group = (name: string, boxes: ChartBox[], extra: string[] = []): void => {
    const block = el('div', 'orgs-outline__unit');
    block.append(el('div', 'orgs-outline__unit-name', name));
    for (const box of boxes) block.append(row(box));
    if (extra.length) block.append(el('div', 'orgs-outline__member', `Also: ${extra.join(', ')}`));
    if (!boxes.length && !extra.length) block.append(el('div', 'orgs-outline__also', 'No one here yet'));
    root.append(block);
  };
  for (const unit of model.units) {
    group(
      unit.name,
      model.boxes.filter((b) => b.unitRef === unit.ref),
      unit.memberNames
    );
  }
  const loose = model.boxes.filter((b) => !b.unitRef || !model.units.some((u) => u.ref === b.unitRef));
  if (loose.length) group(model.units.length ? 'Not in a group' : 'Roles', loose);
  if (!model.boxes.length && !model.units.length) {
    root.append(el('p', 'people-pane__empty', 'No chart yet. Use “Draw the chart” to add people and connect them.'));
  }
  return root;
}
