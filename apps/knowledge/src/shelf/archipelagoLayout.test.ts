import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { buildArchipelago, islandRadius, packCircles } from "./archipelagoLayout";
import { buildShelf } from "./model";

function entry(id: string, book: string, extra: Partial<PageManifestEntry> = {}): PageManifestEntry {
  return { id, title: id, area: "notes", tags: [], excerpt: "", origins: [{ kind: "book", label: book }], ...extra };
}

const entries = [
  entry("a1", "Make It Stick", { connected: ["p1"] }),
  entry("a2", "Make It Stick", { connected: ["p1"] }),
  entry("a3", "Make It Stick"),
  entry("p1", "Peak", { connected: ["a1", "a2"] }),
  entry("d1", "Discourses"),
];
const books = buildShelf(entries, {
  books: [
    { label: "Make It Stick", notebook: "Cognition" },
    { label: "Peak", notebook: "Cognition" },
    { label: "Discourses", notebook: "Philosophy" },
    { label: "Range" },
  ],
  placements: [],
});

describe("buildArchipelago", () => {
  const map = buildArchipelago(books, Date.parse("2026-10-03T00:00:00Z"));

  it("makes an island per book, sized by notes, in a sea per notebook with Unfiled last", () => {
    expect(map.islands.map(i => i.key).sort()).toEqual(books.map(b => b.key).sort());
    expect(map.seas.map(s => s.name)).toEqual(["Cognition", "Philosophy", "Unfiled"]);
    const stick = map.islands.find(i => i.key === "make it stick")!;
    expect(stick.r).toBe(islandRadius(3));
    expect(stick.r).toBeGreaterThan(map.islands.find(i => i.key === "range")!.r);
  });

  it("never lets islands overlap and keeps them inside the world", () => {
    for (const a of map.islands) {
      expect(a.x - a.r).toBeGreaterThan(0);
      expect(a.y - a.r).toBeGreaterThan(0);
      expect(a.x + a.r).toBeLessThan(map.width);
      expect(a.y + a.r).toBeLessThan(map.height);
      for (const b of map.islands) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
    }
  });

  it("counts each linked note pair once on the sea route between two books", () => {
    expect(map.passages).toHaveLength(1);
    expect(map.passages[0]).toMatchObject({ count: 2 });
    expect([map.passages[0]!.from, map.passages[0]!.to].sort()).toEqual(["make it stick", "peak"]);
  });

  it("is deterministic and paints notes as the hills of their island", () => {
    expect(buildArchipelago(books).islands.map(i => [i.x, i.y])).toEqual(buildArchipelago(books).islands.map(i => [i.x, i.y]));
    expect(map.terrain.towns.filter(t => t.province === "make it stick")).toHaveLength(3);
    // Big books are capped at a few hills so the contours stay readable.
    const big = buildArchipelago(buildShelf(Array.from({ length: 30 }, (_, i) => entry(`n${i}`, "Big")), { books: [], placements: [] }));
    expect(big.terrain.towns).toHaveLength(5);
    expect(map.terrain.provinces.find(p => p.id === "range")?.explored).toBe(false);
  });
});

describe("packCircles", () => {
  it("keeps the gap between every pair", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, r: 20 + i * 5 }));
    const centres = packCircles(items, 10);
    for (const a of items) for (const b of items) {
      if (a === b) continue;
      const p = centres.get(a.id)!;
      const q = centres.get(b.id)!;
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(a.r + b.r + 10 - 1e-6);
    }
  });
});
