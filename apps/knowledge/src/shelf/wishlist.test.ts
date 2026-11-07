import { describe, expect, it } from "vitest";
import { addedLabel, buildWishlist } from "./wishlist";

describe("buildWishlist", () => {
  it("puts the newest wish first and undated ones last", () => {
    const list = buildWishlist([
      { label: "Old", added_at: "2026-01-01T00:00:00.000Z" },
      { label: "Undated" },
      { label: "New", added_at: "2026-10-01T00:00:00.000Z" },
    ]);
    expect(list.map(w => w.label)).toEqual(["New", "Old", "Undated"]);
  });

  it("flags a wish that is already a book on the shelf", () => {
    const [wish] = buildWishlist([{ label: "  Middlemarch " }], ["middlemarch"]);
    expect(wish!.key).toBe("middlemarch");
    expect(wish!.onShelf).toBe(true);
    expect(wish!.swatch.fill).toBeTruthy();
  });
});

describe("addedLabel", () => {
  it("reads the date in Sydney time", () => {
    expect(addedLabel("2026-10-02T15:00:00.000Z")).toBe("Added 3 Oct 2026");
    expect(addedLabel(undefined)).toBe("");
  });
});
