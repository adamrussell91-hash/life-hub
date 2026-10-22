// packages/get-things-done/tools/commit.mjs
// The experiment, Commit's one tool: the result that matters, the technique it rests on (with
// the chart nodes it uses, kept on the session as `basis`), the next action, when it starts (a
// cue or protected time, in words: Gear Shifter runs no timers), the check-back date and what
// would tell you to change course. Slots are taken in that order. The next action can become a
// task; the check-back date becomes the session's review proposal (session.mjs), so both reach
// the page as confirm cards.
import { hasSlot } from '../../problem-solver/slots.mjs';
import { isRecordDate } from '../../decision-book/tools/record.mjs';
import { COMMIT_ID, COMMIT_SLOTS, COMMIT_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const gtCommit = Object.freeze({
  id: COMMIT_ID,
  name: 'The experiment',
  kind: 'record',
  step: 'commit',
  family: 'commit',
  tier: 'worksheet',
  when: 'A technique has shown something: turn it into one small experiment with a start, a date to look again and a sign to change course.',
  failureModes: Object.freeze([
    'A result nobody could check afterwards.',
    'An experiment that rests on nothing the technique showed.',
    'A next action too big or too vague to start today.',
    'A start that waits for an app timer or reminder instead of a cue the person will meet.',
    'No check-back date, so the experiment is never looked at again.'
  ]),
  steps: Object.freeze([
    step('result', 'The result that matters', 'What result would tell you this moved?'),
    step('rests_on', 'What it rests on', 'Which technique is this built on, and what on its chart does it use?'),
    step('next_action', 'The next action', 'What is the next action, small enough to start today?'),
    step('start', 'When it starts', 'What cue or protected time starts it?'),
    step('check_back', 'Check back', 'On what date will you look at how it went?'),
    step('change_course', 'Change course', 'What would tell you to change course?')
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: COMMIT_SLOTS,
  edgeKinds: Object.freeze([]),
  taskSlots: Object.freeze({ next_action: () => true }),
  validateNode(run, node) {
    if (node.slot === 'check_back' && !isRecordDate(node.text)) return 'The check-back is a date: put it in node.text as YYYY-MM-DD, or set node to null and ask for one.';
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
