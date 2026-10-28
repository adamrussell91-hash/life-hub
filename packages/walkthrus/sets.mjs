// packages/walkthrus/sets.mjs
// The books (sets) the board can hold. Colour means the set, not the series; adding a set is
// one entry here plus its techniques in catalogue.mjs. No book text lives here.

export const SETS = Object.freeze([
  Object.freeze({ id: 1, name: 'Set 1', colour: '#ffd400' }),
  Object.freeze({ id: 2, name: 'Set 2', colour: '#2da8e0' }),
  Object.freeze({ id: 3, name: 'Set 3', colour: '#9dc33b' })
]);

export const SET_IDS = Object.freeze(SETS.map((s) => s.id));
export const setById = (id) => SETS.find((s) => s.id === id) ?? null;
