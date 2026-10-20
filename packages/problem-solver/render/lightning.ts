// packages/problem-solver/render/lightning.ts
// Lightning problem solving (toolkit pp.158–159): the whole flowchart laid out as the book's
// spread, left page then right page, in ink and paper only. Every box waits faint; the run's
// path inks in solid as it goes, and each arrow it takes draws in along its length.
// - Checks (Start, Define the goal, every "Is it solved?") are black rounded boxes; choices and
//   strategies are paper boxes with an ink rule; Relax is a black circle; the two closing boxes
//   (ours, not the book's) are paper with a double rule along the bottom of the left page.
// - Relax is one node but the book draws it three times: under Start, in the middle of the
//   right page and at its foot. The spot that inks is chosen by the box before it.
// - Yes and No sit in small paper circles on the arrows. At the current yes/no box, its two
//   circles become the answer buttons (44px), when the page passes `onAnswer`.
// - Earlier rounds ("It came back") stay inked but greyed; a reframing loop shows ×N on the
//   arrow back to the goal.
// The stage keeps its size (text at 12px or more) inside its own sideways scroller; the current
// box is brought into view when it moves. A hidden ordered list reads the path out.
import type { PsLightningEntry, PsLightningNodeId, PsLightningState } from '../types';
import { LIGHTNING_EDGES, LIGHTNING_NODES, currentEntry, isQuestion, passes } from '../lightning.mjs';
import { EASE, canAnimate, cancelAnimations, reducedMotion } from './details';

export type LightningAnswer = 'yes' | 'no';
export type LightningView = { el: HTMLDivElement; update(state: PsLightningState): void; destroy(): void };
export type LightningViewOptions = { onAnswer?(node: PsLightningNodeId, answer: LightningAnswer): void };

type Spot = 'relax_start' | 'relax_middle' | 'relax_bottom';
type Place = PsLightningNodeId | Spot;
type Box = { x: number; y: number; w: number; h: number };
type Pt = [number, number];

const SVG = 'http://www.w3.org/2000/svg';
const DRAW_MS = 360;
const PAD = 16;

/**
 * Where each box sits on the stage, in px, measured off the book's spread (scaled to about
 * 1000 wide). The three Relax spots are circles 46 across; Relax itself has no box of its own.
 */
export const LAYOUT: Record<Exclude<Place, 'relax'>, Box> = {
  // Left page.
  start: { x: 37, y: 84, w: 144, h: 62 },
  relax_start: { x: 32, y: 213, w: 46, h: 46 },
  goal: { x: 84, y: 239, w: 102, h: 42 },
  cannot: { x: 261, y: 84, w: 152, h: 75 },
  reframing: { x: 259, y: 226, w: 150, h: 80 },
  subtract: { x: 70, y: 354, w: 136, h: 56 },
  one_step: { x: 269, y: 354, w: 136, h: 56 },
  via_negativa: { x: 72, y: 495, w: 165, h: 96 },
  guess_check: { x: 259, y: 495, w: 169, h: 96 },
  // Right page.
  solved_4: { x: 628, y: 40, w: 114, h: 39 },
  take_break: { x: 845, y: 30, w: 149, h: 88 },
  analogy: { x: 582, y: 140, w: 193, h: 66 },
  solved_3: { x: 876, y: 183, w: 114, h: 39 },
  solved_5: { x: 589, y: 236, w: 114, h: 40 },
  make_list: { x: 843, y: 265, w: 148, h: 79 },
  relax_middle: { x: 691, y: 294, w: 46, h: 46 },
  diagram: { x: 608, y: 359, w: 178, h: 58 },
  solved_2: { x: 876, y: 409, w: 115, h: 38 },
  work_backwards: { x: 847, y: 491, w: 145, h: 84 },
  solved_1: { x: 616, y: 495, w: 114, h: 41 },
  relax_bottom: { x: 676, y: 596, w: 46, h: 46 },
  // Ours: the two closing questions, in a row along the bottom of the left page.
  learn: { x: 96, y: 672, w: 150, h: 40 },
  next: { x: 290, y: 672, w: 150, h: 40 }
};

const SPOTS: Spot[] = ['relax_start', 'relax_middle', 'relax_bottom'];
/** Reading order of the boxes: the book's flow, left page then right. */
const ORDER: Place[] = ['start', 'relax_start', 'goal', 'subtract', 'one_step', 'via_negativa', 'guess_check', 'diagram', 'solved_1', 'relax_bottom', 'work_backwards', 'solved_2', 'make_list', 'solved_3', 'take_break', 'solved_4', 'analogy', 'solved_5', 'relax_middle', 'reframing', 'cannot', 'learn', 'next'];

/** A short line under each strategy's name, in our words. */
const HINT: Partial<Record<PsLightningNodeId, string>> = {
  via_negativa: 'Stop, drop or remove one thing.',
  guess_check: 'Try a quick guess, then check it.',
  diagram: 'Sketch what leads to what.',
  work_backwards: 'Start at the result and trace the steps back.',
  make_list: 'List what is untried; work through it.',
  take_break: 'Step away and come back fresh.',
  analogy: 'Borrow from a similar problem already solved.'
};

/** The Relax spot a path reaches, from the box before it. */
export function relaxSpot(previous: string | null | undefined): Spot {
  if (previous === 'start') return 'relax_start';
  if (previous === 'solved_1') return 'relax_bottom';
  return 'relax_middle';
}

type EdgeSpec = { key: string; from: PsLightningNodeId; to: PsLightningNodeId; spot: Spot | null; label: 'yes' | 'no' | null; points: Pt[]; mark?: Pt; thin?: boolean };

/** Bus lines the book shares: the strategies' feed into the first "solved?" and the Yes column into Relax. */
const FEED: Pt[] = [[650, 625], [650, 536]];
const TO_MIDDLE: Pt[] = [[795, 317], [737, 317]];
const TO_LEARN: Pt[] = [[480, 656], [171, 656], [171, 672]];

/** Every arrow, routed as the book routes it, with its Yes or No circle. */
const ROUTES: Record<string, Omit<EdgeSpec, 'key' | 'from' | 'to' | 'spot' | 'label'>> = {
  'start>relax': { points: [[55, 146], [55, 213]], mark: [55, 174] },
  'start>goal': { points: [[135, 146], [135, 239]], mark: [135, 174] },
  'goal>subtract': { points: [[135, 281], [135, 354]] },
  'subtract>via_negativa': { points: [[135, 410], [135, 495]], mark: [135, 446] },
  'subtract>one_step': { points: [[206, 381], [269, 381]], mark: [237, 381] },
  'one_step>guess_check': { points: [[337, 410], [337, 495]], mark: [337, 446] },
  'one_step>diagram': { points: [[405, 381], [608, 381]], mark: [438, 381] },
  'via_negativa>solved_1': { points: [[154, 591], [154, 625], ...FEED] },
  'guess_check>solved_1': { points: [[343, 591], [343, 625], ...FEED] },
  'diagram>solved_1': { points: [[697, 417], [697, 495]] },
  'solved_1>relax': { points: [[699, 536], [699, 596]], mark: [699, 564] },
  'solved_1>work_backwards': { points: [[730, 515], [847, 515]], mark: [772, 515] },
  'work_backwards>solved_2': { points: [[933, 491], [933, 447]] },
  'solved_2>relax': { points: [[876, 428], [795, 428], ...TO_MIDDLE], mark: [850, 428] },
  'solved_2>make_list': { points: [[933, 409], [933, 344]], mark: [933, 377] },
  'make_list>solved_3': { points: [[933, 265], [933, 222]] },
  'solved_3>relax': { points: [[876, 203], [795, 203], ...TO_MIDDLE], mark: [850, 203] },
  'solved_3>take_break': { points: [[933, 183], [933, 118]], mark: [933, 151] },
  'take_break>solved_4': { points: [[845, 59], [742, 59]] },
  'solved_4>relax': { points: [[724, 79], [724, 108], [795, 108], ...TO_MIDDLE], mark: [724, 108] },
  'solved_4>analogy': { points: [[647, 79], [647, 140]], mark: [647, 108] },
  'analogy>solved_5': { points: [[646, 206], [646, 236]] },
  'solved_5>relax': { points: [[703, 256], [795, 256], ...TO_MIDDLE], mark: [732, 256] },
  'solved_5>reframing': { points: [[621, 276], [621, 290], [409, 290]], mark: [560, 290] },
  'reframing>goal': { points: [[259, 261], [186, 261]], mark: [222, 261] },
  'reframing>cannot': { points: [[334, 226], [334, 159]], mark: [334, 193] },
  'cannot>learn': { points: [[413, 121], [480, 121], ...TO_LEARN], thin: true },
  'relax>learn@relax_start': { points: [[55, 259], [55, 692], [96, 692]], thin: true },
  'relax>learn@relax_middle': { points: [[691, 317], [480, 317], ...TO_LEARN], thin: true },
  'relax>learn@relax_bottom': { points: [[699, 642], [699, 656], ...TO_LEARN.slice(1)], thin: true },
  'learn>next': { points: [[246, 692], [290, 692]], thin: true }
};

function edgeSpecs(): EdgeSpec[] {
  const out: EdgeSpec[] = [];
  for (const edge of LIGHTNING_EDGES as Array<{ from: PsLightningNodeId; to: PsLightningNodeId | null; label: 'yes' | 'no' | null }>) {
    if (!edge.to) continue;
    const key = `${edge.from}>${edge.to}`;
    if (edge.from === 'relax') {
      for (const spot of SPOTS) out.push({ key, from: edge.from, to: edge.to, spot, label: null, ...ROUTES[`${key}@${spot}`] });
      continue;
    }
    const spot = edge.to === 'relax' ? relaxSpot(edge.from) : null;
    out.push({ key, from: edge.from, to: edge.to, spot, label: edge.label, ...ROUTES[key] });
  }
  return out;
}

const f = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const lineD = (points: Pt[]): string => points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');
/** The arrowhead at the last point, pointing along the last segment. */
function headD(points: Pt[]): string {
  const [x2, y2] = points[points.length - 1];
  const [x1, y1] = points[points.length - 2];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const back = 7;
  const half = 4;
  const bx = x2 - ux * back;
  const by = y2 - uy * back;
  return `M${f(x2)} ${f(y2)} L${f(bx - uy * half)} ${f(by + ux * half)} L${f(bx + uy * half)} ${f(by - ux * half)} Z`;
}
/** The line stops where the arrowhead starts, so the tip stays sharp. */
function trimmed(points: Pt[]): Pt[] {
  const out = points.map((p) => [...p] as Pt);
  const [x2, y2] = out[out.length - 1];
  const [x1, y1] = out[out.length - 2];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  out[out.length - 1] = [x2 - ((x2 - x1) / len) * 6, y2 - ((y2 - y1) / len) * 6];
  return out;
}

type NodeState = 'ghost' | 'done' | 'current';
type NodeEl = { place: Place; id: PsLightningNodeId; item: HTMLDivElement; shape: HTMLDivElement; state: NodeState; old: boolean; anim: Animation | null };
type EdgeEl = { spec: EdgeSpec; g: SVGGElement; line: SVGPathElement; head: SVGPathElement; halo: SVGPathElement | null; mark: HTMLSpanElement | null; inked: boolean; old: boolean; anims: Animation[] };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}
function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const out = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) out.setAttribute(k, v);
  return out;
}
function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
const placeOf = (path: PsLightningEntry[], i: number): Place => (path[i].node === 'relax' ? relaxSpot(path[i - 1]?.node) : path[i].node);
const sameStep = (a: PsLightningEntry, b: PsLightningEntry): boolean => a.node === b.node && a.round === b.round;
const ANSWER = { yes: 'Yes', no: 'No' } as const;

/** Read a run's path into what the chart shows: the places and arrows it reached, by round. */
function readPath(state: PsLightningState): { places: Map<Place, boolean>; edges: Map<string, boolean>; current: Place | null } {
  const places = new Map<Place, boolean>();
  const edges = new Map<string, boolean>();
  const now = state.rounds;
  const mark = <K>(map: Map<K, boolean>, key: K, round: number) => map.set(key, map.get(key) === true || round === now);
  state.path.forEach((entry, i) => {
    mark(places, placeOf(state.path, i), entry.round);
    const before = state.path[i - 1];
    if (!before || before.round !== entry.round) return;
    const fromPlace = placeOf(state.path, i - 1);
    const key = `${before.node}>${entry.node}`;
    mark(edges, before.node === 'relax' ? `${key}@${fromPlace}` : key, entry.round);
  });
  const cur = currentEntry(state);
  return { places, edges, current: cur ? placeOf(state.path, state.path.length - 1) : null };
}
const edgeId = (spec: EdgeSpec): string => (spec.from === 'relax' ? `${spec.key}@${spec.spot}` : spec.key);

export function createLightningView(doc: Document = document, opts: LightningViewOptions = {}): LightningView {
  const root = el(doc, 'div', 'ps-ltn');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Lightning problem solving');

  const scroller = el(doc, 'div', 'ps-ltn__scroll');
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', 'Lightning chart');
  scroller.tabIndex = 0;
  const stage = el(doc, 'div', 'ps-ltn__stage');
  const width = Math.max(...Object.values(LAYOUT).map((b) => b.x + b.w)) + PAD;
  const height = Math.max(...Object.values(LAYOUT).map((b) => b.y + b.h)) + PAD;
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  // Arrows: the book's flow first, then the thin closing arrows over it with a paper halo, so
  // where they cross a line they read as passing over it.
  const svg = svgEl(doc, 'svg', { class: 'ps-ltn__edges', viewBox: `0 0 ${width} ${height}`, width: String(width), height: String(height), 'aria-hidden': 'true', focusable: 'false' });
  const flowLayer = svgEl(doc, 'g', { class: 'ps-ltn__flow' });
  const haloLayer = svgEl(doc, 'g', { class: 'ps-ltn__halos' });
  const closeLayer = svgEl(doc, 'g', { class: 'ps-ltn__closing' });
  const entry = svgEl(doc, 'g', { class: 'ps-ltn__entry' });
  entry.append(svgEl(doc, 'path', { class: 'ps-ltn__line', d: lineD([[109, 54], [109, 78]]) }), svgEl(doc, 'path', { class: 'ps-ltn__head', d: headD([[109, 54], [109, 84]]) }));
  svg.append(flowLayer, haloLayer, closeLayer, entry);

  const startWord = el(doc, 'span', 'ps-ltn__start', 'Start');
  startWord.setAttribute('aria-hidden', 'true');

  const list = el(doc, 'div', 'ps-ltn__nodes');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Flowchart boxes');
  const marks = el(doc, 'div', 'ps-ltn__marks');
  marks.setAttribute('aria-hidden', 'true');
  const badge = el(doc, 'span', 'ps-ltn__badge');
  badge.setAttribute('aria-hidden', 'true');
  badge.hidden = true;

  const ask = el(doc, 'div', 'ps-ltn__ask');
  ask.setAttribute('role', 'group');
  ask.hidden = true;
  const buttons: Record<LightningAnswer, HTMLButtonElement> = { yes: el(doc, 'button', 'ps-ltn__answer', 'Yes'), no: el(doc, 'button', 'ps-ltn__answer', 'No') };
  let asking: PsLightningNodeId | null = null;
  let askedKey: string | null = null;
  for (const answer of ['yes', 'no'] as const) {
    const button = buttons[answer];
    button.type = 'button';
    button.setAttribute('data-answer', answer);
    // aria-disabled, not disabled: a focused button keeps focus while the answer is on its way,
    // and the same two buttons move to the next question.
    button.addEventListener('click', () => {
      if (!asking || button.getAttribute('aria-disabled') === 'true') return;
      buttons.yes.setAttribute('aria-disabled', 'true');
      buttons.no.setAttribute('aria-disabled', 'true');
      opts.onAnswer?.(asking, answer);
    });
    ask.append(button);
  }
  stage.append(svg, startWord, list, marks, badge, ask);
  scroller.append(stage);

  const swipe = el(doc, 'p', 'ps-ltn__swipe', 'Scroll sideways for the whole chart.');
  swipe.setAttribute('aria-hidden', 'true');
  const outline = el(doc, 'ol', 'ps-ltn__sr');
  outline.setAttribute('role', 'list');
  outline.setAttribute('aria-label', 'Lightning path');
  root.append(scroller, swipe, outline);

  // ---------------------------------------------------------------- boxes

  const nodes = new Map<Place, NodeEl>();
  for (const place of ORDER) {
    const id = (SPOTS as Place[]).includes(place) ? 'relax' : (place as PsLightningNodeId);
    const def = LIGHTNING_NODES[id];
    const box = LAYOUT[place as keyof typeof LAYOUT];
    const item = el(doc, 'div', `ps-ltn__node ps-ltn__node--${def.kind}`);
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-lnode', id);
    if (id === 'relax') item.setAttribute('data-spot', place);
    item.setAttribute('data-kind', def.kind);
    item.setAttribute('data-state', 'ghost');
    Object.assign(item.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
    const shape = el(doc, 'div', 'ps-ltn__shape');
    shape.setAttribute('data-shape', '');
    shape.setAttribute('data-fill', 'paper');
    const strategy = def.kind === 'strategy' && HINT[id];
    shape.append(el(doc, 'span', `ps-ltn__title${strategy ? ' ps-ltn__name' : ''}`, def.label));
    if (strategy) shape.append(el(doc, 'span', 'ps-ltn__title ps-ltn__hint', HINT[id]!));
    item.append(shape);
    list.append(item);
    nodes.set(place, { place, id, item, shape, state: 'ghost', old: false, anim: null });
  }

  // ---------------------------------------------------------------- arrows

  const edges = new Map<string, EdgeEl>();
  for (const spec of edgeSpecs()) {
    const g = svgEl(doc, 'g', { class: `ps-ltn__edge${spec.thin ? ' ps-ltn__edge--thin' : ''}`, 'data-edge': spec.key, 'data-state': 'ghost' });
    if (spec.spot) g.setAttribute('data-spot', spec.spot);
    const line = svgEl(doc, 'path', { class: 'ps-ltn__line', d: lineD(trimmed(spec.points)), pathLength: '1' });
    const head = svgEl(doc, 'path', { class: 'ps-ltn__head', d: headD(spec.points) });
    g.append(line, head);
    // A closing arrow's halo shows only while that arrow is inked, so a faint one never cuts a gap.
    const halo = spec.thin ? svgEl(doc, 'path', { class: 'ps-ltn__halo', d: lineD(trimmed(spec.points)) }) : null;
    if (halo) haloLayer.append(halo);
    (spec.thin ? closeLayer : flowLayer).append(g);
    let mark: HTMLSpanElement | null = null;
    if (spec.label && spec.mark) {
      mark = el(doc, 'span', 'ps-ltn__mark', ANSWER[spec.label]);
      mark.setAttribute('data-mark', spec.key);
      mark.setAttribute('data-state', 'ghost');
      mark.style.left = `${spec.mark[0]}px`;
      mark.style.top = `${spec.mark[1]}px`;
      marks.append(mark);
    }
    edges.set(edgeId(spec), { spec, g, line, head, halo, mark, inked: false, old: false, anims: [] });
  }

  // ---------------------------------------------------------------- update

  let painted = false;
  let destroyed = false;
  let shown: PsLightningEntry[] = [];
  let shownCurrent: Place | null = null;
  let frame = 0;
  const outlineItems: HTMLLIElement[] = [];

  /** A later path that only adds steps to the one on show (not a reload, an undo or a no-op). */
  function grew(path: PsLightningEntry[]): boolean {
    if (path.length <= shown.length) return false;
    return shown.every((step, i) => sameStep(step, path[i]));
  }

  function syncNodes(read: ReturnType<typeof readPath>, animate: boolean): NodeEl[] {
    const born: NodeEl[] = [];
    for (const n of nodes.values()) {
      const reached = read.places.get(n.place);
      const state: NodeState = n.place === read.current ? 'current' : reached === undefined ? 'ghost' : 'done';
      const old = state === 'done' && reached === false;
      if (animate && state !== 'ghost' && n.state === 'ghost') born.push(n);
      if (n.state !== state) stopNode(n);
      n.state = state;
      n.old = old;
      setAttr(n.item, 'data-state', state);
      setAttr(n.item, 'data-round', old ? 'old' : null);
      setAttr(n.item, 'aria-current', state === 'current' ? 'step' : null);
      // The fill the text sits on: ink once a check or Relax is reached, paper otherwise.
      setAttr(n.shape, 'data-fill', state !== 'ghost' && (n.id === 'relax' || LIGHTNING_NODES[n.id].kind === 'check') ? 'ink' : 'paper');
    }
    return born;
  }

  function syncEdges(read: ReturnType<typeof readPath>, animate: boolean): EdgeEl[] {
    const drawn: EdgeEl[] = [];
    let reorder = false;
    for (const [id, e] of edges) {
      const reached = read.edges.get(id);
      const inked = reached !== undefined;
      const old = inked && reached === false;
      if (inked && !e.inked && animate) drawn.push(e);
      if (!inked && e.inked) stopEdge(e);
      if (inked !== e.inked || old !== e.old) reorder = true;
      e.inked = inked;
      e.old = old;
      const state = inked ? 'done' : 'ghost';
      setAttr(e.g, 'data-state', state);
      setAttr(e.g, 'data-inked', inked ? 'true' : null);
      if (e.halo) setAttr(e.halo, 'data-inked', inked ? 'true' : null);
      setAttr(e.g, 'data-round', old ? 'old' : null);
      if (e.mark) {
        setAttr(e.mark, 'data-state', state);
        setAttr(e.mark, 'data-round', old ? 'old' : null);
      }
    }
    // Inked arrows lie over faint ones where the book's lines share a run; this round's over older.
    if (reorder) {
      const rank = (e: EdgeEl): number => (e.inked ? (e.old ? 1 : 2) : 0);
      for (const e of [...edges.values()].sort((a, b) => rank(a) - rank(b))) e.g.parentNode!.appendChild(e.g);
    }
    return drawn;
  }

  function stopNode(n: NodeEl): void {
    n.anim?.cancel();
    n.anim = null;
  }

  function stopEdge(e: EdgeEl): void {
    for (const anim of e.anims) anim.cancel();
    e.anims = [];
  }

  function syncAsk(state: PsLightningState): void {
    const cur = currentEntry(state);
    const node = cur && isQuestion(cur.node) && opts.onAnswer ? cur.node : null;
    for (const e of edges.values()) if (e.mark) e.mark.hidden = Boolean(node) && e.spec.from === node;
    // An answer stays sent until the question moves on: a re-render of the same state keeps
    // the buttons waiting, so one click can never answer twice.
    const key = cur ? `${cur.node}|${cur.round}|${state.path.length}` : null;
    if (key !== askedKey) for (const answer of ['yes', 'no'] as const) buttons[answer].removeAttribute('aria-disabled');
    askedKey = key;
    asking = node;
    if (!node) {
      // Focus on a button about to hide goes to the chart's scroller, not the page.
      if (!ask.hidden && ask.contains(doc.activeElement)) scroller.focus({ preventScroll: true });
      ask.hidden = true;
      return;
    }
    ask.hidden = false;
    const label = LIGHTNING_NODES[node].label;
    ask.setAttribute('aria-label', `Answer: ${label}`);
    for (const answer of ['yes', 'no'] as const) {
      const spec = [...edges.values()].find((e) => e.spec.from === node && e.spec.label === answer)!.spec;
      const button = buttons[answer];
      button.style.left = `${spec.mark![0]}px`;
      button.style.top = `${spec.mark![1]}px`;
      button.setAttribute('aria-label', `${ANSWER[answer]}: ${label}`);
    }
  }

  function syncBadge(state: PsLightningState): void {
    const count = passes(state);
    badge.hidden = count < 2;
    setText(badge, count < 2 ? '' : `×${count}`);
  }

  function syncOutline(state: PsLightningState): void {
    const cur = currentEntry(state);
    state.path.forEach((step, i) => {
      let li = outlineItems[i];
      if (!li) {
        li = el(doc, 'li', 'ps-ltn__step');
        outlineItems.push(li);
        outline.append(li);
      }
      const parts = [`${state.rounds > 1 ? `Round ${step.round}: ` : ''}${LIGHTNING_NODES[step.node].label}.`];
      if (step.answer) parts.push(`Answer: ${ANSWER[step.answer]}.`);
      if (step.note) parts.push(`Note: ${step.note}`);
      if (cur && i === state.path.length - 1) parts.push('(now)');
      setText(li, parts.join(' '));
    });
    while (outlineItems.length > state.path.length) outlineItems.pop()!.remove();
  }

  /** Bring the current box into the scroller's view, centred across, never moving the page. */
  function reveal(place: Place, smooth: boolean): void {
    const box = LAYOUT[place as keyof typeof LAYOUT];
    const view = scroller.clientWidth;
    if (!view || view >= width) return;
    const left = Math.max(0, Math.min(box.x + box.w / 2 - view / 2, width - view));
    if (Math.abs(scroller.scrollLeft - left) < 1) return;
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    else scroller.scrollLeft = left;
  }

  function update(state: PsLightningState): void {
    if (destroyed) return;
    const animate = painted && grew(state.path);
    const read = readPath(state);
    const born = syncNodes(read, animate);
    const drawn = syncEdges(read, animate);
    syncAsk(state);
    syncBadge(state);
    syncOutline(state);

    // New arrows draw in along their length in path order, then the box they reach settles in.
    drawn.forEach((e, i) => {
      stopEdge(e);
      if (!canAnimate(e.line)) return;
      const delay = i * 140;
      e.anims.push(e.line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: DRAW_MS, delay, easing: EASE, fill: 'backwards' }));
      e.anims.push(e.head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, delay: delay + DRAW_MS - 120, easing: EASE, fill: 'backwards' }));
    });
    const settle = drawn.length ? (drawn.length - 1) * 140 + DRAW_MS - 80 : 0;
    born.forEach((n, i) => {
      if (!canAnimate(n.shape)) return;
      n.anim = n.shape.animate([{ opacity: 0.35, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: Math.min(settle, 120 + i * 140), easing: EASE, fill: 'backwards' });
    });

    // The current box comes into view when it moves: at once on the first paint, gently after.
    if (read.current && read.current !== shownCurrent) {
      const place = read.current;
      if (painted) reveal(place, animate);
      else if (typeof requestAnimationFrame === 'function') {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!destroyed) reveal(place, false);
        });
      }
    }
    shownCurrent = read.current;
    shown = state.path.map((step) => ({ ...step }));
    painted = true;
  }

  // A click on a box waiting for a yes or no goes to its Yes button, the real control.
  stage.addEventListener('click', (event) => {
    if (!asking || !(event.target instanceof Element)) return;
    if (event.target.closest('[data-state="current"]')) buttons.yes.focus();
  });

  return {
    el: root,
    update,
    /** Stop any arrow still drawing and the pending scroll once the page drops this view. */
    destroy() {
      destroyed = true;
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = 0;
      for (const e of edges.values()) stopEdge(e);
      for (const n of nodes.values()) stopNode(n);
      cancelAnimations(root);
    }
  };
}
