// packages/question-book/glyphs.ts
// The book pack's emblems as markup, in the pack's own screen palette: one per chapter (the
// rules card and Your questions included), one per chart drawn inside a chapter, the five
// groups and the book. Vite inlines them at build (`?raw`), as the Rules Book's glyphs.ts does.
// Every string is a static asset from this package, never user text.
import bookEmblemSvg from './glyphs/identity/book-emblem.svg?raw';
import wordmarkSvg from './glyphs/identity/wordmark.svg?raw';

const byName = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -4), svg]));

/** Chapter or chart id → emblem markup (viewBox 140). */
export const CHAPTER_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/models/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
/** Group key → emblem markup (viewBox 240). */
export const GROUP_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/sections/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
export const BOOK_SVG: string = bookEmblemSvg;
export const WORDMARK_SVG: string = wordmarkSvg;

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

/** A chapter's (or chart's) emblem, decorative unless `label` is given. Unknown ids get the book emblem. */
export function chapterEmblem(id: string, label: string | null = null): HTMLSpanElement {
  return holder('qb-emblem', CHAPTER_SVG[id] ?? BOOK_SVG, label);
}

/** A group's emblem by group key. */
export function groupEmblem(key: string, label: string | null = null): HTMLSpanElement {
  return holder('qb-emblem qb-emblem--group', GROUP_SVG[key] ?? '', label);
}

export function bookEmblem(label: string | null = null): HTMLSpanElement {
  return holder('qb-emblem qb-emblem--book', BOOK_SVG, label);
}

export function wordmark(label: string | null = 'The Question Book'): HTMLSpanElement {
  return holder('qb-emblem qb-emblem--wordmark', WORDMARK_SVG, label);
}
