import covers from "./covers.json";

/**
 * Book covers live in public/books/<file>, listed in covers.json keyed by the
 * book's lower-case title (bookKey). `swatch` is the GRAPH_PALETTE index nearest
 * the cover's dominant colour, so the book keeps a kit colour that matches its cover.
 */
export type CoverEntry = { file: string; swatch?: number };

const COVERS = covers as Record<string, CoverEntry>;

/** File name for a cover: "Why Don't Students Like School?" → "why-dont-students-like-school.jpg". */
export function coverFileName(label: string, ext = "jpg") {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}.${ext}`;
}

export function coverEntry(key: string): CoverEntry | undefined {
  return COVERS[key];
}

/** Root-relative so /knowledge (no trailing slash) still finds /knowledge/books/…. */
export function coverSrc(file: string, base: string = import.meta.env.BASE_URL ?? "/") {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}books/${file}`;
}

export function coverEntries() {
  return Object.entries(COVERS);
}
