// packages/problem-solver/titles.mjs
/** Short titles shown inside diagram shapes. The coach writes one; this is the fallback and the guard. */
export const TITLE_MAX_WORDS = 3;
export const TITLE_MAX_CHARS = 32;

const SMALL = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'it', 'that', 'this', 'there', 'because', 'and', 'of', 'to', 'in', 'on', 'for', 'only']);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/[.,;:!?…]+$/u, '').trim();
}

function capitalise(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** A coach-supplied title, trimmed to three words, or null when unusable. */
export function tidyTitle(value) {
  const words = clean(value).split(' ').filter(Boolean).slice(0, TITLE_MAX_WORDS);
  const title = words.join(' ').slice(0, TITLE_MAX_CHARS).trim();
  return title ? capitalise(title) : null;
}

/** Fallback: the first three meaningful words of the answer. */
export function titleFromText(text) {
  const words = clean(text).split(' ').filter(Boolean);
  const meaningful = words.filter((word) => !SMALL.has(word.toLowerCase()));
  return tidyTitle((meaningful.length ? meaningful : words).join(' ')) ?? '';
}

/** The title to show for a node. */
export function nodeTitle(node) {
  return tidyTitle(node?.title) ?? titleFromText(node?.text);
}
