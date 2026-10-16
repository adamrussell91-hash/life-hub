// packages/problem-solver/tools/five-whys.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const MIN_WHYS = 5;
export const MAX_WHYS = 8;

export const fiveWhys = Object.freeze({
  id: 'five_whys',
  name: '5 Whys',
  kind: 'diagnostic',
  when: 'One clear symptom with a likely single chain of cause.',
  steps: [
    { id: 'state', title: 'State the problem', prompt: 'Define the problem clearly in one sentence or statement.' },
    { id: 'ask', title: 'Ask why?', prompt: 'Ask why a minimum of five times. Base each why on the answer before it, until you reach the root cause. Seven or eight may be needed; usually five is enough.' },
    { id: 'specific', title: 'Be specific', prompt: 'The final why should point to a specific process, occurrence, action or activity, not something generic like "not enough time" or "not enough budget".' }
  ],
  slots: { problem: 'The problem statement', why: 'An answer to "why?" about the line above', root: 'The specific root cause' },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    if (hasSlot(run, 'root')) return [];
    return open(nextIndexed(run, 'why', MAX_WHYS), countSlots(run, 'why') >= MIN_WHYS ? 'root' : null);
  },
  complete(run) {
    return hasSlot(run, 'root');
  }
});
