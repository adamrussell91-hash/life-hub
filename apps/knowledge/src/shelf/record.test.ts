import { describe, expect, it } from "vitest";
import { placementForBookNote } from "./record";

describe("placementForBookNote", () => {
  const body = "## In the book\nx\n\n## How this bears on the book\nThe web supports the claim.\n\n## Gaps\n- Replication?\n";
  it("keeps page, stance and gaps from a From-a-book save", () => {
    expect(placementForBookNote({ id: "p1", body }, { label: "Make It Stick", locus: "p. 28" })).toEqual({
      pageId: "p1", page: 28, guessed: false, stance: "supports", gaps: ["Replication?"],
    });
  });
  it("skips notes that are not from a book", () => {
    expect(placementForBookNote({ id: "p1", body }, undefined)).toBeNull();
  });
  it("leaves the page off when the locus names only a chapter", () => {
    expect(placementForBookNote({ id: "p1", body }, { label: "X", locus: "chapter 3" })).not.toHaveProperty("page");
  });
});
