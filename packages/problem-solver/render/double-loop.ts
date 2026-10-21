// packages/problem-solver/render/double-loop.ts
// Double-loop learning (toolkit, Improve), drawn as the book draws it on a square stage: a tall
// blue outer loop running clockwise, and a flatter blue inner loop across its middle. The two meet
// at the left, where the yellow Action strategy box sits, and at the right, where the red Problem
// box sits ("Start here"). Yellow Consequences sits at the top of the outer loop and yellow
// Governing variables at the bottom. Blue Solution sits outside the loops at the top right, reached
// from Consequences by a curved Match arrow; the outer loop's upper right arc, back down to
// Problem, is the Mismatch.
// Once the run has its first node the stage shows: every loop and arrow as a faint track and every
// box faint, until it has an entry. The inner loop draws in once the single-loop fix is placed.
// The recurrence decides the rest: when it came back, the Mismatch arc lights and the outer loop
// draws in; when it held, the Match arrow lights and the outer loop stays faint. A small ink marker
// rests on the box of the latest entry and moves between boxes when that changes.
// Boxes with several entries show the latest and a count; all of them are in the box's details
// card, in a panel under the stage. Phone (the root up to 480px wide): the boxes show a code and
// their heading only, and a key under the stage pairs each code with its latest entry; the key
// items are the touch targets.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { LOOP_STAGE, loopStage, recurs } from '../tools/double-loop.mjs';
import { EASE, canAnimate, cancelAnimations, contestedTag, createDisclosureGroup, detailsCard, nextId, syncContested, syncObjectionNote } from './details';

export type DoubleLoopView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type BoxKey = 'problem' | 'action' | 'consequences' | 'governing' | 'solution';
/** Reading and tab order follows the loop from where the book says to start. */
const ORDER: BoxKey[] = ['problem', 'action', 'consequences', 'governing', 'solution'];
const BOXES: Record<BoxKey, { heading: string; code: string; tone: Accent }> = {
  problem: { heading: 'Problem', code: 'P', tone: 'red' },
  action: { heading: 'Action strategy', code: 'A', tone: 'yellow' },
  consequences: { heading: 'Consequences', code: 'C', tone: 'yellow' },
  governing: { heading: 'Governing variables', code: 'G', tone: 'yellow' },
  solution: { heading: 'Solution', code: 'S', tone: 'blue' }
};

/** Where each box's centre sits, and its width, in percent of the square stage (measured off the book's page). */
const PLACE: Record<BoxKey, { x: number; y: number; w: number }> = {
  consequences: { x: 38.5, y: 11.5, w: 26.5 },
  solution: { x: 88.2, y: 15, w: 21.6 },
  action: { x: 13.8, y: 45, w: 25.6 },
  problem: { x: 69.5, y: 45, w: 26.4 },
  governing: { x: 43, y: 87.4, w: 33 }
};

// The loops, in the stage's 0-100 units. Angles run clockwise on screen from the right.
const OUTER = { cx: 43, cy: 48.2, rx: 28.7, ry: 40.9 };
const INNER = { cx: 44.2, cy: 50.5, rx: 25.2, ry: 15.5 };
type Ellipse = typeof OUTER;
type Pt = [number, number];

const SVG = 'http://www.w3.org/2000/svg';
const HEAD_LEN = 3.6;
const HEAD_HALF = 2.3;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const at = (e: Ellipse, deg: number): Pt => [e.cx + e.rx * Math.cos(rad(deg)), e.cy + e.ry * Math.sin(rad(deg))];
const tangent = (e: Ellipse, deg: number): Pt => {
  const dx = -e.rx * Math.sin(rad(deg));
  const dy = e.ry * Math.cos(rad(deg));
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
};
const f = (n: number): string => n.toFixed(2);

/** A clockwise arc of an ellipse from one angle to another (degrees, `to` greater than `from`). */
function arc(e: Ellipse, from: number, to: number): string {
  const [x1, y1] = at(e, from);
  const [x2, y2] = at(e, to);
  return `M${f(x1)} ${f(y1)} A${e.rx} ${e.ry} 0 ${to - from > 180 ? 1 : 0} 1 ${f(x2)} ${f(y2)}`;
}

/** An arrowhead centred on a point, pointing along a unit direction. */
function head([x, y]: Pt, [dx, dy]: Pt, len = HEAD_LEN, half = HEAD_HALF): string {
  const tip: Pt = [x + (dx * len) / 2, y + (dy * len) / 2];
  const bx = x - (dx * len) / 2;
  const by = y - (dy * len) / 2;
  return `M${f(tip[0])} ${f(tip[1])} L${f(bx - dy * half)} ${f(by + dx * half)} L${f(bx + dy * half)} ${f(by - dx * half)} Z`;
}
const headOn = (e: Ellipse, deg: number): string => head(at(e, deg), tangent(e, deg));

// Match: from Consequences' right side, arching up and over to Solution's left side.
const MATCH_FROM: Pt = [52, 12.2];
const MATCH_VIA: Pt = [64.5, 4.6];
const MATCH_TO: Pt = [75.4, 14];
function matchHead(): string {
  const dx = MATCH_TO[0] - MATCH_VIA[0];
  const dy = MATCH_TO[1] - MATCH_VIA[1];
  const len = Math.hypot(dx, dy);
  const d: Pt = [dx / len, dy / len];
  return head([MATCH_TO[0] - (d[0] * HEAD_LEN) / 2, MATCH_TO[1] - (d[1] * HEAD_LEN) / 2], d);
}

type TrackKey = 'inner' | 'act' | 'mismatch' | 'outer' | 'match';
/**
 * Each track: its path, its arrowheads, and how it is marked. `inner` and `outer` are the loops
 * (`data-loop`, drawn or not); the rest are arrows (`data-arrow`, lit or not). `act` is the outer
 * loop's upper left arc, from Action strategy up to Consequences, travelled either way the
 * recurrence goes.
 */
const TRACKS: Record<TrackKey, { d: string; heads: string[]; attr: 'data-loop' | 'data-arrow' }> = {
  inner: { d: `${arc(INNER, 0, 180)} ${arc(INNER, 180, 360).replace(/^M[^A]*/, '')}`, heads: [headOn(INNER, 95)], attr: 'data-loop' },
  act: { d: arc(OUTER, 180, 270), heads: [headOn(OUTER, 216)], attr: 'data-arrow' },
  mismatch: { d: arc(OUTER, 270, 360), heads: [], attr: 'data-arrow' },
  outer: { d: arc(OUTER, 0, 180), heads: [headOn(OUTER, 36), headOn(OUTER, 145)], attr: 'data-loop' },
  match: { d: `M${MATCH_FROM.join(' ')} Q${MATCH_VIA.join(' ')} ${MATCH_TO.join(' ')}`, heads: [matchHead()], attr: 'data-arrow' }
};
const TRACK_ORDER: TrackKey[] = ['inner', 'act', 'mismatch', 'outer', 'match'];

/** Small ink labels on the stage: [text, class modifier, left %, top %]. */
const LABELS: Array<[string, string, number, number]> = [
  ['Match', 'match', 64.5, 3.6],
  ['Mismatch', 'mismatch', 68.5, 22],
  ['Start here', 'start', 63.8, 29.6],
  ['Single-loop learning', 'single', 43.5, 53],
  ['Double-loop learning', 'double', 72.5, 67.5]
];
/** The small line under each loop's name (desktop only). */
const SUBTITLES: Record<string, string> = {
  single: 'What gets done as things stand',
  double: 'What should be done, ideally'
};
// The "Start here" pointer: a short curved ink arrow onto the Problem box.
const START_LINE = 'M64.6 31.2 Q66.9 31.7 67.3 35.6';
const START_HEAD = head([67.35, 36.2], [0.08, 1], 1.8, 1.2);

type Model = Record<BoxKey, PsNode[]>;

/** What a node is in its box, for its details card and the box's tag line. */
function roleOf(node: PsNode): string {
  const slot = parseSlot(node.slot);
  switch (slot?.name) {
    case 'problem': return 'Problem';
    case 'single': return 'Single-loop fix';
    case 'recurs': return recurTag(node.tag);
    case 'governing': return `Governing variable ${slot.index ?? ''}`.trim();
    case 'reframe': return 'Reframed';
    case 'strategy': return `New strategy ${slot.index ?? ''}`.trim();
    case 'test': return 'Small test';
    case 'monitor': return 'Monitor and go round again';
    default: return '';
  }
}
function recurTag(tag: string | undefined): string {
  return tag === 'yes' ? 'Mismatch: it came back' : tag === 'no' ? 'Match: it held' : 'Does it recur?';
}

function readModel(run: PsToolRun): Model {
  const model: Model = { problem: [], action: [], consequences: [], governing: [], solution: [] };
  for (const node of run.nodes) {
    const name = parseSlot(node.slot)?.name;
    const key = name ? (LOOP_STAGE as Record<string, BoxKey | undefined>)[name] : undefined;
    if (key) model[key].push(node);
  }
  return model;
}

/** The tag line a box shows under its latest entry. */
function tagLine(key: BoxKey, nodes: PsNode[]): string {
  const latest = nodes[nodes.length - 1];
  if (!latest) return '';
  const name = parseSlot(latest.slot)?.name;
  if (key === 'consequences') {
    const recur = nodes.find((node) => parseSlot(node.slot)?.name === 'recurs');
    return recur ? recurTag(recur.tag) : '';
  }
  if (key === 'action' && name === 'strategy') return 'New';
  if (key === 'governing' && name === 'reframe') return 'Reframed';
  return '';
}

const cardKeyOf = (node: PsNode): string => `${node.text}\u0000${node.tag ?? ''}\u0000${node.slot}\u0000${(node.skills ?? []).join(',')}`;

type Box = {
  key: BoxKey;
  item: HTMLDivElement;
  shape: HTMLDivElement;
  button: HTMLButtonElement;
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  tag: HTMLSpanElement;
  count: HTMLSpanElement;
  details: HTMLDivElement;
  inner: HTMLDivElement;
  keyItem: HTMLButtonElement;
  keyCode: HTMLSpanElement;
  keyTitle: HTMLSpanElement;
  /** The box's tag line again (the recurrence, New, Reframed), as the phone box has no room for it. */
  keyNote: HTMLSpanElement;
  keyTag: HTMLSpanElement | null;
  ids: string;
  latest: string | null;
};
type Track = { key: TrackKey; g: SVGGElement; reveal: SVGPathElement; heads: SVGPathElement[]; on: boolean; anims: Animation[] };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}
function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const out = doc.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  for (const [name, value] of Object.entries(attrs)) out.setAttribute(name, value);
  return out;
}
function setText(target: Element, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}
function setAttr(target: Element, name: string, value: string | null): void {
  if (value === null) {
    if (target.hasAttribute(name)) target.removeAttribute(name);
  } else if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

export function createDoubleLoopView(doc: Document = document): DoubleLoopView {
  const root = doc.createElement('div');
  root.className = 'ps-dloop';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Double-loop learning');

  const boxes = new Map<BoxKey, Box>();
  const tracks = new Map<TrackKey, Track>();
  /** One details card per node, made once and kept while the node lasts. */
  const cards = new Map<string, { card: HTMLElement; key: string }>();
  const group = createDisclosureGroup({ onChange: syncOpen });
  let stage: HTMLDivElement | null = null;
  let marker: HTMLSpanElement | null = null;
  let markerAnim: Animation | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  // ---------------------------------------------------------------- the stage

  function buildStage(): void {
    stage = el(doc, 'div', 'ps-dloop__stage');
    stage.setAttribute('data-region', 'loops');
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', 'Loops');

    const svg = svgEl(doc, 'svg', { class: 'ps-dloop__loops', viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
    for (const key of TRACK_ORDER) {
      const spec = TRACKS[key];
      const g = svgEl(doc, 'g', { class: `ps-dloop__track ps-dloop__track--${key}`, [spec.attr]: key });
      g.setAttribute(spec.attr === 'data-loop' ? 'data-drawn' : 'data-lit', 'false');
      // A faint track always; the lit line over it shows through a mask that draws in along the
      // path. (The lit line keeps its stroke width at any size, and a non-scaling stroke cannot
      // carry the path-length dash, so the dash lives on the mask.)
      const maskId = nextId('ps-dloop-mask');
      const mask = svgEl(doc, 'mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: '-5', y: '-5', width: '110', height: '110' });
      const reveal = svgEl(doc, 'path', { class: 'ps-dloop__reveal', d: spec.d, pathLength: '1', fill: 'none', stroke: '#fff', 'stroke-width': '5', 'stroke-dasharray': '1 1', 'stroke-dashoffset': '1' });
      mask.append(reveal);
      const faint = svgEl(doc, 'path', { class: 'ps-dloop__faint', d: spec.d });
      const line = svgEl(doc, 'path', { class: 'ps-dloop__line', d: spec.d, mask: `url(#${maskId})` });
      g.append(mask, faint, line);
      const heads = spec.heads.map((d) => svgEl(doc, 'path', { class: 'ps-dloop__arrowhead', d }));
      g.append(...heads);
      svg.append(g);
      tracks.set(key, { key, g, reveal, heads, on: false, anims: [] });
    }
    svg.append(svgEl(doc, 'path', { class: 'ps-dloop__pointer', d: START_LINE }), svgEl(doc, 'path', { class: 'ps-dloop__pointer-head', d: START_HEAD }));

    const labels = el(doc, 'div', 'ps-dloop__labels');
    for (const [text, mod, left, top] of LABELS) {
      const label = el(doc, 'span', `ps-dloop__meta ps-dloop__label ps-dloop__label--${mod}`, text);
      label.style.left = `${left}%`;
      label.style.top = `${top}%`;
      const sub = SUBTITLES[mod];
      if (sub) label.append(el(doc, 'span', 'ps-dloop__meta ps-dloop__label-sub', sub));
      labels.append(label);
    }

    const list = el(doc, 'div', 'ps-dloop__boxes');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Double-loop boxes');
    const key = el(doc, 'div', 'ps-dloop__key');
    // The key repeats the boxes as larger touch targets on a phone; screen readers use the boxes.
    key.setAttribute('aria-hidden', 'true');
    const panel = el(doc, 'div', 'ps-dloop__panel');
    for (const boxKey of ORDER) {
      const box = makeBox(boxKey);
      boxes.set(boxKey, box);
      list.append(box.item);
      key.append(box.keyItem);
      panel.append(box.details);
    }
    marker = el(doc, 'span', 'ps-dloop__marker');
    marker.setAttribute('aria-hidden', 'true');
    marker.setAttribute('data-stage', 'problem');
    boxes.get('problem')!.item.append(marker);

    stage.append(svg, labels, list);
    root.append(stage, key, panel);
  }

  function makeBox(key: BoxKey): Box {
    const words = BOXES[key];
    const place = PLACE[key];
    const detailsId = nextId('ps-dloop-details');
    const item = el(doc, 'div', `ps-dloop__item ps-dloop__item--${key}`);
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-box', key);
    item.style.left = `${place.x}%`;
    item.style.top = `${place.y}%`;
    item.style.width = `${place.w}%`;
    const shape = el(doc, 'div', 'ps-dloop__shape');
    shape.setAttribute('data-shape', '');
    shape.setAttribute('data-fill', 'paper');
    shape.setAttribute('data-tone', words.tone);
    const button = el(doc, 'button', 'ps-dloop__button');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    // Phone boxes can be small; the key item for the same box is the 44px target.
    button.setAttribute('data-target-ok', '');
    const head = el(doc, 'span', 'ps-dloop__head');
    const code = el(doc, 'span', 'ps-dloop__code', words.code);
    code.setAttribute('aria-hidden', 'true');
    const count = el(doc, 'span', 'ps-dloop__count ps-dloop__tag--count');
    head.append(code, el(doc, 'span', 'ps-dloop__meta', words.heading), count);
    const title = el(doc, 'span', 'ps-dloop__title');
    const tag = el(doc, 'span', 'ps-dloop__tag');
    button.append(head, title, tag);
    shape.append(button);
    item.append(shape);

    const details = el(doc, 'div', 'ps-details');
    details.id = detailsId;
    details.setAttribute('data-box-for', key);
    const inner = el(doc, 'div', 'ps-details__inner');
    details.append(inner);
    group.register(details, button);

    const keyItem = el(doc, 'button', 'ps-dloop__key-item');
    keyItem.type = 'button';
    keyItem.tabIndex = -1;
    keyItem.disabled = true;
    keyItem.setAttribute('data-tone', words.tone);
    const keyCode = el(doc, 'span', 'ps-dloop__key-code', words.code);
    const keyWords = el(doc, 'span', 'ps-dloop__key-words');
    const keyTitle = el(doc, 'span', 'ps-dloop__key-title');
    const keyTag = el(doc, 'span', 'ps-dloop__key-tag');
    keyWords.append(el(doc, 'span', 'ps-dloop__key-meta', words.heading), keyTitle, keyTag);
    keyItem.append(keyCode, keyWords);
    // Focus goes to the box button, so it never rests inside the aria-hidden key.
    keyItem.addEventListener('click', () => {
      button.click();
      button.focus({ preventScroll: true });
    });

    setAttr(button, 'aria-label', `${words.heading}: nothing yet`);
    return { key, item, shape, button, head, title, tag, count, details, inner, keyItem, keyCode, keyTitle, keyNote: keyTag, keyTag: null, ids: '', latest: null };
  }

  function syncOpen(): void {
    for (const box of boxes.values()) {
      const open = box.details.classList.contains('is-open');
      box.item.classList.toggle('is-open', open);
      box.keyItem.classList.toggle('is-open', open);
    }
  }

  // ---------------------------------------------------------------- boxes

  function cardFor(node: PsNode, tone: Accent): HTMLElement {
    const wanted = cardKeyOf(node);
    const have = cards.get(node.id);
    if (have && have.key === wanted) {
      syncObjectionNote(have.card, node);
      return have.card;
    }
    const card = detailsCard(doc, node, tone, '').querySelector<HTMLElement>('.ps-details__card')!;
    card.setAttribute('data-for', node.id);
    const role = roleOf(node);
    if (role) card.prepend(el(doc, 'p', 'ps-dloop__card-head', role));
    cards.set(node.id, { card, key: wanted });
    return card;
  }

  function syncBox(box: Box, nodes: PsNode[], animate: boolean): void {
    const words = BOXES[box.key];
    const ids = nodes.map((node) => node.id).join(' ');
    const latest = nodes[nodes.length - 1] ?? null;
    const was = box.latest;
    const wasFilled = box.ids !== '';
    if (!latest) {
      if (box.details.classList.contains('is-open')) group.close();
      box.inner.replaceChildren();
      box.ids = '';
      box.latest = null;
      setAttr(box.item, 'data-node', null);
      box.shape.classList.remove('is-filled');
      setAttr(box.shape, 'data-fill', 'paper');
      box.item.classList.remove('is-contested');
      box.head.querySelector('.ps-objection')?.remove();
      box.keyTag?.remove();
      setText(box.title, '');
      setText(box.tag, '');
      setText(box.count, '');
      setText(box.keyTitle, '');
      setText(box.keyNote, '');
      box.button.disabled = true;
      box.keyItem.disabled = true;
      box.keyItem.classList.remove('is-filled');
      setAttr(box.button, 'aria-label', `${words.heading}: nothing yet`);
      return;
    }
    box.ids = ids;
    box.latest = latest.id;
    setAttr(box.item, 'data-node', ids);
    box.shape.classList.add('is-filled');
    setAttr(box.shape, 'data-fill', words.tone);
    box.button.disabled = false;
    box.keyItem.disabled = false;
    box.keyItem.classList.add('is-filled');
    const title = nodeTitle(latest);
    const tag = tagLine(box.key, nodes);
    const extra = nodes.length - 1;
    setText(box.title, title);
    setText(box.tag, tag);
    setText(box.count, extra > 0 ? `+${extra}` : '');
    setText(box.keyTitle, extra > 0 ? `${title} (+${extra})` : title);
    setText(box.keyNote, tag);

    const contested = nodes.find((node) => node.state === 'contested') ?? null;
    syncContested(box.item, contested ?? latest, box.head);
    if (contested) {
      box.keyTag ??= contestedTag(doc, contested);
      box.keyTag.title = contested.objection ?? '';
      if (!box.keyTag.parentNode) box.keyTitle.after(box.keyTag);
    } else box.keyTag?.remove();
    const many = extra > 0 ? `, ${nodes.length} entries` : '';
    setAttr(box.button, 'aria-label', `${words.heading}: ${title}${tag ? ` (${tag})` : ''}${many}${contested ? ', contested' : ''}. Show details`);

    const wanted = nodes.map((node) => cardFor(node, words.tone));
    const have = [...box.inner.children];
    if (wanted.length !== have.length || wanted.some((card, i) => card !== have[i])) box.inner.replaceChildren(...wanted);

    if (!animate || was === latest.id) return;
    // A box filling pops; a new latest entry in a filled box fades its words in.
    if (!wasFilled) {
      if (canAnimate(box.shape)) {
        cancelAnimations(box.shape);
        box.shape.animate([{ opacity: 0.4, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
      }
      return;
    }
    for (const part of [box.title, box.tag]) {
      if (!canAnimate(part)) continue;
      cancelAnimations(part);
      part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE, fill: 'backwards' });
    }
    if (extra > 0 && canAnimate(box.count)) {
      cancelAnimations(box.count);
      box.count.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 380, easing: EASE });
    }
  }

  /** Drop the cards of nodes that have gone, so nothing keeps their id. */
  function pruneCards(run: PsToolRun): void {
    const live = new Set(run.nodes.map((node) => node.id));
    for (const [id, { card }] of cards) {
      if (live.has(id)) continue;
      card.remove();
      cards.delete(id);
    }
  }

  // ---------------------------------------------------------------- loops and arrows

  function syncTrack(track: Track, on: boolean, animate: boolean, delay: number): void {
    const spec = TRACKS[track.key];
    setAttr(track.g, spec.attr === 'data-loop' ? 'data-drawn' : 'data-lit', String(on));
    track.g.classList.toggle('is-on', on);
    setAttr(track.reveal, 'stroke-dashoffset', on ? '0' : '1');
    if (on === track.on) return;
    track.on = on;
    // Off: no motion, and nothing left drawing.
    for (const anim of track.anims) anim.cancel();
    track.anims = [];
    if (!on || !animate) return;
    if (canAnimate(track.reveal)) {
      track.anims.push(track.reveal.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: track.key === 'match' ? 420 : 620, delay, easing: EASE, fill: 'backwards' }));
    }
    for (const h of track.heads) {
      if (canAnimate(h)) track.anims.push(h.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200, delay: delay + 360, easing: EASE, fill: 'backwards' }));
    }
  }

  function syncTracks(model: Model, run: PsToolRun, animate: boolean): void {
    const recur = recurs(run);
    const state: Record<TrackKey, boolean> = {
      inner: model.action.some((node) => parseSlot(node.slot)?.name === 'single'),
      act: recur === 'yes' || recur === 'no',
      mismatch: recur === 'yes',
      outer: recur === 'yes',
      // Match: it held, or the recurring branch has reached a solution to watch.
      match: recur === 'no' || model.solution.length > 0
    };
    let delay = 0;
    for (const key of TRACK_ORDER) {
      const track = tracks.get(key)!;
      const turningOn = state[key] && !track.on;
      syncTrack(track, state[key], animate, delay);
      if (turningOn) delay += 200;
    }
  }

  // ---------------------------------------------------------------- marker

  /** The box the marker should rest on for this run. */
  function markerBox(run: PsToolRun): Box {
    return boxes.get(loopStage(run) as BoxKey) ?? boxes.get('problem')!;
  }

  /**
   * Move the marker onto its box. FLIP between measured centres: `before` is the marker's place,
   * read at the top of update() before any write; this moves it, reads the new place and animates.
   */
  function syncMarker(target: Box, before: DOMRect | null): void {
    if (!marker || marker.parentNode === target.item) return;
    markerAnim?.cancel();
    markerAnim = null;
    setAttr(marker, 'data-stage', target.key);
    target.item.append(marker);
    if (!before || !canAnimate(marker)) return;
    const after = marker.getBoundingClientRect();
    const dx = before.left + before.width / 2 - (after.left + after.width / 2);
    const dy = before.top + before.height / 2 - (after.top + after.height / 2);
    markerAnim = marker.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: 520, easing: EASE, fill: 'backwards' });
  }

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    if (destroyed) return;
    if (!stage && !run.nodes.length) {
      painted = true;
      return;
    }
    const animate = painted;
    if (!stage) {
      buildStage();
      if (animate && canAnimate(stage!)) stage!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: EASE, fill: 'backwards' });
    }
    // Read the marker's place before anything is written, when it is about to move.
    const target = markerBox(run);
    const before = animate && marker && marker.parentNode !== target.item ? marker.getBoundingClientRect() : null;
    const model = readModel(run);
    pruneCards(run);
    for (const box of boxes.values()) syncBox(box, model[box.key], animate);
    syncTracks(model, run, animate);
    syncMarker(target, before);
    painted = true;
  }

  return {
    el: root,
    update,
    /** Stop any motion and ignore later updates once the canvas drops this view. */
    destroy() {
      destroyed = true;
      markerAnim?.cancel();
      for (const track of tracks.values()) for (const anim of track.anims) anim.cancel();
      cancelAnimations(root);
    }
  };
}
