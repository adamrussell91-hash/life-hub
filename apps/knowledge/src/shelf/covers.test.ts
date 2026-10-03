import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coverEntries, coverFileName, coverSrc } from "./covers";
import { bookKey } from "./model";
import { BOOK_PALETTE, nearestSwatchIndex } from "./palette";

describe("book covers", () => {
  it("names files from the title", () => {
    expect(coverFileName("Why Don't Students Like School?")).toBe("why-dont-students-like-school.jpg");
    expect(coverFileName("Göbekli Tepe: The Origins", "webp")).toBe("gobekli-tepe-the-origins.webp");
  });

  it("builds a root-relative URL", () => {
    expect(coverSrc("a.jpg", "/knowledge")).toBe("/knowledge/books/a.jpg");
    expect(coverSrc("a.jpg", "/")).toBe("/books/a.jpg");
  });

  it("every covers.json entry is keyed by bookKey, points at a real file and a real swatch", () => {
    for (const [key, entry] of coverEntries()) {
      expect(key).toBe(bookKey(key));
      expect(existsSync(new URL(`../../public/books/${entry.file}`, import.meta.url))).toBe(true);
      if (entry.swatch !== undefined) {
        expect(Number.isInteger(entry.swatch) && entry.swatch >= 0 && entry.swatch < BOOK_PALETTE.length).toBe(true);
      }
    }
  });

  it("matches a colour to the nearest kit swatch", () => {
    expect(nearestSwatchIndex(0x7e, 0xb0, 0xd5)).toBe(0);
    expect(BOOK_PALETTE[nearestSwatchIndex(200, 120, 135)]!.fill).toBe("#c47a8a");
  });
});
