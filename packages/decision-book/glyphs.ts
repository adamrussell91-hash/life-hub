// packages/decision-book/glyphs.ts
// The kit's approved emblems as markup: one per catalogue model, the four sections and the
// book. Vite inlines them at build (`?raw`), as Problem Solver's glyphs.ts does. Every string is
// a static asset from this package, never user text.
import { SECTIONS } from './catalogue.mjs';
import bookEmblemSvg from './glyphs/identity/book-emblem.svg?raw';

const byName = (files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -4), svg]));

/** Model id → emblem markup (viewBox 140). */
export const MODEL_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/models/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
/** Section key → emblem markup (viewBox 240). */
export const SECTION_SVG: Record<string, string> = byName(import.meta.glob('./glyphs/sections/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);
export const BOOK_SVG: string = bookEmblemSvg;

/** The section key for a section number (1–4). */
export const sectionKey = (n: number): string | null => SECTIONS.find((s) => s.id === n)?.key ?? null;

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

/** A model's emblem, decorative unless `label` is given. Unknown ids get the book emblem. */
export function modelEmblem(id: string, label: string | null = null): HTMLSpanElement {
  return holder('dm-emblem', MODEL_SVG[id] ?? BOOK_SVG, label);
}

/** A section's emblem by key. */
export function sectionEmblem(key: string, label: string | null = null): HTMLSpanElement {
  return holder('dm-emblem dm-emblem--section', SECTION_SVG[key] ?? '', label);
}

export function bookEmblem(label: string | null = null): HTMLSpanElement {
  return holder('dm-emblem dm-emblem--book', BOOK_SVG, label);
}
