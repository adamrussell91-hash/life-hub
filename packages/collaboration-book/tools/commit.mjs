// packages/collaboration-book/tools/commit.mjs
// The experiment, Agree's one tool: the result for the team, the model it rests on (with the chart
// nodes it uses, kept on the session as `basis`), the next action (small and easy to stop), who
// owns it and who it needs to hear from, the date to come back to it, and what would show it is
// not working or that the conditions themselves must change. Slots are taken in that order. The
// next action can become a task; the date becomes the session's review proposal (session.mjs).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { isRecordDate } from '../../decision-book/tools/record.mjs';
import { COMMIT_ID, COMMIT_SLOTS, COMMIT_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const cbCommit = Object.freeze({
  id: COMMIT_ID,
  name: 'The team experiment',
  kind: 'record',
  step: 'commit',
  family: 'commit',
  tier: 'worksheet',
  when: 'A model has shown something about how the team works: agree one small experiment with an owner, a date to come back to it and a sign that would change course.',
  failureModes: Object.freeze([
    'A result nobody in the team could check afterwards.',
    'An experiment that rests on an assumption about other people instead of something seen.',
    'A next action too big to start this week, or too hard to stop.',
    'No owner, or an owner who never heard from the people it lands on.',
    'No date, so the experiment quietly lapses.',
    'Expecting a better conversation to fix a problem the conditions keep creating.'
  ]),
  steps: Object.freeze([
    step('result', 'The result for the team', 'What would the team notice if this were working?'),
    step('rests_on', 'What it rests on', 'Which model is this built on, and what did its chart show (as opposed to what anyone assumed)?'),
    step('next_action', 'The next action', 'What is the next action, small enough to start this week and easy to stop?'),
    step('owner', 'Who owns it', 'Who owns it, and whose view does it need before it starts?'),
    step('check_back', 'Come back on', 'On what date will you come back to it together?'),
    step('change_course', 'What would change course', 'What would show it is not working, or that the conditions need changing more than the people do?')
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: COMMIT_SLOTS,
  edgeKinds: Object.freeze([]),
  taskSlots: Object.freeze({ next_action: () => true }),
  validateNode(run, node) {
    if (node.slot === 'check_back' && !isRecordDate(node.text)) return 'The date to come back is a date: put it in node.text as YYYY-MM-DD, or set node to null and ask for one.';
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
