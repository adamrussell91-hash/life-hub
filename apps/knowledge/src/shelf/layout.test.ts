import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { buildShelf } from "./model";
import { parseShelfData } from "./schema";
import { COVER_GAP, COVER_SET_GAP, EXIT_BAR, EXIT_OPEN, layoutDescent, packCovers } from "./layout";

const notebooks = ["A", "A", "A", "B", "B", "C"];
const books = buildShelf([], {
  books: notebooks.map((nb, i) => ({ label: `Book ${i}`, notebook: nb })),
  placements: [],
}).sort((a, b) => (a.notebook ?? "").localeCompare(b.notebook ?? "") || a.label.localeCompare(b.label));

describe("packCovers", () => {
  it("keeps notebooks together and never overfills a shelf", () => {
    const width = 100;
    const shelf = 3 * width + 2 * COVER_GAP + COVER_SET_GAP + width;
    const rows = packCovers(books, shelf, width);
    expect(rows.flatMap(r => r.sets.flatMap(s => s.books.map(b => b.book.notebook)))).toEqual(notebooks);
    for (const row of rows) {
      const used = row.sets.reduce((sum, s) => sum + s.width, 0) + (row.sets.length - 1) * COVER_SET_GAP;
      expect(used).toBeLessThanOrEqual(shelf);
    }
    expect(rows[0]!.sets.map(s => s.books.length)).toEqual([3, 1]);
  });

  it("keeps unselected leads as bars beside their note and opens only the selected note", () => {
    const entry = (id: string, title: string, book: string, extra: Partial<PageManifestEntry> = {}): PageManifestEntry =>
      ({ id, title, area: "notes", tags: [], excerpt: "", origins: [{ kind: "book", label: book }], ...extra });
    const alpha = buildShelf([
      entry("a", "Memory boards", "The Knowledge Gene", { connected: ["c", "d"] }),
      entry("b", "A later chapter", "The Knowledge Gene", { connected: ["e"] }),
      entry("c", "Basal ganglia", "The Neural Mind"),
      entry("d", "Sleep", "Purves"),
      entry("e", "Cortex", "Clinical Neuroanatomy"),
    ], parseShelfData({
      books: [{ label: "The Knowledge Gene", pages: 120 }],
      placements: [
        { pageId: "a", page: 12 },
        { pageId: "b", page: 70 },
        { pageId: "c", page: 4 },
        { pageId: "e", page: 9 },
      ],
    })).find(book => book.label === "The Knowledge Gene")!;
    const closed = layoutDescent(alpha, 800);
    expect(closed.exits.map(exit => exit.height)).toEqual([EXIT_BAR, EXIT_BAR, EXIT_BAR]);
    const bCard = closed.cards.find(card => card.note.id === "b")!;
    const bExit = closed.exits.find(exit => exit.fromId === "b")!;
    expect(Math.abs(bExit.top - (bCard.top + 8))).toBeLessThan(30);
    const open = layoutDescent(alpha, 800, "a");
    expect(open.exits.filter(exit => exit.fromId === "a").every(exit => exit.open && exit.height === EXIT_OPEN)).toBe(true);
    const openB = open.cards.find(card => card.note.id === "b")!;
    const openBExit = open.exits.find(exit => exit.fromId === "b")!;
    expect(openBExit.height).toBe(EXIT_BAR);
    expect(Math.abs(openBExit.top - openB.top)).toBeLessThan(40);
  });

  it("stands each cover at a stable height near 3:2", () => {
    const [a, b] = [packCovers(books, 2000, 100), packCovers(books, 2000, 100)];
    const heights = a.flatMap(r => r.sets.flatMap(s => s.books.map(x => x.height)));
    expect(heights).toEqual(b.flatMap(r => r.sets.flatMap(s => s.books.map(x => x.height))));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(135);
    expect(Math.max(...heights)).toBeLessThanOrEqual(150);
  });
});
