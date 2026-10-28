// packages/communication-book/tools/review.mjs
// The review, the Review step's one tool: what was actually said, how it landed for the other
// person, and whether to keep, adjust or drop the approach (and whether the model still helps).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { REVIEW_ID, REVIEW_SLOTS, REVIEW_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const cmReview = Object.freeze({
  id: REVIEW_ID,
  name: 'The review',
  kind: 'review',
  step: 'review',
  family: 'review',
  tier: 'worksheet',
  when: 'The date has come, or the conversation has happened: see what was said, how it landed, and whether to keep the approach.',
  failureModes: Object.freeze([
    'Judging the plan instead of what was actually said.',
    'Telling only your side of how it went.',
    'Calling it a success because it felt good to say, whatever the other person heard.'
  ]),
  steps: Object.freeze([
    step('happened', 'What was said', 'What was actually said, by both of you? Stay with the words, as far as you remember them.'),
    step('landed', 'How it landed', 'How did it land for the other person? What did they say or do that tells you?'),
    step('keep', 'Keep, adjust or drop', 'Keep the approach, adjust it or drop it, and say why. Does the model still help here?')
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
