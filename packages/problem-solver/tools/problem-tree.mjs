// packages/problem-solver/tools/problem-tree.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const MAX = 12;

export const problemTree = Object.freeze({
  id: 'problem_tree',
  name: 'Problem tree',
  kind: 'diagnostic',
  when: 'Several causes and effects that need sorting, possibly interacting.',
  steps: [
    { id: 'state', title: 'State the problem', prompt: 'Clearly state the problem in general terms. This becomes the base or trunk of the tree.' },
    { id: 'causes_effects', title: 'Establish causes and effects', prompt: 'Identify causes of the problem; these become the roots. Then list their effects or impacts above the problem; these become the branches. Who, what, where, when, why, how.' },
    { id: 'relationships', title: 'Find relationships', prompt: 'Link causes and effects to show linkages or commonalities, focused on how they relate to the problem.' }
  ],
  slots: { trunk: 'The problem in general terms', cause: 'A cause (root)', effect: 'An effect or impact (branch)' },
  edgeKinds: ['relates'],
  nextSlots(run) {
    if (!hasSlot(run, 'trunk')) return ['trunk'];
    return open(nextIndexed(run, 'cause', MAX), nextIndexed(run, 'effect', MAX));
  },
  canEdge(run, from, to) {
    const kind = (id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
    return ['cause', 'effect'].includes(kind(from)) && ['cause', 'effect'].includes(kind(to));
  },
  complete(run) {
    return hasSlot(run, 'trunk') && countSlots(run, 'cause') >= 2 && countSlots(run, 'effect') >= 1;
  }
});
