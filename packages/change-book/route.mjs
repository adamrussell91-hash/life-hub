// packages/change-book/route.mjs
// The placement of a framed session: the book's four main parts, one group each. A session stores
// one or two group ids joined with '+', e.g. 'self+mine', as the Rules Book stores its groups.
// The appendix (Anti-Change) has no group: it can open or close any session, so the coach can
// always offer it.

export const GROUPS = Object.freeze([
  Object.freeze({ id: 'world', section: 'explaining_our_world', label: 'Making sense of the world' }),
  Object.freeze({ id: 'self', section: 'explaining_my_world', label: 'Making sense of myself and others' }),
  Object.freeze({ id: 'mine', section: 'changing_my_world', label: 'Changing my own life' }),
  Object.freeze({ id: 'ours', section: 'changing_our_world', label: 'Changing things together' })
]);

export const GROUP_IDS = Object.freeze(GROUPS.map((g) => g.id));

/** The model every session can reach, whichever group is lit. */
export const ANY_GROUP = Object.freeze(['ch_anti_change']);

/** Up to two group ids found in the text, in the book's order. */
export function parseGroups(text) {
  const words = new Set(String(text ?? '').toLowerCase().match(/[a-z_]+/g) ?? []);
  return GROUP_IDS.filter((id) => words.has(id)).slice(0, 2);
}

/** Section keys for a stored placement value. */
export function groupSections(value) {
  return parseGroups(value).map((id) => GROUPS.find((g) => g.id === id).section);
}
