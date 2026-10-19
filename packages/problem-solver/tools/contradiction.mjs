// packages/problem-solver/tools/contradiction.mjs
import { hasSlot } from '../slots.mjs';

const ORDER = ['improving', 'worsening', 'statement'];

/** TRIZ's general problem: the contradiction behind the specific problem. */
export const contradiction = Object.freeze({
  id: 'contradiction',
  name: 'Contradiction',
  kind: 'contradiction',
  step: 'contradiction',
  when: 'TRIZ only: once the specific problem is defined, name what you want to improve and what gets worse when you do.',
  failureModes: [
    'Two separate problems rather than one trade-off.',
    'A worsening factor that does not actually worsen when the first improves.',
    'A statement that already contains a solution.'
  ],
  steps: [
    { id: 'improving', title: 'What should improve', prompt: 'Name the quality you want to improve, in a few words.' },
    { id: 'worsening', title: 'What gets worse', prompt: 'Name what worsens when you improve it. Check it really does.' },
    { id: 'statement', title: 'State the contradiction', prompt: 'One sentence: improving the first makes the second worse.' }
  ],
  slots: { improving: 'The quality to improve', worsening: 'The quality that worsens', statement: 'The contradiction in one sentence' },
  edgeKinds: [],
  nextSlots(run) {
    const next = ORDER.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return hasSlot(run, 'statement');
  }
});
