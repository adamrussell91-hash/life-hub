// packages/change-book/tools/commit.mjs
// The step, Act's one tool: the result that matters, the model it rests on (with the chart nodes
// it uses, kept on the session as `basis`), the next action (small and reversible), who it affects
// and what valuable thing it keeps, the review date and the evidence that would overturn the
// person's reading or have them undo the step. Slots are taken in that order. The rest of stage
// four lives in these prompts: name the people affected and what to keep before the step is set.
// The next action can become a task; the review date becomes the session's review proposal
// (session.mjs).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { isRecordDate } from '../../decision-book/tools/record.mjs';
import { COMMIT_ID, COMMIT_SLOTS, COMMIT_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const chCommit = Object.freeze({
  id: COMMIT_ID,
  name: 'The reversible step',
  kind: 'record',
  step: 'commit',
  family: 'commit',
  tier: 'worksheet',
  when: 'A model has shown something about the change: turn it into one small step you can undo, with a date to look again and the evidence that could overturn your reading.',
  failureModes: Object.freeze([
    'A result nobody could check afterwards.',
    'A step that rests on an interpretation instead of something seen.',
    'A next action too big or too vague to start today, or one that is hard to undo.',
    'Forgetting the people the step lands on, or the valuable thing it could break.',
    'No review date, so the step is never looked at again.',
    'Treating the model as a law when it is one lens that may fit only partly.'
  ]),
  steps: Object.freeze([
    step('result', 'The result that matters', 'What result would tell you this change is working?'),
    step('rests_on', 'What it rests on', 'Which model is this built on, and which evidence on its chart (as opposed to an interpretation) does it use?'),
    step('next_action', 'The next action', 'What is the next action, small enough to start today and easy to undo?'),
    step('affected', 'Who it affects', 'Who does this step land on, and what valuable thing does it keep?'),
    step('check_back', 'Review date', 'On what date will you look at how it went?'),
    step('change_course', 'What would overturn it', 'What evidence would overturn your reading, or have you undo the step?')
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: COMMIT_SLOTS,
  edgeKinds: Object.freeze([]),
  taskSlots: Object.freeze({ next_action: () => true }),
  validateNode(run, node) {
    if (node.slot === 'check_back' && !isRecordDate(node.text)) return 'The review date is a date: put it in node.text as YYYY-MM-DD, or set node to null and ask for one.';
    return null;
  },
  nextSlots(run) {
    const next = COMMIT_SLOT_NAMES.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return COMMIT_SLOT_NAMES.every((name) => hasSlot(run, name));
  }
});
