// packages/problem-solver/books.mjs
// The coached books that run on Problem Solver's engine, keyed by session kind. Each names its
// process model, its three frame questions, and the frame key that holds a placement (Decision
// Maker's compass, Gear Shifter's route) with the parser that keeps only known ids. The engine
// reads this register instead of testing for a kind by name.
//
// `record` names the tool that settles a session (Decision Maker's decision record, Gear
// Shifter's experiment): the slot whose answer rests on Explore nodes (`basisSlot`, kept on the
// session as `basis`), the slot whose date becomes the review card (`dateSlot`), and the words
// the review card and the coach's repair use.
import { DECISION_MODEL } from '../decision-book/model.mjs';
import { parseCompass } from '../decision-book/compass.mjs';
import { GEAR_SHIFTER_MODEL } from '../get-things-done/model.mjs';
import { parseRoute } from '../get-things-done/route.mjs';
import { RECORD_ID } from '../decision-book/record-slots.mjs';
import { COMMIT_ID } from '../get-things-done/commit-slots.mjs';
import { RULES_BOOK_MODEL } from '../rules-book/model.mjs';
import { parseGroups } from '../rules-book/route.mjs';
import { COMMIT_ID as RULES_COMMIT_ID } from '../rules-book/commit-slots.mjs';

export const BOOK_KINDS = Object.freeze({
  decision: Object.freeze({
    model: DECISION_MODEL,
    frameKeys: Object.freeze(['decision', 'compass', 'known']),
    placeKey: 'compass',
    parsePlace: parseCompass,
    record: Object.freeze({ tool: RECORD_ID, basisSlot: 'reason', dateSlot: 'review', dateReason: 'The review date set in the decision record.', basisRule: 'A reason rests on what a model showed' }),
    reason: 'Decision Maker works from The Decision Book.'
  }),
  shift: Object.freeze({
    model: GEAR_SHIFTER_MODEL,
    frameKeys: Object.freeze(['need', 'route', 'known']),
    placeKey: 'route',
    parsePlace: parseRoute,
    record: Object.freeze({ tool: COMMIT_ID, basisSlot: 'rests_on', dateSlot: 'check_back', dateReason: 'The check-back date set in the experiment.', basisRule: 'The experiment rests on what a technique showed' }),
    reason: 'Gear Shifter works from The Get Things Done Book.'
  }),
  rules: Object.freeze({
    model: RULES_BOOK_MODEL,
    frameKeys: Object.freeze(['situation', 'group', 'known']),
    placeKey: 'group',
    parsePlace: parseGroups,
    record: Object.freeze({ tool: RULES_COMMIT_ID, basisSlot: 'rests_on', dateSlot: 'check_back', dateReason: 'The check time set in the experiment.', basisRule: 'The experiment rests on what a rule showed' }),
    reason: 'The Rules Book works from The Rules Book.'
  })
});

/** The book a session kind belongs to, or null for Problem Solver's own kinds. */
export const bookOf = (kind) => BOOK_KINDS[kind] ?? null;

/** Every frame key any book uses, for the coach schema. */
export const BOOK_FRAME_KEYS = Object.freeze([...new Set(Object.values(BOOK_KINDS).flatMap((b) => b.frameKeys))]);
