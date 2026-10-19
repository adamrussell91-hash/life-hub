// packages/problem-solver/tools/lotus-blossom.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const PETALS = 8;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** Idea ids per solution id, in placement order. */
export function petalsOf(run) {
  const map = new Map();
  for (const edge of run.edges) {
    if (edge.kind !== 'petal') continue;
    if (!map.has(edge.to)) map.set(edge.to, []);
    map.get(edge.to).push(edge.from);
  }
  return map;
}

export const lotusBlossom = Object.freeze({
  id: 'lotus_blossom',
  name: 'Lotus blossom',
  kind: 'generative',
  step: 'devise',
  when: 'You need many options fast: eight solutions around the problem, then eight ideas around each, for up to sixty-four (Matsumura).',
  failureModes: [
    'Judging ideas while generating them.',
    'Eight petals that are really the same idea.',
    'Ending with a pile of ideas and no preferred few.'
  ],
  steps: [
    { id: 'centre', title: 'The central problem', prompt: 'Put the problem at the centre and generate eight possible solutions around it. Keep them brief.' },
    { id: 'expand', title: 'Solution expansion', prompt: 'Make each solution the centre of its own flower and generate up to eight ideas around it.' },
    { id: 'review', title: 'Iterate and review', prompt: 'Review the ideas for viability, overlap, feasibility and impact; circle and link the preferred ones.' }
  ],
  slots: { problem: 'The problem at the centre', solution: 'One of eight possible solutions', idea: 'An idea that grows from one solution', preferred: 'A preferred idea and why' },
  edgeKinds: ['petal', 'marks'],
  validateNode(run, node, edges) {
    const name = parseSlot(node.slot)?.name;
    if (name === 'idea' && !edges.some((edge) => edge.kind === 'petal' && edge.from === node.slot)) return 'Link each idea to the solution it grows from (link kind "petal", from the idea to the solution).';
    if (name === 'preferred' && !edges.some((edge) => edge.kind === 'marks' && edge.from === node.slot)) return 'Link each preferred note to the idea it picks (link kind "marks").';
    return null;
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    const solutions = countSlots(run, 'solution');
    return open(
      solutions < PETALS ? nextIndexed(run, 'solution', PETALS) : null,
      solutions >= 1 ? nextIndexed(run, 'idea', PETALS * PETALS) : null,
      countSlots(run, 'idea') >= 1 ? nextIndexed(run, 'preferred', 8) : null
    );
  },
  canEdge(run, from, to, kind) {
    if (kind === 'petal') return nameOf(run, from) === 'idea' && nameOf(run, to) === 'solution' && !run.edges.some((edge) => edge.kind === 'petal' && edge.from === from) && (petalsOf(run).get(to)?.length ?? 0) < PETALS;
    if (kind === 'marks') return nameOf(run, from) === 'preferred' && nameOf(run, to) === 'idea' && !run.edges.some((edge) => edge.kind === 'marks' && edge.from === from);
    return false;
  },
  complete(run) {
    const flowered = [...petalsOf(run).values()].filter((ideas) => ideas.length >= 1).length;
    return countSlots(run, 'solution') === PETALS && flowered >= 3 && run.edges.some((edge) => edge.kind === 'marks');
  }
});
