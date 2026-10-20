// packages/problem-solver/tools/knowledge-management.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const CAPTURE_MAX = 6;

/** The block of the book's stack each slot belongs to. */
export const KM_BLOCK = Object.freeze({ consider: 'consider', explicit: 'capture', tacit: 'capture', share: 'share', review: 'review' });
export const KM_BLOCKS = Object.freeze(['consider', 'capture', 'share', 'review']);

/** The block the latest node sits in, or null before any. */
export function kmStage(run) {
  const last = run.nodes.at(-1);
  return last ? KM_BLOCK[parseSlot(last.slot)?.name] ?? null : null;
}

export const knowledgeManagement = Object.freeze({
  id: 'knowledge_management',
  name: 'Knowledge management',
  kind: 'record',
  step: 'document',
  when: 'When what was learned should outlast this problem: decide what to keep, write down what can be written, plan how know-how held by people is passed on, and set a time to review and prune it.',
  failureModes: [
    'Capturing only documents and missing the know-how that lives in people.',
    'Writing it down where nobody will look for it.',
    'No review, so the record goes stale or keeps what should be deleted.',
    'Keeping personal or sensitive details that should not be stored.'
  ],
  steps: [
    { id: 'consider', title: 'Consider', prompt: 'What is already recorded, and what is missing that next time will need?' },
    { id: 'capture', title: 'Capture', prompt: 'Explicit: what can be written down, and where. Tacit: know-how held by people, and how it will be passed on (a walk-through, a review, working alongside).' },
    { id: 'share', title: 'Share', prompt: 'How will others find it, and be encouraged to ask and add to it?' },
    { id: 'review', title: 'Review', prompt: 'When will you look at it again, what will you update, and what will you delete?' }
  ],
  slots: {
    consider: 'What needs capturing, and what is already recorded',
    explicit: 'Explicit knowledge: something that can be written down, and where it goes',
    tacit: 'Tacit knowledge: know-how held by people, and how it will be passed on',
    share: 'How it will be shared and kept alive',
    review: 'When it will be reviewed, and what will be updated or deleted'
  },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'consider')) return ['consider'];
    const capture = open(nextIndexed(run, 'explicit', CAPTURE_MAX), nextIndexed(run, 'tacit', CAPTURE_MAX));
    if (!countSlots(run, 'explicit') || !countSlots(run, 'tacit')) return capture;
    return open(...capture, hasSlot(run, 'share') ? null : 'share', hasSlot(run, 'review') ? null : 'review');
  },
  complete(run) {
    return hasSlot(run, 'consider') && countSlots(run, 'explicit') > 0 && countSlots(run, 'tacit') > 0 && hasSlot(run, 'review');
  }
});
