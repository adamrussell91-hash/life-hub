// packages/rules-book/tools/review.mjs
// The review, the Review step's one tool: what actually happened, whether the person's reading
// held up against it (the truth check, run again with results in), and whether the rule is
// still useful here (keep, adjust or drop it: the usefulness check).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { REVIEW_ID, REVIEW_SLOTS, REVIEW_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const rbReview = Object.freeze({
  id: REVIEW_ID,
  name: 'The review',
  kind: 'review',
  step: 'review',
  family: 'review',
  tier: 'worksheet',
  when: 'The check time has come, or the results are in: see what happened, whether your reading held and whether the rule still fits.',
  failureModes: Object.freeze([
    'Judging the plan instead of what actually happened.',
    'Reading the result through the same interpretation that started the experiment.',
    'Keeping the rule, or dropping it, without saying why.'
  ]),
  steps: Object.freeze([
    step('happened', 'What happened', 'What actually happened, compared with the result you wanted? Stay with what you saw.'),
    step('held', 'Did your reading hold', 'Which of your first interpretations did the observations support, and which did they not?'),
    step('keep', 'Is the rule still useful', 'Is this rule still useful for this situation? Keep it, adjust it, or drop it, and say what would make you drop it.')
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: REVIEW_SLOTS,
  edgeKinds: Object.freeze([]),
  nextSlots(run) {
    const next = REVIEW_SLOT_NAMES.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return REVIEW_SLOT_NAMES.every((name) => hasSlot(run, name));
  }
});
