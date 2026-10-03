import type { BookModel, BookNote } from "./model";

export const STACK_MAX_HEIGHT = 250;
export const STACK_MAX_BOOKS = 4;
const STACK_GAP = 24;

export type ShelfBookBox = { book: BookModel; width: number; thickness: number };
export type ShelfStackBox = { notebook?: string; books: ShelfBookBox[]; width: number };
export type ShelfRowBox = { stacks: ShelfStackBox[] };

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Trim width varies per book (stable) so stacks look like real books, not bars. */
export function bookWidth(book: BookModel, maxWidth: number) {
  return Math.min(maxWidth, 204 + (hash(book.key) % 60));
}

/** Page block thickness: proportional to page count, clamped so every book stays readable. */
export function bookThickness(book: BookModel) {
  return Math.round(Math.min(132, Math.max(34, book.pages / 3.7)));
}

/** Stack books lying flat (never mixing notebooks), then pack stacks into shelf rows. */
export function packShelf(books: BookModel[], width: number): ShelfRowBox[] {
  const maxBook = Math.max(160, Math.min(262, width - 24));
  const stacks: ShelfStackBox[] = [];
  let current: ShelfStackBox | null = null;
  let height = 0;
  for (const book of books) {
    const box = { book, width: bookWidth(book, maxBook), thickness: bookThickness(book) };
    const full = !current || current.notebook !== book.notebook || current.books.length >= STACK_MAX_BOOKS
      || height + box.thickness > STACK_MAX_HEIGHT;
    if (full) {
      current = { notebook: book.notebook, books: [], width: 0 };
      stacks.push(current);
      height = 0;
    }
    current!.books.push(box);
    current!.width = Math.max(current!.width, box.width + 16);
    height += box.thickness + 18;
  }
  const rows: ShelfRowBox[] = [];
  let row: ShelfRowBox = { stacks: [] };
  let used = 0;
  for (const stack of stacks) {
    const need = (row.stacks.length ? STACK_GAP : 0) + stack.width;
    if (row.stacks.length && used + need > width) {
      rows.push(row);
      row = { stacks: [] };
      used = 0;
    }
    row.stacks.push(stack);
    used += row.stacks.length > 1 ? STACK_GAP + stack.width : stack.width;
  }
  if (row.stacks.length) rows.push(row);
  return rows;
}

export type DescentCard = { note: BookNote; top: number; anchor: number; height: number };
export type DescentExit = { fromId: string; top: number; anchor: number };
export type DescentLayout = { pxPerPage: number; height: number; cards: DescentCard[]; exits: DescentExit[] };

export const CARD_HEIGHT = 34;
const CARD_GAP = 4;
const EXIT_HEIGHT = 44;

/**
 * Places each note at its page depth, then pushes cards down so none overlap.
 * The column is tall enough for every card, never shorter than the viewport.
 */
export function layoutDescent(book: BookModel, viewport: number, openId?: string, openHeight = 180): DescentLayout {
  const notes = book.placed;
  const place = (pxPerPage: number) => {
    let floor = -Infinity;
    return notes.map(note => {
      const anchor = (note.page! - 1) * pxPerPage;
      const height = note.id === openId ? openHeight : CARD_HEIGHT;
      const top = Math.max(anchor - CARD_HEIGHT / 2, floor + CARD_GAP);
      floor = top + height;
      return { note, top, anchor, height };
    });
  };
  // Stretch the column until cards sit close to their page (mean drift ≤ 28px), within a sane cap.
  let pxPerPage = Math.max(viewport / book.pages, 1.4);
  let cards = place(pxPerPage);
  const drift = (list: DescentCard[]) => (list.length ? list.reduce((sum, c) => sum + (c.top + CARD_HEIGHT / 2 - c.anchor), 0) / list.length : 0);
  while (drift(cards) > 28 && pxPerPage < 9) {
    pxPerPage *= 1.2;
    cards = place(pxPerPage);
  }
  const floor = cards.length ? cards[cards.length - 1]!.top + cards[cards.length - 1]!.height : 0;
  const byId = new Map(cards.map(card => [card.note.id, card]));
  let exitFloor = -Infinity;
  const exits: DescentExit[] = [];
  for (const link of orderedLinks(book)) {
    const card = byId.get(link.fromId);
    if (!card) continue;
    const anchor = card.top + Math.min(card.height, CARD_HEIGHT) / 2;
    const top = Math.max(anchor - EXIT_HEIGHT / 2, exitFloor + 8);
    exitFloor = top + EXIT_HEIGHT;
    exits.push({ fromId: link.fromId, top, anchor });
  }
  const height = Math.max(book.pages * pxPerPage, floor, exitFloor) + 24;
  return { pxPerPage, height, cards, exits };
}

/** Exit order follows card order so their leader lines never cross. */
export function orderedLinks(book: BookModel) {
  const rank = new Map(book.placed.map((note, index) => [note.id, index]));
  return book.links
    .filter(link => rank.has(link.fromId))
    .sort((a, b) => rank.get(a.fromId)! - rank.get(b.fromId)!);
}
