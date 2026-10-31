import { FIGURE_SVGS } from '../../../../packages/walkthrus/glyphs';
import { CATALOGUE, SERIES, techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';
import { SETS } from '../../../../packages/walkthrus/sets.mjs';
import { checkOneActive, isLiveWalkthruGoal, normalizeWalkthru, pieceFor } from '../../../../packages/walkthrus/goal.mjs';
import { countsAsRep, hasLapsed } from '../../../../packages/walkthrus/reps.mjs';
import { ARROW_TYPES, MAX_LABEL } from '../../../../packages/walkthrus/arrows.mjs';
import { isFusionId } from '../../../../packages/walkthrus/tiles.mjs';
import { boardLayout, clusterCellPx, clusterFrame, clustersLayout, type BoardEntry, type BoardLayout, type BoardSeries, type BoardTile } from '../../../../packages/walkthrus/board/layout';
import { HEAD_HALF, HEAD_LENGTH, LABEL_DIVIDER, LABEL_PAD, routeArrows, type ArrowType, type BoardArrow, type RoutedArrow } from '../../../../packages/walkthrus/board/route';
import { labelLevel, type LabelLevel } from '../../../../packages/walkthrus/board/labels';
import { directionBetween, isNeighbour } from '../../../../packages/walkthrus/board/hex';
import { fusedTileSvg, weldPath, type Fusion } from '../../../../packages/walkthrus/board/fused';
import { createGlyphSet } from '../../design-kit/js/glyph-set.js';
import { positionHubFloating } from '../../design-kit/js/hub-floating.js';
import {
  animateTo, assignCamera, cameraKey, createCamera, fitFrameCamera, focusPoint, panBy, retainCentre, tickCamera, wheelZoom, zoomAt,
  type Camera, type CameraAnim
} from '../../design-kit/js/board-camera.js';
import { prefersReducedMotion } from '../../design-kit/js/hub-motion.js';
import {
  createWalkthruGoal, dismissSuggestion, loadBoard, loadSuggestions, loadWalkthruGoals, loadWalkthruReps, loadWalkthruText, makeArrowId, saveBoardArrows, saveBoardClusters,
  type BoardCluster, type DismissKind, type WalkthruGoal, type WalkthruRep, type WalkthruSuggestion, type WalkthruText
} from '@/api/walkthrus';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { renderPanel, type PanelModel } from '@/views/walkthrus-panel';
import {
  addTile, dropTarget, ensureOnBoard, makeCluster, moveCluster, newClusterSpot, placeTile, removeTile, snapCell, type TileMark
} from '@/views/walkthrus-clusters';
import { createDrag, type DragSubject } from '@/views/walkthrus-drag';
import { BOARD_CLUSTER_ID, MAX_CLUSTER_NAME, touchingFreeCells } from '../../../../packages/walkthrus/clusters.mjs';
import { DRAW_COST_TEXT, openFuseBench, type FuseBench } from '@/views/walkthrus-fuse';
import { drawFusion, loadDrawEstimate, saveFusions } from '@/api/walkthrus-fuse';
import { loadProof, type Proof } from '@/api/walkthrus-proof';
import { proofMark, renderProofStrip, renderWhatsWorking } from '@/views/walkthrus-proof';

const NS = 'http://www.w3.org/2000/svg';
const FALLBACK_VIEWPORT = { w: 1000, h: 640 };
const PHONE = '(max-width: 719px)';
/** A mouse wheel moves in whole notches (120 a click) and only up and down; a trackpad drifts in small steps. */
function isMouseWheel(e: WheelEvent, dx: number, dy: number): boolean {
  if (e.deltaMode !== 0) return true;
  const notch = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  return dx === 0 && Math.abs(dy) >= 40 && typeof notch === 'number' && notch !== 0 && notch % 120 === 0;
}
/** Which board shows: Adam's own few techniques, or the whole book to pick from. Remembered per browser. */
type BoardView = 'mine' | 'book';
const VIEW_KEY = 'wt-board-view';
const readView = (): BoardView => { try { return localStorage.getItem(VIEW_KEY) === 'book' ? 'book' : 'mine'; } catch { return 'mine'; } };
const keepView = (view: BoardView): void => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* a convenience only */ } };
const TYPE_LABEL: Record<ArrowType, string> = { leads_to: 'Leads to', pairs_with: 'Pairs with', free: 'Free' };

export interface LearningOptions {
  technique: string | null;
  isCurrent?: () => boolean;
  /** Seam for Proof: the small mark on a tile's top-right corner. Defaults to the loaded Proof's mark. */
  tileMark?: (tileId: string) => TileMark;
  /**
   * Seam for Fuse: a tile dropped onto another on My board. Defaults to opening the fuse bench on
   * the two (or the target's panel when either is already a fusion). `clusterId` is the target's cluster.
   */
  onFuseDrop?: (dragTileId: string, targetTileId: string, clusterId: string) => void;
}

export type { TileMark };
/** A tile with no mark. */
export const noTileMark = (_tileId: string): TileMark => null;
const SAVE_DELAY = 600;

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
    g.append(svg('path', { d: 'M1 9V4h3v5M4 9V2h3v7M7 9V5h2v4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }));
  } else {
    g.append(svg('path', { d: 'M1 5 5 1.5 9 5v4H1Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-linejoin': 'round', 'stroke-dasharray': kind === 'dashed_house' ? '1.6 1.2' : undefined }));
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

interface BoardData {
  arrows: BoardArrow[]; clusters: BoardCluster[]; fusions: Fusion[];
  goals: WalkthruGoal[]; reps: WalkthruRep[]; suggestions: WalkthruSuggestion[]; notices: string[];
}

async function loadData(): Promise<BoardData> {
  const [boardRead, goals, reps, suggestions] = await Promise.allSettled([loadBoard(), loadWalkthruGoals(), loadWalkthruReps(), loadSuggestions()]);
  if (boardRead.status === 'rejected' && goals.status === 'rejected' && reps.status === 'rejected') throw boardRead.reason;
  const notices: string[] = [];
  if (boardRead.status === 'rejected') notices.push('Your arrows didn’t load.');
  if (goals.status === 'rejected') notices.push('Your goal didn’t load.');
  if (reps.status === 'rejected') notices.push('Lesson reps didn’t load.');
  if (suggestions.status === 'rejected') notices.push('Suggestions didn’t load.');
  return {
    arrows: boardRead.status === 'fulfilled' ? boardRead.value.arrows : [],
    clusters: boardRead.status === 'fulfilled' ? boardRead.value.clusters : [],
    fusions: boardRead.status === 'fulfilled' ? (boardRead.value.fusions as unknown as Fusion[]) : [],
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
  const bookLayout: BoardLayout = boardLayout({ entries, sets: SETS as never, series: seriesList, opened });
  const setColour = new Map<number, string>(SETS.map((s: { id: number; colour: string }) => [s.id, s.colour]));
  const tileMark = options.tileMark ?? ((id: string): TileMark => proofMark(id, state.proof));
  const boardLoaded = !data.notices.includes('Your arrows didn’t load.');
  const state = {
    selected: null as string | null,
    /** The cluster the open tile was opened from on My board (a tile may sit in several). */
    selectedCluster: null as string | null,
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
    level: null as LabelLevel | null,
    view: readView(),
    clusters: data.clusters,
    fusions: data.fusions,
    /** Proof for every tile, loaded after the first paint; null until then or when it failed. */
    proof: null as Proof | null,
    proofState: 'loading' as 'loading' | 'ready' | 'failed',
    /** "What's working" shows in place of the board. */
    proofOpen: false,
    drawCost: DRAW_COST_TEXT
  };

  /** What must stay on My board whatever Adam does: the live goal and every arrow's ends. */
  function mustStay(): string[] {
    const live = state.goals.find((g) => isLiveWalkthruGoal(g));
    const ids = [live ? normalizeWalkthru(live.walkthru)?.technique_id ?? null : null, ...state.arrows.flatMap((a) => [a.from, a.to])];
    return ids.filter((id): id is string => Boolean(id));
  }
  // Shown at once; saved with the next change Adam makes.
  state.clusters = ensureOnBoard(state.clusters, mustStay());

  /** Every tile on My board, first appearance first. */
  function onBoardIds(): string[] {
    const ids: string[] = [];
    for (const c of state.clusters) for (const t of c.tiles) if (!ids.includes(t.id)) ids.push(t.id);
    return ids;
  }
  const fusionOf = (id: string): Fusion | null => state.fusions.find((f) => f.id === id) ?? null;
  /** The book entry for a technique, or a stand-in for a fusion so it lays out like any tile. */
  function entryOf(id: string): BoardEntry | null {
    const entry = techniqueById(id) as BoardEntry | null;
    if (entry) return entry;
    const fusion = isFusionId(id) ? fusionOf(id) : null;
    return fusion ? { id, set: 0, kind: 'fusion', series: 'FUSED', code: 'FUSED', page: null, name: fusion.name } : null;
  }
  const nameOf = (id: string | null | undefined): string => (id ? entryOf(id)?.name ?? 'That technique' : 'That technique');
  const clusterName = (id: string | null): string | null => state.clusters.find((c) => c.id === id)?.name ?? null;
  const layoutFor = (): BoardLayout => (state.view === 'book' ? bookLayout : clustersLayout({ clusters: state.clusters, entryOf }));
  let layout: BoardLayout = layoutFor();
  const tileFor = (id: string | null, cluster: string | null = null): BoardTile | null =>
    id ? (cluster ? layout.tiles.find((t) => t.id === id && t.cluster === cluster) : null) ?? layout.tiles.find((t) => t.id === id) ?? null : null;

  /** Two book techniques dropped one on the other open the fuse bench; anything with a fusion in it opens the target. */
  const onFuseDrop = options.onFuseDrop ?? ((drag: string, target: string, clusterId: string): void => {
    if (techniqueById(drag) && techniqueById(target)) openBench([target, drag], clusterId);
    else select(target, clusterId);
  });

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
  const empty = el('div', 'wt-empty');
  empty.hidden = true;
  stage.append(board, tip, pop, empty);
  const proofPane = el('section', 'wt-proofpane');
  proofPane.hidden = true;
  view.append(toolbar, stage, proofPane, panel);
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
  const fitAll = (): Camera => fitFrameCamera(layout.focus, viewport(), 16);

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
  /** Opening a technique shows its whole cluster in the room beside the panel; it never zooms out. */
  function focusZoom(tile: BoardTile, vp: { w: number; h: number }, off: { x: number; y: number }): number {
    const f = clusterFrame(layout, tile.cluster);
    const fit = f ? fitFrameCamera(f, { w: vp.w - off.x, h: vp.h - off.y }, 16).k : 1;
    return Math.max(cam.k, Math.min(fit, isPhone() ? 0.9 : 1.15));
  }
  function focusCamera(tile: BoardTile): Camera {
    const vp = viewport();
    const off = panelOffset();
    return focusPoint(cam, { w: vp.w, h: vp.h - off.y }, tile.x, tile.y, focusZoom(tile, vp, off), off.x);
  }
  function focusTile(tile: BoardTile): void { glideTo(focusCamera(tile)); }

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
      .map((to) => ({ id: `book:${id}:${to}`, from: id, to, type: 'leads_to' as const, quiet: true }));
  }

  // ── painting ──
  /** A fusion's frame: the yellow band, FUSED over its parents' numbers, its drawing (or a dashed figure) and its name. */
  function fusedArt(tile: BoardTile): SVGElement {
    const fusion = fusionOf(tile.id);
    const art = svg('g', { class: 'wt-fused-tile', transform: `translate(${tile.x.toFixed(1)} ${tile.y.toFixed(1)})` });
    const none = { status: 'none' as const, scene: null, svg: null, note: null, at: null };
    art.innerHTML = fusedTileSvg(
      { id: tile.id, name: fusion?.name ?? tile.name, parents: fusion?.parents ?? [], drawing: fusion?.drawing ?? none },
      { size: layout.drawn, standalone: false }
    );
    return art;
  }

  function tileNode(tile: BoardTile): SVGElement {
    const d = layout.drawn;
    const goal = goalFor(tile.id);
    const piece = goal ? pieceFor(goal) : null;
    const label = tile.fusion ? `${tile.name}, a fusion` : `${tile.name}, ${tile.code} page ${tile.page}`;
    const g = svg('g', { class: `wt-tile${tile.fusion ? ' is-fusion' : ''}`, 'data-tile': tile.id, 'data-key': tile.key, 'data-cluster': tile.cluster, role: 'button', tabindex: 0, 'aria-label': label });
    const points = tile.corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    if (tile.fusion) {
      // The frame draws its own edge; the outline on top is what hover and selection thicken.
      g.append(fusedArt(tile), svg('polygon', { class: 'wt-hex wt-hex--fused', points, fill: 'none' }));
    } else {
      g.append(svg('polygon', { class: 'wt-hex', points, fill: setColour.get(tile.set) ?? '#ffd400' }));
      // tab
      g.append(
        svg('rect', { class: 'wt-tab', x: tile.tab.x - tile.tab.w / 2, y: tile.tab.y - tile.tab.h / 2, width: tile.tab.w, height: tile.tab.h, rx: 1.5 }),
        svg('text', { class: 'wt-tab__text', x: tile.tab.x, y: tile.tab.y + d * 0.055, 'text-anchor': 'middle', 'font-size': (d * 0.15).toFixed(1) }, `${tile.code} | ${tile.page}`)
      );
      // figure
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
    }
    // progress, only when there is some: the piece in a white circle on the top-left corner, rep dots beside it
    const mine = repsFor(tile.id).filter((r) => !hasLapsed(r) && countsAsRep(r));
    const shown = mine.slice(-4);
    if (piece || shown.length) {
      const r = d * 0.16;
      const prog = svg('g', { class: 'wt-progress' });
      if (piece) prog.append(svg('circle', { class: 'wt-progress__disc', cx: tile.piece.x, cy: tile.piece.y, r }), pieceIcon(piece, tile.piece.x, tile.piece.y, r * 1.25));
      const startX = tile.piece.x + (piece ? r + d * 0.07 : 0);
      shown.forEach((rep, i) => {
        prog.append(svg('circle', { class: `wt-dot${rep.state === 'partly' ? ' is-hollow' : ''}`, cx: (startX + i * d * 0.085).toFixed(1), cy: (tile.piece.y + d * 0.02).toFixed(1), r: (d * 0.03).toFixed(2) }));
      });
      g.append(prog);
    }
    // the Proof mark, when there is one, on the top-right corner
    const mark = tileMark(tile.id);
    if (mark) {
      const r = d * 0.13;
      g.append(svg('g', { class: `wt-mark wt-mark--${mark === '+' ? 'up' : mark === '−' ? 'down' : 'few'}` },
        svg('circle', { cx: tile.mark.x, cy: tile.mark.y, r }),
        svg('text', { x: tile.mark.x, y: tile.mark.y + r * 0.4, 'text-anchor': 'middle', 'font-size': (r * 1.2).toFixed(1) }, mark === 'few' ? '…' : mark)
      ));
    }
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
      if (r.start) g.append(svg('circle', { class: 'wt-arrow__start', cx: r.start.x.toFixed(1), cy: r.start.y.toFixed(1), r: 4 }));
      for (const h of r.heads) {
        g.append(svg('path', { class: 'wt-arrow__head', d: `M${-HEAD_LENGTH},${-HEAD_HALF} L0,0 L${-HEAD_LENGTH},${HEAD_HALF} Z`, transform: `translate(${h.x.toFixed(1)} ${h.y.toFixed(1)}) rotate(${((h.angle * 180) / Math.PI).toFixed(1)})` }));
      }
    }
    if (r.label) {
      // The book's form: bold caps TYPE, a thin divider, then the words, on a white pill on the line.
      const l = r.label;
      const left = l.x - l.w / 2 + LABEL_PAD;
      const pill = svg('g', { class: 'wt-arrowlabel' });
      if (Math.hypot(l.x - l.anchor.x, l.y - l.anchor.y) > 18) g.append(svg('line', { class: 'wt-arrow__leader', x1: l.anchor.x, y1: l.anchor.y, x2: l.x, y2: l.y }));
      pill.append(
        svg('rect', { class: 'wt-arrowlabel__pill', x: l.x - l.w / 2, y: l.y - l.h / 2, width: l.w, height: l.h, rx: l.h / 2 }),
        svg('text', { class: 'wt-arrowlabel__type', x: left, y: l.y + 3.5 }, l.type)
      );
      if (l.text) {
        const bar = left + l.typeW + LABEL_DIVIDER / 2;
        pill.append(
          svg('line', { class: 'wt-arrowlabel__divider', x1: bar, y1: l.y - l.h * 0.28, x2: bar, y2: l.y + l.h * 0.28 }),
          svg('text', { class: 'wt-arrowlabel__text', x: left + l.typeW + LABEL_DIVIDER, y: l.y + 4 }, l.text)
        );
      }
      g.append(pill);
    }
    return g;
  }

  /**
   * Under the tiles: a short black weld from each fusion to every parent on a touching cell of its
   * cluster, and a thin line to the nearest placement of a parent anywhere else on My board.
   */
  function weldLayer(): SVGElement {
    const g = svg('g', { class: 'wt-welds' });
    if (state.view !== 'mine') return g;
    for (const t of layout.tiles) {
      if (!t.fusion) continue;
      for (const parent of fusionOf(t.id)?.parents ?? []) {
        const touching = layout.tiles.find((p) => p.id === parent && p.cluster === t.cluster && isNeighbour(t.cell, p.cell));
        if (touching) { g.append(svg('path', { class: 'wt-weld', d: weldPath(t, touching, { drawn: layout.drawn }) })); continue; }
        let far: BoardTile | null = null;
        for (const p of layout.tiles) if (p.id === parent && (!far || Math.hypot(p.x - t.x, p.y - t.y) < Math.hypot(far.x - t.x, far.y - t.y))) far = p;
        if (far) g.append(svg('line', { class: 'wt-weld-line', x1: t.x.toFixed(1), y1: t.y.toFixed(1), x2: far.x.toFixed(1), y2: far.y.toFixed(1) }));
      }
    }
    return g;
  }

  function paint(): void {
    const focused = (document.activeElement as Element | null)?.closest?.('[data-tile]') as SVGElement | null;
    const focusKey = focused?.dataset.key ?? null;
    const selectedTile = tileFor(state.selected, state.selectedCluster);
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
      for (const t of layout.tiles) if (t.cluster === selectedTile.cluster && directionBetween(selectedTile.cell, t.cell) >= 0) neighbours.add(t.id);
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
    const mineView = state.view === 'mine';
    for (const c of emptyBoard() ? [] : layout.clusters) {
      const g = svg('g', { class: 'wt-cluster-label' });
      if (mineView) {
        g.setAttribute('data-cluster-title', c.key);
        g.setAttribute('data-cluster', c.key);
        g.setAttribute('aria-label', `${c.name}. Drag to move the cluster.`);
      }
      g.append(
        svg('text', { x: c.label.x, y: c.label.y + 10, 'text-anchor': 'middle' }, c.name.toUpperCase()),
        svg('rect', { x: c.label.x - 30, y: c.label.y + c.label.h / 2 + 3, width: 60, height: 6, fill: setColour.get(c.set) ?? '#ffd400' })
      );
      // A cluster with nothing in it yet: a dashed hexagon where its first tile will go.
      if (c.empty) {
        const corners = [0, 1, 2, 3, 4, 5].map((k) => ({ x: c.x + layout.drawn * Math.cos((Math.PI / 3) * k), y: c.y + layout.drawn * Math.sin((Math.PI / 3) * k) }));
        g.append(
          svg('polygon', { class: 'wt-cluster-slot', points: corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }),
          svg('text', { class: 'wt-cluster-slot__text', x: c.x, y: c.y + 5, 'text-anchor': 'middle' }, 'Add from the book')
        );
      }
      children.push(g);
    }
    children.push(weldLayer());
    const arrowLayer = svg('g', { class: 'wt-arrows' });
    // An arrow into a tile surrounded on all sides crosses a neighbour, so it is drawn over the tiles.
    const overLayer = svg('g', { class: 'wt-arrows wt-arrows--over' });
    for (const r of routed) (r.over.start || r.over.end ? overLayer : arrowLayer).append(arrowNodes(r, bookIds.has(r.id)));
    children.push(arrowLayer);
    const tileLayer = svg('g', { class: 'wt-tiles' });
    const mine = new Set(onBoardIds());
    for (const t of layout.tiles) {
      const node = tileNode(t);
      if (t.id === state.selected && (!selectedTile || t.key === selectedTile.key)) node.classList.add('is-selected');
      else if (selectedTile && neighbours.has(t.id)) node.classList.add('is-neighbour');
      if (state.draw !== 'off' && t.id === state.drawFrom) node.classList.add('is-draw-from');
      if (state.view === 'book' && mine.has(t.id)) node.classList.add('is-mine');
      tileLayer.append(node);
    }
    children.push(tileLayer, overLayer);
    // One robber per tile a suggestion points to; the first (repeated before one-off) wins the tile.
    const robberLayer = svg('g', { class: 'wt-robbers' });
    const seenTiles = new Set<string>();
    for (const sug of state.suggestions) {
      const tile = tileFor(sug.technique_id);
      if (!tile || seenTiles.has(tile.id)) continue;
      seenTiles.add(tile.id);
      const robber = svg('g', {
        class: `wt-robber${state.lifting === sug.key ? ' is-lifting' : ''}`, 'data-suggestion': sug.key, role: 'button', tabindex: 0,
        'aria-label': `Suggestion: ${sug.problem_label} points to ${tile.name}. Press Enter for the reasons.`
      });
      // On the right point, clear of the top corners (progress left, Proof mark right).
      robber.append(robberIcon(tile.x + tile.box.w * 0.4, tile.y, layout.drawn * 0.5));
      robberLayer.append(robber);
    }
    children.push(robberLayer);
    world.replaceChildren(...children);
    if (focusKey) ([...world.querySelectorAll<SVGElement>('[data-key]')].find((n) => n.dataset.key === focusKey))?.focus();
    board.classList.toggle('has-selection', Boolean(selectedTile));
    board.dataset.draw = state.draw;
    board.dataset.view = state.view;
    applyCamera();
  }

  function paintPanel(): void {
    if (!state.selected) { panel.hidden = true; panel.replaceChildren(); return; }
    const live = liveGoal();
    const liveId = live ? normalizeWalkthru(live.walkthru)?.technique_id ?? null : null;
    const model: PanelModel = {
      id: state.selected,
      goal: goalFor(state.selected),
      blockedBy: live && liveId !== state.selected ? nameOf(liveId) : null,
      reps: state.reps,
      board: boardState(state.selected),
      text: state.text ? { state: 'ready', value: state.text } : state.textError ? { state: 'missing', message: state.textError } : { state: 'loading' },
      fusion: isFusionId(state.selected) ? fusionOf(state.selected) : null,
      proof: state.proof,
      canFuse: Boolean(techniqueById(state.selected)) && fuseCandidates(state.selected).length > 0
    };
    panel.hidden = false;
    if (model.fusion) void ensureDrawCost();
    renderPanel(panel, model, {
      onClose: () => select(null),
      onSelect: (id) => select(id),
      onStart: (id) => void startGoal(id),
      onBoardToggle: (id) => {
        const from = state.view === 'mine' ? state.selectedCluster : null;
        if (from) void takeOff(id, from); else chooseCluster(id);
      },
      onTextRetry: () => { state.textError = null; void ensureText(); paintPanel(); },
      onFuseWith: (id) => openFusePicker(id),
      onEditFusion: (id) => {
        const fusion = fusionOf(id);
        if (fusion) openBench(fusion.parents, fusion.cluster_id ?? state.selectedCluster, fusion);
      },
      onDraw: async (id, note) => { await drawOne(id, note); },
      drawCost: state.drawCost
    });
  }

  /** Puts the loaded Proof into the open panel's strip without redrawing the rest of the panel. */
  function refreshProofStrip(): void {
    const host = panel.querySelector<HTMLElement>('.wt-panel__proof');
    if (!host || !state.selected) return;
    host.replaceChildren();
    renderProofStrip(host, state.selected, state.proof);
  }

  let costAsked = false;
  /** The real A$ range for one drawing, asked once; the bench's wording stands in until then. */
  async function ensureDrawCost(): Promise<void> {
    if (costAsked) return;
    costAsked = true;
    try {
      const e = await loadDrawEstimate();
      if (Number.isFinite(e.low_aud) && Number.isFinite(e.high_aud)) state.drawCost = `About A$${e.low_aud.toFixed(2)}–${e.high_aud.toFixed(2)}`;
    } catch { /* the bench's wording stands */ }
  }

  // ── fuse ──
  let bench: FuseBench | null = null;
  const techniqueSteps = (text: WalkthruText, id: string): Array<{ label: string; text: string }> =>
    (text.sets.flatMap((set) => set.techniques).find((t) => t.id === id)?.steps ?? []).map((st) => ({ label: st.label, text: st.text }));

  /** The bench over the board: two or three book techniques, or an existing fusion to edit. */
  function openBench(parents: string[], clusterId: string | null, existing?: Fusion): void {
    bench?.close();
    hidePop();
    hideTip();
    bench = openFuseBench({
      parents,
      clusterId,
      existing,
      stepsOf: async (id) => {
        state.text ??= await loadWalkthruText();
        return techniqueSteps(state.text, id);
      },
      titleOf: (id) => techniqueById(id)?.name ?? id,
      codeOf: (id) => String(techniqueById(id)?.page ?? ''),
      onSave: (fusion) => saveFusion(fusion),
      onDraw: (fusion, note) => drawOne(fusion.id, note),
      onClose: () => { bench = null; }
    });
  }

  /** Book techniques on My board other than `id`: what "Fuse with…" offers. */
  function fuseCandidates(id: string): string[] {
    if (state.view !== 'mine') return [];
    return onBoardIds().filter((other) => other !== id && Boolean(techniqueById(other)));
  }

  /** "Fuse with…": tick one or two other techniques on My board, then the bench opens on them. */
  function openFusePicker(id: string): void {
    const picked: string[] = [];
    const list = el('div', 'wt-pop__choices wt-fusepick');
    const go = button('Fuse', () => { hidePop(); openBench([id, ...picked], state.selectedCluster ?? tileFor(id)?.cluster ?? null); }, 'btn btn--primary btn--small');
    go.disabled = true;
    const note = el('p', 'wt-pop__note', 'Pick one or two.');
    for (const other of fuseCandidates(id)) {
      const label = el('label', 'wt-fusepick__item');
      const box = el('input');
      box.type = 'checkbox';
      box.value = other;
      box.addEventListener('change', () => {
        if (box.checked) { if (picked.length >= 2) { box.checked = false; note.textContent = 'Three at most: this one and two more.'; return; } picked.push(other); }
        else picked.splice(picked.indexOf(other), 1);
        note.textContent = picked.length ? `${picked.length} picked.` : 'Pick one or two.';
        go.disabled = picked.length === 0;
      });
      const entry = techniqueById(other);
      label.append(box, el('span', undefined, `${entry?.page ?? ''} · ${nameOf(other)}`));
      list.append(label);
    }
    const row = el('div', 'wt-pop__row');
    row.append(go, button('Cancel', hidePop, 'btn btn--secondary btn--small'));
    pop.replaceChildren(el('p', 'wt-pop__title', `Fuse ${nameOf(id)} with…`), list, note, row);
    pop.removeAttribute('style');
    pop.hidden = false;
    (list.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  /** The free cell in a cluster that touches the most of the fusion's parents there, nearest them on a tie. */
  function fusionCell(cluster: BoardCluster, parents: string[]): { q: number; r: number } {
    const there = cluster.tiles.filter((t) => parents.includes(t.id));
    const free = touchingFreeCells(cluster.tiles) as Array<{ q: number; r: number }>;
    const centre = (cell: { q: number; r: number }) => clusterCellPx(cluster, cell, layout.size);
    const score = (cell: { q: number; r: number }): number => {
      const touching = there.filter((t) => isNeighbour(cell, t)).length;
      const p = centre(cell);
      const dist = there.reduce((sum, t) => { const c = centre(t); return sum + Math.hypot(c.x - p.x, c.y - p.y); }, 0);
      return touching * 1e6 - dist;
    };
    return free.reduce((best, cell) => (score(cell) > score(best) ? cell : best), free[0]!);
  }

  /** The bench's Save: the fusion list goes whole; a new fusion takes a cell beside its parents. */
  async function saveFusion(fusion: Fusion): Promise<void> {
    if (!boardLoaded) throw new Error('Your board didn’t load. Reload to try again.');
    const next = state.fusions.some((f) => f.id === fusion.id) ? state.fusions.map((f) => (f.id === fusion.id ? fusion : f)) : [...state.fusions, fusion];
    state.fusions = await saveFusions(next);
    const onBoard = state.clusters.some((c) => c.tiles.some((t) => t.id === fusion.id));
    if (!onBoard) {
      const cluster = state.clusters.find((c) => c.id === fusion.cluster_id)
        ?? state.clusters.find((c) => c.tiles.some((t) => fusion.parents.includes(t.id)));
      if (cluster) {
        const cell = fusionCell(cluster, fusion.parents);
        state.clusters = state.clusters.map((c) => (c.id === cluster.id ? { ...c, tiles: [...c.tiles, { id: fusion.id, ...cell }] } : c));
      } else state.clusters = ensureOnBoard(state.clusters, [fusion.id]);
      relayout(false);
      await persistClusters();
    } else relayout(false);
    status.textContent = onBoard ? `Saved ${fusion.name}.` : `Fused ${fusion.name}. It sits beside its parents.`;
  }

  /** Draw or redraw one fusion's picture; the tile and any open panel show the result. */
  async function drawOne(id: string, note?: string): Promise<Fusion> {
    const result = await drawFusion(id, note);
    const fusion = result.fusion;
    state.fusions = state.fusions.map((f) => (f.id === id ? fusion : f));
    paint();
    if (state.selected === id) paintPanel();
    status.textContent = result.failed ? `The drawing for ${fusion.name} did not pass its checks, so nothing changed.` : `Drew ${fusion.name}.`;
    return fusion;
  }

  // ── what's working ──
  function paintProofPane(): void {
    proofPane.replaceChildren();
    if (state.proofState === 'loading') { proofPane.append(el('p', 'canvas-status', 'Working out the numbers…')); return; }
    renderWhatsWorking(proofPane, state.proof, {
      titleOf: (id) => nameOf(id),
      codeOf: (id) => { const e = techniqueById(id); return e ? `${e.code} | ${e.page}` : isFusionId(id) ? 'FUSED' : null; },
      onOpen: (id) => openFromProof(id)
    });
  }

  /** "What's working" shows in place of the board; the board's own buttons step aside. */
  function showProof(on: boolean): void {
    if (state.proofOpen === on) return;
    state.proofOpen = on;
    if (on) { if (state.selected) select(null); if (state.draw !== 'off') endDraw(); hidePop(); hideTip(); }
    stage.hidden = on;
    proofPane.hidden = !on;
    for (const b of cameraButtons) b.hidden = on;
    newClusterButton.hidden = on || state.view !== 'mine';
    syncViewButtons();
    if (on) { status.textContent = ''; paintProofPane(); }
  }

  function openFromProof(id: string): void {
    const onMine = onBoardIds().includes(id);
    if (!onMine && isFusionId(id)) { status.textContent = `${nameOf(id)} isn’t on your board just now.`; return; }
    showProof(false);
    setView(onMine ? 'mine' : 'book');
    select(id);
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

  /** Opens a tile. On My board `cluster` says which placement, since a tile may sit in several clusters. */
  function select(id: string | null, cluster: string | null = null): void {
    // A newly opened tile starts at the top of its panel.
    if (id !== state.selected) panel.scrollTop = 0;
    state.selected = id;
    state.selectedCluster = id && state.view === 'mine' ? (cluster ?? tileFor(id)?.cluster ?? null) : null;
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
    const tile = tileFor(id, state.selectedCluster);
    if (tile) focusTile(tile);
  }

  // ── my board ──
  /**
   * Whether the open tile is on My board, which cluster the panel was opened from (when on My
   * board), and why it can't come off when it can't: the live goal and arrow ends must keep one place.
   */
  function boardState(id: string): PanelModel['board'] {
    const on = onBoardIds().includes(id);
    const cluster = state.view === 'mine' ? clusterName(state.selectedCluster) : null;
    if (!on || !cluster) return { on, locked: null, cluster };
    const places = state.clusters.filter((c) => c.tiles.some((t) => t.id === id)).length;
    const live = liveGoal();
    if (places <= 1 && live && normalizeWalkthru(live.walkthru)?.technique_id === id) return { on, locked: 'It’s your current goal, so it stays on your board.', cluster };
    return { on, locked: null, cluster };
  }

  /** Nothing on My board but, at most, the untouched starter cluster: show the welcome instead. */
  function emptyBoard(): boolean {
    return state.view === 'mine' && !layout.tiles.length && state.clusters.every((c) => c.id === BOARD_CLUSTER_ID);
  }

  function paintEmpty(): void {
    const show = emptyBoard();
    empty.hidden = !show;
    if (!show) return;
    empty.replaceChildren(
      el('p', 'wt-empty__title', 'Your board is empty'),
      el('p', 'wt-empty__text', 'Make a cluster for the few techniques you’re working on, then add them from the whole book.'),
      el('div', 'wt-pop__row')
    );
    empty.lastElementChild!.append(button('Choose from the whole book', () => setView('book'), 'btn btn--primary'), button('+ New cluster', () => openNewCluster(null)));
  }

  function waitingNote(): string {
    if (state.view !== 'mine') return '';
    const on = new Set(onBoardIds());
    const off = state.suggestions.filter((x) => x.technique_id && !on.has(x.technique_id)).length;
    return off ? ` ${off === 1 ? 'A suggestion is' : `${off} suggestions are`} waiting in the whole book.` : '';
  }

  /** Lays the board out again after the view or Adam's clusters change. */
  function relayout(fit: boolean): void {
    drag.cancel();
    layout = layoutFor();
    if (state.selected && !tileFor(state.selected, state.selectedCluster)) {
      state.selected = null;
      state.selectedCluster = null;
      try { history.replaceState(null, '', '#/learning'); } catch { /* ignore */ }
    } else if (state.selected && state.view === 'mine') {
      state.selectedCluster = tileFor(state.selected, state.selectedCluster)?.cluster ?? null;
    }
    paint();
    paintPanel();
    paintEmpty();
    newClusterButton.hidden = state.view !== 'mine';
    if (fit) glideTo(fitAll());
  }

  function syncViewButtons(): void {
    viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === (state.proofOpen ? 'proof' : state.view))));
  }

  function setView(next: BoardView): void {
    if (state.proofOpen) showProof(false);
    if (state.view === next) return;
    state.view = next;
    keepView(next);
    syncViewButtons();
    if (state.draw !== 'off') endDraw();
    status.textContent = next === 'book'
      ? 'The whole book. Open a technique and choose Add to my board.'
      : `Your board. Drag a tile to move it; drag a title to move its cluster.${waitingNote()}`;
    relayout(true);
  }

  // ── saving clusters: at once for adds and take-offs, a moment after the last drag ──
  let saved: BoardCluster[] = state.clusters;
  let saveTimer = 0;
  /** Sends the clusters whole. A failure puts back what was last saved, if nothing has changed since. */
  async function saveNow(): Promise<boolean> {
    if (!boardLoaded) { status.textContent = 'Your board didn’t load, so this change can’t be saved. Reload to try again.'; return false; }
    const sending = state.clusters;
    try {
      const back = await saveBoardClusters(sending);
      saved = back;
      if (state.clusters === sending) state.clusters = back;
      return true;
    } catch (err) {
      if (state.clusters === sending) { state.clusters = saved; relayout(false); }
      status.textContent = `That didn’t save. ${errorMessage(err)}`;
      return false;
    }
  }
  function persistClusters(delay = 0): Promise<boolean> {
    window.clearTimeout(saveTimer);
    if (delay <= 0) return saveNow();
    return new Promise((resolve) => { saveTimer = window.setTimeout(() => void saveNow().then(resolve), delay); });
  }

  /** Takes a tile off one cluster. Off the board entirely, its arrows go with it. */
  async function takeOff(id: string, clusterId: string): Promise<void> {
    const { locked } = boardState(id);
    if (locked) { status.textContent = locked; return; }
    const from = clusterName(clusterId) ?? 'the cluster';
    const beforeArrows = state.arrows;
    state.clusters = removeTile(state.clusters, clusterId, id);
    const gone = !onBoardIds().includes(id);
    const dropped = gone ? state.arrows.filter((a) => a.from === id || a.to === id) : [];
    if (dropped.length) state.arrows = state.arrows.filter((a) => !dropped.includes(a));
    relayout(false);
    if (!(await persistClusters())) { state.arrows = beforeArrows; relayout(false); return; }
    try {
      if (dropped.length) state.arrows = await saveBoardArrows(state.arrows);
      status.textContent = `Took ${nameOf(id)} off ${from}${dropped.length ? `, with its ${dropped.length === 1 ? 'arrow' : `${dropped.length} arrows`}` : ''}.`;
    } catch (err) {
      state.arrows = beforeArrows;
      status.textContent = `That didn’t save. ${errorMessage(err)}`;
    }
    relayout(false);
  }

  async function addToClusterNamed(id: string, clusterId: string): Promise<void> {
    state.clusters = addTile(state.clusters, clusterId, id);
    hidePop();
    relayout(state.view === 'mine');
    if (await persistClusters()) status.textContent = `Added ${nameOf(id)} to ${clusterName(clusterId) ?? 'your board'}.`;
    paintPanel();
  }

  /** A short form in the pop-up: a cluster name and a button. Enter makes it. */
  function nameForm(title: string, action: string, onName: (name: string) => void, onBack: (() => void) | null): void {
    const input = el('input', 'wt-pop__input');
    input.type = 'text';
    input.maxLength = MAX_CLUSTER_NAME;
    input.placeholder = 'Cluster name';
    input.setAttribute('aria-label', 'Cluster name');
    const err = el('p', 'wt-pop__err');
    const go = (): void => {
      if (!input.value.trim()) { err.textContent = 'Give the cluster a name.'; return; }
      onName(input.value);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') hidePop(); });
    const row = el('div', 'wt-pop__row');
    row.append(button(action, go, 'btn btn--primary btn--small'), button(onBack ? 'Back' : 'Cancel', onBack ?? hidePop, 'btn btn--secondary btn--small'));
    pop.replaceChildren(el('p', 'wt-pop__title', title), input, err, row);
    pop.hidden = false;
    input.focus();
  }

  function createCluster(name: string): string | null {
    const made = makeCluster(state.clusters, name, newClusterSpot(clustersLayout({ clusters: state.clusters, entryOf })));
    if (!made) { status.textContent = 'That cluster couldn’t be made. The board holds 40 clusters at most.'; return null; }
    state.clusters = made.clusters;
    return made.id;
  }

  /** "+ New cluster": asks for a name, puts the empty cluster to the right of the others. */
  function openNewCluster(then: string | null): void {
    nameForm(then ? `New cluster for ${nameOf(then)}` : 'New cluster', then ? 'Make it and add' : 'Make it', (name) => {
      const id = createCluster(name);
      if (!id) return;
      hidePop();
      if (then) { void addToClusterNamed(then, id); return; }
      relayout(state.view === 'mine');
      void persistClusters().then((ok) => { if (ok) status.textContent = `Made ${clusterName(id)}. Add techniques to it from the whole book.`; });
    }, then ? () => chooseCluster(then) : null);
  }

  /** Adding from the whole book asks which cluster, or makes a new one. */
  function chooseCluster(id: string): void {
    const list = el('div', 'wt-pop__choices');
    for (const c of state.clusters) {
      const there = c.tiles.some((t) => t.id === id);
      const b = button(there ? `${c.name} · already there` : c.name, () => void addToClusterNamed(id, c.id), 'btn btn--secondary btn--small');
      b.disabled = there;
      list.append(b);
    }
    list.append(button('New cluster…', () => openNewCluster(id), 'btn btn--secondary btn--small'));
    const row = el('div', 'wt-pop__row');
    row.append(button('Cancel', hidePop, 'btn btn--secondary btn--small'));
    pop.replaceChildren(el('p', 'wt-pop__title', `Add ${nameOf(id)} to which cluster?`), list, row);
    pop.hidden = false;
    (list.querySelector('button:not(:disabled)') as HTMLButtonElement | null)?.focus();
  }

  async function startGoal(id: string): Promise<void> {
    const entry = entryOf(id);
    if (!entry) return;
    // A fusion takes its parents' set.
    const set = techniqueById(id)?.set ?? techniqueById(fusionOf(id)?.parents[0] ?? '')?.set ?? 1;
    const candidate = { id: '', sphere: 'professional', status: 'active', walkthru: { technique_id: id, set } };
    const refused = checkOneActive(state.goals, candidate);
    if (refused) { status.textContent = refused.message; paintPanel(); return; }
    try {
      const goal = await createWalkthruGoal({ title: `Get better at ${entry.name}`, walkthru: { technique_id: id, set, stage: 'attempt' } });
      state.goals = [...state.goals, goal];
      status.textContent = `Started working on ${entry.name}.`;
      // Working on it puts it on Adam's board for good, so it stays there once the goal ends.
      const next = ensureOnBoard(state.clusters, [id]);
      if (next !== state.clusters) { state.clusters = next; void persistClusters(); }
    } catch (err) {
      status.textContent = errorMessage(err);
    }
    if (state.view === 'mine') relayout(false); else { paint(); paintPanel(); }
  }

  // ── drag to arrange My board ──
  const tileByKey = (key: string): BoardTile | null => layout.tiles.find((t) => t.key === key) ?? null;
  const nodesOf = (subject: DragSubject): SVGElement[] => subject.kind === 'tile'
    ? [...world.querySelectorAll<SVGElement>('[data-key]')].filter((n) => n.dataset.key === subject.key)
    : [...world.querySelectorAll<SVGElement>('[data-cluster]')].filter((n) => n.dataset.cluster === subject.id);
  const drag = createDrag(board, {
    pick: (target) => {
      if (state.view !== 'mine' || state.draw !== 'off') return null;
      const tile = target.closest('[data-key]') as SVGElement | null;
      if (tile?.dataset.key) return { kind: 'tile', key: tile.dataset.key };
      const title = target.closest('[data-cluster-title]') as SVGElement | null;
      return title?.dataset.clusterTitle ? { kind: 'cluster', id: title.dataset.clusterTitle } : null;
    },
    scale: () => cam.k,
    onStart: (subject) => {
      hideTip();
      hidePop();
      board.classList.add('is-dragging');
      for (const n of nodesOf(subject)) { n.classList.add('is-dragged'); if (subject.kind === 'tile') n.parentNode?.append(n); }
    },
    onMove: (subject, by) => {
      for (const n of nodesOf(subject)) n.setAttribute('transform', `translate(${by.x.toFixed(1)} ${by.y.toFixed(1)})`);
    },
    onDrop: (subject, by) => {
      board.classList.remove('is-dragging');
      if (subject.kind === 'cluster') {
        const c = state.clusters.find((x) => x.id === subject.id);
        if (c) state.clusters = moveCluster(state.clusters, c.id, c.x + by.x, c.y + by.y);
        relayout(false);
        void persistClusters(SAVE_DELAY);
        return;
      }
      const tile = tileByKey(subject.key);
      if (!tile) { relayout(false); return; }
      const at = { x: tile.x + by.x, y: tile.y + by.y };
      const target = dropTarget(layout, tile, at);
      if (target.kind === 'fuse') {
        relayout(false);
        onFuseDrop(tile.id, target.target.id, target.target.cluster);
        return;
      }
      const to = state.clusters.find((c) => c.id === target.clusterId);
      if (!to) { relayout(false); return; }
      if (to.id !== tile.cluster && to.tiles.some((t) => t.id === tile.id)) {
        status.textContent = `${tile.name} is already in ${to.name}.`;
        relayout(false);
        return;
      }
      const cell = snapCell(to, tile.id, at, layout.size);
      state.clusters = placeTile(state.clusters, tile.cluster, tile.id, to.id, cell);
      if (state.selected === tile.id && state.selectedCluster === tile.cluster) state.selectedCluster = to.id;
      if (to.id !== tile.cluster) status.textContent = `Moved ${tile.name} to ${to.name}.`;
      relayout(false);
      void persistClusters(SAVE_DELAY);
    },
    onCancel: () => { board.classList.remove('is-dragging'); paint(); }
  });

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
    const a = { name: nameOf(from) };
    const b = { name: nameOf(to) };
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
    // An arrow drawn in the whole book brings its ends onto My board.
    const kept = ensureOnBoard(state.clusters, mustStay());
    if (kept !== state.clusters) { state.clusters = kept; void persistClusters(); }
    if (state.view === 'mine') relayout(false); else paint();
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

  function tileClicked(id: string, cluster: string | null = null): void {
    if (state.draw === 'from') {
      state.draw = 'to';
      state.drawFrom = id;
      status.textContent = `From ${nameOf(id)}. Now pick where it leads.`;
      paint();
      return;
    }
    if (state.draw === 'to') {
      if (id === state.drawFrom) { state.draw = 'from'; state.drawFrom = null; status.textContent = 'Pick the technique the arrow starts from.'; paint(); return; }
      openNewArrow(state.drawFrom!, id);
      return;
    }
    const same = state.selected === id && (state.view !== 'mine' || !cluster || state.selectedCluster === cluster);
    select(same ? null : id, cluster);
  }

  // ── toolbar ──
  const zoomBy = (factor: number): void => {
    const vp = viewport();
    const t = { ...cam };
    zoomAt(t, vp.w / 2, vp.h / 2, factor);
    glideTo(t);
  };
  const viewSwitch = el('div', 'wt-viewswitch');
  viewSwitch.setAttribute('role', 'group');
  viewSwitch.setAttribute('aria-label', 'Board');
  const viewButtons = (['mine', 'book', 'proof'] as const).map((v) => {
    const b = button(v === 'mine' ? 'My board' : v === 'book' ? 'Whole book' : 'What’s working', () => (v === 'proof' ? showProof(true) : setView(v)), 'wt-viewswitch__btn');
    b.dataset.view = v;
    b.setAttribute('aria-pressed', String(state.view === v));
    return b;
  });
  viewSwitch.append(...viewButtons);
  const newClusterButton = button('+ New cluster', () => openNewCluster(null));
  newClusterButton.hidden = state.view !== 'mine';
  const cameraButtons = [button('Fit', () => glideTo(fitAll())), button('+', () => zoomBy(1.6)), button('−', () => zoomBy(1 / 1.6)), drawButton];
  toolbar.append(viewSwitch, newClusterButton, ...cameraButtons, status);
  toolbar.querySelectorAll('button').forEach((b) => { if (b.textContent === '+') b.setAttribute('aria-label', 'Zoom in'); if (b.textContent === '−') b.setAttribute('aria-label', 'Zoom out'); });

  // ── pointer: pan, pinch, click ──
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let pinchStart = 0;
  board.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    // A press on a tile or title on My board may become a drag; a second finger cancels it for a pinch.
    if (pointers.size === 1) drag.down(e); else drag.cancel();
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y); }
  });
  board.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1 && drag.move(e)) { if (drag.active()) { dragged = true; stopAnim(); } return; }
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
  const release = (e: PointerEvent): void => {
    if (drag.up(e)) dragged = true;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
  };
  board.addEventListener('pointerup', release);
  board.addEventListener('pointercancel', release);
  // A trackpad's two-finger scroll pans; a pinch (ctrl + wheel, or Safari's gesture events) and a
  // mouse wheel's notches zoom, quickly enough that a few moves cross the whole book.
  board.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = board.getBoundingClientRect();
    stopAnim();
    hideTip();
    const lines = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? r.height : 1;
    const dx = e.deltaX * lines;
    const dy = e.deltaY * lines;
    if (e.ctrlKey) zoomAt(cam, e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.012));
    else if (isMouseWheel(e, dx, dy)) wheelZoom(cam, e.clientX - r.left, e.clientY - r.top, dy * 2.5);
    else panBy(cam, -dx, -dy);
    applyCamera();
  }, { passive: false });
  let gestureK = 1;
  const onGesture = (e: Event & { scale?: number; clientX?: number; clientY?: number }): void => {
    e.preventDefault();
    if (e.type === 'gesturestart') { gestureK = 1; return; }
    const scale = e.scale ?? 1;
    const r = board.getBoundingClientRect();
    stopAnim();
    zoomAt(cam, (e.clientX ?? r.left + r.width / 2) - r.left, (e.clientY ?? r.top + r.height / 2) - r.top, scale / gestureK);
    gestureK = scale;
    applyCamera();
  };
  board.addEventListener('gesturestart', onGesture as EventListener, { passive: false });
  board.addEventListener('gesturechange', onGesture as EventListener, { passive: false });

  board.addEventListener('click', (e) => {
    if (dragged) { dragged = false; return; }
    const target = e.target as Element;
    if (target.closest('[data-close]')) { select(null); return; }
    const robber = target.closest('[data-suggestion]');
    if (robber && state.draw === 'off') { openSuggestion((robber as SVGElement).dataset.suggestion!, robber); return; }
    const tile = target.closest('[data-tile]');
    if (tile) { tileClicked((tile as SVGElement).dataset.tile!, (tile as SVGElement).dataset.cluster ?? null); return; }
    const arrow = target.closest('[data-arrow]');
    if (arrow && state.draw === 'off') { openArrowMenu((arrow as SVGElement).dataset.arrow!, arrow); return; }
    hidePop();
  });
  board.addEventListener('keydown', (e) => {
    const tile = (e.target as Element).closest('[data-tile]') as SVGElement | null;
    const close = (e.target as Element).closest('[data-close]');
    const robber = (e.target as Element).closest('[data-suggestion]') as SVGElement | null;
    if ((e.key === 'Enter' || e.key === ' ') && robber && state.draw === 'off') { e.preventDefault(); openSuggestion(robber.dataset.suggestion!, robber); return; }
    if ((e.key === 'Enter' || e.key === ' ') && (tile || close)) { e.preventDefault(); if (close) select(null); else tileClicked(tile!.dataset.tile!, tile!.dataset.cluster ?? null); }
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
    if (e.key === 'Escape' && drag.active()) { drag.cancel(); return; }
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
  if (!bookLayout.tiles.length) {
    stage.replaceChildren(el('p', 'empty-state', 'No WalkThrus techniques are in the catalogue yet.'));
    return;
  }
  // A link to a technique that isn't on Adam's board opens the whole book on it.
  if (options.technique && !layout.tiles.some((t) => t.id === options.technique) && bookLayout.tiles.some((t) => t.id === options.technique)) {
    state.view = 'book';
    syncViewButtons();
    newClusterButton.hidden = true;
    layout = layoutFor();
  }
  assignCamera(cam, initialCamera());
  if (options.technique && layout.tiles.some((t) => t.id === options.technique)) {
    state.selected = options.technique;
    state.selectedCluster = state.view === 'mine' ? tileFor(options.technique)?.cluster ?? null : null;
  }
  paint();
  paintPanel();
  paintEmpty();
  if (state.selected) {
    void ensureText();
    const tile = tileFor(state.selected, state.selectedCluster);
    if (tile) assignCamera(cam, focusCamera(tile));
    applyCamera();
  }
  // Proof never holds up the board: it arrives when it arrives, and a failure shows nothing.
  void loadProof().then((proof) => {
    state.proof = proof;
    state.proofState = 'ready';
    paint();
    refreshProofStrip();
  }).catch(() => { state.proofState = 'failed'; }).finally(() => { if (state.proofOpen) paintProofPane(); });
  if (!state.arrows.length && !data.notices.length) status.textContent = `Draw arrow joins two techniques. Click a hexagon to open it.${waitingNote()}`;
  else if (!data.notices.length) status.textContent = waitingNote().trim();
}
