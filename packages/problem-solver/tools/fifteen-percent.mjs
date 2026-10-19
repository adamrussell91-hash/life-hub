// packages/problem-solver/tools/fifteen-percent.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
const picked = (run) => new Set(run.edges.filter((edge) => edge.kind === 'picks').map((edge) => edge.to));

/** The action node a chosen note picks, or null. */
export function pickedAction(run, chosenId) {
  const to = run.edges.find((edge) => edge.kind === 'picks' && edge.from === chosenId)?.to;
  return run.nodes.find((node) => node.id === to) ?? null;
}

export const fifteenPercent = Object.freeze({
  id: 'fifteen_percent',
  name: '15% solutions',
  kind: 'plan',
  step: 'implement',
  when: 'Change feels too big or stuck waiting for others: find what you can do now, within your own discretion, with no new resources or permission, and start.',
  failureModes: [
    'Actions that need someone else\'s approval or new money, so they are not really yours.',
    'Picking the easiest action instead of the one with most effect.',
    'Choosing an action and setting no time to do it.'
  ],
  steps: [
    { id: 'reflect', title: 'What', prompt: 'Look at the problem and the plan so far: where do you have freedom to act?' },
    { id: 'what', title: 'Now', prompt: 'List the actions you could take now, on your own authority, with what you already have.' },
    { id: 'go', title: 'Go', prompt: 'Pick the action with most effect and do it now; it can become a task.' }
  ],
  slots: { reflect: 'Where you have freedom to act', action: 'Something you can do now, on your own authority', chosen: 'The action picked to do now, and when' },
  edgeKinds: ['picks'],
  requiredLinks: { chosen: { kind: 'picks', message: 'Link each chosen note to the action it picks (link kind "picks", from the note to the action).' } },
  taskSlots: { chosen: () => true },
  nextSlots(run) {
    if (!hasSlot(run, 'reflect')) return ['reflect'];
    const actions = countSlots(run, 'action');
    const unpicked = actions > picked(run).size;
    return open(nextIndexed(run, 'action', 8), actions >= 2 && unpicked ? nextIndexed(run, 'chosen', 8) : null);
  },
  canEdge(run, from, to, kind) {
    return kind === 'picks' && nameOf(run, from) === 'chosen' && nameOf(run, to) === 'action' && !run.edges.some((edge) => edge.kind === 'picks' && edge.from === from) && !picked(run).has(to);
  },
  complete(run) {
    return hasSlot(run, 'reflect') && countSlots(run, 'action') >= 2 && run.edges.some((edge) => edge.kind === 'picks');
  }
});
