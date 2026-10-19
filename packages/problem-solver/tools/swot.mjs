// packages/problem-solver/tools/swot.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

export const QUADRANTS = Object.freeze(['strength', 'weakness', 'opportunity', 'threat']);
const PER_QUADRANT = 6;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** Quadrant items (nodes) for one option id, in placement order. */
export function quadrantsOf(run, optionId) {
  const out = Object.fromEntries(QUADRANTS.map((q) => [q, []]));
  for (const edge of run.edges) {
    if (edge.kind !== 'of' || edge.to !== optionId) continue;
    const node = run.nodes.find((item) => item.id === edge.from);
    const name = parseSlot(node?.slot)?.name;
    if (QUADRANTS.includes(name)) out[name].push(node);
  }
  return out;
}

const fullOption = (run) => run.nodes.some((node) => parseSlot(node.slot)?.name === 'option' && QUADRANTS.every((q) => quadrantsOf(run, node.id)[q].length > 0));

export const swot = withChoice({
  id: 'swot',
  name: 'SWOT analysis',
  kind: 'decision',
  step: 'decide',
  when: 'An option needs weighing against a goal: what it has going for it and against it inside your control, and what helps or threatens it from outside. One grid per option.',
  failureModes: [
    'Internal and external mixed up: a strength that is really an outside opportunity.',
    'Long lists with no judgement about which items matter.',
    'Stopping at the grid without asking what to do about it.'
  ],
  steps: [
    { id: 'goal', title: 'State the goal', prompt: 'Say what the option has to achieve.' },
    { id: 'option', title: 'Name the option', prompt: 'Pick the option to examine; each option gets its own grid.' },
    { id: 'internal', title: 'Strengths and weaknesses', prompt: 'Inside your control: what helps this option succeed, and what holds it back that you could improve.' },
    { id: 'external', title: 'Opportunities and threats', prompt: 'Outside your control: what could help it, and what could put it at risk.' },
    { id: 'synthesis', title: 'Draw it together', prompt: 'Ask how to build on the strengths and openings, how to shrink the weaknesses and threats, how strengths can counter threats, and how weaknesses might become openings.' }
  ],
  slots: {
    goal: 'What the option has to achieve',
    option: 'An option being examined',
    strength: 'A help inside your control',
    weakness: 'A limitation inside your control that could be improved',
    opportunity: 'An outside factor that could help',
    threat: 'An outside factor that puts it at risk',
    synthesis: 'What to do: build on, shrink, counter and convert'
  },
  edgeKinds: ['of'],
  requiredLinks: Object.fromEntries(QUADRANTS.map((q) => [q, { kind: 'of', message: `Link each ${q} to the option it belongs to (link kind "of", from the ${q} to the option).` }])),
  nextSlots(run) {
    if (!hasSlot(run, 'goal')) return ['goal'];
    if (!hasSlot(run, 'option')) return ['option:1'];
    if (hasSlot(run, 'synthesis')) return [];
    return open(nextIndexed(run, 'option', 4), ...QUADRANTS.map((q) => nextIndexed(run, q, 24)), fullOption(run) ? 'synthesis' : null);
  },
  canEdge(run, from, to, kind) {
    const name = nameOf(run, from);
    return kind === 'of' && QUADRANTS.includes(name) && nameOf(run, to) === 'option' && !run.edges.some((edge) => edge.kind === 'of' && edge.from === from) && quadrantsOf(run, to)[name].length < PER_QUADRANT;
  },
  complete(run) {
    return hasSlot(run, 'synthesis') && fullOption(run) && countSlots(run, 'goal') === 1;
  }
});
