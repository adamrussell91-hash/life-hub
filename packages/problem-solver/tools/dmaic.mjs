// packages/problem-solver/tools/dmaic.mjs
import { countSlots, hasSlot, open } from '../slots.mjs';

export const DMAIC_PHASES = Object.freeze(['define', 'measure', 'analyse', 'improve']);
const MAX_PASSES = 3;
const has = (run, slot) => run.nodes.some((node) => node.slot === slot);

/** The pass being worked: the number of define nodes, at least 1. */
export function currentPass(run) {
  return Math.max(1, countSlots(run, 'define'));
}

export const dmaic = Object.freeze({
  id: 'dmaic',
  name: 'DMAIC cycle',
  kind: 'plan',
  step: 'implement',
  when: 'Improving a process or a result that can be measured, where you want data before and after, a pilot, and a plan to keep the gain (Six Sigma\'s define, measure, analyse, improve, control).',
  failureModes: [
    'No baseline, so improvement cannot be shown.',
    'Measures that track activity rather than the result.',
    'Rolling out everywhere without a pilot when one is cheap.',
    'No plan for who keeps the gain and how.'
  ],
  steps: [
    { id: 'define', title: 'Define', prompt: 'The problem, the objectives, the scope and who is involved.' },
    { id: 'measure', title: 'Measure', prompt: 'The key measures of success, today\'s baseline, and how progress will be tracked. SMART measures from Define carry over here.' },
    { id: 'analyse', title: 'Analyse', prompt: 'What the data shows: patterns and the root causes to target.' },
    { id: 'improve', title: 'Improve', prompt: 'Prioritise solutions, pilot the best, then implement it. Go round again if the results fall short.' },
    { id: 'control', title: 'Control', prompt: 'How the gain is kept: who monitors what, how often, and when the plan is revised.' }
  ],
  slots: {
    define: 'This pass: problem, objectives, scope and stakeholders',
    measure: 'This pass: key measures, the baseline, how it is tracked',
    analyse: 'This pass: what the data shows and the root causes to target',
    improve: 'This pass: the chosen solutions, the pilot and its results',
    repeat: 'Why go round again, and what changes next pass',
    control: 'How the gain is kept, monitored and revised'
  },
  edgeKinds: [],
  nextSlots(run) {
    if (hasSlot(run, 'control')) return [];
    const pass = countSlots(run, 'define');
    if (pass === 0) return ['define:1'];
    const missing = DMAIC_PHASES.find((phase) => !has(run, `${phase}:${pass}`));
    if (missing) return [`${missing}:${pass}`];
    if (has(run, `repeat:${pass}`)) return [`define:${pass + 1}`];
    return open('control', pass < MAX_PASSES ? `repeat:${pass}` : null);
  },
  complete(run) {
    return hasSlot(run, 'control');
  }
});
