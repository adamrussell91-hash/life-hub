// packages/problem-solver/tools/causal-map.mjs
import { hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

export const causalMap = Object.freeze({
  id: 'causal_map',
  name: 'Causal map',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Many causes that act on each other and on the problem, where you need to see which way each one pushes and how hard. Deeper than 5 Whys.',
  failureModes: [
    'A cause with no evidence behind it.',
    'A link that does not say whether it makes things more or less.',
    'Every link marked strong, so strength stops meaning anything.',
    'Symptoms of the problem placed as causes.'
  ],
  steps: [
    { id: 'state', title: 'State the problem', prompt: 'Pin the problem down clearly; everything on the map connects back to it.' },
    { id: 'causes', title: 'Identify causes', prompt: 'Gather every plausible cause, from the people involved and from anyone with expertise. Wider forces that act on several causes go in as influences.' },
    { id: 'map', title: 'Map relationships', prompt: 'For each cause or influence, say what it leads to and whether it makes that more (plus) or less (minus). Mark a link strong only when it clearly outweighs the others. Ask why each thing happens and what it leads to.' }
  ],
  slots: { problem: 'The problem', cause: 'A cause, in a few words', influence: 'A wider influence acting on causes' },
  edgeKinds: ['plus', 'minus', 'plus_strong', 'minus_strong'],
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    return open(nextIndexed(run, 'cause', 12), nextIndexed(run, 'influence', 8));
  },
  canEdge(run, from, to) {
    if (run.edges.some((edge) => edge.from === from && edge.to === to)) return false;
    return ['cause', 'influence'].includes(nameOf(run, from)) && ['cause', 'problem'].includes(nameOf(run, to));
  },
  complete(run) {
    const causes = run.nodes.filter((node) => parseSlot(node.slot)?.name === 'cause');
    return hasSlot(run, 'problem') && causes.length >= 3 && causes.every((cause) => run.edges.some((edge) => edge.from === cause.id));
  }
});
