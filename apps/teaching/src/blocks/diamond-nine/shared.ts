import type { Block } from '@/schemas/block';
import { el } from '@/blocks/peer-feedback-ui';
import { isSafeHref } from '@/blocks/sanitize';
import { DIAMOND_ROWS, WILD_ID, rowName, rowSlots, slotRow, type Slots } from './model';

/** Pieces every Diamond 9 view shares: cards, letters, the diamond grid, the dot strip and print. */

export type DiamondNineBlock = Extract<Block, { block_type: 'diamond_nine' }>;
export type DiamondCard = DiamondNineBlock['content']['cards'][number];

export const LETTERS = 'ABCDEFGHI';
export const WILD_LETTER = '★';

/** A picture card's link, only when it is safe to load. */
export function imageSrc(card: DiamondCard): string | null {
  const url = (card.url ?? '').trim();
  return url && isSafeHref(url) ? url : null;
}

/** A card students can rank: words for text and quotes, a safe link for a picture. */
export function cardReady(card: DiamondCard): boolean {
  return card.kind === 'image' ? !!imageSrc(card) : !!card.text.trim();
}

/** The cards that are ready, in the teacher's order (at most nine). */
export function readyCards(block: DiamondNineBlock): DiamondCard[] {
  return block.content.cards.filter(cardReady).slice(0, 9);
}

/** Card id to letter, A to I in the teacher's order; a student's own card is a star. */
export function letterMap(cards: readonly DiamondCard[]): Map<string, string> {
  const map = new Map<string, string>();
  cards.forEach((c, i) => map.set(c.id, LETTERS[i] ?? '?'));
  map.set(WILD_ID, WILD_LETTER);
  return map;
}

/** One line of plain words for a card, for labels and lists. */
export function cardText(card: DiamondCard): string {
  if (card.kind === 'image') return (card.alt_text ?? '').trim() || card.text.trim() || 'Picture';
  if (card.kind === 'quote') {
    const source = (card.source ?? '').trim();
    return `“${card.text.trim()}”${source ? ` (${source})` : ''}`;
  }
  return card.text.trim();
}

/** The face of a card: its letter, then words, a quotation or a picture. */
export function cardFace(card: DiamondCard, letter: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const tag = el('span', `d9-letter${card.id === WILD_ID ? ' d9-letter--wild' : ''}`, letter);
  tag.setAttribute('aria-hidden', 'true');
  const body = el('span', 'd9-card__body');
  if (card.kind === 'image') {
    const src = imageSrc(card);
    if (src) {
      const img = el('img', 'd9-card__image');
      img.src = src;
      img.alt = (card.alt_text ?? '').trim();
      img.loading = 'lazy';
      img.draggable = false;
      body.append(img);
    }
    const caption = card.text.trim() || (card.alt_text ?? '').trim();
    if (caption) body.append(el('span', 'd9-card__caption', caption));
  } else if (card.kind === 'quote') {
    body.append(el('q', 'd9-card__quote', card.text.trim()));
    if ((card.source ?? '').trim()) body.append(el('span', 'd9-card__source', card.source!.trim()));
  } else {
    body.append(el('span', 'd9-card__text', card.text.trim()));
  }
  frag.append(tag, body);
  return frag;
}

/** Words for the two ends: "Most significant…" becomes "Least significant…"; otherwise Most and Least. */
export function endLabels(criterion: string): { top: string; bottom: string } {
  const c = criterion.trim();
  if (/^most\s+\S/i.test(c)) return { top: c, bottom: c.replace(/^most/i, 'Least') };
  return { top: 'Most', bottom: 'Least' };
}

/** The 1-2-3-2-1 diamond. `renderSlot` draws each slot's contents. */
export function diamondGrid(labels: { top: string; bottom: string }, renderSlot: (slot: number, row: number) => HTMLElement, name = 'Diamond'): HTMLElement {
  const wrap = el('div', 'd9-diamond-wrap');
  const grid = el('div', 'd9-diamond');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', name);
  for (let row = 0; row < DIAMOND_ROWS.length; row += 1) {
    const line = el('div', 'd9-row');
    line.dataset.row = String(row);
    for (const slot of rowSlots(row)) line.append(renderSlot(slot, row));
    grid.append(line);
  }
  wrap.append(el('p', 'd9-end d9-end--top', labels.top), grid, el('p', 'd9-end d9-end--bottom', labels.bottom));
  return wrap;
}

/** A diamond to look at, not change. `badge` adds a note to a card (e.g. how far it moved). */
export function readOnlyDiamond(
  slots: Slots | string[],
  cards: ReadonlyMap<string, DiamondCard>,
  letters: ReadonlyMap<string, string>,
  labels: { top: string; bottom: string },
  options: { name?: string; badge?: (id: string) => { text: string; label: string; kind: string } | null } = {}
): HTMLElement {
  return diamondGrid(labels, (slot, row) => {
    const box = el('div', 'd9-slot d9-slot--still');
    const id = slots[slot] ?? null;
    const card = id ? cards.get(id) : undefined;
    if (!id || !card) {
      box.classList.add('d9-slot--empty');
      box.setAttribute('aria-label', `${rowName(row)}: empty`);
      return box;
    }
    const face = el('div', 'd9-card d9-card--still');
    face.append(cardFace(card, letters.get(id) ?? '?'));
    const note = options.badge?.(id);
    let spoken = `${rowName(row)}: ${letters.get(id) ?? ''}, ${cardText(card)}`;
    if (note) {
      const b = el('span', `d9-move d9-move--${note.kind}`, note.text);
      b.setAttribute('aria-hidden', 'true');
      face.append(b);
      spoken += `, ${note.label}`;
    }
    face.setAttribute('role', 'img');
    face.setAttribute('aria-label', spoken);
    box.append(face);
    return box;
  }, options.name);
}

/** How far a card moved, as a badge: ↑2, ↓1 or –. */
export function moveBadge(d: number | undefined): { text: string; label: string; kind: string } | null {
  if (d === undefined) return null;
  if (d > 0) return { text: `↑${d}`, label: `moved up ${d} row${d === 1 ? '' : 's'}`, kind: 'up' };
  if (d < 0) return { text: `↓${-d}`, label: `moved down ${-d} row${d === -1 ? '' : 's'}`, kind: 'down' };
  return { text: '–', label: 'stayed in the same row', kind: 'same' };
}

/** Where the class put one card: a dot per student in each of the five rows. */
export function dotStrip(rows: readonly number[]): HTMLElement {
  const strip = el('div', 'd9-strip');
  const counts = [0, 0, 0, 0, 0];
  for (const r of rows) if (r >= 0 && r < 5) counts[r]! += 1;
  strip.setAttribute('role', 'img');
  strip.setAttribute('aria-label', counts.map((n, r) => `${n} in ${rowName(r).toLowerCase()}`).join(', '));
  counts.forEach((n, r) => {
    const cell = el('span', 'd9-strip__cell');
    cell.title = rowName(r);
    const shown = Math.min(n, 10);
    for (let i = 0; i < shown; i += 1) cell.append(el('span', 'd9-dot'));
    if (n > shown) cell.append(el('span', 'd9-strip__more', `+${n - shown}`));
    strip.append(cell);
  });
  const ends = el('div', 'd9-strip__ends');
  ends.setAttribute('aria-hidden', 'true');
  ends.append(el('span', '', 'Top'), el('span', '', 'Bottom'));
  const wrap = el('div', 'd9-strip-wrap');
  wrap.append(strip, ends);
  return wrap;
}

/** Rows as a short phrase: "up 2 rows". */
export function rowsPhrase(d: number): string {
  const n = Math.abs(d);
  const amount = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${d > 0 ? 'up' : 'down'} ${amount} row${n === 1 ? '' : 's'}`;
}

/** Paper version: the empty diamond, the cards A to I and lines for the two reasons. */
export function renderPrint(block: DiamondNineBlock): HTMLElement {
  const wrap = el('div', 'd9-print');
  const labels = endLabels(block.content.criterion);
  wrap.append(diamondGrid(labels, (slot, row) => {
    const box = el('div', 'd9-slot d9-slot--print');
    box.setAttribute('aria-label', `${rowName(row)}, slot ${slot + 1}`);
    return box;
  }));
  const list = el('ol', 'd9-print__cards');
  block.content.cards.filter((c) => c.text.trim() || (c.alt_text ?? '').trim() || (c.url ?? '').trim()).slice(0, 9).forEach((card, i) => {
    const item = el('li', 'd9-print__card');
    item.append(el('b', 'd9-letter', LETTERS[i] ?? '?'), el('span', '', card.kind === 'image' ? `Picture: ${cardText(card)}` : cardText(card)));
    list.append(item);
  });
  wrap.append(list);
  for (const label of ['Top card, and why', 'Bottom card, and why']) {
    wrap.append(el('p', 'pf-print__label', label), el('div', 'pf-print__lines'));
  }
  if (block.content.second_criterion.trim()) {
    wrap.append(el('p', 'd9-print__second', `Then rank the same cards again by: ${block.content.second_criterion.trim()}`));
  }
  return wrap;
}

/** A card shown in a list (teacher and class views). */
export function cardChip(card: DiamondCard, letter: string): HTMLElement {
  const chip = el('div', 'd9-card d9-card--still d9-card--chip');
  chip.append(cardFace(card, letter));
  return chip;
}

/** Row numbers for the slots in a layout, for tests and summaries. */
export function rowOf(slots: Slots | string[], id: string): number {
  const at = slots.indexOf(id);
  return at < 0 ? -1 : slotRow(at);
}
