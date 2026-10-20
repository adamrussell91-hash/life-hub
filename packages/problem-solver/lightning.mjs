// packages/problem-solver/lightning.mjs
// Lightning problem solving as data: the flowchart graph (toolkit pp.158–159, labels in our
// words) and its pure transitions. A run's state is a path of entries; the last entry is the
// node waiting for an answer. Shared by the server, the coach prompt and the chart.

const node = (kind, label, links = {}) => Object.freeze({ kind, label, ...links });

/**
 * Kinds: `check` (black), `choice` (white, a yes/no question), `strategy` (white), `end`
 * (black circle), `close` (added after the book's chart: the p.157 questions).
 */
export const LIGHTNING_NODES = Object.freeze({
  start: node('check', 'Could you accept things as they are?', { yes: 'relax', no: 'goal' }),
  goal: node('check', 'Define the goal', { next: 'subtract' }),
  subtract: node('choice', 'Could taking something away solve it?', { yes: 'via_negativa', no: 'one_step' }),
  one_step: node('choice', 'Could one step solve it?', { yes: 'guess_check', no: 'diagram' }),
  via_negativa: node('strategy', 'Take something away', { next: 'solved_1' }),
  guess_check: node('strategy', 'Guess and check', { next: 'solved_1' }),
  diagram: node('strategy', 'Draw a diagram', { next: 'solved_1' }),
  solved_1: node('check', 'Is it solved?', { yes: 'relax', no: 'work_backwards' }),
  work_backwards: node('strategy', 'Work backwards', { next: 'solved_2' }),
  solved_2: node('check', 'Is it solved?', { yes: 'relax', no: 'make_list' }),
  make_list: node('strategy', 'Make a list', { next: 'solved_3' }),
  solved_3: node('check', 'Is it solved?', { yes: 'relax', no: 'take_break' }),
  take_break: node('strategy', 'Take a break', { next: 'solved_4' }),
  solved_4: node('check', 'Is it solved?', { yes: 'relax', no: 'analogy' }),
  analogy: node('strategy', 'Find an analogy', { next: 'solved_5' }),
  solved_5: node('check', 'Is it solved?', { yes: 'relax', no: 'reframing' }),
  reframing: node('choice', 'Can the constraints, the problem or the resources change?', { yes: 'goal', no: 'cannot' }),
  cannot: node('strategy', 'Not solvable as things stand: try another problem, or take a walk', { next: 'learn' }),
  relax: node('end', 'Relax', { next: 'learn' }),
  learn: node('close', 'What can I learn?', { next: 'next' }),
  next: node('close', 'What next?', { next: null })
});

export const LIGHTNING_NODE_IDS = Object.freeze(Object.keys(LIGHTNING_NODES));

/** The four questions the strip across the top lights as a run goes. */
export const LIGHTNING_QUESTIONS = Object.freeze([
  { id: 'fix', label: 'Can I fix this?' },
  { id: 'do', label: 'What can I do?' },
  { id: 'learn', label: 'What can I learn?' },
  { id: 'next', label: 'What next?' }
]);

export function questionOf(id) {
  if (id === 'start') return 'fix';
  if (id === 'learn' || id === 'next') return id;
  return 'do';
}

/** True when the node is answered yes or no. */
export const isQuestion = (id) => Boolean(LIGHTNING_NODES[id]?.yes);

/** Every edge of the graph, for the chart: { from, to, label: 'yes' | 'no' | null }. */
export const LIGHTNING_EDGES = Object.freeze(LIGHTNING_NODE_IDS.flatMap((from) => {
  const def = LIGHTNING_NODES[from];
  return def.yes ? [{ from, to: def.yes, label: 'yes' }, { from, to: def.no, label: 'no' }] : def.next ? [{ from, to: def.next, label: null }] : [];
}));

const invalid = (code, message) => Object.assign(new Error(message), { code });

export function newLightning(at) {
  return { path: [{ node: 'start', round: 1, at }], rounds: 1, finishedAt: null, escalatedTo: null };
}

/** The entry waiting for an answer, or null once the run is finished. */
export function currentEntry(state) {
  return state.finishedAt ? null : state.path.at(-1) ?? null;
}

/**
 * Answer the current node and move on. `step` is { node, answer?, note? }:
 * - a yes/no node needs `answer`;
 * - a strategy whose next box asks "Is it solved?" may carry that answer too, so one reply
 *   can say what was tried and whether it worked;
 * - Relax passes straight on to "What can I learn?"; answering "What next?" finishes the run.
 * Throws `stale_node` when `step.node` is not the current node, `invalid_answer` otherwise.
 */
export function applyStep(state, step, at) {
  const current = currentEntry(state);
  if (!current || current.node !== step?.node) throw invalid('stale_node', 'That question has moved on.');
  const def = LIGHTNING_NODES[current.node];
  const note = typeof step.note === 'string' && step.note.trim() ? step.note.trim().slice(0, 600) : undefined;
  const answer = step.answer === 'yes' || step.answer === 'no' ? step.answer : undefined;
  const round = state.rounds;
  const path = state.path.slice(0, -1);
  let target;
  if (def.yes) {
    if (!answer) throw invalid('invalid_answer', `${def.label} needs a yes or no.`);
    path.push({ ...current, answer, ...(note ? { note } : {}) });
    target = def[answer];
  } else if (def.kind === 'strategy' && answer && isQuestion(def.next)) {
    path.push({ ...current, ...(note ? { note } : {}) });
    path.push({ node: def.next, round, at, answer });
    target = LIGHTNING_NODES[def.next][answer];
  } else {
    path.push({ ...current, ...(note ? { note } : {}) });
    target = def.next;
  }
  if (target === 'relax') {
    path.push({ node: 'relax', round, at });
    target = LIGHTNING_NODES.relax.next;
  }
  if (!target) return { ...state, path, finishedAt: at };
  path.push({ node: target, round, at });
  return { ...state, path };
}

/** "It came back": a finished run starts a new round from the start. */
export function again(state, at) {
  if (!state.finishedAt) throw invalid('invalid_answer', 'This run is still going.');
  const rounds = state.rounds + 1;
  return { ...state, rounds, finishedAt: null, path: [...state.path, { node: 'start', round: rounds, at }] };
}

/** How many times the current round has defined the goal (more than 1 means a reframing loop). */
export function passes(state) {
  return state.path.filter((entry) => entry.round === state.rounds && entry.node === 'goal').length;
}

/** Strategies tried in every round with what was tried and whether it worked, in order. The one waiting now is not tried yet. */
export function strategiesTried(state) {
  const out = [];
  const waiting = currentEntry(state);
  state.path.forEach((entry, i) => {
    const def = LIGHTNING_NODES[entry.node];
    if (def.kind !== 'strategy' || entry.node === 'cannot' || entry === waiting) return;
    const after = state.path[i + 1];
    const outcome = after && isQuestion(after.node) && after.answer ? (after.answer === 'yes' ? 'solved' : 'not solved') : null;
    out.push({ node: entry.node, label: def.label, note: entry.note ?? null, outcome, round: entry.round });
  });
  return out;
}

/** What a full session starts from when a Lightning run is escalated (the coach confirms each). */
export function escalationSeeds(state) {
  const goal = state.path.filter((entry) => entry.node === 'goal' && entry.note).at(-1)?.note ?? null;
  const tried = strategiesTried(state);
  const whatIsTrue = tried.length
    ? tried.map((t) => `Tried ${t.label.toLowerCase()}${t.note ? ` (${t.note})` : ''}: ${t.outcome ?? 'no result yet'}.`).join(' ')
    : null;
  return { goal, whatIsTrue, tried };
}
