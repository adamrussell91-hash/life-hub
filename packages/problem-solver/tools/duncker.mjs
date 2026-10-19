// packages/problem-solver/tools/duncker.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
const pathways = (run) => run.nodes.filter((node) => parseSlot(node.slot)?.name === 'pathway');

export const duncker = Object.freeze({
  id: 'duncker',
  name: 'Duncker diagram',
  kind: 'generative',
  step: 'devise',
  when: 'The obvious route keeps failing and you need contrary paths too: one straight to the desired state, one that makes it acceptable not to get there or redefines the problem. Counters functional fixedness.',
  failureModes: [
    'Only obvious pathways, with no functionally opposite one.',
    'Solutions that do not belong under their pathway.',
    'Evaluating without asking whether a redefined problem also reaches the desired state.'
  ],
  steps: [
    { id: 'define', title: 'Define', prompt: 'State the problem (top) and the desired state (bottom).' },
    { id: 'pathways', title: 'Establish pathways', prompt: 'Find at least two broad approaches to an acceptable future, including one functionally opposite to the obvious way.' },
    { id: 'solutions', title: 'Generate specific solutions', prompt: 'Under each pathway list concrete solutions: some remove the obstacles directly, others go round them or change the problem\'s terms.' },
    { id: 'evaluate', title: 'Evaluate', prompt: 'Weigh feasibility, effectiveness and consequences. If the best path redefines the problem, check that solving the new one still reaches the desired state.' }
  ],
  slots: {
    problem: 'The problem, at the top',
    desired: 'The desired state, at the bottom',
    pathway: 'A broad approach (direct, or functionally opposite)',
    solution: 'A specific solution under one pathway',
    redefinition: 'A new problem definition an opposite pathway leads to',
    evaluation: 'The weighing of feasibility, effectiveness and consequences'
  },
  nodeTags: { pathway: ['direct', 'opposite'] },
  edgeKinds: ['under'],
  validateNode(run, node, edges) {
    if (parseSlot(node.slot)?.name !== 'solution') return null;
    return edges.some((edge) => edge.kind === 'under' && edge.from === node.slot) ? null : 'Put each solution under its pathway (link kind "under", from the solution to the pathway).';
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    if (!hasSlot(run, 'desired')) return ['desired'];
    if (hasSlot(run, 'evaluation')) return [];
    const paths = pathways(run);
    const covered = paths.length >= 2 && paths.every((path) => run.edges.some((edge) => edge.kind === 'under' && edge.to === path.id));
    const kinds = new Set(paths.map((path) => path.tag));
    return open(
      nextIndexed(run, 'pathway', 4),
      paths.length ? nextIndexed(run, 'solution', 12) : null,
      kinds.has('opposite') && !hasSlot(run, 'redefinition') ? 'redefinition' : null,
      covered && kinds.has('direct') && kinds.has('opposite') ? 'evaluation' : null
    );
  },
  canEdge(run, from, to, kind) {
    return kind === 'under' && nameOf(run, from) === 'solution' && nameOf(run, to) === 'pathway' && !run.edges.some((edge) => edge.from === from);
  },
  complete(run) {
    return hasSlot(run, 'evaluation');
  }
});
