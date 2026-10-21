// packages/problem-solver/tools/kanban.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const KANBAN_COLUMNS = Object.freeze(['todo', 'doing', 'review', 'done']);

/** Board column for a Tasks hub status (the hub has no review status). */
export function columnForStatus(status) {
  if (status === 'in_progress') return 'doing';
  if (status === 'done' || status === 'dead') return 'done';
  return 'todo';
}

/** The work-in-progress limit, or null when not set. */
export function wipLimit(run) {
  const node = run.nodes.find((item) => item.slot === 'wip');
  const match = node && /\b([1-9]|1\d|20)\b/.exec(node.text);
  return match ? Number(match[1]) : null;
}

export const kanban = Object.freeze({
  id: 'kanban',
  name: 'Kanban',
  kind: 'plan',
  step: 'implement',
  when: 'Several tasks moving through stages, where seeing everything at once and limiting how much is in progress keeps work flowing.',
  failureModes: [
    'Cards too big to finish, such as "sort the rota".',
    'Cards with no owner or due date.',
    'Too much in Doing at once, so nothing finishes.',
    'A board set up once and never updated.'
  ],
  steps: [
    { id: 'columns', title: 'Set up the stages', prompt: 'Work moves from To do through Doing (with a Review stop) to Done.' },
    { id: 'cards', title: 'Add the tasks', prompt: 'One specific task per card, small enough to finish, with a due date where it matters.' },
    { id: 'wip', title: 'Limit work in progress', prompt: 'Decide how many cards can be in Doing at once.' },
    { id: 'update', title: 'Keep it current', prompt: 'Cards that are real tasks move by themselves as you work on them in Tasks.' }
  ],
  slots: { card: 'One specific task, small enough to finish', wip: 'How many cards may be in Doing at once (a whole number)' },
  nodeTags: { card: KANBAN_COLUMNS },
  taskSlots: { card: (node) => node.tag !== 'done' },
  validateNode(run, node) {
    if (node.slot !== 'wip') return null;
    return wipLimit({ nodes: [{ slot: 'wip', text: node.text }] }) ? null : 'Give the limit as a whole number from 1 to 20.';
  },
  edgeKinds: [],
  nextSlots(run) {
    return open(nextIndexed(run, 'card', 20), hasSlot(run, 'wip') ? null : 'wip');
  },
  complete(run) {
    return countSlots(run, 'card') >= 3;
  }
});
