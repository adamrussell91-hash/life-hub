// packages/problem-solver/tools/from-to.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const has = (run, slot) => run.nodes.some((node) => node.slot === slot);
const fullRows = (run) => Array.from({ length: countSlots(run, 'aspect') }, (_, i) => i + 1).filter((i) => has(run, `to:${i}`)).length;

export const fromTo = Object.freeze({
  id: 'from_to',
  name: 'From…to exploration',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Trends are shaping the problem and you want to move from how things are now toward a desired future, using those trends rather than fighting them.',
  failureModes: [
    'A trend asserted with no source.',
    'A "to" that is just the "from" made bigger, not a real speculation.',
    'Ignoring a declining trend that undercuts the plan.'
  ],
  steps: [
    { id: 'aspects', title: 'Determine problem aspects', prompt: 'List the central features or contexts of the problem.' },
    { id: 'trends', title: 'Identify trends', prompt: 'For each aspect, name the most relevant past or emerging trend and whether it is growing, stable or declining. A second strong trend gets its own row.' },
    { id: 'possibilities', title: 'Speculate possibilities', prompt: 'Write where each aspect is now (from) and where it might go (to), grounded in what you know.' },
    { id: 'insights', title: 'Discover insights', prompt: 'Look across the rows for forces to accommodate or put to use.' }
  ],
  slots: { aspect: 'A feature or context of the problem', trend: 'The trend acting on that aspect', from: 'How that aspect is now', to: 'Where it might go', insight: 'What the rows show: forces to use or accommodate' },
  nodeTags: { trend: ['growing', 'stable', 'declining'] },
  edgeKinds: [],
  nextSlots(run) {
    if (hasSlot(run, 'insight')) return [];
    const rows = [];
    for (let i = 1; i <= countSlots(run, 'aspect'); i += 1) {
      if (!has(run, `trend:${i}`)) rows.push(`trend:${i}`);
      else if (!has(run, `from:${i}`)) rows.push(`from:${i}`);
      else if (!has(run, `to:${i}`)) rows.push(`to:${i}`);
    }
    return open(nextIndexed(run, 'aspect', 6), ...rows, fullRows(run) >= 2 ? 'insight' : null);
  },
  complete(run) {
    return fullRows(run) >= 2 && hasSlot(run, 'insight');
  }
});
