// packages/problem-solver/tools/smart.mjs
import { hasSlot } from '../slots.mjs';

const LETTERS = ['s', 'm', 'a', 'r', 't'];

export const smart = Object.freeze({
  id: 'smart',
  name: 'SMART objectives',
  kind: 'objectives',
  when: 'Last in Define: turn the defined problem into goals that can be acted on.',
  steps: [
    { id: 'define', title: 'Define the problem', prompt: 'Make the problem statement specific and measurable, including the issue scope and impact.' },
    { id: 'goals', title: 'Set SMART goals', prompt: 'Specific: who is involved, what, where. Measurable: concrete indicators of progress and success. Attainable: within resources and timeframe. Relevant: aligned with wider objectives and values. Time-based: deadlines.' }
  ],
  slots: { problem: 'The problem, specific and measurable', s: 'Specific', m: 'Measurable', a: 'Attainable', r: 'Relevant', t: 'Time-based' },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    return LETTERS.filter((letter) => !hasSlot(run, letter));
  },
  complete(run) {
    return hasSlot(run, 'problem') && LETTERS.every((letter) => hasSlot(run, letter));
  }
});
