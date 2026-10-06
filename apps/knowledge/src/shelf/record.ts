import type { Page } from "../domain/page";
import type { BookContext } from "../chat/bookNote";
import { getShelf, gradeKind, savePlacements } from "./client";
import { bookKey, chapterStartPage, gapsFromBody, kindFromBody, parseLocusChapter, parseLocusPage } from "./model";
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
  const kind = kindFromBody(page.body);
  const gaps = gapsFromBody(page.body);
  if (!pageNumber && !kind && !gaps.length) return null;
  return {
    pageId: page.id,
    ...(pageNumber ? { page: pageNumber, guessed: !exact } : {}),
    ...(kind ? { kind, kindBy: "clementine" as const, kindGuessed: false } : {}),
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
    if (placement) await savePlacements([placement]);
    // Kind: line already set by Clementine → keep it. Otherwise grade in the background.
    if (book?.label && !placement?.kind) gradeKindInBackground(page.id);
  } catch (error) {
    console.warn("Bookshelf: could not place the new note; it will show as a loose page.", error);
  }
}

/**
 * Asks the server for this note's kind without holding up the save. The server
 * keeps any kind the note already has, so re-saving a note never regrades it.
 */
export function gradeKindInBackground(pageId: string): Promise<void> {
  return gradeKind(pageId).then(
    () => undefined,
    error => console.warn("Bookshelf: could not grade the note's kind.", error),
  );
}

/** A "Write it yourself" note with a book origin and a page typed in compose. */
export function placementForComposedPage(pageId: string, origins: Array<{ kind: string }>, page?: string): PlacementInput | null {
  if (!origins.some(origin => origin.kind === "book")) return null;
  const value = Number(page);
  if (!Number.isInteger(value) || value < 1 || value > 5000) return null;
  return { pageId, page: value, guessed: false };
}

export async function recordComposedPage(pageId: string, origins: Array<{ kind: string }>, page?: string) {
  if (!origins.some(origin => origin.kind === "book")) return;
  const placement = placementForComposedPage(pageId, origins, page);
  if (placement) {
    try {
      await savePlacements([placement]);
    } catch (error) {
      console.warn("Bookshelf: could not place the note; it will show as a loose page.", error);
    }
  }
  // Every book note gets a kind, typed page or not.
  gradeKindInBackground(pageId);
}
