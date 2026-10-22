// packages/get-things-done/route.mjs
// The route: the book's five sections as five stations on a loop, in the order a piece of work
// lives through them. A framed session stores one or two station ids joined with '+', e.g.
// 'before+doing', as Decision Maker stores its compass.

export const ROUTE = Object.freeze([
  Object.freeze({ id: 'before', section: 'before_doing', label: 'Before you start' }),
  Object.freeze({ id: 'doing', section: 'doing_things', label: 'Doing it' }),
  Object.freeze({ id: 'others', section: 'working_with_others', label: 'With other people' }),
  Object.freeze({ id: 'differently', section: 'doing_differently', label: 'Changing course' }),
  Object.freeze({ id: 'after', section: 'reviewing', label: 'After it is done' })
]);

export const ROUTE_IDS = Object.freeze(ROUTE.map((r) => r.id));

/** Up to two station ids found in the text, in route order. */
export function parseRoute(text) {
  const words = new Set(String(text ?? '').toLowerCase().match(/[a-z_]+/g) ?? []);
  return ROUTE_IDS.filter((id) => words.has(id)).slice(0, 2);
}

/** Section keys for a stored route value. */
export function routeSections(value) {
  return parseRoute(value).map((id) => ROUTE.find((r) => r.id === id).section);
}
