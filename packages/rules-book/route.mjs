// packages/rules-book/route.mjs
// The placement of a framed session: the book's four groups. A session stores one or two group
// ids joined with '+', e.g. 'workplace+people', as Gear Shifter stores its route.

export const GROUPS = Object.freeze([
  Object.freeze({ id: 'workplace', section: 'workplace', label: 'Work and deadlines' }),
  Object.freeze({ id: 'change', section: 'change', label: 'Change and innovation' }),
  Object.freeze({ id: 'people', section: 'people', label: 'Yourself and others' }),
  Object.freeze({ id: 'life', section: 'life', label: 'Wider life choices' })
]);

export const GROUP_IDS = Object.freeze(GROUPS.map((g) => g.id));

/** Up to two group ids found in the text, in the book's order. */
export function parseGroups(text) {
  const words = new Set(String(text ?? '').toLowerCase().match(/[a-z_]+/g) ?? []);
  return GROUP_IDS.filter((id) => words.has(id)).slice(0, 2);
}

/** Section keys for a stored placement value. */
export function groupSections(value) {
  return parseGroups(value).map((id) => GROUPS.find((g) => g.id === id).section);
}
