// packages/problem-solver/render/problem-statement.ts
// The Problem statement from the toolkit (p.59): a square split into a tall red
// block (the problem) beside a blue block (solution benefits) over a yellow block
// (impacts). Each block wipes in when its answer is accepted. The composed
// statement sits below the square in full, the one place an answer shows
// without a click.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type ProblemStatementView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Block = 'problem' | 'impact' | 'benefit';
const BLOCKS: Block[] = ['problem', 'benefit', 'impact'];
const META: Record<Block | 'statement', string> = { problem: 'The problem', impact: 'Impacts', benefit: 'Solution benefits', statement: 'The statement' };
const ACCENT: Record<Block, Accent> = { problem: 'red', impact: 'yellow', benefit: 'blue' };
// Each block wipes in from its outer edge.
const WIPE: Record<Block, string> = {
  problem: 'inset(0 100% 0 0)',
  benefit: 'inset(0 0 0 100%)',
  impact: 'inset(100% 0 0 0)'
};

function blockName(node: PsNode): Block | 'statement' | null {
  const name = parseSlot(node.slot)?.name;
  return name === 'problem' || name === 'impact' || name === 'benefit' || name === 'statement' ? name : null;
}

function labelled(doc: Document, className: string, text: string): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

export function createProblemStatementView(doc: Document = document): ProblemStatementView {
  const root = doc.createElement('div');
  root.className = 'ps-statement';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Problem statement');

  const square = doc.createElement('div');
  square.className = 'ps-statement__square';
  square.setAttribute('role', 'presentation');
  const panel = doc.createElement('div');
  panel.className = 'ps-statement__panel';
  const group = createDisclosureGroup();
  const drawn = new Map<string, HTMLElement>();

  function addBlock(node: PsNode, block: Block): HTMLElement {
    const detailsId = nextId('ps-statement-details');
    const item = doc.createElement('div');
    item.className = `ps-statement__block ps-statement__block--${block}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ps-statement__shape';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', `${META[block]}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
    button.append(labelled(doc, 'ps-statement__meta', META[block]), labelled(doc, 'ps-statement__title', nodeTitle(node)));
    if (node.state === 'contested') button.append(contestedTag(doc, node));
    item.append(button);
    const card = detailsCard(doc, node, ACCENT[block], detailsId);
    panel.append(card);
    group.register(card, button);
    square.append(item);
    if (canAnimate(item)) item.animate([{ clipPath: WIPE[block] }, { clipPath: 'inset(0 0 0 0)' }], { duration: 520, easing: EASE, fill: 'backwards' });
    return item;
  }

  function addStatement(node: PsNode): HTMLElement {
    const detailsId = nextId('ps-statement-details');
    const item = doc.createElement('div');
    item.className = 'ps-statement__composed';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const head = doc.createElement('div');
    head.className = 'ps-statement__head';
    head.append(labelled(doc, 'ps-statement__meta', META.statement));
    if (node.state === 'contested') head.append(contestedTag(doc, node));
    const text = doc.createElement('p');
    text.className = 'ps-statement__text';
    text.textContent = node.text;
    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'ps-statement__more';
    more.textContent = 'Details';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', detailsId);
    const card = detailsCard(doc, node, 'red', detailsId);
    // The card repeats the answer, so on the composed statement it carries only skills and objection.
    card.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, card);
    group.register(card, more);
    if (canAnimate(item)) item.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
    return item;
  }

  function update(run: PsToolRun): void {
    for (const node of run.nodes) {
      const name = blockName(node);
      if (!name) continue;
      let item = drawn.get(node.id);
      if (!item) {
        item = name === 'statement' ? addStatement(node) : addBlock(node, name);
        drawn.set(node.id, item);
      }
      item.classList.toggle('is-contested', node.state === 'contested');
    }
    // Structure appears with the first block: square, then its details, then the statement.
    const statement = [...drawn.values()].find((item) => item.classList.contains('ps-statement__composed'));
    if (square.children.length && !square.isConnected) root.prepend(square, panel);
    if (statement && statement.parentElement !== root) root.append(statement);
    else if (statement && root.lastElementChild !== statement) root.append(statement);
  }

  return { el: root, update };
}
