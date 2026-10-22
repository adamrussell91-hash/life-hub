// netlify/functions/_shared/problem-solver/start-session.mjs
// Quick start: a Gear Shifter session of kind 'start' whose state (under `start`) is the flow in
// packages/get-things-done/quick.mjs. The coach walks it one box at a time; the person can also
// pick how it starts on the chart. Going deeper creates a full shift session seeded from the run
// (the coach confirms each seed). Shaped like quick-session.mjs.
import { START_WAYS, again, applyStep, currentEntry, isWay, newStart, startSeeds, taskOf } from '../../../../packages/get-things-done/quick.mjs';
import { createSession } from './session.mjs';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const touch = (session, deps) => ({ ...session, updatedAt: deps.now() });
const idle = () => ({ status: 'idle', mode: 'turn', error: null });
const queue = (session) => ({ ...session, runner: { status: 'queued', mode: 'turn', error: null } });
const userTurn = (text, deps) => ({ id: deps.newId(), role: 'user', text, createdAt: deps.now() });

export function createStartSession({ title = '', text, links = [] }, deps) {
  const base = createSession({ title, text, links }, deps);
  return { ...base, kind: 'start', phase: 'start', start: newStart(base.turns[0].text, deps.now()) };
}

const isStart = (session) => session.kind === 'start' && session.start;

function finish(session, state) {
  return state.finishedAt ? { ...session, start: state, status: 'finished', suggestion: null } : { ...session, start: state, status: 'active' };
}

/**
 * The coach's turn on a Quick start. Its `quick` step (if any) answers the current box; a step
 * for a box that has moved on, or one that does not hold, is dropped and the turn kept. An
 * `escalate` suggestion (Go deeper) is kept until the run finishes or goes deeper.
 */
export function applyStartTurn(session, turn, deps) {
  let next = { ...session, runner: idle() };
  const coachTurn = { id: deps.newId(), role: 'coach', text: turn.message, verdict: turn.verdict, skillsSeen: turn.skillsSeen, skillsMissing: turn.skillsMissing, createdAt: deps.now() };
  if (turn.quick && next.status === 'active') {
    try {
      next = finish(next, applyStep(next.start, turn.quick, deps.now()));
    } catch (error) {
      if (!['stale_node', 'invalid_answer'].includes(error.code)) throw error;
    }
  }
  const open = next.status === 'active' && !next.start.escalatedTo;
  const suggestion = open && turn.suggestion?.kind === 'escalate' ? { kind: 'escalate', reason: turn.suggestion.reason ?? '' } : open && next.suggestion?.kind === 'escalate' ? next.suggestion : null;
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

/** The person picked how it starts on the chart. A box that has moved on is a 409 (refetch). */
export function startAnswer(session, payload, deps) {
  if (!isStart(session)) throw fail(409, 'action_not_allowed', 'This is not a Quick start.');
  if (session.status !== 'active') throw fail(409, 'action_not_allowed', 'This run is finished.');
  const current = currentEntry(session.start);
  if (!current || current.node !== payload?.node) throw fail(409, 'conflict', 'That question has moved on. Reloaded the latest.');
  if (current.node !== 'how' || !isWay(payload?.answer)) throw fail(400, 'validation_error', 'Pick a countdown cue or a protected interval.');
  const state = applyStep(session.start, { node: 'how', answer: payload.answer }, deps.now());
  return queue(touch({ ...session, start: state, turns: [...session.turns, userTurn(`${START_WAYS[payload.answer].label}.`, deps)] }, deps));
}

/** "It came back": a finished run that did not go deeper starts a new round at the first action. */
export function startAgain(session, deps) {
  if (!isStart(session)) throw fail(409, 'action_not_allowed', 'This is not a Quick start.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.start.escalatedTo) throw fail(409, 'action_not_allowed', 'This run went to a full session.');
  if (!session.start.finishedAt) throw fail(409, 'action_not_allowed', 'This run is still going.');
  const state = again(session.start, deps.now());
  return queue(touch({ ...session, status: 'active', start: state, suggestion: null, turns: [...session.turns, userTurn('It came back.', deps)] }, deps));
}

/** The check card: the task made for the check-back date (`taskId`), or set aside (`dismissed`). */
export function startCheck(session, payload, deps) {
  if (!isStart(session)) throw fail(409, 'action_not_allowed', 'This is not a Quick start.');
  const check = session.start.check;
  if (!check) throw fail(409, 'action_not_allowed', 'No check-back date is set.');
  if (check.taskId) throw fail(409, 'action_not_allowed', 'The check task is already made.');
  const taskId = typeof payload?.taskId === 'string' && payload.taskId.trim() ? payload.taskId.trim().slice(0, 200) : null;
  if (!taskId && payload?.dismissed !== true) throw fail(400, 'validation_error', 'A check task id, or dismissed.');
  return touch({ ...session, start: { ...session.start, check: taskId ? { ...check, taskId, dismissed: false } : { ...check, dismissed: true } } }, deps);
}

/**
 * Go deeper: a full shift session (id `fullId`) seeded from the run, and the run marked as gone
 * deeper and finished. Returns both; the service writes the full session first. Refused once it
 * has gone deeper (a replay with the same request id is handled by the service).
 */
export function escalateStart(session, fullId, deps) {
  if (!isStart(session)) throw fail(409, 'action_not_allowed', 'This is not a Quick start.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.start.escalatedTo) throw fail(409, 'action_not_allowed', 'This run already went to a full session.');
  const text = taskOf(session.start) || session.title;
  const full = { ...createSession({ title: session.title, text, links: session.links, kind: 'shift' }, deps), id: fullId, escalatedFrom: session.id, frameSeeds: startSeeds(session.start) };
  const at = deps.now();
  const run = touch({
    ...session,
    status: 'finished',
    suggestion: null,
    runner: idle(),
    start: { ...session.start, escalatedTo: fullId, finishedAt: session.start.finishedAt ?? at },
    turns: [...session.turns, userTurn('Go deeper.', deps)]
  }, deps);
  return { full, run };
}
