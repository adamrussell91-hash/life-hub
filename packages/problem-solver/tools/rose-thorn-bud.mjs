// packages/problem-solver/tools/rose-thorn-bud.mjs
import { nextIndexed, parseSlot } from '../slots.mjs';

export const RTB_LISTS = Object.freeze(['rose', 'thorn', 'bud']);

/** Item nodes per list tag, in placement order. */
export function byList(run) {
  const out = Object.fromEntries(RTB_LISTS.map((q) => [q, []]));
  for (const node of run.nodes) if (parseSlot(node.slot)?.name === 'item' && out[node.tag]) out[node.tag].push(node);
  return out;
}

export const roseThornBud = Object.freeze({
  id: 'rose_thorn_bud',
  name: 'Rose, Thorn, Bud',
  kind: 'review',
  step: 'improve',
  when: 'A quick look back at something that has been running: what is working (roses), what is not (thorns) and what could grow (buds). Light enough to use alone in a few minutes.',
  failureModes: [
    'A list of thorns only, with no roses to keep.',
    'Buds that are wishes with no first step.',
    'Roses so vague that nobody could repeat them.'
  ],
  steps: [
    { id: 'roses', title: 'Roses', prompt: 'What is working well and worth keeping?' },
    { id: 'thorns', title: 'Thorns', prompt: 'What is not working, or is causing friction?' },
    { id: 'buds', title: 'Buds', prompt: 'What has potential but has not grown yet? Each could become a next step.' }
  ],
  slots: { item: 'A rose (working), thorn (not working) or bud (could grow), as the tag says' },
  nodeTags: { item: RTB_LISTS },
  taskSlots: { item: (node) => node.tag === 'bud' },
  edgeKinds: [],
  nextSlots(run) {
    return [nextIndexed(run, 'item', 18)].filter(Boolean);
  },
  complete(run) {
    return Object.values(byList(run)).every((list) => list.length > 0);
  }
});
