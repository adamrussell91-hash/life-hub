// packages/get-things-done/quick.mjs
// Quick start as data: one stalled task, its first small and safe action, how it starts (a
// countdown cue, after The 5-Second Rule, or one protected interval, after The Pomodoro
// Technique; the person picks one and nothing runs a timer), the check-back point, then two
// closing questions. The route is Gear Shifter's own design, not the book's. A run's state is
// a path of entries, as Decision Maker's quick decision's is: the last entry is the box waiting
// for an answer. Shared by the server, the coach prompt and the chart. Our words throughout.

const node = (kind, label, next) => Object.freeze({ kind, label, next });

/** Kinds: `note` (a line of their own words), `choice` (one of START_WAYS), `check` (a date or a point in words) and `close`. */
export const START_NODES = Object.freeze({
  task: node('note', 'What needs to move?', 'action'),
  action: node('note', 'The first small, safe action', 'how'),
  how: node('choice', 'How it starts', 'cue'),
  cue: node('note', 'The cue or the interval', 'check'),
  check: node('check', 'When will you check back?', 'happened'),
  happened: node('close', 'What happened?', 'next'),
  next: node('close', 'What next?', null)
});

export const START_NODE_IDS = Object.freeze(Object.keys(START_NODES));

/** The two ways a start can go, and the technique each is after. */
export const START_WAYS = Object.freeze({
  countdown: Object.freeze({ label: 'Countdown cue', cue: 'The cue', line: 'Pick the moment, count down from five and move before you can argue.', after: 'gt_five_second_rule' }),
  interval: Object.freeze({ label: 'Protected interval', cue: 'The protected interval', line: 'One block of time with a start and an end, kept clear for this.', after: 'gt_pomodoro' })
});

const TEXT_MAX = 600;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (code, message) => Object.assign(new Error(message), { code });
const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, TEXT_MAX) : undefined);

/** @param {unknown} value */
export const isCheckDate = (value) => typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** @param {unknown} value */
export const isWay = (value) => typeof value === 'string' && Object.hasOwn(START_WAYS, value);

/**
 * @param {string} task the opening message, which names the stalled task
 * @param {string} at
 * @returns {import('../problem-solver/types').GtStartState}
 */
export function newStart(task, at) {
  return {
    path: [{ node: 'task', round: 1, at, note: clean(task) ?? '' }, { node: 'action', round: 1, at }],
    rounds: 1,
    finishedAt: null,
    escalatedTo: null,
    check: null
  };
}

/**
 * The entry waiting for an answer, or null once the run is finished.
 * @param {import('../problem-solver/types').GtStartState} state
 */
export function currentEntry(state) {
  return state.finishedAt ? null : state.path.at(-1) ?? null;
}

/** The task as first stated. */
export const taskOf = (state) => state.path.find((entry) => entry.node === 'task')?.note ?? '';

/** A box's answer in a round (the latest by default), or null. */
export function latestNote(state, id, round = state.rounds) {
  return state.path.filter((entry) => entry.node === id && entry.round === round && entry.note).at(-1)?.note ?? null;
}

/**
 * The way a round starts, or null before it is picked.
 * @returns {'countdown' | 'interval' | null}
 */
export function wayOf(state, round = state.rounds) {
  return state.path.find((entry) => entry.node === 'how' && entry.round === round && entry.answer)?.answer ?? null;
}

/** What the cue box asks: the cue or the interval once the way is picked. */
export function cueLabel(state, round = state.rounds) {
  const way = wayOf(state, round);
  return way ? START_WAYS[way].cue : START_NODES.cue.label;
}

/** The round's check-back point: a date (YYYY-MM-DD) or their words; null before it is set. */
export const checkPointOf = (state, round = state.rounds) => latestNote(state, 'check', round);

/**
 * Answer the current box and move on. `step` is { node, answer?, note? }:
 * - a note box and a closing box need `note`;
 * - how it starts needs `answer`: 'countdown' or 'interval';
 * - the check-back needs `note`: a date (YYYY-MM-DD), which sets the check card, or words.
 * Answering What next? finishes the run. Throws `stale_node` when `step.node` is not the
 * current box, `invalid_answer` otherwise.
 * @param {import('../problem-solver/types').GtStartState} state
 * @param {{ node: string, answer?: string, note?: string }} step
 * @param {string} at
 */
export function applyStep(state, step, at) {
  const current = currentEntry(state);
  if (!current || current.node !== step?.node) throw invalid('stale_node', 'That question has moved on.');
  const def = START_NODES[current.node];
  const note = clean(step.note);
  const path = state.path.slice(0, -1);
  let check = state.check;
  if (def.kind === 'choice') {
    if (!isWay(step.answer)) throw invalid('invalid_answer', 'Pick a countdown cue or a protected interval.');
    path.push({ ...current, answer: step.answer });
  } else {
    if (!note) throw invalid('invalid_answer', def.kind === 'check' ? 'Give the check-back a date (YYYY-MM-DD) or say when, in a few words.' : `${def.label} needs a few words.`);
    path.push({ ...current, note });
    if (def.kind === 'check') check = isCheckDate(note) ? { due: note, taskId: null, dismissed: false } : null;
  }
  if (!def.next) return { ...state, path, check, finishedAt: at };
  path.push({ node: def.next, round: state.rounds, at });
  return { ...state, path, check };
}

/**
 * "It came back": a finished run starts a new round at the first action, with the same task.
 * @param {import('../problem-solver/types').GtStartState} state
 * @param {string} at
 */
export function again(state, at) {
  if (!state.finishedAt) throw invalid('invalid_answer', 'This run is still going.');
  const rounds = state.rounds + 1;
  return { ...state, rounds, finishedAt: null, path: [...state.path, { node: 'action', round: rounds, at }] };
}

/**
 * What a full session starts from when a Quick start goes deeper: the need and a line of what
 * is known, as seeds the coach confirms with the person.
 * @param {import('../problem-solver/types').GtStartState} state
 * @returns {import('../problem-solver/types').GtStartSeeds}
 */
export function startSeeds(state) {
  const action = latestNote(state, 'action');
  const way = wayOf(state);
  const cue = latestNote(state, 'cue');
  const lines = [
    action && `First action: ${action}.`,
    way && `Started with a ${way === 'countdown' ? 'countdown cue' : 'protected interval'}${cue ? `: ${cue}` : ''}.`,
    checkPointOf(state) && `Check back: ${checkPointOf(state)}.`,
    latestNote(state, 'happened') && `What happened: ${latestNote(state, 'happened')}.`,
    state.rounds > 1 && `It came back ${state.rounds - 1} time${state.rounds > 2 ? 's' : ''}.`
  ].filter(Boolean);
  return { from: 'start', need: taskOf(state), known: lines.join(' ') || null, action, way, cue };
}
