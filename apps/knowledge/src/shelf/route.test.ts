import { describe, expect, it } from "vitest";
import { bookRoute, parseBookshelfHash } from "./view";

describe("bookshelf routes", () => {
  it("round-trips shelf, book and note", () => {
    expect(parseBookshelfHash(bookRoute())).toEqual({ book: undefined, note: undefined });
    expect(parseBookshelfHash(bookRoute("why don't students like school?", "page_hub_1"))).toEqual({ book: "why don't students like school?", note: "page_hub_1" });
  });
  it("ignores other hashes", () => {
    expect(parseBookshelfHash("#page/abc")).toBeNull();
    expect(parseBookshelfHash("#bookshelfx")).toBeNull();
  });
});
