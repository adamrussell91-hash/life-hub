// packages/problem-solver/tools/radial-tree.mjs
import { hasSlot, nextIndexed, open } from '../slots.mjs';
import { canParent, levels } from './hierarchy.mjs';

export const radialTree = Object.freeze({
  id: 'radial_tree',
  name: 'Radial tree',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Information that breaks down into levels, where seeing clusters, balance and outliers at a glance helps. A vertical tree reads faster; the radial form suits reflection.',
  failureModes: [
    'Levels that mix kinds of thing, so the hierarchy means nothing.',
    'Items hung under the wrong parent.',
    'A lopsided tree accepted without asking why one branch is so thin.'
  ],
  steps: [
    { id: 'hierarchy', title: 'Define the hierarchy', prompt: 'Decide what each level holds; a quick concept map helps find the groupings.' },
    { id: 'nodes', title: 'Draw the nodes', prompt: 'Start with the top level at the centre and work outward, joining each item to the one it belongs under.' },
    { id: 'review', title: 'Review', prompt: 'Look at the whole for balance and legibility, and say what the clusters and gaps show.' }
  ],
  slots: { root: 'The centre: the subject being broken down', node: 'An item, one level below the item it hangs from', review: 'What the finished tree shows: clusters, balance, gaps' },
  edgeKinds: ['parent'],
  nextSlots(run) {
    if (!hasSlot(run, 'root')) return ['root'];
    const deep = [...levels(run, 'root', 'node').values()].some((level) => level >= 3);
    return open(nextIndexed(run, 'node', 40), deep && !hasSlot(run, 'review') ? 'review' : null);
  },
  canEdge(run, from, to) {
    return canParent(run, from, to, 'root', 'node');
  },
  complete(run) {
    return hasSlot(run, 'review') && [...levels(run, 'root', 'node').values()].some((level) => level >= 3);
  }
});
