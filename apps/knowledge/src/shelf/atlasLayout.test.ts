import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { buildAtlas, groupChapters, noteThemes } from "./atlasLayout";
import { buildShelf } from "./model";

const label = "Make It Stick";
function entry(id: string, extra: Partial<PageManifestEntry> = {}): PageManifestEntry {
  return { id, title: id, area: "notes", tags: [], excerpt: "", origins: [{ kind: "book", label }], ...extra };
}
const chapters = Array.from({ length: 8 }, (_, i) => ({ label: String(i + 1), title: `Chapter ${i + 1}`, start: 1 + i * 30 }));

describe("buildAtlas", () => {
  const entries = [entry("a", { connected: ["b"], created_at: "2026-10-01T00:00:00.000Z" }), entry("b"), entry("c"), entry("d", { connected: ["x"] }), entry("x", { origins: [{ kind: "book", label: "Peak" }] })];
  const data = {
    books: [{ label, pages: 250, chapters }],
    placements: [
      { pageId: "a", page: 5, kind: "debate" as const, gaps: ["Novices?"] },
      { pageId: "b", page: 40 },
      { pageId: "c", page: 45, lastOpened: "2025-01-01T00:00:00.000Z" },
    ],
  };
  const book = buildShelf(entries, data).find(b => b.label === label)!;
  const atlas = buildAtlas(book, Date.parse("2026-10-03T00:00:00.000Z"));

  it("makes a province per chapter in reading order, fogging the unwritten ones", () => {
    expect(atlas.source).toBe("chapters");
    expect(atlas.provinces.map(p => p.explored)).toEqual([true, true, false, false, false, false, false, false]);
    const xs = atlas.provinces.map(p => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("settles every note: placed ones in their chapter, loose ones offshore", () => {
    expect(atlas.towns.map(t => [t.note.id, t.province])).toEqual([["a", "ch-0"], ["b", "ch-1"], ["c", "ch-1"], ["d", "loose"]]);
  });

  it("marks peaks, new towns and faded towns", () => {
    const a = atlas.towns.find(t => t.note.id === "a")!;
    expect(a.peak).toBe(true);
    expect(a.isNew).toBe(true);
    expect(atlas.towns.find(t => t.note.id === "c")!.faded).toBe(true);
  });

  it("keeps towns apart, draws roads once, routes to other books, and fogs gaps", () => {
    for (const t of atlas.towns) for (const u of atlas.towns) if (t !== u) expect(Math.hypot(t.x - u.x, t.y - u.y)).toBeGreaterThan(29);
    expect(atlas.roads).toEqual([{ from: "a", to: "b" }]);
    expect(atlas.routes.map(r => [r.toLabel, r.count])).toEqual([["Peak", 1]]);
    expect(atlas.fogs.map(f => f.text)).toEqual(["Novices?"]);
  });

  it("is deterministic", () => {
    expect(buildAtlas(book, Date.parse("2026-10-03T00:00:00.000Z"))).toEqual(atlas);
  });

  it("falls back to themes without chapters, picking each note's least common theme", () => {
    const themed = buildShelf([
      entry("p", { tags: ["Learning Science and Cognition", "Assessment Feedback and Evaluation"] }),
      entry("q", { tags: ["Learning Science and Cognition"] }),
      entry("r", { tags: ["Learning Science and Cognition"] }),
    ], { books: [{ label }], placements: [{ pageId: "p", page: 3 }, { pageId: "q", page: 9 }, { pageId: "r", page: 20 }] }).find(b => b.label === label)!;
    const map = buildAtlas(themed);
    expect(map.source).toBe("themes");
    expect(map.provinces.map(p => p.label)).toEqual(["Assessment Feedback and Evaluation", "Learning Science and Cognition"]);
    expect(noteThemes(themed.placed[0]!)).toContain("Assessment Feedback and Evaluation");
  });
});

describe("groupChapters", () => {
  it("merges a long textbook into at most eight provinces, in order, without losing a chapter", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `C${i}`, start: 1 + i * 20, index: i, end: 20 + i * 20, noteCount: 0 }));
    const groups = groupChapters(many, 600);
    expect(groups.length).toBeLessThanOrEqual(8);
    expect(groups.flat().map(c => c.index)).toEqual(many.map(c => c.index));
  });
});
