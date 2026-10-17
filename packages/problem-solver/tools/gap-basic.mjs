// packages/problem-solver/tools/gap-basic.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const MAX = 8;

export const GAP_STEPS = [
  { id: 'current', title: 'Identify the current state', prompt: 'Determine the focus area that needs to be improved. This might be shortfalls in performance, process or expectations.' },
  { id: 'objective', title: 'Define the objective', prompt: 'Outline the desired state by describing a high-level vision of success.' },
  { id: 'shortfalls', title: 'Specify shortfalls', prompt: 'What is currently known and what is currently done that underpins the current state? List these under known and done. Topics might be finances, people or time.' },
  { id: 'goals', title: 'Envisage goals', prompt: 'What would be needed for the objective to be accomplished? For each shortfall, list an achievable goal under must know and must do.' },
  { id: 'gaps', title: 'Determine the gaps', prompt: 'What can be done to bridge the gap between the current state and the objectives? List these under actions.' }
];

export function bothEnds(run) {
  return open(hasSlot(run, 'current') ? null : 'current', hasSlot(run, 'objective') ? null : 'objective');
}

export const gapBasic = Object.freeze({
  id: 'gap_basic',
  name: 'Gap analysis',
  kind: 'diagnostic',
  when: 'A clear present state and a desired state; the work is the distance between them.',
  steps: GAP_STEPS,
  slots: { current: 'The current state', objective: 'The objective', known: 'Currently known', done: 'Currently done', must_know: 'Must know', must_do: 'Must do', action: 'An action that bridges a gap' },
  edgeKinds: [],
  nextSlots(run) {
    const ends = bothEnds(run);
    if (ends.length) return ends;
    const musts = countSlots(run, 'must_know') + countSlots(run, 'must_do');
    return open(
      nextIndexed(run, 'known', MAX),
      nextIndexed(run, 'done', MAX),
      nextIndexed(run, 'must_know', MAX),
      nextIndexed(run, 'must_do', MAX),
      musts > 0 ? nextIndexed(run, 'action', MAX) : null
    );
  },
  complete(run) {
    return bothEnds(run).length === 0 &&
      countSlots(run, 'known') + countSlots(run, 'done') >= 1 &&
      countSlots(run, 'must_know') + countSlots(run, 'must_do') >= 1 &&
      countSlots(run, 'action') >= 1;
  }
});
