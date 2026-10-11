import type { PageManifestEntry } from "../domain/page";
import { coverEntry, coverSrc } from "./covers";
import { BOOK_PALETTE, bookSwatch, type BookSwatch } from "./palette";
import type { Chapter, KindBy, Placement, ShelfBook, ShelfData, ShelfKind } from "./schema";
import { ShelfKindSchema } from "./schema";

/** Page count assumed for a book whose facts have not been filled in yet. */
export const FALLBACK_PAGES = 300;

export type BookNote = {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  connected: string[];
  createdAt?: string;
  page?: number;
  guessed: boolean;
  kind?: ShelfKind;
  kindGuessed?: boolean;
  kindBy?: KindBy;
  kindReason?: string;
  gaps: string[];
  themes: string[];
  lastOpened?: string;
  chapterIndex?: number;
};

export type ChapterModel = Chapter & { index: number; end: number; noteCount: number };

export type BookLink = { fromId: string; toId: string; toBook: string; toLabel: string; toPage?: number; toTitle: string };

export type BookModel = {
  key: string;
  label: string;
  author?: string;
  edition?: string;
  notebook?: string;
  swatch: BookSwatch;
  /** Cover image URL, when one has been added to public/books. */
  cover?: string;
  pages: number;
  pagesKnown: boolean;
  /** Claude's estimate rather than facts Adam checked. */
  estimated?: { confidence: "high" | "medium" | "low" };
  chapters: ChapterModel[];
  /** Notes with a page, in page order. */
  placed: BookNote[];
  /** Notes still waiting for a page. */
  loose: BookNote[];
  noteCount: number;
  lastNotePage?: number;
  densestChapter?: ChapterModel;
  reading?: { page?: number };
  completedOn?: string;
  links: BookLink[];
  latestActivity?: string;
};

export function bookKey(label: string) {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

/** "ch 3", "chapter 3", "Ch. 12: Title" → 3 / 12. Only when the locus names no page. */
export function parseLocusChapter(locus?: string): string | undefined {
  if (!locus || parseLocusPage(locus)) return undefined;
  return locus.match(/\b(?:ch(?:apter)?|chap)\.?\s*(\d{1,3}|[ivxlc]+)\b/i)?.[1]?.toLowerCase();
}

/** The start page of the chapter a locus names, from the book's facts. */
export function chapterStartPage(chapters: Chapter[], chapter: string): number | undefined {
  const byLabel = chapters.find(ch => ch.label?.trim().toLowerCase() === chapter);
  const byIndex = /^\d+$/.test(chapter) ? chapters[Number(chapter) - 1] : undefined;
  return (byLabel ?? byIndex)?.start;
}

/** "p. 42", "pp 42–45", "page 42", "42" → 42. Chapter-only loci return undefined. */
export function parseLocusPage(locus?: string): number | undefined {
  if (!locus) return undefined;
  const text = locus.trim();
  const tagged = text.match(/\b(?:pp?\.?|pages?)\s*(\d{1,4})/i);
  const bare = text.match(/^(\d{1,4})(?:\s*[-–]\s*\d{1,4})?$/);
  const value = Number((tagged ?? bare)?.[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

const SECTION_NAMES = /^(in the book|what it means|how this bears|sources|gaps|archive citations|title)\b/i;

/** A heading in any form the notes use: "## In the book", "**In the book**", "2. In the book:", "IN THE BOOK". */
function headingName(line: string): string | null {
  const text = line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*|\*\*:?$|^__|__:?$/g, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
  const isMarked = /^\s*(#{1,6}\s|\*\*|__|\d+[.)]\s)/.test(line);
  const match = text.match(SECTION_NAMES);
  if (match && (isMarked || text.length <= match[0].length + 30)) return match[1]!.toLowerCase();
  return /^\s*#{1,6}\s/.test(line) ? text.toLowerCase() : null;
}

/** The text under a named section, up to the next heading of any kind. "" when the note has no such section. */
export function sectionText(body: string, name: RegExp): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex(line => {
    const heading = headingName(line);
    return heading !== null && name.test(heading);
  });
  if (start < 0) return "";
  // An inline heading ("**In the book** — Kelly's move…") keeps the rest of its line.
  const first = lines[start]!.replace(/^.*?(in the book|how this bears on the book|how this bears|gaps)\**:?\**\s*[—–:-]?\s*/i, "");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => headingName(line) !== null);
  return [first, ...(end < 0 ? rest : rest.slice(0, end))].join("\n").trim();
}

function section(body: string, heading: RegExp): string {
  return sectionText(body, heading);
}

/** Reads an explicit `Kind:` line. No prose fallback — missing line means undefined. */
export function kindFromBody(body: string): ShelfKind | undefined {
  const hit = body.match(/^[\s>*_-]*\**\s*kind\s*[:：]\s*\**\s*(person|idea|case|debate|bridge)\b/im);
  if (!hit?.[1]) return undefined;
  const parsed = ShelfKindSchema.safeParse(hit[1].toLowerCase());
  return parsed.success ? parsed.data : undefined;
}

/** Reads the open questions from a book note's "Gaps" section, one per bullet or line. */
export function gapsFromBody(body: string): string[] {
  return section(body, /^gaps\b/)
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

export function chapterIndexForPage(chapters: Chapter[], page: number): number | undefined {
  let found: number | undefined;
  chapters.forEach((chapter, index) => {
    if (chapter.start <= page) found = index;
  });
  return found;
}

function toNote(entry: PageManifestEntry, placement?: Placement): BookNote {
  return {
    id: entry.id,
    title: entry.title,
    excerpt: entry.excerpt,
    tags: entry.tags ?? [],
    connected: entry.connected ?? [],
    createdAt: entry.created_at,
    page: placement?.page,
    guessed: Boolean(placement?.guessed),
    kind: placement?.kind,
    kindGuessed: placement?.kindGuessed,
    kindBy: placement?.kindBy,
    kindReason: placement?.kindReason,
    gaps: placement?.gaps ?? [],
    themes: placement?.themes ?? [],
    lastOpened: placement?.lastOpened,
  };
}

/**
 * The one model for every Bookshelf view: books from the archive's book origins,
 * merged with shelf facts and note placements. Views must read counts from here.
 */
export function buildShelf(entries: PageManifestEntry[], data: ShelfData): BookModel[] {
  const facts = new Map(data.books.map(book => [bookKey(book.label), book]));
  const placements = new Map(data.placements.map(item => [item.pageId, item]));
  const grouped = new Map<string, { label: string; notes: BookNote[] }>();
  for (const entry of entries) {
    for (const origin of entry.origins ?? []) {
      if (origin.kind !== "book" || !origin.label.trim()) continue;
      const key = bookKey(origin.label);
      const group = grouped.get(key) ?? { label: facts.get(key)?.label ?? origin.label.trim(), notes: [] };
      if (!group.notes.some(note => note.id === entry.id)) group.notes.push(toNote(entry, placements.get(entry.id)));
      grouped.set(key, group);
    }
  }
  for (const [key, book] of facts) {
    if (!grouped.has(key)) grouped.set(key, { label: book.label, notes: [] });
  }

  const noteBook = new Map<string, { key: string; label: string; note: BookNote }>();
  for (const [key, group] of grouped) for (const note of group.notes) noteBook.set(note.id, { key, label: group.label, note });

  const books = [...grouped].map(([key, group]) => modelBook(key, group.label, group.notes, facts.get(key), noteBook));
  return books.sort(shelfOrder);
}

function modelBook(
  key: string,
  label: string,
  notes: BookNote[],
  facts: ShelfBook | undefined,
  noteBook: Map<string, { key: string; label: string; note: BookNote }>,
): BookModel {
  const placedPages = notes.flatMap(note => (note.page ? [note.page] : []));
  const lastNotePage = placedPages.length ? Math.max(...placedPages) : undefined;
  const pagesKnown = Boolean(facts?.pages);
  const pages = facts?.pages ?? Math.max(FALLBACK_PAGES, Math.ceil(((lastNotePage ?? 0) * 1.1) / 10) * 10);
  const rawChapters = facts?.chapters ?? [];
  for (const note of notes) {
    if (note.page && rawChapters.length) note.chapterIndex = chapterIndexForPage(rawChapters, note.page);
  }
  const chapters: ChapterModel[] = rawChapters.map((chapter, index) => ({
    ...chapter,
    index,
    end: (rawChapters[index + 1]?.start ?? pages + 1) - 1,
    noteCount: notes.filter(note => note.chapterIndex === index).length,
  }));
  const densestChapter = chapters.reduce<ChapterModel | undefined>(
    (best, chapter) => (chapter.noteCount > (best?.noteCount ?? 0) ? chapter : best),
    undefined,
  );
  const placed = notes.filter(note => note.page).sort((a, b) => a.page! - b.page! || a.title.localeCompare(b.title));
  const loose = notes.filter(note => !note.page).sort((a, b) => a.title.localeCompare(b.title));
  const links: BookLink[] = [];
  for (const note of notes) {
    for (const id of note.connected) {
      const other = noteBook.get(id);
      if (!other || other.key === key) continue;
      links.push({ fromId: note.id, toId: id, toBook: other.key, toLabel: other.label, toPage: other.note.page, toTitle: other.note.title });
    }
  }
  const activity = [...notes.map(note => note.createdAt), facts?.reading?.updated_at].filter((d): d is string => Boolean(d)).sort();
  const cover = coverEntry(key);
  const coverSwatch = cover?.swatch !== undefined ? BOOK_PALETTE[cover.swatch] : undefined;
  return {
    key,
    label,
    author: facts?.author,
    edition: facts?.edition,
    notebook: facts?.notebook,
    swatch: coverSwatch ?? bookSwatch(label),
    cover: cover ? coverSrc(cover.file) : undefined,
    pages,
    pagesKnown,
    estimated: facts?.estimated ? { confidence: facts.estimated.confidence } : undefined,
    chapters,
    placed,
    loose,
    noteCount: notes.length,
    lastNotePage,
    densestChapter,
    completedOn: facts?.completed_on,
    reading: facts?.reading ? { page: facts.reading.page ?? undefined } : undefined,
    links,
    latestActivity: activity[activity.length - 1],
  };
}

function shelfOrder(a: BookModel, b: BookModel) {
  if (Boolean(a.notebook) !== Boolean(b.notebook)) return a.notebook ? -1 : 1;
  return (a.notebook ?? "").localeCompare(b.notebook ?? "") || a.label.localeCompare(b.label);
}

/** Note ids whose title, tags or excerpt contain every word of the query. */
export function matchShelf(books: BookModel[], query: string): Set<string> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = new Set<string>();
  if (!words.length) return hits;
  for (const book of books) {
    for (const note of [...book.placed, ...book.loose]) {
      const hay = `${note.title} ${note.tags.join(" ")} ${note.excerpt} ${note.themes.join(" ")}`.toLowerCase();
      if (words.every(word => hay.includes(word))) hits.add(note.id);
    }
  }
  return hits;
}

export function findBook(books: BookModel[], key: string) {
  return books.find(book => book.key === key);
}
