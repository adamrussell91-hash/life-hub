import { describe, expect, it } from "vitest";
import { placementForBookNote, placementForComposedPage } from "./record";

describe("placementForBookNote", () => {
  const body = "## In the book\nx\n\n## How this bears on the book\nThe web supports the claim.\n\n## Gaps\n- Replication?\n";
  it("keeps page, stance and gaps from a From-a-book save", () => {
    expect(placementForBookNote({ id: "p1", body }, { label: "Make It Stick", locus: "p. 28" })).toEqual({
      pageId: "p1", page: 28, guessed: false, stance: "supports", gaps: ["Replication?"],
    });
  });
  it("reads an explicit Kind line as clementine", () => {
    const withKind = "Kind: debate\n\n## How this bears on the book\nAdds a rival account.\n";
    expect(placementForBookNote({ id: "p1", body: withKind }, { label: "X", locus: "p. 1" })).toMatchObject({
      kind: "debate", kindBy: "clementine", kindGuessed: false,
    });
  });
  it("skips notes that are not from a book", () => {
    expect(placementForBookNote({ id: "p1", body }, undefined)).toBeNull();
  });
  it("leaves the page off when the locus names a chapter the shelf doesn't know", () => {
    expect(placementForBookNote({ id: "p1", body }, { label: "X", locus: "chapter 3" })).not.toHaveProperty("page");
  });
  it("puts a chapter-only locus at the chapter's first page, as a guess", () => {
    const chapters = [{ title: "One", start: 1 }, { title: "Two", start: 23 }, { label: "3", title: "Three", start: 46 }];
    expect(placementForBookNote({ id: "p1", body }, { label: "X", locus: "Ch. 2" }, chapters)).toMatchObject({ page: 23, guessed: true });
    expect(placementForBookNote({ id: "p1", body }, { label: "X", locus: "chapter 3: Mix it up" }, chapters)).toMatchObject({ page: 46, guessed: true });
  });
  it("trusts an explicit Verdict line over the prose", () => {
    const verdict = "## How this bears on the book\nVerdict: complicates\nIt mostly supports the claim, but...\n";
    expect(placementForBookNote({ id: "p1", body: verdict }, { label: "X" })).toMatchObject({ stance: "complicates" });
  });
});

describe("placementForComposedPage", () => {
  it("places a written note at its typed page only when it has a book origin", () => {
    expect(placementForComposedPage("p1", [{ kind: "book" }], "42")).toEqual({ pageId: "p1", page: 42, guessed: false });
    expect(placementForComposedPage("p1", [{ kind: "notebook" }], "42")).toBeNull();
    expect(placementForComposedPage("p1", [{ kind: "book" }], "")).toBeNull();
    expect(placementForComposedPage("p1", [{ kind: "book" }], "-3")).toBeNull();
  });
});
