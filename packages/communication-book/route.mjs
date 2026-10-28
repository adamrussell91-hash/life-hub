// packages/communication-book/route.mjs
// The placement of a framed session: three kinds of communication situation over the book's five
// sections. Preparing what to say draws on Job and Career; a relationship (listening, mending,
// getting closer) on Self and Knowledge and Love and Friendship; making sense of a message on
// Words and Meanings and the Conclusion. A session stores one or two group ids joined with '+',
// e.g. 'prepare+relate', as the Collaboration Book stores its groups.

export const GROUPS = Object.freeze([
  Object.freeze({ id: 'prepare', sections: Object.freeze(['job_career']), label: 'Preparing what to say' }),
  Object.freeze({ id: 'relate', sections: Object.freeze(['self_knowledge', 'love_friendship']), label: 'Listening, mending or getting closer' }),
  Object.freeze({ id: 'read', sections: Object.freeze(['words_meanings', 'conclusion']), label: 'Making sense of a message' })
]);

export const GROUP_IDS = Object.freeze(GROUPS.map((g) => g.id));

/** Up to two group ids found in the text, in the book's order. */
export function parseGroups(text) {
  const words = new Set(String(text ?? '').toLowerCase().match(/[a-z_]+/g) ?? []);
  return GROUP_IDS.filter((id) => words.has(id)).slice(0, 2);
}

/** Section keys for a stored placement value, in the book's order. */
export function groupSections(value) {
  return parseGroups(value).flatMap((id) => GROUPS.find((g) => g.id === id).sections);
}
