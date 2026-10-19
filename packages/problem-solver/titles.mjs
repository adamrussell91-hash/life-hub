// packages/problem-solver/titles.mjs
/** Short titles shown inside diagram shapes. The coach writes one; this is the fallback and the guard. */
export const TITLE_MAX_WORDS = 5;
/** A title made from the answer itself is a summary, so it stays shorter. */
export const FALLBACK_MAX_WORDS = 3;
export const TITLE_MAX_CHARS = 32;

const SMALL = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'it', 'that', 'this', 'there', 'because', 'and', 'of', 'to', 'in', 'on', 'for', 'only']);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/[.,;:!?…]+$/u, '').trim();
}

function capitalise(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

const isSmall = (word) => SMALL.has(word.toLowerCase());

/**
 * A coach-supplied title, kept whole when it fits a shape (five words, 32 characters),
 * otherwise trimmed; null when unusable. A cut never ends on a joining word: "eating and
 * training" keeps its next word when it fits, otherwise the dangling "and" goes.
 */
export function tidyTitle(value, maxWords = TITLE_MAX_WORDS) {
  const all = clean(value).split(' ').filter(Boolean);
  let words = all.slice(0, maxWords);
  if (all.length > words.length && isSmall(words.at(-1)) && !isSmall(all[words.length])) {
    const longer = all.slice(0, maxWords + 1);
    if (longer.join(' ').length <= TITLE_MAX_CHARS) words = longer;
  }
  while (words.length > 1 && words.join(' ').length > TITLE_MAX_CHARS) words = words.slice(0, -1);
  while (words.length > 1 && isSmall(words.at(-1))) words = words.slice(0, -1);
  const title = words.join(' ').slice(0, TITLE_MAX_CHARS).trim();
  return title ? capitalise(title) : null;
}

/** Fallback: the first three meaningful words of the answer. */
export function titleFromText(text) {
  const words = clean(text).split(' ').filter(Boolean);
  const meaningful = words.filter((word) => !SMALL.has(word.toLowerCase()));
  return tidyTitle((meaningful.length ? meaningful : words).join(' '), FALLBACK_MAX_WORDS) ?? '';
}

/** The title to show for a node. */
export function nodeTitle(node) {
  // Titles saved before the joining-word rule may end "eating and"; finish them from the text.
  const saved = clean(node?.title);
  const text = clean(node?.text);
  if (saved && isSmall(saved.split(' ').at(-1)) && text.toLowerCase().startsWith(saved.toLowerCase())) return tidyTitle(text);
  return tidyTitle(node?.title) ?? titleFromText(node?.text);
}
