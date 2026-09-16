import { describe, expect, it } from "vitest";
import { buildSkyIndex, entriesFromCutoff, skyIndexRange, unconnectedEntries } from "./skyIndex";
import type { PageManifestEntry } from "../domain/page";
import type { SavedConstellation } from "./schema";
import { monthIndexFromIso } from "./timeline";

function entry(id: string, createdAt?: string): PageManifestEntry {
  return { id, title: id, area: "notes", tags: [], excerpt: "", created_at: createdAt };
}

function constellation(id: string, createdAt: string, noteIds: string[]): SavedConstellation {
  const notes = noteIds.map(pageId => ({ pageId, title: pageId, excerpt: "", role: "role" }));
  return {
    version: 1,
    query: id,
    title: id,
    symbol: { templateId: "spiral", label: "Spiral", meaning: "meaning" },
    notes,
    relations: [{ sourceId: noteIds[0]!, targetId: noteIds[1]!, type: "extends", explanation: "x" }],
    synthesis: { summary: "s", claims: [{ text: "c", sourceIds: [noteIds[0]!] }], tensions: [], gaps: [] },
    id,
    createdAt,
    updatedAt: createdAt,
    sky: { y: 0.5, rotation: 0, scale: 1 },
  };
}

describe("unconnectedEntries", () => {
  it("excludes entries referenced by any saved constellation", () => {
    const entries = [entry("a"), entry("b"), entry("c")];
    const saved = [constellation("stars_1", "2026-01-01T00:00:00.000Z", ["a", "b"])];
    expect(unconnectedEntries(entries, saved).map(item => item.id)).toEqual(["c"]);
  });
});

describe("buildSkyIndex", () => {
  it("buckets unconnected notes and constellations by their creation month", () => {
    const entries = [entry("a", "2026-01-10T00:00:00.000Z"), entry("b", "2026-01-20T00:00:00.000Z"), entry("c", "2026-03-01T00:00:00.000Z")];
    const saved = [constellation("stars_1", "2026-03-05T00:00:00.000Z", ["c"])];
    const index = buildSkyIndex(entries, saved);
    const januaryIndex = monthIndexFromIso("2026-01-10T00:00:00.000Z")!;
    const marchIndex = monthIndexFromIso("2026-03-05T00:00:00.000Z")!;
    expect(index.get(januaryIndex)?.notes).toHaveLength(2);
    expect(index.get(marchIndex)?.constellations).toHaveLength(1);
    expect(index.get(marchIndex)?.notes).toHaveLength(0);
  });

  it("gives same-month notes distinct dayRatios so they don't stack on one screen column", () => {
    const entries = [entry("a", "2026-01-10T00:00:00.000Z"), entry("b", "2026-01-20T00:00:00.000Z")];
    const index = buildSkyIndex(entries, []);
    const januaryIndex = monthIndexFromIso("2026-01-10T00:00:00.000Z")!;
    const notes = index.get(januaryIndex)?.notes ?? [];
    const byId = new Map(notes.map(note => [note.pageId, note.dayRatio]));
    expect(byId.get("a")).not.toBe(byId.get("b"));
  });

  it("skips entries with no usable creation date", () => {
    const entries = [entry("a", undefined), entry("b", "not-a-date")];
    const index = buildSkyIndex(entries, []);
    expect(index.size).toBe(0);
  });
});

describe("entriesFromCutoff", () => {
  it("drops entries created before the cutoff", () => {
    const entries = [entry("old", "2026-08-31T23:59:59.000Z"), entry("new", "2026-09-01T00:00:00.000Z")];
    expect(entriesFromCutoff(entries, "2026-09-01T00:00:00.000Z").map(item => item.id)).toEqual(["new"]);
  });

  it("drops entries with no usable creation date", () => {
    const entries = [entry("missing", undefined), entry("bad", "not-a-date")];
    expect(entriesFromCutoff(entries, "2026-09-01T00:00:00.000Z")).toEqual([]);
  });
});

describe("skyIndexRange", () => {
  it("spans from the earliest bucket to the latest, including the fallback month", () => {
    const entries = [entry("a", "2020-01-01T00:00:00.000Z")];
    const index = buildSkyIndex(entries, []);
    const fallback = monthIndexFromIso("2026-09-15T00:00:00.000Z")!;
    const range = skyIndexRange(index, fallback);
    expect(range.min).toBe(monthIndexFromIso("2020-01-01T00:00:00.000Z"));
    expect(range.max).toBe(fallback);
  });

  it("falls back to a year before the given month when the index is empty", () => {
    const fallback = monthIndexFromIso("2026-09-15T00:00:00.000Z")!;
    const range = skyIndexRange(new Map(), fallback);
    expect(range).toEqual({ min: fallback - 12, max: fallback });
  });
});
