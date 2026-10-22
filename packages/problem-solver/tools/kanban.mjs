// packages/problem-solver/tools/kanban.mjs
// Kanban, built by kanbanTool. The default build is Problem Solver's own tool. Options make the
// variants another book needs (Gear Shifter's: To do, Doing and Done with no Review stop, a
// suggested limit of three cards in progress, and effort, help and urgency on each card, which
// the person sets with the board's controls and which are never required).
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const KANBAN_COLUMNS = Object.freeze(['todo', 'doing', 'review', 'done']);

/** Card fields, each with its allowed values in order. */
export const CARD_FIELDS = Object.freeze({
  effort: Object.freeze(['small', 'medium', 'large']),
  help: Object.freeze(['alone', 'needs_help']),
  urgency: Object.freeze(['now', 'soon', 'later'])
});

/** The latest fields set on each card, by card node id. */
export function cardFieldsOf(run) {
  const out = {};
  for (const snap of run.scores?.snapshots ?? []) if (snap.card) out[snap.card] = { effort: snap.effort, help: snap.help, urgency: snap.urgency };
  return out;
}

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

const DEFAULTS = Object.freeze({
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
  slots: { card: 'One specific task, small enough to finish', wip: 'How many cards may be in Doing at once (a whole number)' }
});

/**
 * @param {object} [options] any of the default fields above, plus:
 * @param {string[]} [options.columns] the card tags, in board order (default KANBAN_COLUMNS)
 * @param {number} [options.suggestedWip] a limit the board suggests until one is set
 * @param {boolean} [options.cardFields] effort, help and urgency per card, through the scores
 */
export function kanbanTool(options = {}) {
  const def = { ...DEFAULTS, ...options };
  const columns = Object.freeze([...(options.columns ?? KANBAN_COLUMNS)]);
  if (!['todo', 'doing', 'done'].every((c) => columns.includes(c)) || columns.some((c) => !KANBAN_COLUMNS.includes(c))) throw new Error(`Kanban ${def.id}: columns must include todo, doing and done, and may add review`);
  const variant = def.id !== DEFAULTS.id;
  return Object.freeze({
    id: def.id,
    name: def.name,
    kind: def.kind,
    step: def.step,
    when: def.when,
    failureModes: def.failureModes,
    steps: def.steps,
    ...(def.exercise ? { exercise: def.exercise } : {}),
    ...(variant ? { variantOf: 'kanban' } : {}),
    ...(options.suggestedWip ? { suggestedWip: options.suggestedWip } : {}),
    slots: def.slots,
    nodeTags: { card: columns },
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
    },
    ...(options.cardFields ? {
      cardFields: CARD_FIELDS,
      pickScores(payload) {
        return { card: payload?.card, effort: payload?.effort, help: payload?.help, urgency: payload?.urgency };
      },
      validateScores(run, fields) {
        if (!run.nodes.some((node) => node.id === fields.card && node.slot.startsWith('card:'))) return 'Set fields on one of the cards.';
        for (const [name, values] of Object.entries(CARD_FIELDS)) if (!values.includes(fields[name])) return `${name} is ${values.slice(0, -1).join(', ')} or ${values.at(-1)}.`;
        return null;
      }
    } : {})
  });
}

export const kanban = kanbanTool();
