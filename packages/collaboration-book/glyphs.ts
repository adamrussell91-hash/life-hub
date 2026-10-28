// packages/collaboration-book/glyphs.ts
// The book pack's emblems as markup: one per catalogue entry (the two variants', Postmortem and
// Corporate Culture, drawn for the Collaboration Book in the same language), the three sections
// and the book. Their main strokes are currentColor, which collaboration-book.css sets to the
// book's purple; cyan and gold are the pack's screen shades. Vite inlines them at build (`?raw`),
// as the Change Book's glyphs.ts does. Every string is a static asset from this package, never
// user text.
import bookEmblemSvg from './glyphs/identity/book-emblem.svg?raw';

const byName = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -4), svg]));

/** Entry id → emblem markup (viewBox 140). */
export const ENTRY_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/models/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
/** Section key → emblem markup (viewBox 240). */
export const SECTION_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/sections/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
export const BOOK_SVG: string = bookEmblemSvg;

function holder(className: string, markup: string, label: string | null): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = markup;
  const svg = span.querySelector('svg');
  if (label) {
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', label);
  } else span.setAttribute('aria-hidden', 'true');
  // The wrapper names it (or hides it); the inner SVG's own role and title would say it twice.
  svg?.removeAttribute('role');
  svg?.removeAttribute('aria-label');
  svg?.removeAttribute('aria-labelledby');
  svg?.querySelector('title')?.remove();
  svg?.querySelector('desc')?.remove();
  return span;
}

/** An entry's emblem, decorative unless `label` is given. Unknown ids get the book emblem. */
export function entryEmblem(id: string, label: string | null = null): HTMLSpanElement {
  return holder('cb-emblem', ENTRY_SVG[id] ?? BOOK_SVG, label);
}

/** A section's emblem by its key. */
export function sectionEmblem(key: string, label: string | null = null): HTMLSpanElement {
  return holder('cb-emblem cb-emblem--section', SECTION_SVG[key] ?? '', label);
}

export function bookEmblem(label: string | null = null): HTMLSpanElement {
  return holder('cb-emblem cb-emblem--book', BOOK_SVG, label);
}
