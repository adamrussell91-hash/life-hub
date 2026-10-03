import { describe, expect, it } from "vitest";
import { bookKey } from "../shelf/model";
import { parseJudgements } from "./propose";
import {
  addCrossBookCandidates,
  isCrossBookPair,
  mergeManifestConnected,
  runCrossBook,
  type CrossBookNote,
} from "./crossBook";
import { confidencePercent, routeConfidence } from "./schema";
import type { PageManifestEntry } from "../domain/page";

const now = "2026-10-03T00:00:00.000Z";

function note(id: string, book: string, extra: Partial<CrossBookNote> = {}): CrossBookNote {
  return {
    id,
    title: id,
    body: `Body of ${id} about basal ganglia`,
    excerpt: `basal ganglia ${id}`,
    connected: [],
    book,
    ...extra,
  };
}

describe("confidence routing", () => {
  it("auto-approves an explicit 0.80 and queues every lower score", () => {
    expect(routeConfidence({ confidence: 0.8, confidenceExplicit: true })).toBe("auto");
    expect(routeConfidence({ confidence: 0.79, confidenceExplicit: true })).toBe("queue");
    expect(routeConfidence({ confidence: 0.59, confidenceExplicit: true })).toBe("queue");
    expect(routeConfidence({ confidence: 0, confidenceExplicit: true })).toBe("queue");
    expect(routeConfidence({ confidence: 0.5, confidenceExplicit: false })).toBe("queue");
    expect(routeConfidence({})).toBe("queue");
  });

  it("shows a percent only when the model gave a number", () => {
    expect(confidencePercent(undefined)).toBeNull();
    expect(confidencePercent("high")).toBeNull();
    expect(confidencePercent(0.72)).toBe("72%");
  });

  it("keeps a low score and does not invent one when the field is missing", () => {
    const judged = parseJudgements(
      JSON.stringify({
        proposals: [
          { pageId: "low", related: true, relation: "related", rationale: "loose", confidence: 0.2 },
          { pageId: "bare", related: true, relation: "related", rationale: "unsure" },
          { pageId: "bad", related: true, relation: "related", rationale: "nope", confidence: "high" },
        ],
      }),
      new Set(["low", "bare", "bad"]),
    );
    expect(judged.map(item => [item.pageId, item.confidence, item.confidenceExplicit])).toEqual([
      ["low", 0.2, true],
      ["bare", undefined, false],
      ["bad", undefined, false],
    ]);
  });
});

describe("cross-book pairs", () => {
  it("uses bookKey so the rail and the shelf agree", () => {
    expect(bookKey("The Neural Mind")).toBe("the neural mind");
    expect(isCrossBookPair("The Neural Mind", "the neural mind")).toBe(false);
    expect(isCrossBookPair("The Neural Mind", "Atomic Habits")).toBe(true);
    expect(isCrossBookPair("The Neural Mind", undefined)).toBe(false);
  });

  it("adds other-book candidates and leaves same-book notes out", () => {
    const hits = addCrossBookCandidates({
      sourceBook: "The Neural Mind",
      linking: [],
      sourceId: "source",
      sourceVector: [],
      corpus: [],
      connected: [],
      skip: new Set(),
      query: "basal ganglia direct pathway",
      lexicalDocs: [
        { id: "same", title: "Same book", excerpt: "basal ganglia direct pathway", book: "The Neural Mind" },
        { id: "other", title: "Other book", excerpt: "basal ganglia direct pathway", book: "Atomic Habits" },
      ],
      bookOf: id => (id === "same" ? "The Neural Mind" : id === "other" ? "Atomic Habits" : undefined),
    });
    expect(hits.map(hit => hit.pageId)).toEqual(["other"]);
  });

  it("queues scores under 0.80, auto-approves the rest, and skips known pairs", async () => {
    const notes = [
      note("a", "Alpha"),
      note("b", "Beta"),
      note("c", "Beta"),
      note("same", "Alpha"),
      note("linked", "Gamma", { excerpt: "basal ganglia linked" }),
      note("pending", "Delta", { excerpt: "basal ganglia pending" }),
      note("dismissed", "Epsilon", { excerpt: "basal ganglia dismissed" }),
    ];
    notes[0]!.connected = ["linked"];
    const judged: { source: string; hits: string[] }[] = [];
    const result = await runCrossBook({
      notes,
      pending: [
        {
          id: "a||pending",
          noteA: "a",
          noteB: "pending",
          titleA: "a",
          titleB: "pending",
          excerptA: "a",
          excerptB: "pending",
          relation: "related",
          rationale: "already",
          proposedAt: now,
        },
      ],
      dismissed: [{ noteA: "a", noteB: "dismissed", dismissedAt: now }],
      now: () => now,
      judge: async (source, candidates) => {
        judged.push({ source: source.id, hits: candidates.map(hit => hit.pageId) });
        return candidates.map(hit => ({
          pageId: hit.pageId,
          related: true as const,
          relation: "related" as const,
          rationale: `because ${hit.pageId}`,
          confidence: hit.pageId === "b" ? 0.91 : hit.pageId === "c" ? 0.2 : 0.64,
          confidenceExplicit: true,
        }));
      },
    });

    const fromA = judged.find(call => call.source === "a")?.hits ?? [];
    expect(fromA).not.toContain("same");
    expect(fromA).not.toContain("linked");
    expect(fromA).not.toContain("pending");
    expect(fromA).not.toContain("dismissed");
    expect(fromA).toContain("b");
    expect(judged.filter(call => (call.source === "a" && call.hits.includes("b")) || (call.source === "b" && call.hits.includes("a")))).toHaveLength(1);
    expect(result.autoApproved.filter(row => row.noteA === "a" && row.noteB === "b")).toHaveLength(1);
    expect(result.queued.some(row => row.confidence === 0.2)).toBe(true);
    expect(result.queued.some(row => row.confidence === 0.64)).toBe(true);
    expect(result.queued.some(row => (row.confidence ?? 1) >= 0.8)).toBe(false);
    expect(result.connected.find(row => row.id === "a")?.connected).toContain("b");
    expect(result.connected.find(row => row.id === "b")?.connected).toContain("a");
  });

  it("sends each pair once, even when the first judge returns nothing", async () => {
    const sent: string[] = [];
    await runCrossBook({
      notes: [note("a", "Alpha"), note("b", "Beta")],
      pending: [],
      dismissed: [],
      now: () => now,
      judge: async (source, candidates) => {
        for (const hit of candidates) sent.push([source.id, hit.pageId].sort().join("||"));
        return [];
      },
    });
    expect(sent).toEqual(["a||b"]);
  });

  it("judges claimed pairs concurrently without sending one twice", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const sent: string[] = [];
    await runCrossBook({
      notes: [note("a", "Alpha"), note("b", "Beta"), note("c", "Gamma")],
      pending: [],
      dismissed: [],
      concurrency: 3,
      now: () => now,
      judge: async (source, candidates) => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise(resolve => setTimeout(resolve, 30));
        inflight -= 1;
        for (const hit of candidates) sent.push([source.id, hit.pageId].sort().join("||"));
        return [];
      },
    });
    expect(maxInflight).toBeGreaterThan(1);
    expect(new Set(sent).size).toBe(sent.length);
    expect(sent).toHaveLength(3);
  });

  it("keeps one link when a reply names the same note twice", async () => {
    const result = await runCrossBook({
      notes: [note("a", "Alpha"), note("b", "Beta")],
      pending: [],
      dismissed: [],
      now: () => now,
      judge: async () => [
        { pageId: "b", related: true, relation: "related", rationale: "again", confidence: 0.97, confidenceExplicit: true },
        { pageId: "b", related: true, relation: "builds-on", rationale: "first", confidence: 0.8, confidenceExplicit: true },
      ],
    });
    expect(result.autoApproved).toHaveLength(1);
    expect(result.autoApproved[0]?.rationale).toBe("again");
    expect(result.pairsJudged).toBe(1);
  });
});

describe("mergeManifestConnected", () => {
  it("writes connected onto the matching rows and clears an empty link", () => {
    const rows = [
      { id: "a", title: "A", area: "notes", tags: [], excerpt: "a", path: "pages/a.json" },
      { id: "b", title: "B", area: "notes", tags: [], excerpt: "b", connected: ["a"] },
    ] as PageManifestEntry[];
    const next = mergeManifestConnected(rows, [
      { id: "a", connected: ["b"] },
      { id: "b", connected: [] },
    ]);
    expect(next[0]?.connected).toEqual(["b"]);
    expect(next[0]).toMatchObject({ path: "pages/a.json" });
    expect(next[1]?.connected).toBeUndefined();
  });

  it("refuses to write when an id is missing", () => {
    expect(() => mergeManifestConnected([], [{ id: "a", connected: ["b"] }])).toThrow(/manifest has no entry/);
  });
});
