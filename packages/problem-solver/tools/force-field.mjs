// packages/problem-solver/tools/force-field.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const MAX = 6;

/** Sum of the latest for and against scores, or null before any scoring. */
export function forceTotals(run) {
  const latest = run.scores?.snapshots?.at(-1);
  if (!latest) return null;
  const sum = (list) => list.reduce((total, value) => total + value, 0);
  return { for: sum(latest.for), against: sum(latest.against) };
}

/** Force nodes of one side, in slot order. */
export function forces(run, side) {
  return run.nodes.filter((node) => parseSlot(node.slot)?.name === side).sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index);
}

export const forceField = Object.freeze({
  id: 'force_field',
  name: 'Force field analysis',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Change is needed and forces push for and against it (personal, social, cultural, political, environmental, economic). If restraining forces dominate and cannot be moved, reframe.',
  failureModes: [
    'Forces scored with no reason given.',
    'Only internal forces, missing the outside ones (or the reverse).',
    'Planning to push harder on drivers without weakening the restrainers.',
    'Ignoring that forces change over time.'
  ],
  steps: [
    { id: 'define', title: 'Define the problem and goal', prompt: 'Say clearly where things stand now and the outcome you want.' },
    { id: 'forces', title: 'Uncover forces for and against change', prompt: 'Brainstorm every force, small or large, inside or outside, that helps or hinders the change.' },
    { id: 'assess', title: 'Assess the forces', prompt: 'Score each force from 1 to 5. Then plan how to strengthen the drivers and weaken the restrainers until the drivers outweigh them.' }
  ],
  slots: { current: 'The current state', goal: 'The goal', for: 'A force for change', against: 'A force against change' },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'current')) return ['current'];
    if (!hasSlot(run, 'goal')) return ['goal'];
    return open(nextIndexed(run, 'for', MAX), nextIndexed(run, 'against', MAX));
  },
  pickScores(payload) {
    return { for: payload?.for, against: payload?.against };
  },
  validateScores(run, scores) {
    for (const side of ['for', 'against']) {
      const list = scores?.[side];
      if (!Array.isArray(list) || list.length !== countSlots(run, side)) return `Give one score per force ${side === 'for' ? 'for' : 'against'} change.`;
      if (!list.every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) return 'Scores run from 1 to 5.';
    }
    return null;
  },
  complete(run) {
    return hasSlot(run, 'goal') && countSlots(run, 'for') >= 1 && countSlots(run, 'against') >= 1 && (run.scores?.snapshots?.length ?? 0) >= 1;
  }
});
