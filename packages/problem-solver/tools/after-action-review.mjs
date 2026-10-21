// packages/problem-solver/tools/after-action-review.mjs
import { hasSlot } from '../slots.mjs';

export const AAR_SLOTS = Object.freeze(['intended', 'achieved', 'differences', 'learned']);
const words = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
const textOf = (run, slot) => run.nodes.find((node) => node.slot === slot)?.text ?? '';

/** Word count of the longest of the first three answers. */
export function longestEarlier(run) {
  return Math.max(0, ...AAR_SLOTS.slice(0, 3).map((slot) => words(textOf(run, slot))));
}

/** The share of the review's words spent on what was learned (0 when nothing is placed). */
export function learnedShare(run) {
  const total = AAR_SLOTS.reduce((sum, slot) => sum + words(textOf(run, slot)), 0);
  return total ? words(textOf(run, 'learned')) / total : 0;
}

export const afterActionReview = Object.freeze({
  id: 'after_action_review',
  name: 'After action review',
  kind: 'review',
  step: 'improve',
  when: 'Soon after an activity, a milestone or a pilot: compare what was meant to happen with what did, find why, and spend most of the time on what was learned. Works alone in five minutes or with a team, without rank.',
  failureModes: [
    'Describing the plan instead of what actually happened.',
    'Blaming a person for a difference that a process allowed.',
    'Rushing the learning: it should take at least half the review.',
    'Waiting so long that the details are forgotten.'
  ],
  steps: [
    { id: 'intended', title: 'Set out to achieve', prompt: 'What were you trying to achieve? Use the goal and measures set earlier.' },
    { id: 'achieved', title: 'Achieved', prompt: 'What actually happened? Facts and measures, not impressions.' },
    { id: 'differences', title: 'Why the difference', prompt: 'Why did the result differ from the aim, for better or worse? Look at the process, not the people.' },
    { id: 'learned', title: 'Learned', prompt: 'What will you keep, change or try next time? This is the heart of the review.' }
  ],
  slots: {
    intended: 'What you set out to achieve',
    achieved: 'What actually happened, with measures',
    differences: 'Why the result differed from the aim',
    learned: 'What you learned and will carry forward (the fullest answer)'
  },
  edgeKinds: [],
  nextSlots(run) {
    const missing = AAR_SLOTS.find((slot) => !hasSlot(run, slot));
    return missing ? [missing] : [];
  },
  complete(run) {
    return AAR_SLOTS.every((slot) => hasSlot(run, slot));
  },
  promptNote(run) {
    if (hasSlot(run, 'learned') || !hasSlot(run, 'differences')) return null;
    return `Learned is the heart of the review. Accept it only if it is longer than ${longestEarlier(run)} words (the longest answer so far); if it is shorter, challenge and ask what else they learned.`;
  }
});
