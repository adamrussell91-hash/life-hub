// packages/collaboration-book/route.mjs
// The placement of a framed session: the book's three parts, one group each. A session stores one
// or two group ids joined with '+', e.g. 'problems+trust', as the Change Book stores its groups.

export const GROUPS = Object.freeze([
  Object.freeze({ id: 'problems', section: 'solving_problems', label: 'Solving a problem together' }),
  Object.freeze({ id: 'goals', section: 'achieving_goals', label: 'Reaching a goal together' }),
  Object.freeze({ id: 'trust', section: 'creating_trust', label: 'Building trust' })
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
