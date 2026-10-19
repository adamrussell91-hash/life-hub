// packages/problem-solver/render/contradiction.ts
// Contradiction (TRIZ's general problem). The book has no chart for it, so this follows the
// tool's emblem: on a yellow ground, a blue triangle pointing up (what should improve) beside
// a red triangle pointing down (what gets worse). Each triangle appears with its node: the
// blue one rises into place, the red one drops. Once both exist a thin double-headed tension
// line draws out from between them to each. The statement sits in full in a card beneath,
// like the composed problem statement. On a narrow panel the triangles stay side by side and
// scale down; on the narrowest their words move under them.
// The triangles are inline SVG, so the paper-and-ink focus ring is two stroked copies of the
// same triangle behind the fill: it follows the slanted sides and is never clipped.
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type ContradictionView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type Side = 'improving' | 'worsening';

const SVG = 'http://www.w3.org/2000/svg';
const SIDES: Side[] = ['improving', 'worsening'];
const META: Record<Side, string> = { improving: 'Improves', worsening: 'Worsens' };
const LABEL: Record<Side, string> = { improving: 'What should improve', worsening: 'What gets worse' };
/** viewBox 0 0 100 86: near equilateral, point up for improving, point down for worsening. */
const POINTS: Record<Side, string> = { improving: '50,0 100,86 0,86', worsening: '0,0 100,0 50,86' };
const GAP = 6;
const HEAD_LEN = 9;
const HEAD_HALF = 5;

type Shape = { side: Side; region: HTMLDivElement; item: HTMLDivElement; button: HTMLButtonElement; title: HTMLSpanElement; card: HTMLElement; node: PsNode };
type Tension = { g: SVGGElement; halves: SVGPathElement[]; heads: SVGPathElement[]; anims: Animation[] };
type Statement = { region: HTMLDivElement; item: HTMLDivElement; head: HTMLDivElement; text: HTMLParagraphElement; more: HTMLButtonElement; node: PsNode };

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, className: string): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  el.setAttribute('class', className);
  return el;
}

export function createContradictionView(doc: Document = document): ContradictionView {
  const root = doc.createElement('div');
  root.className = 'ps-contra';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Contradiction');

  const group = createDisclosureGroup();
  const shapes = new Map<Side, Shape>();
  let stage: HTMLDivElement | null = null;
  let overlay: SVGSVGElement | null = null;
  let panel: HTMLDivElement | null = null;
  let tension: Tension | null = null;
  let statement: Statement | null = null;
  let observer: ResizeObserver | null = null;

  function ensureStage(): HTMLDivElement {
    if (stage) return stage;
    stage = doc.createElement('div');
    stage.className = 'ps-contra__stage';
    overlay = svgEl(doc, 'svg', 'ps-contra__links');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('focusable', 'false');
    stage.append(overlay);
    panel = doc.createElement('div');
    panel.className = 'ps-contra__panel';
    root.prepend(stage, panel);
    if (canAnimate(stage)) stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE, fill: 'backwards' });
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => layout());
      observer.observe(stage);
    }
    return stage;
  }

  function teardown(): void {
    for (const anim of tension?.anims ?? []) anim.cancel();
    observer?.disconnect();
    observer = null;
    root.replaceChildren();
    shapes.clear();
    stage = overlay = panel = null;
    tension = null;
    statement = null;
  }

  function syncOpen(): void {
    for (const shape of shapes.values()) shape.card.classList.toggle('is-open', shape.item.classList.contains('is-open'));
  }

  function addShape(node: PsNode, side: Side): Shape {
    const detailsId = nextId('ps-contra-details');
    const region = doc.createElement('div');
    region.className = `ps-contra__region ps-contra__region--${side}`;
    region.setAttribute('data-region', side);
    region.setAttribute('aria-label', LABEL[side]);
    const item = doc.createElement('div');
    item.className = `ps-contra__item ps-contra__item--${side}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ps-contra__shape';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    // Back to front: ink ring, paper ring, then the flat fill. The rings are wide strokes on
    // copies of the triangle, so half of each lies outside the fill: paper 2px, ink 2px more.
    const art = svgEl(doc, 'svg', 'ps-contra__art');
    art.setAttribute('viewBox', '0 0 100 86');
    art.setAttribute('preserveAspectRatio', 'none');
    art.setAttribute('aria-hidden', 'true');
    art.setAttribute('focusable', 'false');
    for (const part of ['ink', 'paper', 'fill']) {
      const poly = svgEl(doc, 'polygon', `ps-contra__${part}`);
      poly.setAttribute('points', POINTS[side]);
      art.append(poly);
    }
    const words = span(doc, 'ps-contra__words');
    const title = span(doc, 'ps-contra__title', nodeTitle(node));
    words.append(span(doc, 'ps-contra__meta', META[side]), title);
    button.append(art, words);
    item.append(button);
    region.append(item);
    // Improving on the left, worsening on the right, whatever order they arrive in.
    const stageEl = ensureStage();
    if (side === 'improving') stageEl.insertBefore(region, shapes.get('worsening')?.region ?? null);
    else stageEl.append(region);
    const card = detailsCard(doc, node, side === 'improving' ? 'blue' : 'red', detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);
    const shape: Shape = { side, region, item, button, title, card, node };
    shapes.set(side, shape);
    return shape;
  }

  function paint(shape: Shape, node: PsNode): void {
    shape.node = node;
    const title = nodeTitle(node);
    if (shape.title.textContent !== title) shape.title.textContent = title;
    syncContested(shape.item, node, shape.title.parentElement, shape.button);
    const label = `${LABEL[shape.side]}: ${title}${node.state === 'contested' ? ', contested' : ''}. Show details`;
    if (shape.button.getAttribute('aria-label') !== label) shape.button.setAttribute('aria-label', label);
  }

  function removeShape(side: Side): void {
    const shape = shapes.get(side);
    if (!shape) return;
    shape.region.remove();
    shape.card.remove();
    shapes.delete(side);
  }

  function addTension(): Tension {
    const g = svgEl(doc, 'g', 'ps-contra__tension');
    const halves = [0, 1].map(() => {
      const half = svgEl(doc, 'path', 'ps-contra__line');
      half.setAttribute('pathLength', '1');
      return half;
    });
    const heads = [0, 1].map(() => svgEl(doc, 'path', 'ps-contra__head'));
    g.append(...halves, ...heads);
    overlay!.append(g);
    return { g, halves, heads, anims: [] };
  }

  function removeTension(): void {
    if (!tension) return;
    for (const anim of tension.anims) anim.cancel();
    tension.g.remove();
    tension = null;
  }

  /** The line runs out from the middle to each side, so both halves draw at once. */
  function drawIn(t: Tension, delay: number): void {
    for (const anim of t.anims) anim.cancel();
    t.anims = [];
    if (!canAnimate(t.halves[0])) return;
    for (const half of t.halves) t.anims.push(half.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 360, delay, easing: EASE, fill: 'backwards' }));
    for (const head of t.heads) t.anims.push(head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: delay + 260, easing: EASE, fill: 'backwards' }));
  }

  /** The button's layout box inside the stage (offsets, so a triangle mid-rise is measured where it lands). */
  function boxOf(el: HTMLElement): { l: number; t: number; w: number; h: number } | null {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h || !stage) return null;
    let l = 0;
    let t = 0;
    let at: HTMLElement | null = el;
    while (at && at !== stage) {
      l += at.offsetLeft;
      t += at.offsetTop;
      at = at.offsetParent as HTMLElement | null;
    }
    if (at !== stage) {
      const a = el.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      l = a.left - s.left;
      t = a.top - s.top;
    }
    return { l, t, w, h };
  }

  /** Measure both triangles, then write the line: across their middles, slanted side to slanted side. */
  function layout(): void {
    if (!stage || !overlay) return;
    const width = stage.offsetWidth;
    const height = stage.offsetHeight;
    const up = shapes.get('improving');
    const down = shapes.get('worsening');
    // The button's top is the triangle's; its height is the triangle's only while the words
    // sit inside, so the triangle's height comes from its width (viewBox 100 by 86).
    const tri = (shape: Shape | undefined) => {
      const box = shape ? boxOf(shape.button) : null;
      return box ? { ...box, h: box.w * 0.86 } : null;
    };
    const a = tri(up);
    const b = tri(down);
    const view = `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`;
    if (overlay.getAttribute('viewBox') !== view) overlay.setAttribute('viewBox', view);
    if (!tension) return;
    if (!a || !b) {
      tension.g.setAttribute('hidden', '');
      return;
    }
    tension.g.removeAttribute('hidden');
    // At half height the up triangle's right side is 3/4 across it, the down triangle's left side 1/4.
    const y = ((a.t + a.h / 2) + (b.t + b.h / 2)) / 2;
    const x1 = a.l + a.w * 0.75 + GAP;
    const x2 = b.l + b.w * 0.25 - GAP;
    const mid = (x1 + x2) / 2;
    const f = (n: number) => n.toFixed(1);
    const ends = [x1, x2];
    ends.forEach((x, i) => {
      const dir = i === 0 ? -1 : 1;
      const stop = x - dir * (HEAD_LEN - 1);
      const d = `M${f(mid)} ${f(y)} L${f(stop)} ${f(y)}`;
      if (tension!.halves[i].getAttribute('d') !== d) tension!.halves[i].setAttribute('d', d);
      const base = x - dir * HEAD_LEN;
      const head = `M${f(x)} ${f(y)} L${f(base)} ${f(y - HEAD_HALF)} L${f(base)} ${f(y + HEAD_HALF)} Z`;
      if (tension!.heads[i].getAttribute('d') !== head) tension!.heads[i].setAttribute('d', head);
    });
    // Too close to draw (a very narrow panel): leave the gap empty rather than overlap the heads.
    tension.g.classList.toggle('is-cramped', x2 - x1 < HEAD_LEN * 2 + 8);
  }

  function ensureStatement(node: PsNode): boolean {
    if (statement) return false;
    const detailsId = nextId('ps-contra-details');
    const region = doc.createElement('div');
    region.className = 'ps-contra__region ps-contra__region--statement';
    region.setAttribute('data-region', 'statement');
    region.setAttribute('aria-label', 'The contradiction in one sentence');
    const item = doc.createElement('div');
    item.className = 'ps-contra__statement';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const head = doc.createElement('div');
    head.className = 'ps-contra__statement-head';
    head.append(span(doc, 'ps-contra__statement-meta', 'The contradiction'));
    const text = doc.createElement('p');
    text.className = 'ps-contra__statement-text';
    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'ps-contra__more';
    more.textContent = 'Details';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', detailsId);
    const card = detailsCard(doc, node, 'red', detailsId);
    // The card repeats the answer, so here it carries only the skills and any objection.
    card.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, card);
    group.register(item, more);
    region.append(item);
    root.append(region);
    statement = { region, item, head, text, more, node };
    return true;
  }

  function paintStatement(node: PsNode): void {
    if (!statement) return;
    statement.node = node;
    if (statement.text.textContent !== node.text) statement.text.textContent = node.text;
    syncContested(statement.item, node, statement.head, statement.more);
  }

  function update(run: PsToolRun): void {
    const found: Partial<Record<Side | 'statement', PsNode>> = {};
    for (const node of run.nodes) {
      const name = parseSlot(node.slot)?.name;
      if ((name === 'improving' || name === 'worsening' || name === 'statement') && !found[name]) found[name] = node;
    }
    if (!found.improving && !found.worsening && !found.statement) {
      if (stage || statement) teardown();
      return;
    }
    ensureStage();

    // An undo: drop what went, and the line once either end is gone.
    for (const side of SIDES) {
      const shape = shapes.get(side);
      if (shape && shape.node.id !== found[side]?.id) removeShape(side);
    }
    if (statement && statement.node.id !== found.statement?.id) {
      statement.region.remove();
      statement = null;
    }

    const fresh: Shape[] = [];
    for (const side of SIDES) {
      const node = found[side];
      if (!node) continue;
      let shape = shapes.get(side);
      if (!shape) {
        shape = addShape(node, side);
        fresh.push(shape);
      }
      paint(shape, node);
    }
    stage!.classList.toggle('has-both', shapes.size === 2);

    let drawTension = false;
    if (shapes.size === 2 && !tension) {
      tension = addTension();
      drawTension = true;
    } else if (shapes.size < 2) removeTension();

    const freshStatement = found.statement ? ensureStatement(found.statement) : false;
    if (found.statement) paintStatement(found.statement);
    if (statement && root.lastElementChild !== statement.region) root.append(statement.region);

    syncOpen();
    layout();

    // Blue rises into place, red drops; the line draws once both have landed.
    fresh.forEach((shape, i) => {
      if (!canAnimate(shape.button)) return;
      const from = shape.side === 'improving' ? 'translateY(26px)' : 'translateY(-26px)';
      shape.button.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: 480, delay: i * 90, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)', fill: 'backwards' });
    });
    if (drawTension && tension) drawIn(tension, fresh.length ? 300 + (fresh.length - 1) * 90 : 0);
    if (freshStatement && statement && canAnimate(statement.item)) {
      statement.item.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: fresh.length ? 360 : 0, easing: EASE, fill: 'backwards' });
    }
  }

  /** Stop the size watch and any line or shape still moving once the canvas drops this view. */
  function destroy(): void {
    observer?.disconnect();
    observer = null;
    for (const anim of tension?.anims ?? []) anim.cancel();
    cancelAnimations(root);
  }

  return { el: root, update, destroy };
}
