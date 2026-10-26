// packages/rules-book/tools/commit.mjs
// The experiment, Act's one tool: the result that matters, the rule it rests on (with the chart
// nodes it uses, kept on the session as `basis`), the next action, when it starts (a cue or
// protected time, in words: the Rules Book runs no timers), the check time and the observation
// that would overturn the person's reading or make them drop the rule. Slots are taken in that
// order. The rest of the model check lives in these prompts: the truth check (what was seen,
// what was inferred) before the rule is leaned on, and the usefulness check (is the rule still
// useful here, what would make me drop it) before the experiment is set. The next action can
// become a task; the check time becomes the session's review proposal (session.mjs).
import { hasSlot } from '../../problem-solver/slots.mjs';
import { isRecordDate } from '../../decision-book/tools/record.mjs';
import { COMMIT_ID, COMMIT_SLOTS, COMMIT_SLOT_NAMES } from '../commit-slots.mjs';

const step = (id, title, prompt) => Object.freeze({ id, title, prompt });

export const rbCommit = Object.freeze({
  id: COMMIT_ID,
  name: 'The experiment',
  kind: 'record',
  step: 'commit',
  family: 'commit',
  tier: 'worksheet',
  when: 'A rule has shown something: turn it into one small experiment with a start, a time to look again and an observation that could overturn your reading.',
  failureModes: Object.freeze([
    'A result nobody could check afterwards.',
    'An experiment that rests on an interpretation and not on something observed.',
    'A next action too big or too vague to start today.',
    'A start that waits for an app timer or reminder instead of a cue the person will meet.',
    'No check time, so the experiment is never looked at again.',
    'Treating the rule as a law when it is a lens that may not fit here.'
  ]),
  steps: Object.freeze([
    step('result', 'The result that matters', 'What result would tell you this moved?'),
    step('rests_on', 'What it rests on', 'Which rule is this built on, and which observation on its chart (as opposed to an interpretation) does it use?'),
    step('next_action', 'The next action', 'What is the next action, small enough to start today?'),
    step('start', 'When it starts', 'What cue or protected time starts it?'),
    step('check_back', 'Check time', 'On what date will you look at how it went?'),
    step('change_course', 'What would overturn it', 'What observation would overturn your reading, or show the rule is no longer useful here?')
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: COMMIT_SLOTS,
  edgeKinds: Object.freeze([]),
  taskSlots: Object.freeze({ next_action: () => true }),
  validateNode(run, node) {
    if (node.slot === 'check_back' && !isRecordDate(node.text)) return 'The check time is a date: put it in node.text as YYYY-MM-DD, or set node to null and ask for one.';
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
