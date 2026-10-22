// packages/decision-book/quick.mjs
// Quick decision as data: the Yes/No rule (three tests set before any is answered; any no means
// do not proceed), then on three yeses the Stop Rule (a trigger and the action it forces), an
// optional check date, and two closing questions. A run's state is a path of entries, as a
// Lightning run's is: the last entry is the box waiting for an answer. Shared by the server,
// the coach prompt and the chart. Our words throughout.

const node = (kind, label, links = {}) => Object.freeze({ kind, label, ...links });

/**
 * Kinds: `note` (a line of their own words), `tests` (the three tests, set together), `test`
 * (a yes/no box), `end` (passed straight through), `check` (a date, or no) and `close`.
 */
export const QUICK_NODES = Object.freeze({
  decision: node('note', 'What are you deciding?', { next: 'tests' }),
  tests: node('tests', 'Set three yes/no tests', { next: 'test_one' }),
  test_one: node('test', 'First test', { yes: 'test_two', no: 'stop' }),
  test_two: node('test', 'Second test', { yes: 'test_three', no: 'stop' }),
  test_three: node('test', 'Third test', { yes: 'proceed', no: 'stop' }),
  proceed: node('end', 'Proceed', { next: 'trigger' }),
  stop: node('end', 'Do not proceed', { next: 'learn' }),
  trigger: node('note', 'If this happens', { next: 'action' }),
  action: node('note', 'Then I will do this', { next: 'check' }),
  check: node('check', 'When will you check how it went?', { next: 'learn' }),
  learn: node('close', 'What did I learn?', { next: 'next' }),
  next: node('close', 'What next?', { next: null })
});

export const QUICK_NODE_IDS = Object.freeze(Object.keys(QUICK_NODES));
export const TEST_IDS = Object.freeze(['test_one', 'test_two', 'test_three']);

/** Tests close to the book's, offered when the person has none of their own. */
export const SUGGESTED_TESTS = Object.freeze(['Do I want it?', 'Can I do it?', 'Is it worth it?']);

const TEXT_MAX = 600;
const TEST_MAX = 120;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (code, message) => Object.assign(new Error(message), { code });
const clean = (value, max = TEXT_MAX) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** @param {string} id */
export const isTest = (id) => QUICK_NODES[id]?.kind === 'test';

/** @param {unknown} value */
export const isCheckDate = (value) => typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/**
 * @param {string} decision the opening message, which states the decision
 * @param {string} at
 * @returns {import('../problem-solver/types').DmQuickState}
 */
export function newQuick(decision, at) {
  return {
    path: [{ node: 'decision', round: 1, at, note: clean(decision) ?? '' }, { node: 'tests', round: 1, at }],
    rounds: 1,
    finishedAt: null,
    escalatedTo: null,
    check: null
  };
}

/**
 * The entry waiting for an answer, or null once the run is finished.
 * @param {import('../problem-solver/types').DmQuickState} state
 */
export function currentEntry(state) {
  return state.finishedAt ? null : state.path.at(-1) ?? null;
}

/** The decision as first stated. */
export const decisionOf = (state) => state.path.find((entry) => entry.node === 'decision')?.note ?? '';

/**
 * The tests of a round (the latest by default), or null before they are set.
 * @returns {string[] | null}
 */
export function testsOf(state, round = state.rounds) {
  return state.path.find((entry) => entry.node === 'tests' && entry.round === round && entry.tests)?.tests ?? null;
}

/** What a test box asks: its test once set, else its label. */
export function testLabel(state, id, round = state.rounds) {
  return testsOf(state, round)?.[TEST_IDS.indexOf(id)] ?? QUICK_NODES[id].label;
}

/** A round's answers in test order: 'yes', 'no', or null for a test not reached. */
export function answersOf(state, round = state.rounds) {
  return TEST_IDS.map((id) => state.path.find((entry) => entry.node === id && entry.round === round)?.answer ?? null);
}

/**
 * How a round came out: 'proceed' on three yeses, 'stop' on any no, null while it is open.
 * @returns {'proceed' | 'stop' | null}
 */
export function outcomeOf(state, round = state.rounds) {
  const end = state.path.find((entry) => entry.round === round && (entry.node === 'proceed' || entry.node === 'stop'));
  return end ? end.node : null;
}

const latestNote = (state, id) => state.path.filter((entry) => entry.node === id && entry.note).at(-1)?.note ?? null;

/** The latest Stop Rule, or null before a trigger is set. */
export function stopRuleOf(state) {
  const trigger = latestNote(state, 'trigger');
  return trigger ? { trigger, action: latestNote(state, 'action') } : null;
}

/**
 * Answer the current box and move on. `step` is { node, answer?, note?, tests? }:
 * - the tests box needs `tests`: three questions, each answerable yes or no;
 * - a test needs `answer`; the trigger and the action need `note`;
 * - the check box takes a date (YYYY-MM-DD) as `note`, or `answer: 'no'` for no check;
 * - Proceed and Do not proceed pass straight on; answering "What next?" finishes the run.
 * Throws `stale_node` when `step.node` is not the current box, `invalid_answer` otherwise.
 * @param {import('../problem-solver/types').DmQuickState} state
 * @param {{ node: string, answer?: string, note?: string, tests?: string[] }} step
 * @param {string} at
 */
export function applyStep(state, step, at) {
  const current = currentEntry(state);
  if (!current || current.node !== step?.node) throw invalid('stale_node', 'That question has moved on.');
  const def = QUICK_NODES[current.node];
  const note = clean(step.note);
  const answer = step.answer === 'yes' || step.answer === 'no' ? step.answer : undefined;
  const round = state.rounds;
  const path = state.path.slice(0, -1);
  let check = state.check;
  let target;
  if (def.kind === 'tests') {
    const tests = Array.isArray(step.tests) ? step.tests.map((test) => clean(test, TEST_MAX)).filter(Boolean) : [];
    if (tests.length !== 3) throw invalid('invalid_answer', 'Set three tests, each answerable yes or no.');
    path.push({ ...current, tests });
    target = def.next;
  } else if (def.kind === 'test') {
    if (!answer) throw invalid('invalid_answer', `${testLabel(state, current.node)} needs a yes or no.`);
    path.push({ ...current, answer, ...(note ? { note } : {}) });
    target = def[answer];
  } else if (def.kind === 'check') {
    if (answer === 'no') path.push({ ...current, answer });
    else if (isCheckDate(note)) {
      path.push({ ...current, note });
      check = { due: note, taskId: null, dismissed: false };
    } else throw invalid('invalid_answer', 'Give the check a date (YYYY-MM-DD), or say no check.');
    target = def.next;
  } else {
    if (def.kind === 'note' && !note) throw invalid('invalid_answer', `${def.label} needs a few words.`);
    path.push({ ...current, ...(note ? { note } : {}) });
    target = def.next;
  }
  if (QUICK_NODES[target]?.kind === 'end') {
    path.push({ node: target, round, at });
    target = QUICK_NODES[target].next;
  }
  if (!target) return { ...state, path, check, finishedAt: at };
  path.push({ node: target, round, at });
  return { ...state, path, check };
}

/**
 * "It came back": a finished run starts a new round at the tests, with the same decision.
 * @param {import('../problem-solver/types').DmQuickState} state
 * @param {string} at
 */
export function again(state, at) {
  if (!state.finishedAt) throw invalid('invalid_answer', 'This run is still going.');
  const rounds = state.rounds + 1;
  return { ...state, rounds, finishedAt: null, path: [...state.path, { node: 'tests', round: rounds, at }] };
}

/**
 * What a full decision starts from when a quick run goes deeper: the decision, the tests with
 * their answers and any Stop Rule, as seeds the coach confirms with the person.
 * @param {import('../problem-solver/types').DmQuickState} state
 * @returns {import('../problem-solver/types').DmQuickSeeds}
 */
export function quickSeeds(state) {
  const tests = (testsOf(state) ?? []).map((test, i) => ({ test, answer: answersOf(state)[i] }));
  const rule = stopRuleOf(state);
  const lines = [
    tests.length ? `Yes/No tests: ${tests.map((t) => `${t.test} ${t.answer ?? 'not answered'}`).join('; ')}.` : '',
    rule ? `Stop Rule: if ${rule.trigger}, then ${rule.action ?? 'no action agreed yet'}.` : ''
  ].filter(Boolean);
  return { from: 'quick', decision: decisionOf(state), known: lines.join(' ') || null, tests, stopRule: rule };
}
