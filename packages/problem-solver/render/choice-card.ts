// packages/problem-solver/render/choice-card.ts
// The "Chosen option" card every Decide chart ends with: the `choice` node in full under the
// chart, with a 3px blue top border, a Details button (skills and any objection) and the
// contested tag when contested. It appears with the node, rising in (never on the first paint
// of a saved run), and goes when the node goes. It never tries to match the choice to an
// option on the chart: the card is the record.
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { CHOICE_SLOT } from '../tools/choice.mjs';
import { EASE, canAnimate, detailsCard, nextId, syncContested } from './details';
import type { DisclosureGroup } from './details';

export type ChoiceCard = {
  /** Draw, refresh or drop the card for the run's choice node, appending it to `host`. Returns the card or null. */
  sync(run: PsToolRun, host: HTMLElement, animate: boolean): HTMLDivElement | null;
};

/** The run's chosen option, if placed. */
export function choiceNode(run: PsToolRun): PsNode | null {
  return run.nodes.find((node) => parseSlot(node.slot)?.name === CHOICE_SLOT) ?? null;
}

export function createChoiceCard(doc: Document, group: DisclosureGroup): ChoiceCard {
  let card: { item: HTMLDivElement; head: HTMLDivElement; text: HTMLParagraphElement; more: HTMLButtonElement; id: string } | null = null;

  function build(node: PsNode): NonNullable<typeof card> {
    const detailsId = nextId('ps-choice-details');
    const item = doc.createElement('div');
    item.className = 'ps-choice';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-choice', '');
    const head = doc.createElement('div');
    head.className = 'ps-choice__head';
    const meta = doc.createElement('span');
    meta.className = 'ps-choice__meta';
    meta.textContent = 'Chosen option';
    head.append(meta);
    const text = doc.createElement('p');
    text.className = 'ps-choice__text';
    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'ps-choice__more';
    more.textContent = 'Details';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', detailsId);
    more.setAttribute('aria-label', 'Chosen option. Show details');
    const details = detailsCard(doc, node, 'blue', detailsId);
    details.setAttribute('data-for', node.id);
    // The card already shows the answer in full, so its details carry only skills and any objection.
    details.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, details);
    group.register(item, more);
    return { item, head, text, more, id: node.id };
  }

  return {
    sync(run, host, animate) {
      const node = choiceNode(run);
      if (card && card.id !== node?.id) {
        card.item.remove();
        card = null;
      }
      if (!node) return null;
      const fresh = !card;
      if (!card) card = build(node);
      if (card.text.textContent !== node.text) card.text.textContent = node.text;
      syncContested(card.item, node, card.head, card.more);
      if (card.item.parentElement !== host || host.lastElementChild !== card.item) host.append(card.item);
      if (fresh && animate && canAnimate(card.item)) {
        card.item.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
      }
      return card.item;
    }
  };
}
