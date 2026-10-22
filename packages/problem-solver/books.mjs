// packages/problem-solver/books.mjs
// The coached books that run on Problem Solver's engine, keyed by session kind. Each names its
// process model, its three frame questions, and the frame key that holds a placement (Decision
// Maker's compass, Gear Shifter's route) with the parser that keeps only known ids. The engine
// reads this register instead of testing for a kind by name.
import { DECISION_MODEL } from '../decision-book/model.mjs';
import { parseCompass } from '../decision-book/compass.mjs';
import { GEAR_SHIFTER_MODEL } from '../get-things-done/model.mjs';
import { parseRoute } from '../get-things-done/route.mjs';

export const BOOK_KINDS = Object.freeze({
  decision: Object.freeze({
    model: DECISION_MODEL,
    frameKeys: Object.freeze(['decision', 'compass', 'known']),
    placeKey: 'compass',
    parsePlace: parseCompass,
    reason: 'Decision Maker works from The Decision Book.'
  }),
  shift: Object.freeze({
    model: GEAR_SHIFTER_MODEL,
    frameKeys: Object.freeze(['need', 'route', 'known']),
    placeKey: 'route',
    parsePlace: parseRoute,
    reason: 'Gear Shifter works from The Get Things Done Book.'
  })
});

/** The book a session kind belongs to, or null for Problem Solver's own kinds. */
export const bookOf = (kind) => BOOK_KINDS[kind] ?? null;

/** Every frame key any book uses, for the coach schema. */
export const BOOK_FRAME_KEYS = Object.freeze([...new Set(Object.values(BOOK_KINDS).flatMap((b) => b.frameKeys))]);
