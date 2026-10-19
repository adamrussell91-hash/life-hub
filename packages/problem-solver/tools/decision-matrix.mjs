// packages/problem-solver/tools/decision-matrix.mjs
import { countSlots, nextIndexed, open, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

const ordered = (run, name) => run.nodes.filter((node) => parseSlot(node.slot)?.name === name).sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index);
const latest = (run) => run.scores?.snapshots?.at(-1) ?? null;
const titleOf = (node) => node.title ?? node.text;

export const criteria = (run) => ordered(run, 'criterion');
export const options = (run) => ordered(run, 'option');

/** True when the latest snapshot covers exactly the criteria and options now placed. */
function scoresCurrent(run) {
  const s = latest(run);
  const nc = countSlots(run, 'criterion');
  return Boolean(s) && s.weights?.length === nc && s.ratings?.length === countSlots(run, 'option') && s.ratings.every((row) => row.length === nc);
}

/**
 * Weighted totals per option from the latest snapshot, or null before scoring.
 * Percentage weights give totals out of 10 (rating x weight / 100); ranks give raw sums.
 * `leader` is the index of the single highest total, or null on a tie.
 */
export function matrixTotals(run) {
  const s = latest(run);
  if (!s) return null;
  const scale = s.mode === 'percent' ? 100 : 1;
  const totals = s.ratings.map((row) => Math.round((row.reduce((sum, rating, i) => sum + rating * (s.weights[i] ?? 0), 0) / scale) * 100) / 100);
  const top = Math.max(...totals);
  return { totals, leader: totals.filter((t) => t === top).length === 1 ? totals.indexOf(top) : null };
}

export const decisionMatrix = withChoice({
  id: 'decision_matrix',
  name: 'Decision matrix',
  kind: 'decision',
  step: 'decide',
  when: 'Several options to compare against several factors that do not matter equally. Weighting the factors and rating each option shows which performs best overall (multiple-criteria decision analysis).',
  failureModes: [
    'Criteria too vague to rate against, such as "good" or "works".',
    'Weights left equal, or not adding to 100, with no reason given.',
    'Ratings that do not match the evidence already stated.',
    'Choosing the winner first and fitting the numbers afterwards.',
    'Treating a narrow lead as decisive.'
  ],
  steps: [
    { id: 'criteria', title: 'Identify the criteria', prompt: 'Name the factors the options will be judged on. Make each one specific, measurable and central to the decision.' },
    { id: 'weights', title: 'Weight the criteria', prompt: 'Give each criterion a weight: percentages that add up to 100, or ranks where the most important gets the highest number.' },
    { id: 'rate', title: 'Rate the options', prompt: 'List the options (carry them over from Devise) and rate each one from 1 to 10 against every criterion.' },
    { id: 'totals', title: 'Total the scores', prompt: 'Multiply each rating by its weight and add them up per option. The highest total performs best; check it against your judgement.' }
  ],
  slots: { criterion: 'A factor the options are judged on, specific and measurable', option: 'An option being compared' },
  edgeKinds: [],
  nextSlots(run) {
    return open(nextIndexed(run, 'criterion', 8), nextIndexed(run, 'option', 6));
  },
  pickScores(payload) {
    return { mode: payload?.mode, weights: payload?.weights, ratings: payload?.ratings };
  },
  validateScores(run, s) {
    const nc = countSlots(run, 'criterion');
    const no = countSlots(run, 'option');
    if (nc < 2 || no < 2) return 'Add at least two criteria and two options before scoring.';
    if (!['percent', 'rank'].includes(s?.mode)) return 'Choose percentage weights or ranks.';
    const w = s.weights;
    if (!Array.isArray(w) || w.length !== nc || !w.every(Number.isInteger)) return 'Give one whole-number weight per criterion.';
    if (s.mode === 'percent' && (w.some((v) => v < 0 || v > 100) || w.reduce((a, b) => a + b, 0) !== 100)) return 'Percentage weights must add up to 100.';
    if (s.mode === 'rank' && [...w].sort((a, b) => a - b).some((v, i) => v !== i + 1)) return `Ranks use each number from 1 to ${nc} once; the most important criterion gets ${nc}.`;
    const r = s.ratings;
    if (!Array.isArray(r) || r.length !== no || !r.every((row) => Array.isArray(row) && row.length === nc)) return 'Rate every option against every criterion.';
    if (!r.flat().every((v) => Number.isInteger(v) && v >= 1 && v <= 10)) return 'Ratings run from 1 to 10.';
    return null;
  },
  awaiting(run) {
    return countSlots(run, 'criterion') >= 2 && countSlots(run, 'option') >= 2 && !scoresCurrent(run)
      ? 'The person weights the criteria and rates each option with the Score the options button; ask them to, and wait.'
      : null;
  },
  scoreLine(run) {
    const result = matrixTotals(run);
    if (!result) return null;
    const s = latest(run);
    const weights = criteria(run).map((node, i) => `${titleOf(node)} ${s.weights[i]}`).join(', ');
    const totals = options(run).map((node, i) => `${node.slot} ${result.totals[i]}${result.leader === i ? ' (leading)' : ''}`).join(', ');
    return `Weights (${s.mode === 'percent' ? 'percent' : 'rank'}): ${weights}. Totals: ${totals}${result.leader === null ? ' (tied at the top)' : ''}.`;
  },
  complete(run) {
    return countSlots(run, 'criterion') >= 2 && countSlots(run, 'option') >= 2 && scoresCurrent(run);
  }
});
