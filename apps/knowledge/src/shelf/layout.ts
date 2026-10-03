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
export type DescentExit = { fromId: string; toId: string; top: number; anchor: number; height: number; open: boolean };
export type DescentLayout = { pxPerPage: number; height: number; cards: DescentCard[]; exits: DescentExit[] };

export const CARD_HEIGHT = 34;
const CARD_GAP = 4;
/** Closed lead: a colour bar beside the note. Open lead: the named card. */
export const EXIT_BAR = 8;
export const EXIT_OPEN = 52;
const EXIT_BAR_GAP = 3;
const EXIT_OPEN_GAP = 6;

/**
 * Places each note at its page depth, then pushes cards down so none overlap.
 * The column is tall enough for every card, never shorter than the viewport.
 */
function exitBlockHeight(count: number, open: boolean) {
  if (!count) return 0;
  const item = open ? EXIT_OPEN : EXIT_BAR;
  const gap = open ? EXIT_OPEN_GAP : EXIT_BAR_GAP;
  return count * item + (count - 1) * gap;
}

export function layoutDescent(book: BookModel, viewport: number, openId?: string, openHeight = 180): DescentLayout {
  const notes = book.placed;
  const linksByNote = new Map<string, ReturnType<typeof orderedLinks>>();
  for (const link of orderedLinks(book)) {
    const list = linksByNote.get(link.fromId) ?? [];
    list.push(link);
    linksByNote.set(link.fromId, list);
  }
  const place = (pxPerPage: number) => {
    let floor = -Infinity;
    return notes.map(note => {
      const anchor = (note.page! - 1) * pxPerPage;
      const height = note.id === openId ? openHeight : CARD_HEIGHT;
      const slot = Math.max(height, exitBlockHeight(linksByNote.get(note.id)?.length ?? 0, note.id === openId));
      const top = Math.max(anchor - CARD_HEIGHT / 2, floor + CARD_GAP);
      floor = top + slot;
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
  const exits: DescentExit[] = [];
  for (const card of cards) {
    const links = linksByNote.get(card.note.id) ?? [];
    const open = card.note.id === openId;
    const height = open ? EXIT_OPEN : EXIT_BAR;
    const gap = open ? EXIT_OPEN_GAP : EXIT_BAR_GAP;
    const block = exitBlockHeight(links.length, open);
    const anchor = card.top + Math.min(card.height, CARD_HEIGHT) / 2;
    let top = block > Math.min(card.height, CARD_HEIGHT) ? card.top : anchor - block / 2;
    for (const link of links) {
      exits.push({ fromId: link.fromId, toId: link.toId, top, anchor, height, open });
      top += height + gap;
    }
  }
  const exitFloor = exits.length ? exits[exits.length - 1]!.top + exits[exits.length - 1]!.height : 0;
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

// ── Covers: books standing face out ──────────────────────────────────

export type CoverBox = { book: BookModel; width: number; height: number };
export type CoverSet = { notebook?: string; books: CoverBox[]; width: number };
export type CoverRow = { sets: CoverSet[] };

export const COVER_GAP = 12;
export const COVER_SET_GAP = 32;

/** Cover width that fits `columns` books on a narrow shelf, capped for desktop. */
export function coverWidth(shelfWidth: number, phone: boolean) {
  if (!phone) return 124;
  return Math.max(72, Math.min(124, Math.floor((shelfWidth - 2 * COVER_GAP) / 3)));
}

/** Books stand at slightly different heights (stable per title), like a real shelf. */
export function coverBox(book: BookModel, width: number): CoverBox {
  return { book, width, height: Math.round(width * 1.5 * (0.9 + (hash(book.key) % 11) / 100)) };
}

/** Books face out in notebook sets; a set that doesn't fit carries on along the next shelf. */
export function packCovers(books: BookModel[], shelfWidth: number, width: number): CoverRow[] {
  const rows: CoverRow[] = [];
  let row: CoverRow = { sets: [] };
  let used = 0;
  let set: CoverSet | null = null;
  const newRow = () => {
    if (row.sets.length) rows.push(row);
    row = { sets: [] };
    used = 0;
    set = null;
  };
  for (const book of books) {
    const box = coverBox(book, width);
    const sameSet = set !== null && (set as CoverSet).notebook === book.notebook;
    const need = sameSet ? COVER_GAP + width : (row.sets.length ? COVER_SET_GAP : 0) + width;
    if (used + need > shelfWidth && used > 0) newRow();
    if (!set || (set as CoverSet).notebook !== book.notebook) {
      if (row.sets.length) used += COVER_SET_GAP;
      set = { notebook: book.notebook, books: [], width: 0 };
      row.sets.push(set);
    } else used += COVER_GAP;
    (set as CoverSet).books.push(box);
    (set as CoverSet).width += ((set as CoverSet).books.length > 1 ? COVER_GAP : 0) + width;
    used += width;
  }
  if (row.sets.length) rows.push(row);
  return rows;
}
