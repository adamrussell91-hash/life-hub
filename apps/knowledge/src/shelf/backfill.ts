import type { Page } from "../domain/page";
import type { BookModel } from "./model";
import { gapsFromBody, kindFromBody, sectionText } from "./model";
import type { PlacementInput } from "./schema";

const PAGE_RE = /\b(?:pp?|pg|pages?)\.?\s*(\d{1,4})(?:\s*[-–]\s*\d{1,4})?\b/i;
const NOT_THE_BOOK = /^(what it means|how this bears|sources|gaps|archive citations)/;

function firstPage(text: string) {
  const clean = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "");
  const value = Number(clean.match(PAGE_RE)?.[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * The book page a note names: "p. 42", "p42", "pg 42", "page 42", "pp 140–142".
 * Reads "In the book" when the note has it; otherwise the note minus its web
 * sections, so a source's page number is never taken for the book's.
 */
export function pageFromBody(body: string): number | undefined {
  const inBook = sectionText(body, /^in the book/);
  if (inBook) return firstPage(inBook);
  const kept: string[] = [];
  let skipping = false;
  for (const line of body.split(/\r?\n/)) {
    const lower = line.replace(/^[#*_\d.)\s]+/, "").toLowerCase();
    if (/^\s*(#{1,6}\s|\*\*|__)/.test(line)) skipping = NOT_THE_BOOK.test(lower);
    if (!skipping) kept.push(line);
  }
  return firstPage(kept.join("\n"));
}

/** Notes missing a page, kind or gaps: the ones worth reading. */
export function notesToRead(books: BookModel[]) {
  const seen = new Set<string>();
  const list: Array<{ id: string; maxPage: number }> = [];
  for (const book of books) {
    for (const note of [...book.placed, ...book.loose]) {
      if (seen.has(note.id) || (note.page && note.kind && note.gaps.length)) continue;
      seen.add(note.id);
      list.push({ id: note.id, maxPage: book.pagesKnown ? book.pages : 5000 });
    }
  }
  return list;
}

/** Only fills fields the note doesn't have yet; never overwrites a page Adam placed. */
export function fillFromBody(
  page: Pick<Page, "id" | "body">,
  current: { page?: number; kind?: string; gaps: string[] },
  maxPage: number,
): PlacementInput | null {
  const patch: PlacementInput = { pageId: page.id };
  if (!current.page) {
    const found = pageFromBody(page.body);
    if (found && found <= maxPage) Object.assign(patch, { page: found, guessed: true });
  }
  if (!current.kind) {
    const kind = kindFromBody(page.body);
    if (kind) Object.assign(patch, { kind, kindBy: "clementine" as const, kindGuessed: false });
  }
  if (!current.gaps.length) {
    const gaps = gapsFromBody(page.body);
    if (gaps.length) patch.gaps = gaps;
  }
  return Object.keys(patch).length > 1 ? patch : null;
}

export async function readNotesForShelf(
  books: BookModel[],
  getPage: (id: string) => Promise<Pick<Page, "id" | "body">>,
  onProgress: (done: number, total: number) => void,
): Promise<{ patches: PlacementInput[]; failed: number }> {
  const byId = new Map(books.flatMap(book => [...book.placed, ...book.loose].map(note => [note.id, note] as const)));
  const queue = notesToRead(books);
  const patches: PlacementInput[] = [];
  let failed = 0;
  let done = 0;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const page = await getPage(item.id);
        const patch = fillFromBody(page, byId.get(item.id)!, item.maxPage);
        if (patch) patches.push(patch);
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress(done, done + queue.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { patches, failed };
}
