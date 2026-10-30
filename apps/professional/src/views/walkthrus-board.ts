import { FIGURE_SVGS } from '../../../../packages/walkthrus/glyphs';
import { CATALOGUE, SERIES, techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';
import { SETS } from '../../../../packages/walkthrus/sets.mjs';
import { checkOneActive, isLiveWalkthruGoal, normalizeWalkthru, pieceFor } from '../../../../packages/walkthrus/goal.mjs';
import { countsAsRep, hasLapsed } from '../../../../packages/walkthrus/reps.mjs';
import { ARROW_TYPES, MAX_LABEL } from '../../../../packages/walkthrus/arrows.mjs';
import { boardLayout, clusterFrame, type BoardEntry, type BoardLayout, type BoardSeries, type BoardTile } from '../../../../packages/walkthrus/board/layout';
import { routeArrows, type ArrowType, type BoardArrow, type RoutedArrow } from '../../../../packages/walkthrus/board/route';
import { labelLevel, type LabelLevel } from '../../../../packages/walkthrus/board/labels';
import { directionBetween } from '../../../../packages/walkthrus/board/hex';
import { createGlyphSet } from '../../design-kit/js/glyph-set.js';
import { positionHubFloating } from '../../design-kit/js/hub-floating.js';
import {
  animateTo, assignCamera, cameraKey, createCamera, fitFrameCamera, focusPoint, panBy, retainCentre, tickCamera, wheelZoom, zoomAt,
  type Camera, type CameraAnim
} from '../../design-kit/js/board-camera.js';
import { prefersReducedMotion } from '../../design-kit/js/hub-motion.js';
import {
  createWalkthruGoal, dismissSuggestion, loadBoardArrows, loadSuggestions, loadWalkthruGoals, loadWalkthruReps, loadWalkthruText, makeArrowId, saveBoardArrows,
  type DismissKind, type WalkthruGoal, type WalkthruRep, type WalkthruSuggestion, type WalkthruText
} from '@/api/walkthrus';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { renderPanel, type PanelModel } from '@/views/walkthrus-panel';

const NS = 'http://www.w3.org/2000/svg';
const FALLBACK_VIEWPORT = { w: 1000, h: 640 };
const PHONE = '(max-width: 719px)';
const TYPE_LABEL: Record<ArrowType, string> = { leads_to: 'Leads to', pairs_with: 'Pairs with', free: 'Free' };

export interface LearningOptions {
  technique: string | null;
  isCurrent?: () => boolean;
}

type Attrs = Record<string, string | number | undefined>;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Array<Node | string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  for (const kid of kids) node.append(kid);
  return node;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const entries = CATALOGUE as unknown as BoardEntry[];
const seriesList = SERIES as unknown as BoardSeries[];
const glyphs = createGlyphSet({ svgs: FIGURE_SVGS, labelOf: (id: string) => techniqueById(id)?.name ?? id, className: 'wt-glyph' });

/** Caps title wrapped to a few short lines, with an ellipsis if it still doesn't fit. */
export function wrapTitle(name: string, maxChars: number, maxLines: number): string[] {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.slice(0, Math.max(1, maxChars - 1))}…`;
  return kept;
}

function pieceIcon(kind: 'dashed_house' | 'house' | 'city', x: number, y: number, size: number): SVGElement {
  const g = svg('g', { transform: `translate(${x - size / 2} ${y - size / 2}) scale(${size / 10})`, class: `wt-piece wt-piece--${kind}` });
  if (kind === 'city') {
    g.append(svg('path', { d: 'M1 9V4h3v5M4 9V2h3v7M7 9V5h2v4', fill: 'none', stroke: '#ffd400', 'stroke-width': 1, 'stroke-linejoin': 'round' }));
  } else {
    g.append(svg('path', { d: 'M1 5 5 1.5 9 5v4H1Z', fill: 'none', stroke: '#ffd400', 'stroke-width': 1, 'stroke-linejoin': 'round', 'stroke-dasharray': kind === 'dashed_house' ? '1.6 1.2' : undefined }));
  }
  return g;
}

/** The robber: a masked figure in a flat cap. Sits on the tile a suggestion points to. */
function robberIcon(x: number, y: number, size: number): SVGElement {
  const g = svg('g', { transform: `translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${(size / 20).toFixed(3)})`, class: 'wt-robber__figure' });
  g.append(
    svg('circle', { class: 'wt-robber__hit', cx: 10, cy: 10, r: 11 }),
    svg('path', { class: 'wt-robber__body', d: 'M4 20c0-5 2.5-8 6-8s6 3 6 8Z' }),
    svg('circle', { class: 'wt-robber__head', cx: 10, cy: 7.5, r: 4 }),
    svg('path', { class: 'wt-robber__cap', d: 'M5.8 6.2c.6-3 2.4-4.4 4.2-4.4s3.6 1.4 4.2 4.4Z' }),
    svg('rect', { class: 'wt-robber__mask', x: 6.2, y: 6.6, width: 7.6, height: 2.2, rx: 1 })
  );
  return g;
}

interface BoardData { arrows: BoardArrow[]; goals: WalkthruGoal[]; reps: WalkthruRep[]; suggestions: WalkthruSuggestion[]; notices: string[] }

async function loadData(): Promise<BoardData> {
  const [arrows, goals, reps, suggestions] = await Promise.allSettled([loadBoardArrows(), loadWalkthruGoals(), loadWalkthruReps(), loadSuggestions()]);
  if (arrows.status === 'rejected' && goals.status === 'rejected' && reps.status === 'rejected') throw arrows.reason;
  const notices: string[] = [];
  if (arrows.status === 'rejected') notices.push('Your arrows didn’t load.');
  if (goals.status === 'rejected') notices.push('Your goal didn’t load.');
  if (reps.status === 'rejected') notices.push('Lesson reps didn’t load.');
  if (suggestions.status === 'rejected') notices.push('Suggestions didn’t load.');
  return {
    arrows: arrows.status === 'fulfilled' ? arrows.value : [],
    goals: goals.status === 'fulfilled' ? goals.value : [],
    reps: reps.status === 'fulfilled' ? reps.value : [],
    suggestions: suggestions.status === 'fulfilled' ? suggestions.value : [],
    notices
  };
}

export async function renderLearningBoard(root: HTMLElement, options: LearningOptions): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  showViewLoading(root, 'Loading the board…');
  let data: BoardData;
  try {
    data = await loadData();
  } catch (err) {
    if (!isCurrent()) return;
    renderLoadError(root, err, () => void renderLearningBoard(root, options));
    return;
  }
  if (!isCurrent()) return;
  mountBoard(root, data, options);
}

function mountBoard(root: HTMLElement, data: BoardData, options: LearningOptions): void {
  const opened = SETS.map((s: { id: number }) => s.id).filter((id: number) => entries.some((e) => e.set === id));
  const layout: BoardLayout = boardLayout({ entries, sets: SETS as never, series: seriesList, opened });
  const setColour = new Map<number, string>(SETS.map((s: { id: number; colour: string }) => [s.id, s.colour]));
  const state = {
    selected: null as string | null,
    arrows: data.arrows,
    goals: data.goals,
    reps: data.reps,
    suggestions: data.suggestions,
    /** The suggestion being lifted into a goal: it animates once, then goes. */
    lifting: null as string | null,
    text: null as WalkthruText | null,
    textError: null as string | null,
    draw: 'off' as 'off' | 'from' | 'to',
    drawFrom: null as string | null,
    level: null as LabelLevel | null
  };

  // ── shell ──
  const view = el('div', 'wt-view');
  const toolbar = el('div', 'wt-toolbar');
  const status = el('p', 'wt-toolbar__status', data.notices.join(' '));
  status.setAttribute('role', 'status');
  const stage = el('div', 'wt-stage');
  stage.tabIndex = 0;
  stage.setAttribute('role', 'application');
  stage.setAttribute('aria-label', 'WalkThrus board. Arrow keys pan, plus and minus zoom, zero fits the board.');
  const board = svg('svg', { class: 'wt-svg', role: 'presentation' });
  const world = svg('g', { class: 'wt-world' });
  board.append(world);
  const tip = el('div', 'wt-tip');
  tip.hidden = true;
  const pop = el('div', 'wt-pop');
  pop.hidden = true;
  const panel = el('aside', 'wt-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Technique');
  stage.append(board, tip, pop);
  view.append(toolbar, stage, panel);
  root.replaceChildren(view);

  const button = (label: string, onClick: () => void, className = 'btn btn--secondary'): HTMLButtonElement => {
    const b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  // ── camera ──
  const cam: Camera = createCamera();
  let anim: CameraAnim | null = null;
  let raf = 0;
  const isPhone = (): boolean => typeof matchMedia === 'function' && matchMedia(PHONE).matches;
  const viewport = () => {
    const r = stage.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : FALLBACK_VIEWPORT;
  };
  let lastViewport = viewport();

  function applyCamera(): void {
    world.setAttribute('transform', `translate(${cam.x.toFixed(2)} ${cam.y.toFixed(2)}) scale(${cam.k.toFixed(4)})`);
    const level = labelLevel(cam.k, state.level);
    if (level !== state.level) { state.level = level; board.dataset.level = level; }
  }
  function stopAnim(): void { anim = null; }
  function frame(now: number): void {
    raf = 0;
    if (!anim) return;
    const done = tickCamera(cam, anim, now);
    applyCamera();
    if (done) anim = null;
    else raf = requestAnimationFrame(frame);
  }
  function glideTo(target: Camera): void {
    anim = animateTo(cam, target, { reduceMotion: prefersReducedMotion() });
    if (!anim) { applyCamera(); return; }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  const fitAll = (): Camera => fitFrameCamera(layout.bounds, viewport(), 16);

  /** Desktop shows the whole board. A phone starts on the active goal's cluster, else the first one. */
  function initialCamera(): Camera {
    if (isPhone()) {
      const live = state.goals.find((g) => isLiveWalkthruGoal(g));
      const tile = live ? layout.tiles.find((t) => t.id === normalizeWalkthru(live.walkthru)?.technique_id) : null;
      const key = tile?.cluster ?? layout.clusters[0]?.key;
      const f = key ? clusterFrame(layout, key) : null;
      if (f) return fitFrameCamera(f, viewport(), 12);
    }
    return fitAll();
  }

  function panelOffset(): { x: number; y: number } {
    if (panel.hidden) return { x: 0, y: 0 };
    return isPhone() ? { x: 0, y: panel.getBoundingClientRect().height || viewport().h * 0.55 } : { x: panel.getBoundingClientRect().width || 380, y: 0 };
  }
  function focusTile(tile: BoardTile): void {
    const vp = viewport();
    const off = panelOffset();
    const k = Math.max(cam.k, isPhone() ? 0.9 : 1.15);
    const target = focusPoint(cam, { w: vp.w, h: vp.h - off.y }, tile.x, tile.y + tile.box.h * 0.9, k, off.x);
    glideTo(target);
  }

  // ── data helpers ──
  const goalFor = (id: string): WalkthruGoal | null => state.goals.find((g) => normalizeWalkthru(g.walkthru)?.technique_id === id) ?? null;
  const liveGoal = (): WalkthruGoal | null => state.goals.find((g) => isLiveWalkthruGoal(g)) ?? null;
  const repsFor = (id: string): WalkthruRep[] => state.reps.filter((r) => r.technique_id === id);

  function bookArrowsFor(id: string | null): BoardArrow[] {
    if (!id) return [];
    const entry = techniqueById(id);
    if (!entry) return [];
    const kept = new Set(state.arrows.map((a) => `${a.from}|${a.to}`));
    return (entry.see_also as string[])
      .filter((to) => !kept.has(`${id}|${to}`) && layout.tiles.some((t) => t.id === to))
      .map((to) => ({ id: `book:${id}:${to}`, from: id, to, type: 'leads_to' as const }));
  }

  // ── painting ──
  function tileNode(tile: BoardTile): SVGElement {
    const d = layout.drawn;
    const goal = goalFor(tile.id);
    const piece = goal ? pieceFor(goal) : null;
    const g = svg('g', { class: 'wt-tile', 'data-tile': tile.id, role: 'button', tabindex: 0, 'aria-label': `${tile.name}, ${tile.code} page ${tile.page}` });
    g.append(svg('polygon', { class: 'wt-hex', points: tile.corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '), fill: setColour.get(tile.set) ?? '#ffd400' }));
    // tab
    g.append(
      svg('rect', { class: 'wt-tab', x: tile.tab.x - tile.tab.w / 2, y: tile.tab.y - tile.tab.h / 2, width: tile.tab.w, height: tile.tab.h, rx: 1.5 }),
      svg('text', { class: 'wt-tab__text', x: tile.tab.x, y: tile.tab.y + d * 0.055, 'text-anchor': 'middle', 'font-size': (d * 0.15).toFixed(1) }, `${tile.code} | ${tile.page}`)
    );
    // icon
    const icon = svg('g', { class: 'wt-icon' });
    icon.innerHTML = glyphs.markup(tile.id);
    const inner = icon.querySelector('svg');
    if (inner) {
      inner.setAttribute('x', String(tile.glyph.x - tile.glyph.w / 2));
      inner.setAttribute('y', String(tile.glyph.y - tile.glyph.h / 2));
      inner.setAttribute('width', String(tile.glyph.w));
      inner.setAttribute('height', String(tile.glyph.h));
    }
    g.append(icon);
    // title
    const lines = wrapTitle(tile.name, 13, 2);
    const fs = d * 0.125;
    const title = svg('text', { class: 'wt-title', 'text-anchor': 'middle', 'font-size': fs.toFixed(1) });
    lines.forEach((line, i) => title.append(svg('tspan', { x: tile.title.x, y: (tile.title.y - ((lines.length - 1) * fs * 1.1) / 2 + i * fs * 1.1 + fs * 0.35).toFixed(1) }, line)));
    g.append(title);
    // badge: progress piece and lesson-use dots
    g.append(svg('rect', { class: 'wt-badge', x: tile.badge.x - tile.badge.w / 2, y: tile.badge.y - tile.badge.h / 2, width: tile.badge.w, height: tile.badge.h, rx: tile.badge.h / 2 }));
    if (piece) g.append(pieceIcon(piece, tile.badge.x - tile.badge.w / 2 + tile.badge.h * 0.62, tile.badge.y, tile.badge.h * 0.7));
    const mine = repsFor(tile.id).filter((r) => !hasLapsed(r) && countsAsRep(r));
    const shown = mine.slice(-4);
    shown.forEach((rep, i) => {
      const cx = tile.badge.x + tile.badge.w / 2 - tile.badge.h * 0.5 - (shown.length - 1 - i) * (tile.badge.h * 0.32);
      g.append(svg('circle', { class: `wt-dot${rep.state === 'partly' ? ' is-hollow' : ''}`, cx, cy: tile.badge.y, r: tile.badge.h * 0.11 }));
    });
    return g;
  }

  function arrowNodes(r: RoutedArrow, isBook: boolean): SVGElement {
    const g = svg('g', { class: `wt-arrow${isBook ? ' is-book' : ''}${r.dashed ? ' is-free' : ''}`, 'data-arrow': r.id });
    if (r.knot) {
      const k = r.knot;
      const deg = (k.angle * 180) / Math.PI;
      const chev = svg('g', { class: 'wt-knot', transform: `translate(${k.x.toFixed(1)} ${k.y.toFixed(1)}) rotate(${deg.toFixed(1)})` });
      if (k.chevrons === 0) chev.append(svg('line', { x1: 0, y1: -8, x2: 0, y2: 8, 'stroke-dasharray': '3 3' }));
      for (let i = 0; i < k.chevrons; i++) chev.append(svg('path', { d: `M${i * 6 - 6},-6 L${i * 6},0 L${i * 6 - 6},6` }));
      g.append(svg('circle', { class: 'wt-knot__hit', cx: k.x, cy: k.y, r: 12 }), chev);
    } else {
      g.append(svg('path', { class: 'wt-arrow__hit', d: r.d }), svg('path', { class: 'wt-arrow__line', d: r.d }));
      for (const h of r.heads) {
        g.append(svg('path', { class: 'wt-arrow__head', d: 'M-16,-8 L0,0 L-16,8 Z', transform: `translate(${h.x.toFixed(1)} ${h.y.toFixed(1)}) rotate(${((h.angle * 180) / Math.PI).toFixed(1)})` }));
      }
    }
    if (r.label) {
      const l = r.label;
      if (Math.hypot(l.x - l.anchor.x, l.y - l.anchor.y) > 18) g.append(svg('line', { class: 'wt-arrow__leader', x1: l.anchor.x, y1: l.anchor.y, x2: l.x, y2: l.y }));
      g.append(
        svg('rect', { class: 'wt-chiplabel', x: l.x - l.w / 2, y: l.y - l.h / 2, width: l.w, height: l.h, rx: l.h / 2 }),
        svg('text', { class: 'wt-chiplabel__text', x: l.x, y: l.y + 4, 'text-anchor': 'middle' }, l.text)
      );
    }
    return g;
  }

  function stripNode(tile: BoardTile): SVGElement | null {
    const text = state.text;
    const master = text?.sets.flatMap((s) => s.techniques).find((t) => t.id === tile.id);
    const cardW = 78;
    const cardH = 52;
    const gap = 8;
    const total = 5 * cardW + 4 * gap;
    const top = tile.y + tile.box.h / 2 + 22;
    const g = svg('g', { class: 'wt-strip' });
    g.append(svg('path', { class: 'wt-strip__connector', d: `M${tile.x},${tile.y + tile.box.h / 2} V${top - 10} H${tile.x} ` }));
    for (let i = 0; i < 5; i++) {
      const x = tile.x - total / 2 + i * (cardW + gap);
      const step = master?.steps.find((s) => s.n === i + 1);
      const card = svg('g', { class: 'wt-strip__card' });
      card.append(
        svg('rect', { x, y: top, width: cardW, height: cardH, rx: 6 }),
        svg('text', { class: 'wt-strip__n', x: x + 8, y: top + 15 }, String(i + 1))
      );
      wrapTitle(step?.label ?? '', 14, 2).forEach((line, j) => card.append(svg('text', { class: 'wt-strip__label', x: x + 8, y: top + 29 + j * 11 }, line)));
      g.append(card);
    }
    g.append(svg('path', { class: 'wt-strip__connector', d: `M${tile.x - total / 2 + cardW / 2},${top} V${top - 10} H${tile.x + total / 2 - cardW / 2} V${top}` }));
    const close = svg('g', { class: 'wt-strip__close', role: 'button', tabindex: 0, 'aria-label': 'Close the steps', 'data-close': '1' });
    close.append(svg('circle', { cx: tile.x + total / 2 + 20, cy: top + cardH / 2, r: 12 }), svg('path', { d: `M${tile.x + total / 2 + 15},${top + cardH / 2} h10` }));
    g.append(close);
    return g;
  }

  function paint(): void {
    const focused = (document.activeElement as Element | null)?.closest?.('[data-tile]') as SVGElement | null;
    const focusId = focused?.dataset.tile ?? null;
    const selectedTile = state.selected ? layout.tiles.find((t) => t.id === state.selected) ?? null : null;
    const userArrows = state.arrows;
    const book = bookArrowsFor(state.selected);
    let routed: RoutedArrow[] = [];
    try {
      routed = routeArrows(layout, [...userArrows, ...book]);
    } catch {
      status.textContent = 'The arrows couldn’t be drawn. The tiles are fine.';
    }
    const bookIds = new Set(book.map((b) => b.id));
    const neighbours = new Set<string>();
    if (selectedTile) {
      for (const t of layout.tiles) if (directionBetween(selectedTile.cell, t.cell) >= 0) neighbours.add(t.id);
      for (const a of userArrows) { if (a.from === selectedTile.id) neighbours.add(a.to); if (a.to === selectedTile.id) neighbours.add(a.from); }
    }

    const children: SVGElement[] = [];
    for (const slot of layout.boxSlots) {
      const g = svg('g', { class: 'wt-boxslot' });
      g.append(
        svg('rect', { x: slot.frame.x, y: slot.frame.y, width: slot.frame.w, height: slot.frame.h, rx: 18, stroke: slot.colour }),
        svg('text', { x: slot.frame.x + slot.frame.w / 2, y: slot.frame.y + slot.frame.h / 2, 'text-anchor': 'middle' }, `${slot.name} · still in the box`)
      );
      children.push(g);
    }
    for (const c of layout.clusters) {
      const g = svg('g', { class: 'wt-cluster-label' });
      g.append(
        svg('text', { x: c.label.x, y: c.label.y + 10, 'text-anchor': 'middle' }, c.name.toUpperCase()),
        svg('rect', { x: c.label.x - 30, y: c.label.y + c.label.h / 2 + 3, width: 60, height: 6, fill: setColour.get(c.set) ?? '#ffd400' })
      );
      children.push(g);
    }
    const arrowLayer = svg('g', { class: 'wt-arrows' });
    for (const r of routed) arrowLayer.append(arrowNodes(r, bookIds.has(r.id)));
    children.push(arrowLayer);
    const tileLayer = svg('g', { class: 'wt-tiles' });
    for (const t of layout.tiles) {
      const node = tileNode(t);
      if (t.id === state.selected) node.classList.add('is-selected');
      else if (selectedTile && neighbours.has(t.id)) node.classList.add('is-neighbour');
      if (state.draw !== 'off' && t.id === state.drawFrom) node.classList.add('is-draw-from');
      tileLayer.append(node);
    }
    children.push(tileLayer);
    // One robber per tile a suggestion points to; the first (repeated before one-off) wins the tile.
    const robberLayer = svg('g', { class: 'wt-robbers' });
    const seenTiles = new Set<string>();
    for (const sug of state.suggestions) {
      const tile = sug.technique_id ? layout.tiles.find((t) => t.id === sug.technique_id) : null;
      if (!tile || seenTiles.has(tile.id)) continue;
      seenTiles.add(tile.id);
      const robber = svg('g', {
        class: `wt-robber${state.lifting === sug.key ? ' is-lifting' : ''}`, 'data-suggestion': sug.key, role: 'button', tabindex: 0,
        'aria-label': `Suggestion: ${sug.problem_label} points to ${tile.name}. Press Enter for the reasons.`
      });
      robber.append(robberIcon(tile.x + tile.box.w * 0.34, tile.y - tile.box.h * 0.36, layout.drawn * 0.5));
      robberLayer.append(robber);
    }
    children.push(robberLayer);
    if (selectedTile) {
      const strip = stripNode(selectedTile);
      if (strip) children.push(strip);
    }
    world.replaceChildren(...children);
    if (focusId) ([...world.querySelectorAll<SVGElement>('[data-tile]')].find((n) => n.dataset.tile === focusId))?.focus();
    board.classList.toggle('has-selection', Boolean(selectedTile));
    board.dataset.draw = state.draw;
    applyCamera();
  }

  function paintPanel(): void {
    if (!state.selected) { panel.hidden = true; panel.replaceChildren(); return; }
    const live = liveGoal();
    const liveId = live ? normalizeWalkthru(live.walkthru)?.technique_id ?? null : null;
    const model: PanelModel = {
      id: state.selected,
      goal: goalFor(state.selected),
      blockedBy: live && liveId !== state.selected ? techniqueById(liveId)?.name ?? 'another technique' : null,
      reps: state.reps,
      text: state.text ? { state: 'ready', value: state.text } : state.textError ? { state: 'missing', message: state.textError } : { state: 'loading' }
    };
    panel.hidden = false;
    renderPanel(panel, model, {
      onClose: () => select(null),
      onSelect: (id) => select(id),
      onStart: (id) => void startGoal(id),
      onTextRetry: () => { state.textError = null; void ensureText(); paintPanel(); }
    });
  }

  async function ensureText(): Promise<void> {
    if (state.text) return;
    try {
      state.text = await loadWalkthruText();
      state.textError = null;
    } catch (err) {
      state.textError = `The steps couldn’t be loaded. ${errorMessage(err)}`;
    }
    paintPanel();
    if (state.selected) paint();
  }

  function select(id: string | null): void {
    state.selected = id;
    hideTip();
    hidePop();
    if (id) {
      try { history.replaceState(null, '', `#/learning/${encodeURIComponent(id)}`); } catch { /* the hash is a convenience */ }
      void ensureText();
    } else {
      try { history.replaceState(null, '', '#/learning'); } catch { /* ignore */ }
    }
    paint();
    paintPanel();
    const tile = id ? layout.tiles.find((t) => t.id === id) : null;
    if (tile) focusTile(tile);
  }

  async function startGoal(id: string): Promise<void> {
    const entry = techniqueById(id);
    if (!entry) return;
    const candidate = { id: '', sphere: 'professional', status: 'active', walkthru: { technique_id: id } };
    const refused = checkOneActive(state.goals, candidate);
    if (refused) { status.textContent = refused.message; paintPanel(); return; }
    try {
      const goal = await createWalkthruGoal({ title: `Get better at ${entry.name}`, walkthru: { technique_id: id, stage: 'attempt' } });
      state.goals = [...state.goals, goal];
      status.textContent = `Started working on ${entry.name}.`;
    } catch (err) {
      status.textContent = errorMessage(err);
    }
    paint();
    paintPanel();
  }

  // ── suggestions ──
  const suggestionByKey = (key: string): WalkthruSuggestion | null => state.suggestions.find((x) => x.key === key) ?? null;

  function chainList(sug: WalkthruSuggestion): HTMLElement {
    const list = el('ol', 'wt-chainlist');
    for (const link of sug.chain) if (link.text) list.append(el('li', `wt-chainlist__${link.step}`, link.text));
    return list;
  }

  function showRobberTip(sug: WalkthruSuggestion, anchor: Element): void {
    tip.replaceChildren(el('p', 'wt-tip__code', sug.kind === 'repeated' ? 'Suggestion' : 'Worth a look'), chainList(sug));
    tip.hidden = false;
    void positionHubFloating(anchor, tip, { placement: 'top', strategy: 'fixed', offset: 8 });
  }

  function removeSuggestion(key: string): void {
    state.suggestions = state.suggestions.filter((x) => x.key !== key);
    state.lifting = null;
    paint();
  }

  async function answerSuggestion(sug: WalkthruSuggestion, kind: DismissKind, said: string): Promise<void> {
    try {
      await dismissSuggestion(sug.key, kind);
      status.textContent = said;
      removeSuggestion(sug.key);
    } catch (err) {
      status.textContent = `That didn’t save. ${errorMessage(err)}`;
    }
  }

  /** "Make it a goal": the robber lifts, a dashed house goes on the tile. */
  async function makeGoal(sug: WalkthruSuggestion): Promise<void> {
    const entry = sug.technique_id ? techniqueById(sug.technique_id) : null;
    if (!entry) return;
    const candidate = { id: '', sphere: 'professional', status: 'active', walkthru: { technique_id: entry.id } };
    const refused = checkOneActive(state.goals, candidate);
    if (refused) { status.textContent = refused.message; return; }
    try {
      const goal = await createWalkthruGoal({
        title: `Get better at ${entry.name}`,
        walkthru: { technique_id: entry.id, stage: 'attempt', problem_type: sug.problem_type, origin: { kind: 'pattern', suggestion_id: sug.key } }
      });
      state.goals = [...state.goals, goal];
      await dismissSuggestion(sug.key, 'accepted').catch(() => undefined);
      hidePop();
      state.lifting = sug.key;
      paint();
      status.textContent = `Started working on ${entry.name}.`;
      const done = (): void => removeSuggestion(sug.key);
      if (prefersReducedMotion()) done(); else window.setTimeout(done, 420);
    } catch (err) {
      status.textContent = errorMessage(err);
    }
  }

  function openSuggestion(key: string, at: Element): void {
    const sug = suggestionByKey(key);
    const entry = sug?.technique_id ? techniqueById(sug.technique_id) : null;
    if (!sug || !entry) return;
    hideTip();
    const live = liveGoal();
    const row = el('div', 'wt-pop__row');
    if (sug.action === 'goal') {
      const make = button('Make it a goal', () => void makeGoal(sug), 'btn btn--primary btn--small');
      if (live) { make.disabled = true; make.title = 'You’re already working on a technique. Finish, park or drop it first.'; }
      row.append(make);
    } else {
      const next = sug.next_lesson;
      if (next) row.append(button(`Add to the next lesson (${next.date})`, () => { window.location.assign(next.url); }, 'btn btn--primary btn--small'));
      row.append(button('Open the technique', () => { hidePop(); select(entry.id); }, next ? 'btn btn--secondary btn--small' : 'btn btn--primary btn--small'));
    }
    row.append(
      button('Not now', () => { hidePop(); void answerSuggestion(sug, 'not_now', 'Parked until there’s more evidence.'); }, 'btn btn--secondary btn--small'),
      button('Not this', () => { hidePop(); void answerSuggestion(sug, 'not_this', 'Muted for these classes until the end of term.'); }, 'btn btn--secondary btn--small'),
      button('Close', hidePop, 'btn btn--secondary btn--small')
    );
    const lead = sug.action === 'goal'
      ? `Try ${entry.name}?`
      : `${sug.problem_label} showed up once. Add ${entry.name} to ${sug.class_titles[0] ?? 'the class'}’s next lesson as a WalkThru note?${sug.next_lesson ? '' : ' No upcoming lesson is timetabled for it yet.'}`;
    pop.replaceChildren(el('p', 'wt-pop__title', lead), chainList(sug), ...(sug.note ? [el('p', 'wt-pop__note', sug.note)] : []), row);
    pop.hidden = false;
    void positionHubFloating(at, pop, { placement: 'bottom', strategy: 'fixed', offset: 8 });
  }

  // ── tooltip ──
  let tipTimer = 0;
  function hideTip(): void { window.clearTimeout(tipTimer); tip.hidden = true; }
  function showTip(tile: BoardTile, anchor: Element): void {
    const entry = techniqueById(tile.id);
    if (!entry) return;
    tip.replaceChildren(el('p', 'wt-tip__code', `${entry.code} | ${entry.page}`), el('p', 'wt-tip__name', entry.name));
    const master = state.text?.sets.flatMap((s) => s.techniques).find((t) => t.id === tile.id);
    if (master) {
      const list = el('ol', 'wt-tip__steps');
      for (const step of master.steps) list.append(el('li', undefined, step.label));
      tip.append(list);
    } else if (!state.text && !state.textError) void ensureText().then(() => { if (!tip.hidden) showTip(tile, anchor); });
    tip.hidden = false;
    void positionHubFloating(anchor, tip, { placement: 'top', strategy: 'fixed', offset: 8 });
  }

  // ── arrows: draw, edit ──
  function hidePop(): void { pop.hidden = true; pop.replaceChildren(); }
  function openNewArrow(from: string, to: string): void {
    const a = techniqueById(from);
    const b = techniqueById(to);
    let type: ArrowType = 'leads_to';
    const label = el('input', 'wt-pop__input');
    label.type = 'text';
    label.maxLength = MAX_LABEL;
    label.placeholder = 'Short label (optional)';
    label.setAttribute('aria-label', 'Arrow label');
    const types = el('div', 'wt-pop__types');
    const err = el('p', 'wt-pop__err');
    const paintTypes = (): void => {
      types.replaceChildren(...(ARROW_TYPES as ArrowType[]).map((t) => {
        const b2 = button(TYPE_LABEL[t], () => { type = t; label.placeholder = t === 'free' ? 'A label is required' : 'Short label (optional)'; paintTypes(); }, `btn btn--small ${t === type ? 'btn--primary' : 'btn--secondary'}`);
        b2.setAttribute('aria-pressed', String(t === type));
        return b2;
      }));
    };
    paintTypes();
    const save = button('Draw it', () => {
      const text = label.value.trim();
      if (type === 'free' && !text) { err.textContent = 'A free arrow needs a label.'; return; }
      if (state.arrows.some((x) => x.from === from && x.to === to && x.type === type)) { err.textContent = 'That arrow is already on the board.'; return; }
      void commitArrows([...state.arrows, { id: makeArrowId(), from, to, type, ...(text ? { label: text } : {}) }], `${a?.name} → ${b?.name}`);
      endDraw();
    }, 'btn btn--primary btn--small');
    pop.replaceChildren(el('p', 'wt-pop__title', `${a?.name} → ${b?.name}`), types, label, err, el('div', 'wt-pop__row'));
    pop.lastElementChild!.append(save, button('Cancel', endDraw, 'btn btn--secondary btn--small'));
    pop.hidden = false;
    label.focus();
  }

  function openArrowMenu(id: string, at: Element): void {
    const isBook = id.startsWith('book:');
    const arrow = isBook ? null : state.arrows.find((x) => x.id === id);
    if (!isBook && !arrow) return;
    const row = el('div', 'wt-pop__row');
    if (isBook) {
      const [, from, to] = id.split(':');
      row.append(button('Keep this arrow', () => {
        void commitArrows([...state.arrows, { id: makeArrowId(), from: from!, to: to!, type: 'leads_to' }], 'Kept');
        hidePop();
      }, 'btn btn--primary btn--small'));
    } else {
      row.append(button('Remove', () => { void commitArrows(state.arrows.filter((x) => x.id !== id), 'Removed'); hidePop(); }, 'btn btn--secondary btn--small'));
    }
    row.append(button('Close', hidePop, 'btn btn--secondary btn--small'));
    const title = isBook ? 'The book’s own link' : `${TYPE_LABEL[arrow!.type]}${arrow!.label ? `: ${arrow!.label}` : ''}`;
    pop.replaceChildren(el('p', 'wt-pop__title', title), row);
    pop.hidden = false;
    void positionHubFloating(at, pop, { placement: 'bottom', strategy: 'fixed', offset: 8 });
  }

  async function commitArrows(next: BoardArrow[], what: string): Promise<void> {
    const before = state.arrows;
    state.arrows = next;
    paint();
    try {
      state.arrows = await saveBoardArrows(next);
      status.textContent = `${what}.`;
    } catch (err) {
      state.arrows = before;
      status.textContent = `That didn’t save. ${errorMessage(err)}`;
    }
    paint();
  }

  const drawButton = button('Draw arrow', () => {
    if (state.draw === 'off') startDraw(); else endDraw();
  });
  drawButton.setAttribute('aria-pressed', 'false');
  function startDraw(): void {
    state.draw = 'from';
    state.drawFrom = null;
    hidePop();
    drawButton.setAttribute('aria-pressed', 'true');
    drawButton.textContent = 'Stop drawing';
    status.textContent = 'Pick the technique the arrow starts from.';
    paint();
  }
  function endDraw(): void {
    state.draw = 'off';
    state.drawFrom = null;
    hidePop();
    drawButton.setAttribute('aria-pressed', 'false');
    drawButton.textContent = 'Draw arrow';
    status.textContent = data.notices.join(' ');
    paint();
  }

  function tileClicked(id: string): void {
    if (state.draw === 'from') {
      state.draw = 'to';
      state.drawFrom = id;
      status.textContent = `From ${techniqueById(id)?.name}. Now pick where it leads.`;
      paint();
      return;
    }
    if (state.draw === 'to') {
      if (id === state.drawFrom) { state.draw = 'from'; state.drawFrom = null; status.textContent = 'Pick the technique the arrow starts from.'; paint(); return; }
      openNewArrow(state.drawFrom!, id);
      return;
    }
    select(state.selected === id ? null : id);
  }

  // ── toolbar ──
  const zoomBy = (factor: number): void => {
    const vp = viewport();
    const t = { ...cam };
    zoomAt(t, vp.w / 2, vp.h / 2, factor);
    glideTo(t);
  };
  toolbar.append(
    button('Fit', () => glideTo(fitAll())),
    button('+', () => zoomBy(1.3)),
    button('−', () => zoomBy(1 / 1.3)),
    drawButton,
    status
  );
  toolbar.querySelectorAll('button').forEach((b) => { if (b.textContent === '+') b.setAttribute('aria-label', 'Zoom in'); if (b.textContent === '−') b.setAttribute('aria-label', 'Zoom out'); });

  // ── pointer: pan, pinch, click ──
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let pinchStart = 0;
  board.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y); }
  });
  board.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      if (!dragged && Math.hypot(dx, dy) < 4) return;
      dragged = true;
      stopAnim();
      panBy(cam, dx, dy);
      pointers.set(e.pointerId, next);
      applyCamera();
      hideTip();
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, next);
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchStart > 0) {
        const r = board.getBoundingClientRect();
        stopAnim();
        zoomAt(cam, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top, dist / pinchStart);
        applyCamera();
      }
      pinchStart = dist;
      dragged = true;
    }
  });
  const release = (e: PointerEvent): void => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = 0; };
  board.addEventListener('pointerup', release);
  board.addEventListener('pointercancel', release);
  board.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = board.getBoundingClientRect();
    stopAnim();
    wheelZoom(cam, e.clientX - r.left, e.clientY - r.top, e.deltaY);
    applyCamera();
  }, { passive: false });

  board.addEventListener('click', (e) => {
    if (dragged) { dragged = false; return; }
    const target = e.target as Element;
    if (target.closest('[data-close]')) { select(null); return; }
    const robber = target.closest('[data-suggestion]');
    if (robber && state.draw === 'off') { openSuggestion((robber as SVGElement).dataset.suggestion!, robber); return; }
    const tile = target.closest('[data-tile]');
    if (tile) { tileClicked((tile as SVGElement).dataset.tile!); return; }
    const arrow = target.closest('[data-arrow]');
    if (arrow && state.draw === 'off') { openArrowMenu((arrow as SVGElement).dataset.arrow!, arrow); return; }
    hidePop();
  });
  board.addEventListener('keydown', (e) => {
    const tile = (e.target as Element).closest('[data-tile]') as SVGElement | null;
    const close = (e.target as Element).closest('[data-close]');
    const robber = (e.target as Element).closest('[data-suggestion]') as SVGElement | null;
    if ((e.key === 'Enter' || e.key === ' ') && robber && state.draw === 'off') { e.preventDefault(); openSuggestion(robber.dataset.suggestion!, robber); return; }
    if ((e.key === 'Enter' || e.key === ' ') && (tile || close)) { e.preventDefault(); if (close) select(null); else tileClicked(tile!.dataset.tile!); }
  });
  board.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const robberNode = (e.target as Element).closest('[data-suggestion]');
    const hovered = robberNode ? suggestionByKey((robberNode as SVGElement).dataset.suggestion!) : null;
    if (robberNode && hovered && state.draw === 'off' && pop.hidden) { window.clearTimeout(tipTimer); tipTimer = window.setTimeout(() => showRobberTip(hovered, robberNode), 140); return; }
    const tile = (e.target as Element).closest('[data-tile]') as SVGElement | null;
    if (!tile || state.draw !== 'off' || !pop.hidden) return;
    const t = layout.tiles.find((x) => x.id === tile.dataset.tile);
    if (!t) return;
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => showTip(t, tile), 140);
  });
  board.addEventListener('pointerout', (e) => { if ((e.target as Element).closest('[data-tile], [data-suggestion]')) hideTip(); });
  board.addEventListener('focusin', (e) => {
    const robberNode = (e.target as Element).closest('[data-suggestion]') as SVGElement | null;
    const sug = robberNode ? suggestionByKey(robberNode.dataset.suggestion!) : null;
    if (robberNode && sug) { if (robberNode.matches(':focus-visible') && state.draw === 'off') showRobberTip(sug, robberNode); else hideTip(); return; }
    const tile = (e.target as Element).closest('[data-tile]') as SVGElement | null;
    const t = tile ? layout.tiles.find((x) => x.id === tile.dataset.tile) : null;
    // Keyboard focus shows the tip; a tap doesn't.
    if (tile && t && state.draw === 'off' && tile.matches(':focus-visible')) showTip(t, tile); else hideTip();
  });
  stage.addEventListener('keydown', (e) => {
    if ((e.target as Element).closest('input, button, a')) return;
    if (e.key === 'Escape' && state.draw !== 'off') { endDraw(); return; }
    const result = cameraKey(e.key, cam);
    if (result.kind === 'none') return;
    e.preventDefault();
    if (result.kind === 'zoom') zoomBy(result.factor);
    else if (result.kind === 'fit') glideTo(fitAll());
    else if (result.kind === 'escape') { if (state.selected) select(null); } else { stopAnim(); applyCamera(); }
  });

  // A resize keeps whatever the reader is looking at.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const next = viewport();
      if (next.w === lastViewport.w && next.h === lastViewport.h) return;
      retainCentre(cam, lastViewport, next);
      lastViewport = next;
      applyCamera();
    }).observe(stage);
  }

  // ── first paint: the camera is final before anything shows ──
  assignCamera(cam, initialCamera());
  if (!layout.tiles.length) {
    stage.replaceChildren(el('p', 'empty-state', 'No WalkThrus techniques are in the catalogue yet.'));
    return;
  }
  if (options.technique && layout.tiles.some((t) => t.id === options.technique)) state.selected = options.technique;
  paint();
  paintPanel();
  if (state.selected) {
    void ensureText();
    const tile = layout.tiles.find((t) => t.id === state.selected);
    if (tile) assignCamera(cam, focusPoint(cam, viewport(), tile.x, tile.y + tile.box.h * 0.9, Math.max(cam.k, isPhone() ? 0.9 : 1.15), panelOffset().x));
    applyCamera();
  }
  if (!state.arrows.length && !data.notices.length) status.textContent = 'Draw arrow joins two techniques. Click a hexagon to open it.';
}
