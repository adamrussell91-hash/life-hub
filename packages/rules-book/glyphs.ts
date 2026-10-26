// packages/rules-book/glyphs.ts
// The book pack's emblems as markup, in the pack's own screen palette: one per catalogue entry
// (the Pareto and One-Step variants' drawn for the Rules Book in the same style), the four
// groups and the book. Vite inlines them at build (`?raw`), as Gear Shifter's glyphs.ts does.
// Every string is a static asset from this package, never user text.
import bookEmblemSvg from './glyphs/identity/book-emblem.svg?raw';

const byName = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -4), svg]));

/** Entry id → emblem markup (viewBox 140). */
export const ENTRY_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/models/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
/** Group (section) key → emblem markup (viewBox 240). */
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
  return holder('rb-emblem', ENTRY_SVG[id] ?? BOOK_SVG, label);
}

/** A group's emblem by section key. */
export function sectionEmblem(key: string, label: string | null = null): HTMLSpanElement {
  return holder('rb-emblem rb-emblem--section', SECTION_SVG[key] ?? '', label);
}

export function bookEmblem(label: string | null = null): HTMLSpanElement {
  return holder('rb-emblem rb-emblem--book', BOOK_SVG, label);
}
