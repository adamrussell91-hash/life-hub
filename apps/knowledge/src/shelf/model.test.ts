import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { buildShelf, gapsFromBody, kindFromBody, matchShelf, parseLocusPage } from "./model";
import { parseShelfData } from "./schema";

function entry(id: string, title: string, book: string | string[], extra: Partial<PageManifestEntry> = {}): PageManifestEntry {
  const books = Array.isArray(book) ? book : [book];
  return { id, title, area: "notes", tags: [], excerpt: "", origins: books.map(label => ({ kind: "book" as const, label })), ...extra };
}

describe("buildShelf", () => {
  const entries = [
    entry("a", "Retrieval practice", "Make It Stick", { connected: ["c"], tags: ["memory"] }),
    entry("b", "Fluency illusion", "make it stick"),
    entry("c", "Practice testing", "Why Don't Students Like School?"),
    entry("d", "Unrelated", "Make It Stick", { origins: [{ kind: "notebook", label: "Literacy" }] }),
  ];
  const data = parseShelfData({
    books: [
      { label: "Make It Stick", pages: 313, notebook: "Cognitive Psychology", chapters: [{ title: "One", start: 1 }, { title: "Two", start: 23 }] },
      { label: "The Enigma of Reason", reading: { page: null } },
    ],
    placements: [{ pageId: "a", page: 28 }, { pageId: "c", page: 91, kind: "idea" }, { pageId: "bad", page: -1 }],
  });
  const books = buildShelf(entries, data);
  const stick = books.find(book => book.key === "make it stick")!;

  it("groups book origins case-insensitively and keeps the stored title", () => {
    expect(stick.label).toBe("Make It Stick");
    expect(stick.noteCount).toBe(2);
    expect(books.map(book => book.label)).toContain("The Enigma of Reason");
  });

  it("splits placed and loose notes and fills chapter counts", () => {
    expect(stick.placed.map(note => note.id)).toEqual(["a"]);
    expect(stick.loose.map(note => note.id)).toEqual(["b"]);
    expect(stick.chapters.map(ch => [ch.noteCount, ch.end])).toEqual([[0, 22], [1, 313]]);
    expect(stick.densestChapter?.title).toBe("Two");
  });

  it("links notes across books with the target page", () => {
    expect(stick.links).toEqual([{ fromId: "a", toId: "c", toBook: "why don't students like school?", toLabel: "Why Don't Students Like School?", toPage: 91, toTitle: "Practice testing" }]);
  });

  it("estimates a page count when facts are missing", () => {
    const why = books.find(book => book.key.startsWith("why"))!;
    expect(why.pagesKnown).toBe(false);
    expect(why.pages).toBe(300);
  });

  it("orders by notebook, then title", () => {
    expect(books[0]!.label).toBe("Make It Stick");
  });

  it("marks reading books", () => {
    expect(books.find(book => book.label === "The Enigma of Reason")!.reading).toEqual({ page: undefined });
  });

  it("matches every query word across title, tags and excerpt", () => {
    expect([...matchShelf(books, "retrieval memory")]).toEqual(["a"]);
    expect(matchShelf(books, "  ").size).toBe(0);
  });
});

describe("book note parsing", () => {
  it("reads a page from loose locus text", () => {
    expect(parseLocusPage("p. 42")).toBe(42);
    expect(parseLocusPage("pp 42–45")).toBe(42);
    expect(parseLocusPage("page 7, top")).toBe(7);
    expect(parseLocusPage("118")).toBe(118);
    expect(parseLocusPage("chapter 3")).toBeUndefined();
    expect(parseLocusPage("")).toBeUndefined();
  });

  const body = `# Retrieval\n\n## In the book\nPilots.\n\n## How this bears on the book\nThis complicates the claim for novices.\n\n## Sources\n- x\n\n## Gaps\n- Does it hold for novices?\n- Long-term retention\n`;
  it("reads Kind lines and carries kind on buildShelf notes", () => {
    expect(kindFromBody("Kind: bridge\n\n# Title")).toBe("bridge");
    expect(kindFromBody(body)).toBeUndefined();
    const shelf = buildShelf(
      [{ id: "n1", title: "N", excerpt: "", tags: [], connected: [], origins: [{ kind: "book", label: "Make It Stick" }] }],
      { books: [], placements: [{ pageId: "n1", page: 10, kind: "idea", kindGuessed: true }] },
    );
    expect(shelf[0]?.placed[0]).toMatchObject({ kind: "idea", kindGuessed: true });
  });
  it("reads gaps as bullet lines", () => {
    expect(gapsFromBody(body)).toEqual(["Does it hold for novices?", "Long-term retention"]);
  });
});
