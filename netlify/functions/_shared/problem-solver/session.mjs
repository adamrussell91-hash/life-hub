// netlify/functions/_shared/problem-solver/session.mjs
import { addEdge, isComplete as isRunComplete, newRun, placeNode } from '../../../../packages/problem-solver/machine.mjs';

const TITLE_MAX = 120;

function touch(session, deps) {
  return { ...session, updatedAt: deps.now() };
}

function queue(session, mode = 'turn') {
  return { ...session, runner: { status: 'queued', mode, error: null } };
}

function userTurn(text, deps) {
  return { id: deps.newId(), role: 'user', text, createdAt: deps.now() };
}

export function activeRun(session) {
  return session.define.runs.find((run) => run.status === 'active') ?? null;
}

function replaceRun(session, run) {
  return { ...session, define: { ...session.define, runs: session.define.runs.map((item) => (item.id === run.id ? run : item)) } };
}

export function createSession({ title = '', text, links = [] }, deps) {
  const at = deps.now();
  const clean = String(text ?? '').trim();
  if (!clean) throw Object.assign(new Error('Describe the problem to start.'), { status: 400, code: 'validation_error' });
  return {
    id: deps.newId(),
    title: (String(title).trim() || clean).slice(0, TITLE_MAX),
    revision: 0,
    status: 'active',
    phase: 'frame',
    frame: {},
    model: null,
    links: links.filter((link) => ['task', 'project', 'goal'].includes(link?.kind) && typeof link.id === 'string').map(({ kind, id }) => ({ kind, id })),
    define: { runs: [], finishedEarly: false, exitObjection: null },
    turns: [userTurn(clean, deps)],
    summary: '',
    suggestion: null,
    pendingKeep: null,
    requestIds: [],
    runner: { status: 'queued', mode: 'turn', error: null },
    createdAt: at,
    updatedAt: at
  };
}

export function say(session, text, deps) {
  const clean = String(text ?? '').trim();
  if (!clean) throw Object.assign(new Error('Write something first.'), { status: 400, code: 'validation_error' });
  return queue(touch({ ...session, turns: [...session.turns, userTurn(clean, deps)] }, deps));
}

function frameComplete(frame) {
  return Boolean(frame.goal && frame.whatIsTrue && frame.whatCanBeDone);
}

function slotToId(run, slot) {
  return run.nodes.find((node) => node.slot === slot)?.id ?? null;
}

/** Apply a validated coach turn. Throws `illegal_slot` so the coach can be asked to repair. */
export function applyCoachTurn(session, turn, deps) {
  let next = { ...session, runner: { status: 'idle', mode: 'turn', error: null } };
  const coachTurn = {
    id: deps.newId(),
    role: 'coach',
    text: turn.message,
    verdict: turn.verdict,
    skillsSeen: turn.skillsSeen,
    skillsMissing: turn.skillsMissing,
    createdAt: deps.now()
  };

  if (session.runner.mode === 'closing') {
    next = { ...next, define: { ...next.define, exitObjection: turn.exitObjection ?? next.define.exitObjection } };
  } else if (next.phase === 'frame') {
    if (turn.verdict === 'accept' && turn.frame) next = { ...next, frame: { ...next.frame, ...turn.frame } };
    if (frameComplete(next.frame) && turn.model) next = { ...next, model: turn.model, phase: 'define' };
  } else if (next.phase === 'define') {
    const run = activeRun(next);
    if (run && turn.node && turn.verdict === 'accept') {
      let placed = placeNode(run, {
        id: deps.newId(),
        slot: turn.node.slot,
        text: turn.node.text,
        state: 'accepted',
        skills: turn.skillsSeen,
        turnId: coachTurn.id
      });
      for (const edge of turn.edges) {
        placed = addEdge(placed, { from: slotToId(placed, edge.from), to: slotToId(placed, edge.to), kind: edge.kind });
      }
      next = { ...replaceRun(next, placed), pendingKeep: null };
    } else if (run && turn.node && turn.verdict === 'challenge') {
      next = { ...next, pendingKeep: { slot: turn.node.slot, text: turn.node.text, objection: turn.message, skills: turn.skillsSeen, runId: run.id } };
    }
  }

  return touch({
    ...next,
    turns: [...next.turns, coachTurn],
    suggestion: turn.suggestion ?? null,
    summary: turn.summary ?? next.summary
  }, deps);
}

export function keepAnyway(session, deps) {
  const keep = session.pendingKeep;
  const run = activeRun(session);
  if (!keep || !run || run.id !== keep.runId) throw Object.assign(new Error('Nothing to keep.'), { status: 409, code: 'action_not_allowed' });
  const placed = placeNode(run, { id: deps.newId(), slot: keep.slot, text: keep.text, state: 'contested', objection: keep.objection, skills: keep.skills, turnId: null });
  return touch({ ...replaceRun(session, placed), pendingKeep: null, turns: [...session.turns, userTurn('Keep it anyway.', deps)] }, deps);
}

export function acceptSuggestion(session, deps) {
  const suggestion = session.suggestion;
  if (!suggestion) throw Object.assign(new Error('No suggestion to accept.'), { status: 409, code: 'action_not_allowed' });
  if (suggestion.kind === 'finish_define') return finishDefine({ ...session, suggestion: null }, deps);
  const current = activeRun(session);
  let next = { ...session, suggestion: null, pendingKeep: null };
  if (current) {
    const closed = suggestion.kind === 'switch_tool'
      ? { ...current, status: 'switched', switchReason: suggestion.reason }
      : { ...current, status: 'done' };
    next = replaceRun(next, closed);
  }
  next = { ...next, phase: 'define', define: { ...next.define, runs: [...next.define.runs, newRun(suggestion.tool, deps.newId())] } };
  return queue(touch(next, deps));
}

export function dismissSuggestion(session, deps) {
  return touch({ ...session, suggestion: null }, deps);
}

export function finishDefine(session, deps) {
  const current = activeRun(session);
  const finishedEarly = !current || current.nodes.length === 0 || !isRunComplete(current);
  let next = { ...session, suggestion: null, pendingKeep: null, phase: 'defined', status: 'defined' };
  if (current) next = replaceRun(next, { ...current, status: 'done' });
  next = { ...next, define: { ...next.define, finishedEarly }, turns: [...next.turns, userTurn("I've defined it.", deps)] };
  return queue(touch(next, deps), 'closing');
}

export function rename(session, title, deps) {
  const clean = String(title ?? '').trim().slice(0, TITLE_MAX);
  if (!clean) throw Object.assign(new Error('Title required.'), { status: 400, code: 'validation_error' });
  return touch({ ...session, title: clean }, deps);
}

export function archive(session, deps) {
  return touch({ ...session, status: 'archived' }, deps);
}

/** Small list row. Index rows (no turns) pass through unchanged. */
export function summaryRow(session) {
  if (!Array.isArray(session.turns)) return session;
  const last = session.define.runs.at(-1);
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    phase: session.phase,
    model: session.model?.id ?? null,
    tool: last?.tool ?? null,
    links: session.links,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}
