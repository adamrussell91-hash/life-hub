import { describe, expect, it } from "vitest";
import { fillFromBody, pageFromBody, readNotesForShelf } from "./backfill";
import { buildShelf } from "./model";

const body = "# T\n\n## In the book\nKelly's move on p. 64 is to treat songlines as maps.\n\n## How this bears on the book\nThe archaeology complicates it.\n\n## Gaps\n- Dating?\n";

describe("backfill from note bodies", () => {
  it("reads a page only from the In the book section", () => {
    expect(pageFromBody(body)).toBe(64);
    expect(pageFromBody("## In the book\nNo page given.\n\n## Sources\n- Smith 2020, p. 9")).toBeUndefined();
  });

  it("fills only missing fields and marks inferred pages as guesses", () => {
    expect(fillFromBody({ id: "a", body }, { gaps: [] }, 336)).toEqual({ pageId: "a", page: 64, guessed: true, stance: "complicates", gaps: ["Dating?"] });
    expect(fillFromBody({ id: "a", body }, { page: 70, stance: "supports", gaps: ["x"] }, 336)).toBeNull();
    expect(fillFromBody({ id: "a", body }, { gaps: [] }, 50)).not.toHaveProperty("page");
  });

  it("reads every incomplete note once and counts failures", async () => {
    const entries = [
      { id: "a", title: "A", area: "notes" as const, tags: [], excerpt: "", origins: [{ kind: "book" as const, label: "The Knowledge Gene" }] },
      { id: "b", title: "B", area: "notes" as const, tags: [], excerpt: "", origins: [{ kind: "book" as const, label: "The Knowledge Gene" }] },
    ];
    const books = buildShelf(entries, { books: [{ label: "The Knowledge Gene", pages: 336 }], placements: [] });
    const progress: number[] = [];
    const result = await readNotesForShelf(books, async id => {
      if (id === "b") throw new Error("gone");
      return { id, body };
    }, done => progress.push(done));
    expect(result.failed).toBe(1);
    expect(result.patches.map(p => p.pageId)).toEqual(["a"]);
    expect(progress.at(-1)).toBe(2);
  });
});
