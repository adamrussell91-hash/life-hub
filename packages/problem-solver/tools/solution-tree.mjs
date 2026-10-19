// packages/problem-solver/tools/solution-tree.mjs
import { hasSlot, nextIndexed } from '../slots.mjs';
import { canParent, childrenOf } from './hierarchy.mjs';

export const solutionTree = Object.freeze({
  id: 'solution_tree',
  name: 'Solution tree',
  kind: 'generative',
  step: 'devise',
  when: 'You know the aim and need to map every way to reach it: an issue tree asks why, a solution tree asks how, branching into actions and alternatives.',
  failureModes: [
    'Branches that are not real "hows" of their parent.',
    'Stopping at one path when alternatives exist.',
    'Actions too vague to start on.'
  ],
  steps: [
    { id: 'aim', title: 'State the aim', prompt: 'Name the objective; it is the trunk at the base of the tree.' },
    { id: 'possibilities', title: 'Determine possibilities', prompt: 'Add the high-level ways to reach it, then for each, the actions that achieve it, branching until every step is set out.' },
    { id: 'alternatives', title: 'Consider alternatives', prompt: 'Look for other ways to the same outcome; they become twigs off the branches.' }
  ],
  slots: { aim: 'The objective, at the base', how: 'A way to achieve the item it hangs from' },
  edgeKinds: ['parent'],
  nextSlots(run) {
    return hasSlot(run, 'aim') ? [nextIndexed(run, 'how', 30)].filter(Boolean) : ['aim'];
  },
  canEdge(run, from, to) {
    return canParent(run, from, to, 'aim', 'how');
  },
  complete(run) {
    const families = childrenOf(run, 'aim', 'how');
    const hows = new Set([...families.values()].flat());
    const nested = [...families.keys()].some((parent) => hows.has(parent));
    return hasSlot(run, 'aim') && hows.size >= 3 && nested && [...families.values()].some((kids) => kids.length >= 2);
  }
});
