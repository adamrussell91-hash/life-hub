// netlify/functions/_shared/thinking-threads/thread.mjs
// A thread: one situation moving through the thinking tools and protocols (spec section 1).
// Pure functions over the thread value; the store (store.mjs) bumps `revision` on each write.
// Every function returns a new thread and stamps `updatedAt`; bad input throws an Error with
// `status` and `code`, the same shape the Problem Solver service throws.
import { randomUUID } from 'node:crypto';

export const THREAD_STATUSES = Object.freeze(['open', 'resting', 'closed']);
export const SESSION_KINDS = Object.freeze(['tool', 'protocol']);
export const SESSION_ROLES = Object.freeze(['home', 'detour', 'handed_on']);
export const SESSION_STATES = Object.freeze(['open', 'running', 'returned', 'failed', 'removed']);
export const LANDINGS = Object.freeze(['answer', 'note', 'dismissed']);
export const ROUTE_OUTCOMES = Object.freeze(['taken', 'not_now', 'shown']);
export const JOINTS = Object.freeze(['framed', 'step_done', 'before_commit', 'returned', 'resumed', 'recorded', 'asked']);

const TITLE_MAX = 120;
const TEXT_MAX = 12000;
const QUESTION_MAX = 400;
const ROUTE_KEPT = 200;
const SESSIONS_MAX = 40;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const stamp = (thread, now) => ({ ...thread, updatedAt: now });
const text = (value, max) => String(value ?? '').trim().slice(0, max);

/** A title drafted from the situation: its first sentence, cut to a readable length. */
export function draftTitle(situation) {
  const first = String(situation ?? '').trim().split(/(?<=[.!?])\s|\n/)[0] ?? '';
  const clean = first.replace(/[.!?]+$/, '').trim();
  if (clean.length <= 80) return clean;
  return `${clean.slice(0, 77).replace(/\s+\S*$/, '')}…`;
}

export const emptyDigest = () => ({ facts: [], choices: [], restsOn: [], openQuestions: [] });

function newSession({ kind, tool, sessionId, role, from = null, question = null, questions = null }, now) {
  if (!SESSION_KINDS.includes(kind)) throw fail(400, 'validation_error', `Unknown session kind: ${kind}`);
  if (typeof tool !== 'string' || !tool) throw fail(400, 'validation_error', 'A session needs its tool.');
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 200) throw fail(400, 'validation_error', 'A session id is required.');
  if (!SESSION_ROLES.includes(role) || role === 'handed_on') throw fail(400, 'validation_error', 'A session joins as home or detour.');
  const cleanFrom = from && typeof from === 'object' && typeof from.sessionId === 'string'
    ? { sessionId: from.sessionId, stepId: typeof from.stepId === 'string' ? from.stepId : null }
    : null;
  if (role === 'detour' && !cleanFrom) throw fail(400, 'validation_error', 'A detour says which session it left from.');
  return {
    kind,
    tool,
    sessionId,
    role,
    from: role === 'detour' ? cleanFrom : null,
    question: question == null ? null : text(question, QUESTION_MAX) || null,
    ...(questions ? { questions } : {}),
    state: 'open',
    packet: null,
    landing: null,
    addedAt: now
  };
}

/** A new thread. `homeSession` ({ kind, tool, sessionId }) joins as its home. */
export function createThread({ situation, title, homeSession = null, now }) {
  const clean = text(situation, TEXT_MAX);
  if (!clean) throw fail(400, 'validation_error', 'Describe the situation to start.');
  const thread = {
    id: randomUUID(),
    revision: 0,
    createdAt: now,
    updatedAt: now,
    title: text(title, TITLE_MAX) || draftTitle(clean) || 'Untitled thread',
    situation: clean,
    status: 'open',
    restUntil: null,
    digest: emptyDigest(),
    sessions: [],
    route: [],
    links: [],
    lastCheckAt: null
  };
  return homeSession ? addSession(thread, { ...homeSession, role: 'home', now }) : thread;
}

const findSession = (thread, sessionId) => {
  const session = thread.sessions.find((s) => s.sessionId === sessionId);
  if (!session) throw fail(404, 'not_found', 'That session is not in this thread.');
  return session;
};
const withSession = (thread, sessionId, patch) => ({ ...thread, sessions: thread.sessions.map((s) => (s.sessionId === sessionId ? { ...s, ...patch } : s)) });

/**
 * Add a session. The same session id again is a no-op. A detour leaves from a home session
 * only: one level, never a detour of a detour. `questions` ({ chapterId, questionIds }) is
 * kept for a Thought Starter detour.
 */
export function addSession(thread, { kind, tool, sessionId, role, from = null, question = null, questions = null, now }) {
  if (thread.sessions.some((s) => s.sessionId === sessionId)) return thread;
  if (thread.sessions.length >= SESSIONS_MAX) throw fail(413, 'limit', 'This thread has reached its session limit.');
  const session = newSession({ kind, tool, sessionId, role, from, question, questions }, now);
  if (role === 'detour') {
    const origin = thread.sessions.find((s) => s.sessionId === session.from.sessionId);
    if (!origin) throw fail(400, 'validation_error', 'A detour leaves from a session in this thread.');
    if (origin.role !== 'home') throw fail(409, 'action_not_allowed', 'A detour cannot start its own detour.');
  }
  return stamp({ ...thread, sessions: [...thread.sessions, session] }, now);
}

export function setSessionState(thread, sessionId, state, now) {
  if (!SESSION_STATES.includes(state)) throw fail(400, 'validation_error', `Unknown session state: ${state}`);
  const session = findSession(thread, sessionId);
  if (session.state === state) return thread;
  return stamp(withSession(thread, sessionId, { state }), now);
}

/** A packet came back: the session is `returned`, its landing waits for the person. */
export function landPacket(thread, sessionId, packet, now) {
  findSession(thread, sessionId);
  if (!packet || typeof packet !== 'object') throw fail(400, 'validation_error', 'A packet is required.');
  return stamp(withSession(thread, sessionId, { state: 'returned', packet, landing: null, returnedAt: now }), now);
}

/** What the person did with a returned packet in the home step. */
export function setLanding(thread, sessionId, landing, now) {
  if (!LANDINGS.includes(landing)) throw fail(400, 'validation_error', `Unknown landing: ${landing}`);
  const session = findSession(thread, sessionId);
  if (session.state !== 'returned') throw fail(409, 'action_not_allowed', 'Nothing has come back from that session yet.');
  if (session.landing === landing) return thread;
  return stamp(withSession(thread, sessionId, { landing }), now);
}

/** Make a detour the home tool: the detour becomes home, the old home is handed on. */
export function handOver(thread, detourSessionId, now) {
  const detour = findSession(thread, detourSessionId);
  if (detour.role === 'home') return thread;
  if (detour.role !== 'detour') throw fail(409, 'action_not_allowed', 'Only a detour can become the home tool.');
  const sessions = thread.sessions.map((s) => {
    if (s.sessionId === detourSessionId) return { ...s, role: 'home', from: null, handedFrom: detour.from };
    if (s.role === 'home') return { ...s, role: 'handed_on' };
    return s;
  });
  return stamp({ ...thread, sessions }, now);
}

/** Log a suggestion and what became of it. `stepId` and `sessionId` say where it was made. */
export function recordRoute(thread, { joint, optionId, reason = null, outcome, stepId = null, sessionId = null, now }) {
  if (!JOINTS.includes(joint)) throw fail(400, 'validation_error', `Unknown joint: ${joint}`);
  if (!ROUTE_OUTCOMES.includes(outcome)) throw fail(400, 'validation_error', `Unknown outcome: ${outcome}`);
  if (typeof optionId !== 'string' || !optionId) throw fail(400, 'validation_error', 'A route names its option.');
  const entry = { at: now, joint, optionId, reason: reason == null ? null : text(reason, 400), outcome, stepId: stepId ?? null, sessionId: sessionId ?? null };
  return stamp({ ...thread, route: [...thread.route, entry].slice(-ROUTE_KEPT), lastCheckAt: now }, now);
}

/** Title, status and rest date. Resting needs a date; leaving rest clears it. */
export function patchThread(thread, { title, status, restUntil } = {}, now) {
  let next = { ...thread };
  if (title !== undefined) {
    const clean = text(title, TITLE_MAX);
    if (!clean) throw fail(400, 'validation_error', 'Title required.');
    next.title = clean;
  }
  if (status !== undefined) {
    if (!THREAD_STATUSES.includes(status)) throw fail(400, 'validation_error', `Unknown status: ${status}`);
    next.status = status;
  }
  if (restUntil !== undefined) {
    if (restUntil !== null && !DATE_RE.test(String(restUntil))) throw fail(400, 'validation_error', 'Rest until a date (YYYY-MM-DD).');
    next.restUntil = restUntil;
  }
  if (next.status === 'resting' && !next.restUntil) throw fail(400, 'validation_error', 'Resting needs a date to come back.');
  if (next.status !== 'resting') next.restUntil = null;
  return stamp(next, now);
}

/** Replace the digest (the guide rewrites it after a return). Arrays of short strings only. */
export function setDigest(thread, digest, now) {
  const list = (value) => (Array.isArray(value) ? value.map((item) => text(item, 300)).filter(Boolean).slice(0, 12) : []);
  return stamp({ ...thread, digest: { facts: list(digest?.facts), choices: list(digest?.choices), restsOn: list(digest?.restsOn), openQuestions: list(digest?.openQuestions) } }, now);
}

/** Shown in thread lists: more than one session, or any detour. */
export function isListed(thread) {
  const sessions = thread?.sessions ?? [];
  return sessions.length > 1 || sessions.some((s) => s.role === 'detour');
}

/** True when the person said Not now to this option at this step. */
export function wasDeclined(thread, { optionId, fromStepId = null }) {
  return (thread?.route ?? []).some((r) => r.outcome === 'not_now' && r.optionId === optionId && (r.stepId ?? null) === (fromStepId ?? null));
}

/** The home session, or null. */
export const homeOf = (thread) => thread?.sessions?.find((s) => s.role === 'home') ?? null;

/** The thread session for a tool session id, or null. */
export const sessionOf = (thread, sessionId) => thread?.sessions?.find((s) => s.sessionId === sessionId) ?? null;
