// packages/change-book/tools/review.mjs
// The review, the Review step's one tool: what actually happened, whether the person's reading
// held up against it (evidence and interpretation kept apart again, with results in), and whether
// the model still helps here (keep, adjust or undo the step).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { REVIEW_ID, REVIEW_SLOTS, REVIEW_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const chReview = Object.freeze({
  id: REVIEW_ID,
  name: 'The review',
  kind: 'review',
  step: 'review',
  family: 'review',
  tier: 'worksheet',
  when: 'The review date has come, or the results are in: see what happened, whether your reading held and whether the model still helps.',
  failureModes: Object.freeze([
    'Judging the plan instead of what actually happened.',
    'Reading the result through the same interpretation that started the step.',
    'Keeping the step, or undoing it, with no reason given.'
  ]),
  steps: Object.freeze([
    step('happened', 'What happened', 'What actually happened, compared with the result you wanted? Stay with what you saw.'),
    step('held', 'Did your reading hold', 'Which of your first interpretations did the evidence support, and which did it weaken?'),
    step('keep', 'Does the model still help', 'Does this model still help with this change? Keep the step, adjust it or undo it, and say why.')
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
