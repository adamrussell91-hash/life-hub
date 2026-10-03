import type { Page } from "../domain/page";
import type { BookContext } from "../chat/bookNote";
import { getShelf, savePlacements } from "./client";
import { bookKey, chapterStartPage, gapsFromBody, parseLocusChapter, parseLocusPage, stanceFromBody } from "./model";
import type { Chapter, PlacementInput } from "./schema";

/** What the Bookshelf learns from a freshly saved From-a-book note. */
export function placementForBookNote(
  page: Pick<Page, "id" | "body">,
  book?: BookContext,
  chapters: Chapter[] = [],
): PlacementInput | null {
  if (!book?.label) return null;
  const exact = parseLocusPage(book.locus);
  // "ch 3" lands at the chapter's first page, marked as a guess.
  const chapter = exact ? undefined : parseLocusChapter(book.locus);
  const chapterPage = chapter ? chapterStartPage(chapters, chapter) : undefined;
  const pageNumber = exact ?? chapterPage;
  const stance = stanceFromBody(page.body);
  const gaps = gapsFromBody(page.body);
  if (!pageNumber && !stance && !gaps.length) return null;
  return {
    pageId: page.id,
    ...(pageNumber ? { page: pageNumber, guessed: !exact } : {}),
    ...(stance ? { stance } : {}),
    ...(gaps.length ? { gaps } : {}),
  };
}

/**
 * Places the note on the shelf. The note is already saved, so a failure here only
 * means it lands on the loose pile; it never blocks or fails the save.
 */
export async function recordBookNote(page: Pick<Page, "id" | "body">, book?: BookContext) {
  try {
    let chapters: Chapter[] = [];
    if (book?.label && !parseLocusPage(book.locus) && parseLocusChapter(book.locus)) {
      const shelf = await getShelf();
      chapters = shelf.books.find(item => bookKey(item.label) === bookKey(book.label))?.chapters ?? [];
    }
    const placement = placementForBookNote(page, book, chapters);
    if (!placement) return;
    await savePlacements([placement]);
  } catch (error) {
    console.warn("Bookshelf: could not place the new note; it will show as a loose page.", error);
  }
}
