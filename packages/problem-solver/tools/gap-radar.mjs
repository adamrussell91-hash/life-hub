// packages/problem-solver/tools/gap-radar.mjs
import { countSlots, nextIndexed, open, parseSlot } from '../slots.mjs';
import { GAP_STEPS, bothEnds } from './gap-basic.mjs';

/** Axis texts in slot order. */
export function radarAxes(run) {
  return run.nodes
    .filter((node) => parseSlot(node.slot)?.name === 'axis')
    .sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index)
    .map((node) => node.text);
}

export const gapRadar = Object.freeze({
  id: 'gap_radar',
  name: 'Gap analysis (advanced)',
  kind: 'diagnostic',
  when: 'Several dimensions of the gap that can each be scored 1 to 10 and tracked over time.',
  step: 'define',
  failureModes: [
    'Topics that overlap, so scores double count.',
    'Scores given with no reason or evidence.',
    'An inconsistent scale between snapshots, so progress cannot be compared.'
  ],
  steps: [
    ...GAP_STEPS.slice(0, 3),
    { id: 'score', title: 'Score each topic', prompt: 'For each topic, give the current state and the objective a rating from 1 to 10, with 10 a perfect score. Rescore later to track progress.' }
  ],
  slots: { current: 'The current state', objective: 'The objective', axis: 'A topic to score, a few words' },
  edgeKinds: [],
  nextSlots(run) {
    const ends = bothEnds(run);
    return ends.length ? ends : open(nextIndexed(run, 'axis', 8));
  },
  /** @returns {string | null} an error message, or null when valid */
  validateScores(run, scores) {
    const axes = radarAxes(run);
    if (axes.length < 3) return 'Add at least three topics before scoring.';
    for (const key of ['current', 'objective']) {
      const list = scores?.[key];
      if (!Array.isArray(list) || list.length !== axes.length) return `Give one score per topic for ${key}.`;
      if (!list.every((n) => Number.isInteger(n) && n >= 1 && n <= 10)) return 'Scores run from 1 to 10.';
    }
    return null;
  },
  /** Where snapshots live on the run (kept as `radar` for v1 data). */
  scoreKey: 'radar',
  /** The score fields this tool keeps from a payload. */
  pickScores(payload) {
    return { current: payload?.current, objective: payload?.objective };
  },
  awaiting(run) {
    return countSlots(run, 'axis') >= 3 && !(run.radar?.snapshots?.length)
      ? 'The person scores each topic with the Score each topic button; ask them to, and wait.'
      : null;
  },
  complete(run) {
    return countSlots(run, 'axis') >= 3 && (run.radar?.snapshots?.length ?? 0) >= 1;
  }
});
