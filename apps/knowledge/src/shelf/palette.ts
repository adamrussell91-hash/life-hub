/** Kit GRAPH_PALETTE (hub-design-kit js/graph-palette.js). Closed: do not add a 21st. */
export const BOOK_PALETTE = [
  { fill: "#7eb0d5", ink: "#315875" }, { fill: "#88b39a", ink: "#44604e" }, { fill: "#d4b96a", ink: "#6c581f" },
  { fill: "#d4a07f", ink: "#77503a" }, { fill: "#b5a3d1", ink: "#5d4d72" }, { fill: "#6f9ec4", ink: "#294c71" },
  { fill: "#9cbf8f", ink: "#3c5949" }, { fill: "#c9a35c", ink: "#6c581f" }, { fill: "#c98b78", ink: "#7a5038" },
  { fill: "#9f8fc2", ink: "#5d4e70" }, { fill: "#5f8fb8", ink: "#315875" }, { fill: "#7aa68a", ink: "#44604e" },
  { fill: "#b8974e", ink: "#6c581f" }, { fill: "#b87d68", ink: "#77503a" }, { fill: "#8f7eb0", ink: "#5d4d72" },
  { fill: "#d4a8b8", ink: "#6e4454" }, { fill: "#6fb0a8", ink: "#2f5c57" }, { fill: "#c4b06a", ink: "#6a5a28" },
  { fill: "#8a9cc4", ink: "#3d4a6e" }, { fill: "#c47a8a", ink: "#6e3d48" },
] as const;

export type BookSwatch = (typeof BOOK_PALETTE)[number];

/** Stable colour per book title (FNV-1a), so a book keeps its colour across sessions. */
export function bookSwatch(label: string): BookSwatch {
  let hash = 2166136261;
  for (const ch of label.toLowerCase()) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return BOOK_PALETTE[(hash >>> 0) % BOOK_PALETTE.length]!;
}

/** Index of the palette fill nearest an RGB colour (for matching a cover's dominant colour). */
export function nearestSwatchIndex(r: number, g: number, b: number) {
  let best = 0;
  let bestDistance = Infinity;
  BOOK_PALETTE.forEach((swatch, index) => {
    const n = Number.parseInt(swatch.fill.slice(1), 16);
    const dr = ((n >> 16) & 255) - r;
    const dg = ((n >> 8) & 255) - g;
    const db = (n & 255) - b;
    // Weighted for how eyes see colour, so a red cover doesn't land on brown.
    const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
