// packages/problem-solver/tools/assumptions-map.mjs
import { nextIndexed, parseSlot } from '../slots.mjs';

export const ASSUMPTION_QUADRANTS = Object.freeze(['test_first', 'act_on', 'watch', 'park']);
const PLACED_TO_COMPLETE = 3;

/** Item nodes per quadrant tag, in placement order. */
export function byAssumptionQuadrant(run) {
  const out = Object.fromEntries(ASSUMPTION_QUADRANTS.map((q) => [q, []]));
  for (const node of run.nodes) if (parseSlot(node.slot)?.name === 'item' && out[node.tag]) out[node.tag].push(node);
  return out;
}

export const assumptionsMap = Object.freeze({
  id: 'assumptions_map',
  name: 'Assumptions map',
  kind: 'analysis',
  step: 'analyse',
  when: 'A plan or explanation rests on things you are taking for granted: list them, then sort by how much the plan depends on each and how well you actually know it, so you check the shaky, important ones first.',
  failureModes: [
    'Listing only the assumptions that feel safe to name.',
    'Treating a belief as known because everyone repeats it.',
    'Testing the easy assumptions first rather than the important unknown ones.'
  ],
  steps: [
    { id: 'list', title: 'List the assumptions', prompt: 'What must be true for this plan or explanation to hold? Write each as a claim.' },
    { id: 'place', title: 'Sort them', prompt: 'Test first: important and not yet known. Act on: important and known. Watch: less important and not known. Park: less important and known.' }
  ],
  slots: { item: 'An assumption, placed by how much the plan depends on it and how well it is known' },
  nodeTags: { item: ASSUMPTION_QUADRANTS },
  taskSlots: { item: (node) => node.tag === 'test_first' },
  edgeKinds: [],
  nextSlots(run) {
    return [nextIndexed(run, 'item', 16)].filter(Boolean);
  },
  complete(run) {
    return Object.values(byAssumptionQuadrant(run)).reduce((sum, list) => sum + list.length, 0) >= PLACED_TO_COMPLETE;
  }
});
