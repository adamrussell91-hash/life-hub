import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { atlasContext, buildArchipelago, islandRadius, packCircles } from "./archipelagoLayout";
import { terrainField } from "./atlasTerrain";
import { SEA_LEVEL } from "./islandShape";

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

describe("crossings", () => {
  // One notebook: Hub shares 3 links with Three, 2 with Two, 1 with One. Far is in another notebook, linked 4 times.
  const linked = (from: string, to: string, n: number) => Array.from({ length: n }, (_, i) => [
    entry(`${from}-${to}-${i}`, from, { connected: [`${to}-${from}-${i}`] }),
    entry(`${to}-${from}-${i}`, to, { connected: [`${from}-${to}-${i}`] }),
  ]).flat();
  const shelf = buildShelf([...linked("Hub", "Three", 3), ...linked("Hub", "Two", 2), ...linked("Hub", "One", 1), ...linked("Hub", "Far", 4), entry("h", "Hub")], {
    books: [
      { label: "Hub", notebook: "Sea" }, { label: "Three", notebook: "Sea" }, { label: "Two", notebook: "Sea" },
      { label: "One", notebook: "Sea" }, { label: "Far", notebook: "Other" },
    ],
    placements: [],
  });
  const map = buildArchipelago(shelf, Date.parse("2026-10-03T00:00:00Z"));
  const kind = (other: string) => map.crossings.find(c => [c.from, c.to].includes(other))!.kind;
  const field = terrainField(map.terrain, 13);
  const pair = (a: string, b: string) => [a, b].sort().join("|");
  const joined = new Set(map.crossings.filter(c => c.kind === "joined").map(c => pair(c.from, c.to)));

  it("bridges or joins neighbours in one sea by how many links they share, and leaves other seas to faint routes", () => {
    expect(kind("one")).toBe("rope");
    expect(kind("two")).toBe("stone");
    expect(kind("three")).toBe("joined");
    expect(kind("far")).toBe("far");
  });

  it("pulls joined books shore to shore", () => {
    const hub = map.islands.find(i => i.key === "hub")!;
    const three = map.islands.find(i => i.key === "three")!;
    expect(Math.hypot(hub.x - three.x, hub.y - three.y) - hub.r - three.r).toBeLessThan(20);
  });

  it("joins land across the neck of joined books and keeps open sea between every other pair", () => {
    for (const c of map.crossings.filter(c => c.kind === "joined")) expect(field((c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2).e).toBeGreaterThan(SEA_LEVEL);
    for (const a of map.islands) for (const b of map.islands) {
      if (a.key >= b.key || joined.has(pair(a.key, b.key))) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const t = (a.r + (d - a.r - b.r) / 2) / d;
      const mid = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      // Skip pairs with a third island lying between them.
      if (map.islands.some(i => i !== a && i !== b && Math.hypot(i.x - mid.x, i.y - mid.y) < i.r * 1.2)) continue;
      expect(field(mid.x, mid.y).e).toBeLessThan(SEA_LEVEL);
    }
  });

  it("tells a book's own map where its island sits and which neighbours meet it", () => {
    const ctx = atlasContext(map, "hub")!;
    const hub = map.islands.find(i => i.key === "hub")!;
    expect(ctx.island).toEqual({ x: hub.x, y: hub.y, r: hub.r });
    expect(ctx.neighbours.map(n => [n.key, n.kind, n.count]).sort()).toEqual([["one", "rope", 1], ["three", "joined", 3], ["two", "stone", 2]]);
  });
});
import { buildShelf } from "./model";
