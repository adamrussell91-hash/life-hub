// packages/decision-book/tools/record.mjs
// The decision record, Decide's one tool: the decision, its reasons (each resting on model nodes,
// kept on the session as `basis`), a Stop Rule (a trigger and the action agreed now), the first
// step and the review date. Order: the decision, then reasons; once there is a reason, the Stop
// Rule's trigger, then its action, then the first step, then the review. Reasons can still be
// added until the review is set. The first step can become a task; the review date becomes the
// session's review proposal (session.mjs), so both reach the page as confirm cards.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { REASONS_MAX, RECORD_ID, RECORD_SLOTS } from '../record-slots.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isRecordDate(text) {
  const value = String(text ?? '').trim();
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const dmRecord = Object.freeze({
  id: RECORD_ID,
  name: 'The decision record',
  kind: 'record',
  step: 'settle',
  family: 'record',
  tier: 'worksheet',
  when: 'The models have done their work: settle the decision, why, what would make you rethink, the first step and when to look again.',
  failureModes: Object.freeze([
    'A reason that rests on nothing a model showed.',
    'A Stop Rule with no trigger anyone could notice, or no action agreed in advance.',
    'A first step too big or too vague to start this week.',
    'No review date, so the decision is never checked against what happened.'
  ]),
  steps: Object.freeze([
    Object.freeze({ id: 'decision', title: 'The decision', prompt: 'Say the decision in one sentence, as you would tell someone it affects.' }),
    Object.freeze({ id: 'reasons', title: 'The reasons', prompt: 'Why this? Give each reason and the model finding it rests on.' }),
    Object.freeze({ id: 'stop_rule', title: 'What would make you rethink', prompt: 'Name one trigger you would notice, and the action you agree to now if it happens.' }),
    Object.freeze({ id: 'first_step', title: 'The first step', prompt: 'What is the first thing you will do, and by when?' }),
    Object.freeze({ id: 'review', title: 'When to review it', prompt: 'On what date will you look at what happened against what you expected?' })
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: Object.freeze({ ...RECORD_SLOTS }),
  edgeKinds: Object.freeze([]),
  taskSlots: Object.freeze({ first_step: () => true }),
  validateNode(run, node) {
    if (node.slot === 'review' && !isRecordDate(node.text)) return 'The review is a date: put it in node.text as YYYY-MM-DD.';
    return null;
  },
  nextSlots(run) {
    if (!hasSlot(run, 'decision')) return ['decision'];
    if (hasSlot(run, 'review')) return [];
    const reasoned = countSlots(run, 'reason') >= 1;
    const next = !reasoned ? null
      : !hasSlot(run, 'trigger') ? 'trigger'
        : !hasSlot(run, 'action') ? 'action'
          : !hasSlot(run, 'first_step') ? 'first_step'
            : 'review';
    return open(nextIndexed(run, 'reason', REASONS_MAX), next);
  },
  complete(run) {
    return ['decision', 'reason', 'trigger', 'action', 'first_step', 'review'].every((name) => hasSlot(run, name));
  }
});
