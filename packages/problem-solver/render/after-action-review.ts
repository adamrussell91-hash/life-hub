// packages/problem-solver/render/after-action-review.ts
// After action review (toolkit, Improve), drawn as the book draws it: four equal horizontal bars
// stacked with even gaps, each with a shape at its left and its heading beside it. Yellow with a
// red square (set out to achieve), yellow with a blue triangle (achieved), red with a yellow
// triangle (why the difference), blue with a yellow equals sign (learned).
// The four questions are the tool, so the bars show from the start as faint outlines (paper with a
// thin ink rule). An accepted answer fills its bar's colour from the left, the shape pops in, and
// the answer shows under the heading, clamped to three lines; the full text is in the details card
// under the bar. The bar grows in height to fit; the four stay equal width.
// Under the bars, once the learned answer is placed, a thin ink gauge shows the share of the
// review's words spent on learning, against a tick at half. It morphs when the share changes.
// Phone (the root up to 480px wide): smaller shapes, the heading on one line and the answer below.
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { AAR_SLOTS, learnedShare } from '../tools/after-action-review.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type AfterActionReviewView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type Slot = 'intended' | 'achieved' | 'differences' | 'learned';
type Tone = 'yellow' | 'red' | 'blue';
const BARS: Record<Slot, { title: string; tone: Tone; shape: 'square' | 'triangle' | 'equals'; mark: Tone }> = {
  intended: { title: 'Set out to achieve', tone: 'yellow', shape: 'square', mark: 'red' },
  achieved: { title: 'Achieved', tone: 'yellow', shape: 'triangle', mark: 'blue' },
  differences: { title: 'Why the difference', tone: 'red', shape: 'triangle', mark: 'yellow' },
  learned: { title: 'Learned', tone: 'blue', shape: 'equals', mark: 'yellow' }
};

type Bar = {
  slot: Slot;
  item: HTMLDivElement;
  shape: HTMLDivElement;
  fill: HTMLSpanElement;
  button: HTMLButtonElement;
  mark: HTMLSpanElement;
  head: HTMLSpanElement;
  answer: HTMLSpanElement;
  card: HTMLDivElement;
  shown: string | null;
  cardKey: string;
};
type Gauge = { el: HTMLDivElement; label: HTMLSpanElement; fill: HTMLSpanElement; share: number };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
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

const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');
const cardKeyOf = (node: PsNode): string => `${node.id}\u0000${node.text}\u0000${(node.skills ?? []).join(',')}`;

export function createAfterActionReviewView(doc: Document = document): AfterActionReviewView {
  const root = doc.createElement('div');
  root.className = 'ps-aar';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'After action review');
  const group = createDisclosureGroup();

  const stack = el(doc, 'div', 'ps-aar__stack');
  stack.setAttribute('role', 'list');
  stack.setAttribute('aria-label', 'Review questions');
  root.append(stack);

  const bars = new Map<Slot, Bar>();
  let gauge: Gauge | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  function makeBar(slot: Slot): Bar {
    const words = BARS[slot];
    const detailsId = nextId('ps-aar-details');
    const item = el(doc, 'div', 'ps-aar__item');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-bar', slot);
    item.setAttribute('data-filled', 'false');
    const shape = el(doc, 'div', 'ps-aar__bar');
    shape.setAttribute('data-shape', '');
    shape.setAttribute('data-fill', 'paper');
    shape.setAttribute('data-tone', words.tone);
    // The colour lies on its own layer, so it can wipe in from the left when the bar fills.
    const fill = el(doc, 'span', 'ps-aar__fill');
    fill.setAttribute('aria-hidden', 'true');
    const button = el(doc, 'button', 'ps-aar__button');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const mark = el(doc, 'span', `ps-aar__mark ps-aar__mark--${words.shape}`);
    mark.setAttribute('aria-hidden', 'true');
    mark.setAttribute('data-mark', words.mark);
    const head = el(doc, 'span', 'ps-aar__head');
    head.append(el(doc, 'span', 'ps-aar__title', words.title));
    const answer = el(doc, 'span', 'ps-aar__answer');
    button.append(mark, head, answer);
    shape.append(fill, button);
    const card = el(doc, 'div', 'ps-details');
    card.id = detailsId;
    item.append(shape, card);
    group.register(card, button);
    return { slot, item, shape, fill, button, mark, head, answer, card, shown: null, cardKey: '' };
  }

  for (const slot of AAR_SLOTS as readonly Slot[]) {
    const bar = makeBar(slot);
    bars.set(slot, bar);
    stack.append(bar.item);
    setAttr(bar.button, 'aria-label', `${BARS[slot].title}: not yet answered`);
  }

  // ---------------------------------------------------------------- bars

  function syncBar(bar: Bar, node: PsNode | undefined, animate: boolean): void {
    const words = BARS[bar.slot];
    const was = bar.shown;
    if (!node) {
      if (was !== null) {
        if (bar.card.classList.contains('is-open')) group.close();
        bar.card.replaceChildren();
        bar.cardKey = '';
      }
      bar.shown = null;
      setAttr(bar.item, 'data-node', null);
      setAttr(bar.card, 'data-for', null);
      setAttr(bar.item, 'data-filled', 'false');
      bar.shape.classList.remove('is-filled');
      bar.item.classList.remove('is-contested');
      setAttr(bar.shape, 'data-fill', 'paper');
      bar.head.querySelector('.ps-objection')?.remove();
      setText(bar.answer, '');
      bar.button.disabled = true;
      setAttr(bar.button, 'aria-label', `${words.title}: not yet answered`);
      return;
    }
    if (was !== node.id && bar.card.classList.contains('is-open')) group.close();
    bar.shown = node.id;
    setAttr(bar.item, 'data-node', node.id);
    setAttr(bar.card, 'data-for', node.id);
    setAttr(bar.item, 'data-filled', 'true');
    bar.shape.classList.add('is-filled');
    setAttr(bar.shape, 'data-fill', words.tone);
    bar.button.disabled = false;
    setText(bar.answer, node.text);
    setAttr(bar.button, 'aria-label', `${words.title}: ${nodeTitle(node)}${contested(node)}. Show details`);
    const key = cardKeyOf(node);
    if (bar.cardKey !== key) {
      const built = detailsCard(doc, node, words.tone, bar.card.id);
      bar.card.replaceChildren(...built.childNodes);
      bar.cardKey = key;
    }
    syncContested(bar.item, node, bar.head, bar.button);
    if (!animate || was === node.id) return;
    // Arrival: the colour wipes in from the left, the shape pops, the answer fades in.
    // A new answer in a bar already filled only fades its text in.
    if (was === null) {
      if (canAnimate(bar.fill)) {
        cancelAnimations(bar.fill);
        bar.fill.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 420, easing: EASE, fill: 'backwards' });
      }
      if (canAnimate(bar.mark)) {
        cancelAnimations(bar.mark);
        bar.mark.animate([{ opacity: 0.35, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 160, easing: EASE, fill: 'backwards' });
      }
    }
    if (canAnimate(bar.answer)) {
      cancelAnimations(bar.answer);
      bar.answer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: was === null ? 220 : 0, easing: EASE, fill: 'backwards' });
    }
  }

  // ---------------------------------------------------------------- learning gauge

  function makeGauge(): Gauge {
    const out = el(doc, 'div', 'ps-aar__share');
    const label = el(doc, 'span', 'ps-aar__meta');
    const track = el(doc, 'span', 'ps-aar__share-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = el(doc, 'span', 'ps-aar__share-fill');
    const tick = el(doc, 'span', 'ps-aar__share-tick');
    track.append(fill, tick);
    out.append(label, track);
    return { el: out, label, fill, share: -1 };
  }

  function syncGauge(run: PsToolRun, hasLearned: boolean, animate: boolean): void {
    if (!hasLearned) {
      if (gauge) {
        cancelAnimations(gauge.el);
        gauge.el.remove();
        gauge = null;
      }
      return;
    }
    let born = false;
    if (!gauge) {
      gauge = makeGauge();
      root.append(gauge.el);
      born = true;
    }
    const share = Math.max(0, Math.min(1, learnedShare(run)));
    const percent = Math.round(share * 100);
    setAttr(gauge.el, 'data-share', String(percent));
    setText(gauge.label, `Time on learning: ${percent}% (aim for half)`);
    const prev = gauge.share;
    if (prev === share) return;
    gauge.share = share;
    gauge.fill.style.transform = `scaleX(${share})`;
    if (!animate) return;
    if (born) {
      if (canAnimate(gauge.el)) gauge.el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 240, easing: EASE, fill: 'backwards' });
      return;
    }
    if (canAnimate(gauge.fill)) {
      cancelAnimations(gauge.fill);
      gauge.fill.animate([{ transform: `scaleX(${prev})` }, { transform: `scaleX(${share})` }], { duration: 600, easing: EASE, fill: 'backwards' });
    }
  }

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    if (destroyed) return;
    const at = (slot: Slot): PsNode | undefined => run.nodes.find((node) => parseSlot(node.slot)?.name === slot);
    for (const bar of bars.values()) syncBar(bar, at(bar.slot), painted);
    syncGauge(run, Boolean(at('learned')), painted);
    painted = true;
  }

  return {
    el: root,
    update,
    /** Stop any motion and ignore later updates once the canvas drops this view. */
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
