// netlify/functions/_shared/problem-solver/lightning-session.mjs
// Lightning runs: a session of kind 'lightning' whose state is the flowchart path. The coach
// walks it one node at a time; the person can also answer a yes/no box on the chart.
// Escalating creates a full session seeded from the run (the coach confirms each seed).
import { again, applyStep, currentEntry, escalationSeeds, LIGHTNING_NODES, newLightning } from '../../../../packages/problem-solver/lightning.mjs';
import { createSession } from './session.mjs';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const touch = (session, deps) => ({ ...session, updatedAt: deps.now() });
const idle = () => ({ status: 'idle', mode: 'turn', error: null });
const queue = (session) => ({ ...session, runner: { status: 'queued', mode: 'turn', error: null } });
const userTurn = (text, deps) => ({ id: deps.newId(), role: 'user', text, createdAt: deps.now() });

export function createLightningSession({ title = '', text, links = [] }, deps) {
  const base = createSession({ title, text, links }, deps);
  return { ...base, kind: 'lightning', phase: 'lightning', lightning: newLightning(deps.now()) };
}

const isLightning = (session) => session.kind === 'lightning' && session.lightning;

function finish(session, state, deps) {
  return state.finishedAt ? { ...session, lightning: state, status: 'finished', suggestion: null } : { ...session, lightning: state, status: 'active' };
}

/**
 * The coach's turn on a Lightning run. Its `lightning` step (if any) answers the current node;
 * a step for a node that has moved on is dropped, and the turn is kept. An `escalate`
 * suggestion is kept until the run finishes or is escalated.
 */
export function applyLightningTurn(session, turn, deps) {
  let next = { ...session, runner: idle() };
  const coachTurn = { id: deps.newId(), role: 'coach', text: turn.message, verdict: turn.verdict, skillsSeen: turn.skillsSeen, skillsMissing: turn.skillsMissing, createdAt: deps.now() };
  if (turn.lightning && next.status === 'active') {
    try {
      next = finish(next, applyStep(next.lightning, turn.lightning, deps.now()), deps);
    } catch (error) {
      if (!['stale_node', 'invalid_answer'].includes(error.code)) throw error;
    }
  }
  const open = next.status === 'active' && !next.lightning.escalatedTo;
  const suggestion = open && turn.suggestion?.kind === 'escalate' ? { kind: 'escalate', reason: turn.suggestion.reason ?? '' } : open && next.suggestion?.kind === 'escalate' ? next.suggestion : null;
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

/** The person answered a yes/no box on the chart. A box that has moved on is a 409 (refetch). */
export function lightningAnswer(session, payload, deps) {
  if (!isLightning(session)) throw fail(409, 'action_not_allowed', 'This is not a Lightning run.');
  if (session.status !== 'active') throw fail(409, 'action_not_allowed', 'This run is finished.');
  const current = currentEntry(session.lightning);
  if (!current || current.node !== payload?.node) throw fail(409, 'conflict', 'That question has moved on. Reloaded the latest.');
  if (!LIGHTNING_NODES[current.node].yes || !['yes', 'no'].includes(payload?.answer)) throw fail(400, 'validation_error', 'Answer yes or no.');
  const state = applyStep(session.lightning, { node: current.node, answer: payload.answer }, deps.now());
  const next = finish({ ...session, turns: [...session.turns, userTurn(payload.answer === 'yes' ? 'Yes.' : 'No.', deps)] }, state, deps);
  return queue(touch(next, deps));
}

/** "It came back": a finished, unescalated run starts a new round from the start. */
export function lightningAgain(session, deps) {
  if (!isLightning(session)) throw fail(409, 'action_not_allowed', 'This is not a Lightning run.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.lightning.escalatedTo) throw fail(409, 'action_not_allowed', 'This run went to the full process.');
  if (!session.lightning.finishedAt) throw fail(409, 'action_not_allowed', 'This run is still going.');
  const state = again(session.lightning, deps.now());
  return queue(touch({ ...session, status: 'active', lightning: state, suggestion: null, turns: [...session.turns, userTurn('It came back.', deps)] }, deps));
}

/**
 * Escalate: a full session (id `fullId`) seeded from the run, and the run marked as escalated
 * and finished. Returns both; the service writes the full session first. Refused when already
 * escalated: only a replay with the same request id returns the run (the service handles it);
 * a new request id on an escalated run gets 409.
 */
export function escalateLightning(session, fullId, deps) {
  if (!isLightning(session)) throw fail(409, 'action_not_allowed', 'This is not a Lightning run.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.lightning.escalatedTo) throw fail(409, 'action_not_allowed', 'This run already went to the full process.');
  const seeds = escalationSeeds(session.lightning);
  const snag = session.turns.find((t) => t.role === 'user')?.text ?? session.title;
  const full = { ...createSession({ title: session.title, text: snag, links: session.links }, deps), id: fullId, escalatedFrom: session.id, frameSeeds: seeds };
  const at = deps.now();
  const lightning = touch({
    ...session,
    status: 'finished',
    suggestion: null,
    runner: idle(),
    lightning: { ...session.lightning, escalatedTo: fullId, finishedAt: session.lightning.finishedAt ?? at },
    turns: [...session.turns, userTurn('Take this to the full process.', deps)]
  }, deps);
  return { full, lightning };
}
