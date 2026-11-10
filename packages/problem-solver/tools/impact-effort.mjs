// packages/problem-solver/tools/impact-effort.mjs
import { nextIndexed, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

export const IMPACT_EFFORT_QUADRANTS = Object.freeze(['quick_win', 'big_bet', 'fill_in', 'drop']);

/** Item nodes per quadrant tag, in placement order. */
export function byImpactEffort(run) {
  const out = Object.fromEntries(IMPACT_EFFORT_QUADRANTS.map((q) => [q, []]));
  for (const node of run.nodes) if (parseSlot(node.slot)?.name === 'item' && out[node.tag]) out[node.tag].push(node);
  return out;
}

export const impactEffort = withChoice({
  id: 'impact_effort',
  name: 'Impact vs Effort',
  kind: 'decision',
  step: 'decide',
  when: 'Several options and not enough time or people for all of them: place each by how much difference it makes and how much work it takes, then start with the cheap wins.',
  failureModes: [
    'Guessing impact without saying what difference it should make.',
    'Calling everything a quick win, so nothing is compared.',
    'Dropping a big bet because it is hard, without asking whether it can be cut into smaller pieces.'
  ],
  steps: [
    { id: 'list', title: 'List the options', prompt: 'Every option or action still in play.' },
    { id: 'place', title: 'Place each one', prompt: 'Quick win: big difference, little work. Big bet: big difference, a lot of work. Fill-in: small difference, little work. Drop: small difference, a lot of work.' }
  ],
  slots: { item: 'An option, placed in one quadrant by its impact and its effort' },
  nodeTags: { item: IMPACT_EFFORT_QUADRANTS },
  taskSlots: { item: (node) => node.tag === 'quick_win' },
  edgeKinds: [],
  nextSlots(run) {
    return [nextIndexed(run, 'item', 16)].filter(Boolean);
  },
  complete(run) {
    return Object.values(byImpactEffort(run)).filter((list) => list.length > 0).length >= 2;
  }
});
