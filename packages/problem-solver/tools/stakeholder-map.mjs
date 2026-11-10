// packages/problem-solver/tools/stakeholder-map.mjs
import { nextIndexed, parseSlot } from '../slots.mjs';

export const STAKEHOLDER_QUADRANTS = Object.freeze(['manage_closely', 'keep_satisfied', 'keep_informed', 'monitor']);
const PLACED_TO_COMPLETE = 3;

/** Item nodes per quadrant tag, in placement order. */
export function byStakeholderQuadrant(run) {
  const out = Object.fromEntries(STAKEHOLDER_QUADRANTS.map((q) => [q, []]));
  for (const node of run.nodes) if (parseSlot(node.slot)?.name === 'item' && out[node.tag]) out[node.tag].push(node);
  return out;
}

export const stakeholderMap = Object.freeze({
  id: 'stakeholder_map',
  name: 'Stakeholder map',
  kind: 'diagnostic',
  step: 'define',
  when: 'A problem that other people can help, block or be affected by: place each person or group by how much power they have over the outcome and how much they care, to decide who needs what from you.',
  failureModes: [
    'Naming people instead of the roles that hold the power, so the map goes stale when someone moves on.',
    'Leaving out the quiet group with real power.',
    'Treating the map as fixed when interest and power shift as the problem moves.'
  ],
  steps: [
    { id: 'list', title: 'List who is involved', prompt: 'Everyone who can affect the problem or is affected by it. Name roles, such as "site manager", not individuals.' },
    { id: 'place', title: 'Place them', prompt: 'Manage closely: high power, high interest. Keep satisfied: high power, low interest. Keep informed: low power, high interest. Monitor: low power, low interest.' }
  ],
  slots: { item: 'A person or group, by role, placed by their power over the outcome and their interest in it' },
  nodeTags: { item: STAKEHOLDER_QUADRANTS },
  edgeKinds: [],
  nextSlots(run) {
    return [nextIndexed(run, 'item', 16)].filter(Boolean);
  },
  complete(run) {
    return Object.values(byStakeholderQuadrant(run)).reduce((sum, list) => sum + list.length, 0) >= PLACED_TO_COMPLETE;
  }
});
