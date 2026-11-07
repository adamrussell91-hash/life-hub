import { coverEntry, coverSrc } from "./covers";
import { bookKey } from "./model";
import { BOOK_PALETTE, bookSwatch, type BookSwatch } from "./palette";
import type { Wish } from "./schema";

export type WishModel = Wish & {
  key: string;
  swatch: BookSwatch;
  cover?: string;
  /** Already a book on the shelf under the same title. */
  onShelf: boolean;
};

/** Newest wish first; a wish with no date sorts last, then by title. */
export function buildWishlist(wishes: Wish[] = [], shelfKeys: Iterable<string> = []): WishModel[] {
  const shelf = new Set(shelfKeys);
  return wishes
    .map(wish => {
      const key = bookKey(wish.label);
      const cover = coverEntry(key);
      const coverSwatch = cover?.swatch !== undefined ? BOOK_PALETTE[cover.swatch] : undefined;
      return {
        ...wish,
        key,
        swatch: coverSwatch ?? bookSwatch(wish.label),
        cover: cover ? coverSrc(cover.file) : undefined,
        onShelf: shelf.has(key),
      };
    })
    .sort((a, b) => (b.added_at ?? "").localeCompare(a.added_at ?? "") || a.label.localeCompare(b.label));
}

/** "Added 3 Oct 2026", in Sydney time. */
export function addedLabel(iso?: string) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return `Added ${new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))}`;
}
