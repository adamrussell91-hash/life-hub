// netlify/functions/_shared/problem-solver/quick-session.mjs
// Quick decisions: a Decision Maker session of kind 'quick' whose state is the Yes/No flow. The
// coach walks it one box at a time; the person can also answer a test on the chart. Going deeper
// creates a full decision seeded from the run (the coach confirms each seed). Shaped like
// lightning-session.mjs.
import { again, applyStep, currentEntry, decisionOf, isTest, newQuick, quickSeeds } from '../../../../packages/decision-book/quick.mjs';
import { createSession } from './session.mjs';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const touch = (session, deps) => ({ ...session, updatedAt: deps.now() });
const idle = () => ({ status: 'idle', mode: 'turn', error: null });
const queue = (session) => ({ ...session, runner: { status: 'queued', mode: 'turn', error: null } });
const userTurn = (text, deps) => ({ id: deps.newId(), role: 'user', text, createdAt: deps.now() });

export function createQuickSession({ title = '', text, links = [] }, deps) {
  const base = createSession({ title, text, links }, deps);
  return { ...base, kind: 'quick', phase: 'quick', quick: newQuick(base.turns[0].text, deps.now()) };
}

const isQuick = (session) => session.kind === 'quick' && session.quick;

function finish(session, state) {
  return state.finishedAt ? { ...session, quick: state, status: 'finished', suggestion: null } : { ...session, quick: state, status: 'active' };
}

/**
 * The coach's turn on a quick run. Its `quick` step (if any) answers the current box; a step for
 * a box that has moved on, or one that does not hold, is dropped and the turn kept. An `escalate`
 * suggestion (Go deeper) is kept until the run finishes or goes deeper.
 */
export function applyQuickTurn(session, turn, deps) {
  let next = { ...session, runner: idle() };
  const coachTurn = { id: deps.newId(), role: 'coach', text: turn.message, verdict: turn.verdict, skillsSeen: turn.skillsSeen, skillsMissing: turn.skillsMissing, createdAt: deps.now() };
  if (turn.quick && next.status === 'active') {
    try {
      next = finish(next, applyStep(next.quick, turn.quick, deps.now()));
    } catch (error) {
      if (!['stale_node', 'invalid_answer'].includes(error.code)) throw error;
    }
  }
  const open = next.status === 'active' && !next.quick.escalatedTo;
  const suggestion = open && turn.suggestion?.kind === 'escalate' ? { kind: 'escalate', reason: turn.suggestion.reason ?? '' } : open && next.suggestion?.kind === 'escalate' ? next.suggestion : null;
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

/** The person answered a test on the chart. A test that has moved on is a 409 (refetch). */
export function quickAnswer(session, payload, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  if (session.status !== 'active') throw fail(409, 'action_not_allowed', 'This run is finished.');
  const current = currentEntry(session.quick);
  if (!current || current.node !== payload?.node) throw fail(409, 'conflict', 'That question has moved on. Reloaded the latest.');
  if (!isTest(current.node) || !['yes', 'no'].includes(payload?.answer)) throw fail(400, 'validation_error', 'Answer yes or no.');
  const state = applyStep(session.quick, { node: current.node, answer: payload.answer }, deps.now());
  const next = finish({ ...session, turns: [...session.turns, userTurn(payload.answer === 'yes' ? 'Yes.' : 'No.', deps)] }, state);
  return queue(touch(next, deps));
}

/** "It came back": a finished run that did not go deeper starts a new round at the tests. */
export function quickAgain(session, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.quick.escalatedTo) throw fail(409, 'action_not_allowed', 'This run went to a full decision.');
  if (!session.quick.finishedAt) throw fail(409, 'action_not_allowed', 'This run is still going.');
  const state = again(session.quick, deps.now());
  return queue(touch({ ...session, status: 'active', quick: state, suggestion: null, turns: [...session.turns, userTurn('It came back.', deps)] }, deps));
}

/** The check card: the task made for the check date (`taskId`), or set aside (`dismissed`). */
export function quickCheck(session, payload, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  const check = session.quick.check;
  if (!check) throw fail(409, 'action_not_allowed', 'No check date is set.');
  if (check.taskId) throw fail(409, 'action_not_allowed', 'The check task is already made.');
  const taskId = typeof payload?.taskId === 'string' && payload.taskId.trim() ? payload.taskId.trim().slice(0, 200) : null;
  if (!taskId && payload?.dismissed !== true) throw fail(400, 'validation_error', 'A check task id, or dismissed.');
  return touch({ ...session, quick: { ...session.quick, check: taskId ? { ...check, taskId, dismissed: false } : { ...check, dismissed: true } } }, deps);
}

/**
 * Go deeper: a full decision (id `fullId`) seeded from the run, and the run marked as gone deeper
 * and finished. Returns both; the service writes the full decision first. Refused once it has
 * gone deeper (a replay with the same request id is handled by the service).
 */
export function escalateQuick(session, fullId, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.quick.escalatedTo) throw fail(409, 'action_not_allowed', 'This run already went to a full decision.');
  const text = decisionOf(session.quick) || session.title;
  const full = { ...createSession({ title: session.title, text, links: session.links, kind: 'decision' }, deps), id: fullId, escalatedFrom: session.id, frameSeeds: quickSeeds(session.quick) };
  const at = deps.now();
  const quick = touch({
    ...session,
    status: 'finished',
    suggestion: null,
    runner: idle(),
    quick: { ...session.quick, escalatedTo: fullId, finishedAt: session.quick.finishedAt ?? at },
    turns: [...session.turns, userTurn('Go deeper.', deps)]
  }, deps);
  return { full, quick };
}
