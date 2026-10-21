// packages/problem-solver/render/knowledge-management.ts
// Knowledge management (toolkit, Document), drawn as the book draws it: four equal yellow squares
// stacked with a small even gap, each with its own mark.
// Consider: a blue right-angled triangle in the lower left (its right angle at the bottom left),
// the heading across the top. Capture: a red band across the top carrying the heading. Share: a
// thick blue frame around the yellow, the heading inside it at the top. Review: a red disc filling
// most of the square, the heading on the disc.
// The four blocks are the tool, so the squares show from the start as faint paper with a thin ink
// rule. The first entry in a block fills its square and draws its mark in: the triangle grows from
// its right angle, the band slides down, the frame's stroke draws round, the disc pops.
// The answers sit to the right of each square: the title of Consider, Share and Review, and for
// Capture two lists, Explicit and Tacit, each entry a pill. Each square opens a details card under
// its row with the full answers (Capture lists every entry).
// Phone (the root up to 480px wide): 72px squares in a left column, the answers beside them, and
// pills on one line each.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { KM_BLOCK, KM_BLOCKS } from '../tools/knowledge-management.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested, syncObjectionNote } from './details';

export type KnowledgeManagementView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type B = 'consider' | 'capture' | 'share' | 'review';
type ListKind = 'explicit' | 'tacit';
const BLOCKS = KM_BLOCKS as readonly B[];
const LISTS: readonly ListKind[] = ['explicit', 'tacit'];

/** Each block: its heading, a short line in our words shown while it waits, and its mark's colour (the card accent). */
const BLOCK: Record<B, { heading: string; hint: string; accent: Accent }> = {
  consider: { heading: 'Consider', hint: 'What next time will need, and what is already recorded', accent: 'blue' },
  capture: { heading: 'Capture', hint: 'What can be written down, and what people carry', accent: 'red' },
  share: { heading: 'Share', hint: 'How others will find it and add to it', accent: 'blue' },
  review: { heading: 'Review', hint: 'When it is looked at again, and what goes', accent: 'red' }
};
const LIST_LABEL: Record<ListKind, string> = { explicit: 'Explicit', tacit: 'Tacit' };

const SVG = 'http://www.w3.org/2000/svg';

type Pill = { el: HTMLDivElement; text: HTMLSpanElement };
type Block = {
  b: B;
  item: HTMLDivElement;
  square: HTMLDivElement;
  button: HTMLButtonElement;
  /** The element that carries the mark's colour and moves when the block fills. */
  mark: Element;
  answer: HTMLDivElement;
  head: HTMLDivElement;
  title: HTMLSpanElement;
  lists: Record<ListKind, { wrap: HTMLDivElement; list: HTMLDivElement; empty: HTMLParagraphElement }> | null;
  details: HTMLDivElement;
  inner: HTMLDivElement;
  ids: string;
};

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

const slotName = (node: PsNode): string => parseSlot(node.slot)?.name ?? '';
const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const cardKeyOf = (node: PsNode): string => `${node.text}\u0000${node.title ?? ''}\u0000${(node.skills ?? []).join(',')}`;

function readModel(run: PsToolRun): Record<B, PsNode[]> {
  const model = Object.fromEntries(BLOCKS.map((b) => [b, [] as PsNode[]])) as Record<B, PsNode[]>;
  for (const node of run.nodes) {
    const block = (KM_BLOCK as Record<string, string | undefined>)[slotName(node)] as B | undefined;
    if (block) model[block].push(node);
  }
  // Capture reads explicit before tacit, each in slot order.
  model.capture.sort((a, b) => (slotName(a) === slotName(b) ? indexOf(a) - indexOf(b) : slotName(a) === 'explicit' ? -1 : 1));
  return model;
}

export function createKnowledgeManagementView(doc: Document = document): KnowledgeManagementView {
  const root = doc.createElement('div');
  root.className = 'ps-km';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Knowledge management');

  const stack = el(doc, 'div', 'ps-km__stack');
  stack.setAttribute('role', 'list');
  stack.setAttribute('aria-label', 'Knowledge management blocks');
  root.append(stack);

  const blocks = new Map<B, Block>();
  const pills = new Map<string, Pill>();
  /** One details card per node, made once and kept while the node lasts. */
  const cards = new Map<string, { card: HTMLElement; key: string }>();
  /** Every node id drawn so far: only one never seen before moves (an undo back to an old one stays still). */
  const seen = new Set<string>();
  const group = createDisclosureGroup();
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;
  /** New pills of this update, animated once the DOM is settled. */
  let pending: HTMLElement[] = [];

  // ---------------------------------------------------------------- squares

  function makeMark(b: B, square: HTMLDivElement): Element {
    const words = BLOCK[b];
    const heading = el(doc, 'span', 'ps-km__title', words.heading);
    if (b === 'consider') {
      const triangle = el(doc, 'span', 'ps-km__triangle');
      triangle.setAttribute('aria-hidden', 'true');
      square.append(triangle, heading);
      return triangle;
    }
    if (b === 'share') {
      // The frame is a stroked square, so its stroke can draw round.
      const frame = doc.createElementNS(SVG, 'svg');
      frame.setAttribute('class', 'ps-km__frame');
      frame.setAttribute('viewBox', '0 0 100 100');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('focusable', 'false');
      const rect = doc.createElementNS(SVG, 'rect');
      rect.setAttribute('class', 'ps-km__frame-line');
      for (const [name, value] of Object.entries({ x: '4.5', y: '4.5', width: '91', height: '91', pathLength: '100' })) rect.setAttribute(name, value);
      frame.append(rect);
      square.append(frame, heading);
      return rect;
    }
    // Capture's band and Review's disc carry the heading, so each is a shape of its own.
    const carrier = el(doc, 'span', b === 'capture' ? 'ps-km__band' : 'ps-km__disc');
    carrier.setAttribute('data-shape', '');
    carrier.setAttribute('data-fill', 'paper');
    carrier.append(heading);
    square.append(carrier);
    return carrier;
  }

  function makeBlock(b: B): Block {
    const words = BLOCK[b];
    const detailsId = nextId('ps-km-details');
    const item = el(doc, 'div', `ps-km__item ps-km__item--${b}`);
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-block', b);
    item.setAttribute('data-filled', 'false');
    const row = el(doc, 'div', 'ps-km__row');

    const button = el(doc, 'button', 'ps-km__button');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', `${words.heading}: not yet answered`);
    const square = el(doc, 'div', 'ps-km__square');
    square.setAttribute('data-shape', '');
    square.setAttribute('data-fill', 'paper');
    const mark = makeMark(b, square);
    button.append(square);

    const answer = el(doc, 'div', 'ps-km__answer');
    const head = el(doc, 'div', 'ps-km__answer-head');
    const title = el(doc, 'span', 'ps-km__answer-title ps-km__hint', words.hint);
    head.append(title);
    answer.append(head);
    let lists: Block['lists'] = null;
    if (b === 'capture') {
      const box = el(doc, 'div', 'ps-km__lists');
      const make = (kind: ListKind) => {
        const wrap = el(doc, 'div', 'ps-km__list-wrap');
        const label = el(doc, 'p', 'ps-km__meta', LIST_LABEL[kind]);
        const list = el(doc, 'div', 'ps-km__list');
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', LIST_LABEL[kind]);
        list.setAttribute('data-list', kind);
        const empty = el(doc, 'p', 'ps-km__empty', 'None yet');
        wrap.append(label, list, empty);
        box.append(wrap);
        return { wrap, list, empty };
      };
      lists = { explicit: make('explicit'), tacit: make('tacit') };
      box.hidden = true;
      answer.append(box);
    }
    row.append(button, answer);

    const details = el(doc, 'div', 'ps-details');
    details.id = detailsId;
    const inner = el(doc, 'div', 'ps-details__inner');
    details.append(inner);
    item.append(row, details);
    group.register(details, button);
    return { b, item, square, button, mark, answer, head, title, lists, details, inner, ids: '' };
  }

  for (const b of BLOCKS) {
    const block = makeBlock(b);
    blocks.set(b, block);
    stack.append(block.item);
  }

  // ---------------------------------------------------------------- details cards

  function cardFor(block: Block, node: PsNode, many: boolean): HTMLElement {
    const wanted = `${many}\u0000${cardKeyOf(node)}`;
    const have = cards.get(node.id);
    if (have && have.key === wanted) {
      syncObjectionNote(have.card, node);
      return have.card;
    }
    const card = detailsCard(doc, node, BLOCK[block.b].accent, '').querySelector<HTMLElement>('.ps-details__card')!;
    card.setAttribute('data-for', node.id);
    if (many) card.prepend(el(doc, 'p', 'ps-km__card-head', `${LIST_LABEL[slotName(node) as ListKind] ?? ''}: ${nodeTitle(node)}`));
    have?.card.replaceWith(card);
    cards.set(node.id, { card, key: wanted });
    return card;
  }

  function prune(run: PsToolRun): void {
    const live = new Set(run.nodes.map((node) => node.id));
    for (const [id, { card }] of cards) {
      if (live.has(id)) continue;
      card.remove();
      cards.delete(id);
    }
    for (const [id, pill] of pills) {
      if (live.has(id)) continue;
      cancelAnimations(pill.el);
      pill.el.remove();
      pills.delete(id);
    }
  }

  // ---------------------------------------------------------------- capture lists

  function makePill(node: PsNode): Pill {
    const pill = el(doc, 'div', 'ps-km__pill');
    pill.setAttribute('role', 'listitem');
    pill.setAttribute('data-node', node.id);
    pill.setAttribute('data-shape', '');
    pill.setAttribute('data-fill', 'card');
    const text = el(doc, 'span', 'ps-km__pill-text');
    pill.append(text);
    return { el: pill, text };
  }

  function syncLists(block: Block, nodes: PsNode[], animate: boolean): void {
    if (!block.lists) return;
    const box = block.lists.explicit.wrap.parentElement!;
    box.hidden = nodes.length === 0;
    for (const kind of LISTS) {
      const { list, empty } = block.lists[kind];
      const mine = nodes.filter((node) => slotName(node) === kind);
      empty.hidden = mine.length > 0;
      const wanted = mine.map((node) => {
        let pill = pills.get(node.id);
        const born = !pill;
        if (!pill) {
          pill = makePill(node);
          pills.set(node.id, pill);
        }
        const title = nodeTitle(node);
        setText(pill.text, title);
        setAttr(pill.text, 'title', title);
        syncContested(pill.el, node, pill.el);
        // Pills drop into their list once every block is in place (see update).
        if (born && animate && !seen.has(node.id) && canAnimate(pill.el)) pending.push(pill.el);
        return pill.el;
      });
      const have = [...list.children];
      if (wanted.length !== have.length || wanted.some((pill, i) => pill !== have[i])) list.replaceChildren(...wanted);
    }
  }

  // ---------------------------------------------------------------- blocks

  function drawIn(block: Block): void {
    const mark = block.mark;
    if (!canAnimate(mark)) return;
    cancelAnimations(mark);
    const timing = { duration: 460, easing: EASE, fill: 'backwards' as const };
    if (block.b === 'consider') mark.animate([{ transform: 'scale(0)' }, { transform: 'none' }], timing);
    else if (block.b === 'capture') mark.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], timing);
    // The dash exists only while it draws, so the finished frame keeps its mitred corners.
    else if (block.b === 'share') mark.animate([{ strokeDasharray: '100', strokeDashoffset: '100' }, { strokeDasharray: '100', strokeDashoffset: '0' }], { ...timing, duration: 520 });
    else mark.animate([{ transform: 'scale(0.6)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { ...timing, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
  }

  function syncBlock(block: Block, nodes: PsNode[], animate: boolean): void {
    const words = BLOCK[block.b];
    const wasFilled = block.ids !== '';
    const carrier = block.b === 'capture' || block.b === 'review' ? (block.mark as HTMLElement) : null;
    if (!nodes.length) {
      if (!wasFilled) return;
      if (block.details.classList.contains('is-open')) group.close();
      cancelAnimations(block.item);
      block.inner.replaceChildren();
      block.ids = '';
      setAttr(block.item, 'data-node', null);
      setAttr(block.item, 'data-filled', 'false');
      setAttr(block.square, 'data-fill', 'paper');
      if (carrier) setAttr(carrier, 'data-fill', 'paper');
      block.square.classList.remove('is-filled');
      block.item.classList.remove('is-contested');
      block.head.querySelector('.ps-objection')?.remove();
      block.title.classList.add('ps-km__hint');
      setText(block.title, words.hint);
      syncLists(block, nodes, false);
      block.button.disabled = true;
      setAttr(block.button, 'aria-label', `${words.heading}: not yet answered`);
      return;
    }
    block.ids = nodes.map((node) => node.id).join(' ');
    setAttr(block.item, 'data-node', block.ids);
    setAttr(block.item, 'data-filled', 'true');
    setAttr(block.square, 'data-fill', 'yellow');
    if (carrier) setAttr(carrier, 'data-fill', 'red');
    block.square.classList.add('is-filled');
    block.button.disabled = false;

    const latest = nodes[nodes.length - 1];
    const contested = nodes.find((node) => node.state === 'contested') ?? null;
    let label: string;
    if (block.lists) {
      // Capture: the answers are the pills; the heading line says how many of each.
      const count = (kind: ListKind) => nodes.filter((node) => slotName(node) === kind).length;
      const summary = `${count('explicit')} explicit, ${count('tacit')} tacit`;
      block.title.classList.remove('ps-km__hint');
      setText(block.title, summary);
      syncLists(block, nodes, animate);
      // The tag sits on the contested pill, so the row only carries the class and the label.
      syncContested(block.item, contested ?? latest, null);
      label = `${words.heading}: ${summary}${contested ? ', contested' : ''}. Show details`;
    } else {
      block.title.classList.remove('ps-km__hint');
      setText(block.title, nodeTitle(latest));
      syncContested(block.item, contested ?? latest, block.head);
      label = `${words.heading}: ${nodeTitle(latest)}${contested ? ', contested' : ''}. Show details`;
    }
    setAttr(block.button, 'aria-label', label);

    const wanted = nodes.map((node) => cardFor(block, node, Boolean(block.lists)));
    const have = [...block.inner.children];
    if (wanted.length !== have.length || wanted.some((card, i) => card !== have[i])) block.inner.replaceChildren(...wanted);

    const fresh = nodes.filter((node) => !seen.has(node.id));
    if (!animate || !fresh.length) return;
    if (!wasFilled) drawIn(block);
    // A new answer beside a square fades in (Capture's arrive as pills instead).
    if (!block.lists && canAnimate(block.head)) {
      cancelAnimations(block.head);
      block.head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: wasFilled ? 0 : 220, easing: EASE, fill: 'backwards' });
    }
  }

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    if (destroyed) return;
    const animate = painted;
    const model = readModel(run);
    pending = [];
    prune(run);
    for (const block of blocks.values()) syncBlock(block, model[block.b], animate);
    pending.forEach((pill, i) => {
      pill.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 160 + i * 60, easing: EASE, fill: 'backwards' });
    });
    pending = [];
    for (const node of run.nodes) seen.add(node.id);
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
