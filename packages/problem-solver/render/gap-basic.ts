// packages/problem-solver/render/gap-basic.ts
// Gap analysis from the toolkit (p.53): a red circle (current state) and a blue
// circle (objective) either side of an ellipse split into a red and a blue half,
// with a yellow bar of actions across the centre. Each part appears only once
// its answer is accepted. Items are small pill buttons; only the first three of a
// lobe show, then a "+N" pill opens the rest in the details card.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type GapBasicView = { el: HTMLDivElement; update(run: PsToolRun): void };

type End = 'current' | 'objective';
type Lobe = 'known' | 'done' | 'must_know' | 'must_do';
type Slot = End | Lobe | 'action';

const VISIBLE = 3;
/** The bar between the circles has room for two titles; a phone shows every action in a list instead. */
const BAR_VISIBLE = 2;
const END_META: Record<End, string> = { current: 'Current state', objective: 'Objective' };
const LOBE_META: Record<Lobe, string> = { known: 'Known', done: 'Done', must_know: 'Must know', must_do: 'Must do' };
const SIDE: Record<Lobe, End> = { known: 'current', done: 'current', must_know: 'objective', must_do: 'objective' };
const LOBES: Lobe[] = ['known', 'done', 'must_know', 'must_do'];
const ACCENT: Record<Slot, Accent> = { current: 'red', known: 'red', done: 'red', objective: 'blue', must_know: 'blue', must_do: 'blue', action: 'yellow' };

function slotOf(node: PsNode): Slot | null {
  const name = parseSlot(node.slot)?.name;
  return name === 'current' || name === 'objective' || name === 'action' || LOBES.includes(name as Lobe) ? (name as Slot) : null;
}

const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;

function text(doc: Document, tag: 'span' | 'p', className: string, value: string): HTMLElement {
  const el = doc.createElement(tag);
  el.className = className;
  el.textContent = value;
  return el;
}

/** Direct item children (happy-dom has no :scope). */
function children(container: HTMLElement): HTMLElement[] {
  return [...container.children].filter((el): el is HTMLElement => el.hasAttribute('data-node'));
}

function fade(el: HTMLElement): void {
  if (canAnimate(el)) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE, fill: 'backwards' });
}

export function createGapBasicView(doc: Document = document): GapBasicView {
  const root = doc.createElement('div');
  root.className = 'ps-gap';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Gap analysis');
  const stage = doc.createElement('div');
  stage.className = 'ps-gap__stage';
  const actions = doc.createElement('div');
  actions.className = 'ps-gap__actions';
  actions.append(text(doc, 'span', 'ps-gap__actions-label', 'Actions'));
  const actionRow = doc.createElement('div');
  actionRow.className = 'ps-gap__actions-row';
  actions.append(actionRow);
  const panel = doc.createElement('div');
  panel.className = 'ps-gap__panel';
  const group = createDisclosureGroup();

  const drawn = new Map<string, HTMLElement>();
  const halves = new Map<End, HTMLElement>();
  const lobes = new Map<Lobe, { el: HTMLElement; stack: HTMLElement; head: HTMLElement }>();
  const overflow = new Map<string, { button: HTMLButtonElement; card: HTMLElement; list: HTMLElement }>();
  let bar: HTMLElement | null = null;

  function ensureHalf(end: End): void {
    if (halves.has(end)) return;
    const half = doc.createElement('div');
    half.className = `ps-gap__half ps-gap__half--${end}`;
    half.setAttribute('aria-hidden', 'true');
    stage.prepend(half);
    halves.set(end, half);
    if (canAnimate(half)) half.animate([{ clipPath: end === 'current' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 520, easing: EASE, fill: 'backwards' });
    for (const name of LOBES.filter((l) => SIDE[l] === end)) {
      const lobe = doc.createElement('div');
      lobe.className = `ps-gap__lobe ps-gap__lobe--${name}`;
      lobe.setAttribute('data-lobe', name);
      const stack = doc.createElement('div');
      stack.className = 'ps-gap__stack';
      const head = doc.createElement('div');
      head.className = 'ps-gap__lobe-head';
      head.append(text(doc, 'span', 'ps-gap__lobe-label', LOBE_META[name]));
      lobe.append(head, stack);
      stage.append(lobe);
      lobes.set(name, { el: lobe, stack, head });
      fade(lobe);
    }
  }

  function ensureBar(): void {
    if (bar) return;
    bar = doc.createElement('div');
    bar.className = 'ps-gap__bar';
    bar.setAttribute('aria-hidden', 'true');
    stage.append(bar);
    root.insertBefore(actions, panel.isConnected ? panel : null);
    if (canAnimate(bar)) bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 560, easing: EASE, fill: 'backwards' });
  }

  function itemFor(node: PsNode, slot: Slot, className: string, content: HTMLElement[], aria: string): { item: HTMLElement; button: HTMLButtonElement } {
    const detailsId = nextId('ps-gap-details');
    const item = doc.createElement('div');
    item.className = className;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', `${aria}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
    button.append(...content);
    if (node.state === 'contested') button.append(contestedTag(doc, node));
    item.append(button);
    const card = detailsCard(doc, node, ACCENT[slot], detailsId);
    panel.append(card);
    group.register(card, button);
    return { item, button };
  }

  function addEnd(node: PsNode, end: End): HTMLElement {
    const { item, button } = itemFor(node, end, `ps-gap__node ps-gap__node--${end}`, [text(doc, 'span', 'ps-gap__meta', END_META[end]), text(doc, 'span', 'ps-gap__title', nodeTitle(node))], END_META[end]);
    button.className = 'ps-gap__shape ps-gap__circle';
    stage.append(item);
    if (canAnimate(item)) item.animate([{ opacity: 0, scale: '0.7' }, { opacity: 1, scale: '1' }], { duration: 460, easing: EASE, fill: 'backwards' });
    return item;
  }

  function addPill(node: PsNode, slot: Lobe | 'action'): HTMLElement {
    const label = slot === 'action' ? 'Action' : LOBE_META[slot];
    const { item, button } = itemFor(node, slot, `ps-gap__item ps-gap__item--${slot}`, [text(doc, 'span', 'ps-gap__pill-title', nodeTitle(node))], label);
    button.className = 'ps-gap__shape ps-gap__pill';
    fade(item);
    return item;
  }

  /** Insert in slot-index order without recreating anything. */
  function place(container: HTMLElement, item: HTMLElement, node: PsNode, nodes: Map<string, PsNode>): void {
    const next = children(container).find((el) => el !== item && indexOf(nodes.get(el.getAttribute('data-node') ?? '') ?? node) > indexOf(node));
    container.insertBefore(item, next ?? container.querySelector('.ps-gap__more'));
  }

  /** Visible cap and the "+N" pill for one container of pills. */
  function refreshOverflow(key: string, container: HTMLElement, host: HTMLElement, group_nodes: PsNode[], accent: Accent, label: string, capAlways: boolean): void {
    const cap = capAlways ? VISIBLE : BAR_VISIBLE;
    const items = children(container);
    items.forEach((item, i) => {
      item.hidden = capAlways && i >= cap;
      item.classList.toggle('is-extra', !capAlways && i >= cap);
    });
    const extra = Math.max(0, group_nodes.length - cap);
    let entry = overflow.get(key);
    if (!extra) {
      entry?.button.remove();
      return;
    }
    if (!entry) {
      const id = nextId('ps-gap-more');
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'ps-gap__shape ps-gap__pill ps-gap__more';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', id);
      const cardWrap = doc.createElement('div');
      cardWrap.className = 'ps-details';
      cardWrap.id = id;
      const inner = doc.createElement('div');
      inner.className = 'ps-details__inner';
      const card = doc.createElement('div');
      card.className = `ps-details__card ps-details__card--${accent}`;
      const list = doc.createElement('ul');
      list.className = 'ps-gap__more-list';
      card.append(list);
      inner.append(card);
      cardWrap.append(inner);
      panel.append(cardWrap);
      group.register(cardWrap, button);
      entry = { button, card: cardWrap, list };
      overflow.set(key, entry);
    }
    entry.button.textContent = `+${extra}`;
    entry.button.setAttribute('aria-label', `${extra} more under ${label}. Show list`);
    entry.list.replaceChildren(
      ...group_nodes.map((n) => {
        const li = doc.createElement('li');
        const strong = doc.createElement('strong');
        strong.textContent = nodeTitle(n);
        li.append(strong, doc.createTextNode(`: ${n.text}`));
        if (n.state === 'contested') li.append(doc.createTextNode(' '), contestedTag(doc, n));
        return li;
      })
    );
    host.append(entry.button);
  }

  function update(run: PsToolRun): void {
    const byId = new Map(run.nodes.map((n) => [n.id, n]));
    for (const node of run.nodes) {
      const slot = slotOf(node);
      if (!slot) continue;
      let item = drawn.get(node.id);
      if (!item) {
        if (slot === 'current' || slot === 'objective') {
          ensureHalf(slot);
          item = addEnd(node, slot);
        } else if (slot === 'action') {
          ensureBar();
          item = addPill(node, slot);
          place(actionRow, item, node, byId);
        } else {
          ensureHalf(SIDE[slot]);
          item = addPill(node, slot);
          place(lobes.get(slot)!.stack, item, node, byId);
        }
        drawn.set(node.id, item);
      }
      item.classList.toggle('is-contested', node.state === 'contested');
    }
    for (const name of LOBES) {
      const lobe = lobes.get(name);
      if (!lobe) continue;
      const nodes = run.nodes.filter((n) => parseSlot(n.slot)?.name === name).sort((a, b) => indexOf(a) - indexOf(b));
      refreshOverflow(name, lobe.stack, lobe.head, nodes, ACCENT[name], LOBE_META[name], true);
    }
    const actionNodes = run.nodes.filter((n) => parseSlot(n.slot)?.name === 'action').sort((a, b) => indexOf(a) - indexOf(b));
    if (actionNodes.length) refreshOverflow('action', actionRow, actionRow, actionNodes, 'yellow', 'Actions', false);
    if (stage.children.length && !stage.isConnected) root.prepend(stage);
    if (!panel.isConnected) root.append(panel);
    if (actions.isConnected && actions.nextElementSibling !== panel) root.insertBefore(actions, panel);
  }

  return { el: root, update };
}
