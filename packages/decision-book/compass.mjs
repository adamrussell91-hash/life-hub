// packages/decision-book/compass.mjs
// The section compass: the book's four sections as a 2×2 of who the question is about
// (me or others) and what the person wants (understand or improve). A framed decision
// stores one or two quadrant ids joined with '+', e.g. 'self_improve+others_improve'.

export const COMPASS = Object.freeze([
  Object.freeze({ id: 'self_improve', who: 'self', aim: 'improve', section: 1, label: 'Improve yourself' }),
  Object.freeze({ id: 'self_understand', who: 'self', aim: 'understand', section: 2, label: 'Understand yourself' }),
  Object.freeze({ id: 'others_understand', who: 'others', aim: 'understand', section: 3, label: 'Understand others' }),
  Object.freeze({ id: 'others_improve', who: 'others', aim: 'improve', section: 4, label: 'Improve others' })
]);

export const COMPASS_IDS = Object.freeze(COMPASS.map((q) => q.id));

/** Up to two quadrant ids found in the text, in compass order. */
export function parseCompass(text) {
  const words = new Set(String(text ?? '').toLowerCase().match(/[a-z_]+/g) ?? []);
  return COMPASS_IDS.filter((id) => words.has(id)).slice(0, 2);
}

/** Section numbers for a stored compass value. */
export function compassSections(value) {
  return parseCompass(value).map((id) => COMPASS.find((q) => q.id === id).section);
}
