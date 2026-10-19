// packages/problem-solver/tools/problem-reduction.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const has = (run, slot) => run.nodes.some((node) => node.slot === slot);

function orderFrom(text, count) {
  // Numbers beyond the sub count are part of the sentence ("affects 30 people"), not the order.
  const numbers = (String(text).match(/\d+/g) ?? []).map(Number).filter((value) => value >= 1 && value <= count);
  const valid = numbers.length === count && new Set(numbers).size === count && numbers.every((value) => value >= 1 && value <= count);
  return valid ? numbers : null;
}

/** The tackle order as sub-problem numbers, or null before it is set. */
export function priorityOrder(run) {
  const node = run.nodes.find((item) => item.slot === 'priority');
  return node ? orderFrom(node.text, countSlots(run, 'sub')) : null;
}

export const problemReduction = Object.freeze({
  id: 'problem_reduction',
  name: 'Problem reduction',
  kind: 'generative',
  step: 'devise',
  when: 'A problem too big to solve whole, which breaks into smaller parts that can each be solved and then combined (Newell and Simon\'s divide and conquer).',
  failureModes: [
    'Sub-problems that overlap, so work is done twice.',
    'An order chosen by ease rather than impact and feasibility.',
    'Forgetting to put the pieces back together.'
  ],
  steps: [
    { id: 'define', title: 'Define the problem', prompt: 'State the whole problem with the specifics that matter.' },
    { id: 'decompose', title: 'Decompose', prompt: 'Break it into smaller parts. Ask what its elements are, who is affected, the root causes, what happens if it stays unsolved, where and when it occurs.' },
    { id: 'prioritise', title: 'Prioritise', prompt: 'Decide the order to tackle the parts, by impact and feasibility.' },
    { id: 'solve', title: 'Solve each part', prompt: 'Work each sub-problem on its own; split it further if needed.' },
    { id: 'integrate', title: 'Integrate', prompt: 'Combine the part solutions into one solution for the whole.' }
  ],
  slots: {
    problem: 'The whole problem',
    sub: 'A smaller part of it',
    priority: 'The order to tackle the parts, as their numbers, e.g. "2, 3, 1"',
    solution: 'The solution to the sub-problem with the same number',
    integrated: 'How the part solutions combine into one'
  },
  edgeKinds: [],
  validateNode(run, node) {
    if (node.slot !== 'priority') return null;
    return orderFrom(node.text, countSlots(run, 'sub')) ? null : 'List every sub-problem number once, in the order to tackle them, for example "2, 3, 1".';
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    const subs = countSlots(run, 'sub');
    if (!hasSlot(run, 'priority')) return open(nextIndexed(run, 'sub', 6), subs >= 2 ? 'priority' : null);
    const unsolved = Array.from({ length: subs }, (_, i) => `solution:${i + 1}`).filter((slot) => !has(run, slot));
    if (unsolved.length) return unsolved;
    return hasSlot(run, 'integrated') ? [] : ['integrated'];
  },
  complete(run) {
    return hasSlot(run, 'integrated');
  }
});
