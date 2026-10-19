// packages/problem-solver/tools/pareto.mjs
import { countSlots, hasSlot, nextIndexed, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

const CUT = 80;
const latest = (run) => run.scores?.snapshots?.at(-1) ?? null;
const items = (run) => run.nodes.filter((node) => parseSlot(node.slot)?.name === 'item').sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index);
const scoresCurrent = (run) => latest(run)?.counts?.length === countSlots(run, 'item');
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Items ranked by their latest figure, largest first (ties keep slot order), with percent
 * of the total, cumulative percent, and `vital` for every row up to and including the
 * first whose cumulative reaches 80%. Empty before data.
 */
export function paretoRows(run) {
  const s = latest(run);
  if (!s) return [];
  const list = items(run).map((node, i) => ({ node, count: s.counts[i] ?? 0, order: i }));
  const total = list.reduce((sum, row) => sum + row.count, 0) || 1;
  list.sort((a, b) => b.count - a.count || a.order - b.order);
  let running = 0;
  let reached = false;
  return list.map(({ node, count }) => {
    running += count;
    const vital = !reached;
    if (running / total * 100 >= CUT) reached = true;
    return { node, count, percent: round1(count / total * 100), cumulative: round1(running / total * 100), vital };
  });
}

export const pareto = withChoice({
  id: 'pareto',
  name: 'Pareto analysis',
  kind: 'decision',
  step: 'decide',
  when: 'Many contributing items and limited effort: find the vital few that account for most of the effect (roughly 80% from 20% of causes), using real counts, costs or time.',
  failureModes: [
    'A ranking with no data behind it.',
    'Items at different levels, so one swallows several others.',
    'Treating 80/20 as exact rather than a guide.',
    'Measuring what is easy to count instead of what matters.'
  ],
  steps: [
    { id: 'target', title: 'Set the target', prompt: 'Say what is being measured (how often, how much it costs, how long it takes) and over what period.' },
    { id: 'items', title: 'List the components', prompt: 'List the items that contribute: causes, categories or activities, at the same level.' },
    { id: 'data', title: 'Collect the data', prompt: 'Give each item its figure; the chart ranks them and works out the percentages.' },
    { id: 'read', title: 'Read the chart', prompt: 'Find where the cumulative line crosses 80%; the items to its left are the vital few to tackle first.' }
  ],
  slots: { target: 'What is measured, how, and over what period', item: 'A contributing item, at the same level as the others' },
  edgeKinds: [],
  nextSlots(run) {
    return hasSlot(run, 'target') ? [nextIndexed(run, 'item', 12)].filter(Boolean) : ['target'];
  },
  pickScores(payload) {
    return { counts: payload?.counts };
  },
  validateScores(run, s) {
    const count = countSlots(run, 'item');
    if (count < 3) return 'List at least three items before adding the data.';
    if (!Array.isArray(s?.counts) || s.counts.length !== count) return 'Give one figure per item.';
    if (!s.counts.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return 'Figures are zero or more.';
    if (!s.counts.some((v) => v > 0)) return 'Give at least one item above zero.';
    return null;
  },
  awaiting(run) {
    return countSlots(run, 'item') >= 3 && !scoresCurrent(run) ? 'The person enters a figure for each item with the Add the data button; ask them to, and wait.' : null;
  },
  scoreLine(run) {
    const rows = paretoRows(run);
    if (!rows.length) return null;
    const vital = rows.filter((row) => row.vital);
    return `Ranked: ${rows.map((row) => `${row.node.slot} ${row.count} (${row.percent}%, cumulative ${row.cumulative}%)`).join('; ')}. Vital few: ${vital.map((row) => row.node.slot).join(', ')} (${vital.at(-1).cumulative}%).`;
  },
  complete(run) {
    return countSlots(run, 'item') >= 3 && scoresCurrent(run);
  }
});
