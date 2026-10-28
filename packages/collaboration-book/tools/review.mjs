// packages/collaboration-book/tools/review.mjs
// The review, the Review step's one tool: what actually happened for the people involved, whether
// the conditions changed or only the conversation did, and whether to keep, adjust or stop the
// practice (and whether the model still helps).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { REVIEW_ID, REVIEW_SLOTS, REVIEW_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const cbReview = Object.freeze({
  id: REVIEW_ID,
  name: 'The review',
  kind: 'review',
  step: 'review',
  family: 'review',
  tier: 'worksheet',
  when: 'The date has come, or the results are in: see what happened for the people involved, whether the conditions changed, and whether to keep the practice.',
  failureModes: Object.freeze([
    'Judging the plan instead of what actually happened.',
    'Hearing only from the people who were already comfortable speaking.',
    'Calling it fixed because the conversation went well while the conditions stayed the same.'
  ]),
  steps: Object.freeze([
    step('happened', 'What happened', 'What actually happened, and how did it land for the people involved? Stay with what was seen.'),
    step('conditions', 'Did the conditions change', 'Did anything about the conditions change (time, roles, decisions, resources), or only the conversation?'),
    step('keep', 'Keep, adjust or stop', 'Keep the practice, adjust it or stop it, and say why. Does the model still help here?')
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
