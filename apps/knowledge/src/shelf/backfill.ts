import type { Page } from "../domain/page";
import type { BookModel } from "./model";
import { gapsFromBody, stanceFromBody } from "./model";
import type { PlacementInput } from "./schema";

/** A page number written in the "In the book" section, e.g. "(p. 42)" or "page 118". */
export function pageFromBody(body: string): number | undefined {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex(line => /^#{1,4}\s*in the book\b/i.test(line));
  const rest = start < 0 ? lines.slice(0, 12) : lines.slice(start + 1);
  const end = rest.findIndex(line => /^#{1,4}\s/.test(line));
  const text = (end < 0 ? rest : rest.slice(0, end)).slice(0, 12).join(" ");
  const match = text.match(/\b(?:pp?\.|pages?)\s*(\d{1,4})\b/i);
  const value = Number(match?.[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Notes missing a page, stance or gaps: the ones worth reading. */
export function notesToRead(books: BookModel[]) {
  const seen = new Set<string>();
  const list: Array<{ id: string; maxPage: number }> = [];
  for (const book of books) {
    for (const note of [...book.placed, ...book.loose]) {
      if (seen.has(note.id) || (note.page && note.stance && note.gaps.length)) continue;
      seen.add(note.id);
      list.push({ id: note.id, maxPage: book.pagesKnown ? book.pages : 5000 });
    }
  }
  return list;
}

/** Only fills fields the note doesn't have yet; never overwrites a page Adam placed. */
export function fillFromBody(
  page: Pick<Page, "id" | "body">,
  current: { page?: number; stance?: string; gaps: string[] },
  maxPage: number,
): PlacementInput | null {
  const patch: PlacementInput = { pageId: page.id };
  if (!current.page) {
    const found = pageFromBody(page.body);
    if (found && found <= maxPage) Object.assign(patch, { page: found, guessed: true });
  }
  if (!current.stance) {
    const stance = stanceFromBody(page.body);
    if (stance) patch.stance = stance;
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
