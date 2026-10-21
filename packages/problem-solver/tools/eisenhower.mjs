// packages/problem-solver/tools/eisenhower.mjs
import { nextIndexed, parseSlot } from '../slots.mjs';

export const EISENHOWER_QUADRANTS = Object.freeze(['do', 'schedule', 'delegate', 'eliminate']);

/** Item nodes per quadrant tag, in placement order. */
export function byQuadrant(run) {
  const out = Object.fromEntries(EISENHOWER_QUADRANTS.map((q) => [q, []]));
  for (const node of run.nodes) if (parseSlot(node.slot)?.name === 'item' && out[node.tag]) out[node.tag].push(node);
  return out;
}

export const eisenhower = Object.freeze({
  id: 'eisenhower',
  name: 'Eisenhower matrix',
  kind: 'plan',
  step: 'implement',
  when: 'Too many things competing for time: sort them by urgent and important to decide what to do now, schedule, hand on or drop.',
  failureModes: [
    'Everything marked urgent and important.',
    'Delegating what only you can do, or keeping what someone else could.',
    'Never eliminating anything.'
  ],
  steps: [
    { id: 'list', title: 'List the demands', prompt: 'Everything competing for time on this problem.' },
    { id: 'sort', title: 'Sort them', prompt: 'Do first: important and pressing. Schedule: important, not yet due. Delegate: someone else can do it and it does not move your goal. Eliminate: distractions.' }
  ],
  slots: { item: 'A demand on your time, sorted into one quadrant' },
  nodeTags: { item: EISENHOWER_QUADRANTS },
  taskSlots: { item: (node) => node.tag === 'do' },
  edgeKinds: [],
  nextSlots(run) {
    return [nextIndexed(run, 'item', 16)].filter(Boolean);
  },
  complete(run) {
    return Object.values(byQuadrant(run)).filter((list) => list.length > 0).length >= 2;
  }
});
