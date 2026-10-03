import type { Page } from "../domain/page";
import type { BookContext } from "../chat/bookNote";
import { savePlacements } from "./client";
import { gapsFromBody, parseLocusPage, stanceFromBody } from "./model";
import type { PlacementInput } from "./schema";

/** What the Bookshelf learns from a freshly saved From-a-book note. */
export function placementForBookNote(page: Pick<Page, "id" | "body">, book?: BookContext): PlacementInput | null {
  if (!book?.label) return null;
  const pageNumber = parseLocusPage(book.locus);
  const stance = stanceFromBody(page.body);
  const gaps = gapsFromBody(page.body);
  if (!pageNumber && !stance && !gaps.length) return null;
  return {
    pageId: page.id,
    ...(pageNumber ? { page: pageNumber, guessed: false } : {}),
    ...(stance ? { stance } : {}),
    ...(gaps.length ? { gaps } : {}),
  };
}

/**
 * Places the note on the shelf. The note is already saved, so a failure here only
 * means it lands on the loose pile; it never blocks or fails the save.
 */
export async function recordBookNote(page: Pick<Page, "id" | "body">, book?: BookContext) {
  const placement = placementForBookNote(page, book);
  if (!placement) return;
  try {
    await savePlacements([placement]);
  } catch (error) {
    console.warn("Bookshelf: could not place the new note; it will show as a loose page.", error);
  }
}
