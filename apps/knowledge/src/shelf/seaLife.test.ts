import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { buildArchipelago, chartLandmarks, mostConnected } from "./archipelagoLayout";
import { buildShelf, type BookNote } from "./model";
import { freshInk, openWater, pickBottle, seasonAt, skyAt, southernZone, voyages } from "./seaLife";

const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m);

describe("skyAt", () => {
  it("follows the local clock", () => {
    expect(skyAt(at(5, 30))).toBe("dawn");
    expect(skyAt(at(12))).toBe("day");
    expect(skyAt(at(17, 45))).toBe("dusk");
    expect(skyAt(at(21, 5))).toBe("night");
    expect(skyAt(at(2))).toBe("night");
  });
});

const note = (id: string, createdAt: string, extra: Partial<BookNote> = {}): BookNote => ({
  id, title: id, excerpt: "", tags: [], connected: [], createdAt, guessed: false, gaps: [], themes: [], ...extra,
});

describe("pickBottle", () => {
  const now = Date.parse("2026-10-03T10:00:00Z");
  it("only sends notes untouched for four months", () => {
    const books = [{ key: "a", label: "A", notes: [note("new", "2026-09-30"), note("opened", "2025-01-01", { lastOpened: "2026-09-01" })] }];
    expect(pickBottle(books, now)).toBeUndefined();
  });
  it("picks the same old note all day and says when it was last touched", () => {
    const books = [{ key: "a", label: "A", notes: [note("old1", "2026-01-10"), note("old2", "2025-11-02"), note("new", "2026-09-30")] }];
    const first = pickBottle(books, now)!;
    expect(["old1", "old2"]).toContain(first.noteId);
    expect(pickBottle(books, now + 3 * 60 * 60 * 1000)!.noteId).toBe(first.noteId);
    expect(first.since).toMatch(/2026|2025/);
  });
});

function entry(id: string, book: string, extra: Partial<PageManifestEntry> = {}): PageManifestEntry {
  return { id, title: id, area: "notes", tags: [], excerpt: "", origins: [{ kind: "book", label: book }], ...extra };
}

describe("chartLandmarks", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  const books = buildShelf([
    entry("a1", "Make It Stick", { created_at: "2026-10-01T00:00:00Z" }),
    entry("p1", "Peak", { created_at: "2025-01-01T00:00:00Z" }),
  ], { books: [{ label: "Make It Stick" }, { label: "Peak", reading: { page: 3 } }, { label: "Range" }], placements: [] });
  const map = buildArchipelago(books, now);

  it("puts a lighthouse on fresh books, a camp on the one being read and mist over empty ones", () => {
    const marks = chartLandmarks(map);
    const near = (kind: string, key: string) => {
      const island = map.islands.find(i => i.key === key)!;
      return marks.some(m => m.kind === kind && Math.hypot(m.x - island.x, m.y - island.y) < island.r);
    };
    expect(near("lighthouse", "make it stick")).toBe(true);
    expect(near("lighthouse", "peak")).toBe(false);
    expect(near("camp", "peak")).toBe(true);
    expect(near("mist", "range")).toBe(true);
    expect(marks.some(m => m.kind === "volcano")).toBe(false);
  });
});

describe("open water and voyages", () => {
  const lands = [{ x: 300, y: 300, r: 120 }, { x: 900, y: 320, r: 140 }, { x: 600, y: 800, r: 100 }];
  const bounds = { x: 0, y: 0, w: 1200, h: 1100 };
  let seed = 1;
  const roll = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  it("never places anything on land", () => {
    for (let k = 0; k < 50; k += 1) {
      const p = openWater({ bounds, lands }, 30, roll)!;
      for (const l of lands) expect(Math.hypot(p.x - l.x, p.y - l.y)).toBeGreaterThan(l.r + 30);
    }
  });

  it("sails between harbours without crossing a third island", () => {
    const trips = voyages({ bounds, lands, harbours: lands }, roll, 3);
    expect(trips.length).toBeGreaterThan(0);
    for (const v of trips) {
      for (let t = 0.1; t < 0.9; t += 0.1) {
        const x = (1 - t) ** 2 * v.from.x + 2 * (1 - t) * t * v.via.x + t * t * v.to.x;
        const y = (1 - t) ** 2 * v.from.y + 2 * (1 - t) * t * v.via.y + t * t * v.to.y;
        const inside = lands.filter(l => Math.hypot(x - l.x, y - l.y) < l.r);
        expect(inside.length).toBe(0);
      }
    }
  });
});

describe("seasons", () => {
  it("knows the southern hemisphere from the time zone", () => {
    expect(southernZone("Australia/Sydney")).toBe(true);
    expect(southernZone("Pacific/Auckland")).toBe(true);
    expect(southernZone("Europe/London")).toBe(false);
    expect(southernZone("America/New_York")).toBe(false);
  });
  it("turns the seasons the right way round in each hemisphere", () => {
    expect(seasonAt(new Date(2026, 9, 3), true)).toBe("spring");
    expect(seasonAt(new Date(2026, 9, 3), false)).toBe("autumn");
    expect(seasonAt(new Date(2026, 0, 15), true)).toBe("summer");
    expect(seasonAt(new Date(2026, 11, 1), false)).toBe("winter");
    expect(seasonAt(new Date(2026, 6, 1), true)).toBe("winter");
    expect(seasonAt(new Date(2026, 3, 1), false)).toBe("spring");
  });
});

describe("freshInk", () => {
  const notes = [{ id: "a", x: 10, y: 10 }, { id: "b", x: 10, y: 10 }, { id: "c", x: 90, y: 40 }];
  it("blooms nothing on the first visit", () => {
    expect(freshInk(notes, undefined)).toEqual([]);
  });
  it("groups unseen notes by where they landed", () => {
    expect(freshInk(notes, new Set(["c"]))).toEqual([{ x: 10, y: 10, count: 2 }]);
  });
});

describe("mostConnected", () => {
  const item = (id: string, links: number) => ({ note: { id, connected: Array.from({ length: links }, (_, k) => `x${k}`) } });
  it("needs three links and prefers the most", () => {
    expect(mostConnected([item("a", 2)])).toBeUndefined();
    expect(mostConnected([item("a", 3), item("b", 5), item("c", 4)])?.note.id).toBe("b");
    expect(mostConnected([item("b", 4), item("a", 4)])?.note.id).toBe("a");
  });
});
