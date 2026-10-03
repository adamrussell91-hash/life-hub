import { describe, expect, it } from "vitest";
import { buildShelf } from "./model";
import { COVER_GAP, COVER_SET_GAP, packCovers } from "./layout";

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

  it("stands each cover at a stable height near 3:2", () => {
    const [a, b] = [packCovers(books, 2000, 100), packCovers(books, 2000, 100)];
    const heights = a.flatMap(r => r.sets.flatMap(s => s.books.map(x => x.height)));
    expect(heights).toEqual(b.flatMap(r => r.sets.flatMap(s => s.books.map(x => x.height))));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(135);
    expect(Math.max(...heights)).toBeLessThanOrEqual(150);
  });
});
