// packages/get-things-done/tools/review.mjs
// The experiment review, Review's default tool: what changed, what it cost and what to keep,
// in that order. A finished project opens Project Evaluation instead (model.mjs REVIEW_TOOL).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { EXPERIMENT_REVIEW_ID, EXPERIMENT_REVIEW_SLOTS, EXPERIMENT_REVIEW_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const gtReview = Object.freeze({
  id: EXPERIMENT_REVIEW_ID,
  name: 'The experiment review',
  kind: 'review',
  step: 'review',
  family: 'review',
  tier: 'worksheet',
  when: 'The check-back date has come, or the results are in: see what the experiment changed, what it cost and what to keep.',
  failureModes: Object.freeze([
    'Judging the plan instead of what actually happened.',
    'Counting hours spent as the result.',
    'Keeping everything, or dropping everything, without saying why.'
  ]),
  steps: Object.freeze([
    step('changed', 'What changed', 'What actually changed, compared with the result you wanted?'),
    step('cost', 'What it cost', 'What did it cost you in time, energy or goodwill?'),
    step('keep', 'What to keep', 'What will you keep, drop or change next time?')
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: EXPERIMENT_REVIEW_SLOTS,
  edgeKinds: Object.freeze([]),
  nextSlots(run) {
    const next = EXPERIMENT_REVIEW_SLOT_NAMES.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return EXPERIMENT_REVIEW_SLOT_NAMES.every((name) => hasSlot(run, name));
  }
});
