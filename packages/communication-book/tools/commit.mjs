// packages/communication-book/tools/commit.mjs
// The next conversation, Commit's one tool: what would show the next exchange went better, the
// model it rests on (with the chart nodes it uses, kept on the session as `basis`), the next
// conversation or message with its first words, who takes it and whose reply it waits on, the
// date to come back to it, and what would show it is not landing. Slots are taken in that order.
// The next conversation can become a task; the date becomes the session's review proposal
// (session.mjs).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { isRecordDate } from '../../decision-book/tools/record.mjs';
import { COMMIT_ID, COMMIT_SLOTS, COMMIT_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const cmCommit = Object.freeze({
  id: COMMIT_ID,
  name: 'The next conversation',
  kind: 'record',
  step: 'commit',
  family: 'commit',
  tier: 'worksheet',
  when: 'A model has shown something about the exchange: commit to one next conversation or message, who takes it, a date to come back to it and a sign that would change course.',
  failureModes: Object.freeze([
    'A result only you could notice, with nothing from the other person’s side.',
    'A next step that rests on a guess about the other person instead of something said or seen.',
    'A next conversation with no first words, so it never quite starts.',
    'Nobody named to take it, or no thought for whose reply it waits on.',
    'No date, so the conversation quietly never happens.',
    'Planning a perfect script for a reply nobody can control.'
  ]),
  steps: Object.freeze([
    step('result', 'What would show it went better', 'After the next exchange, what would tell you it went better, for them as well as for you?'),
    step('rests_on', 'What it rests on', 'Which model is this built on, and what did its chart show (as opposed to what anyone assumed)?'),
    step('next_action', 'The next conversation', 'Who will you speak or write to next, and what are the first words you will use?'),
    step('owner', 'Who takes it', 'Who takes this step, and whose reply does it wait on?'),
    step('check_back', 'Come back on', 'On what date will you come back to it?'),
    step('change_course', 'What would change course', 'What would show it is not landing, and what would you try instead?')
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
