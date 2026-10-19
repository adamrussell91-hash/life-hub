// netlify/functions/_shared/problem-solver/session.mjs
import { addEdge, applyScores, canEdge, canPlace, isComplete as isRunComplete, newRun, placeNode, toolDef } from '../../../../packages/problem-solver/machine.mjs';
import { defaultToolFor, firstStep, nextStepAfter, stepName } from '../../../../packages/problem-solver/steps.mjs';

const TITLE_MAX = 120;
const TEXT_MAX = 12000;
const LINKS_MAX = 20;
const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone'];

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function checkLength(text) {
  if (text.length > TEXT_MAX) throw fail(413, 'limit', 'That is too long; keep it under 12,000 characters.');
}

const touch = (session, deps) => ({ ...session, updatedAt: deps.now() });
const idle = () => ({ status: 'idle', mode: 'turn', error: null });
const emptyStep = () => ({ runs: [], status: 'open', objection: null });

function queue(session, mode = 'turn', leaving = null) {
  return { ...session, runner: { status: 'queued', mode, error: null, ...(leaving ? { leaving } : {}) } };
}

function userTurn(text, deps) {
  return { id: deps.newId(), role: 'user', text, createdAt: deps.now() };
}

/** The step the session is in, or null in frame and once finished. */
export function currentStep(session) {
  return session.steps?.[session.phase] ?? null;
}

export function activeRun(session) {
  return currentStep(session)?.runs.find((run) => run.status === 'active') ?? null;
}

/** Every run in step order, for summaries and the record. */
export function allRuns(session) {
  return Object.values(session.steps ?? {}).flatMap((step) => step.runs);
}

function withStep(session, id, patch) {
  return { ...session, steps: { ...session.steps, [id]: { ...(session.steps[id] ?? emptyStep()), ...patch } } };
}

function replaceRun(session, run) {
  const steps = Object.fromEntries(Object.entries(session.steps).map(([id, step]) => [id, { ...step, runs: step.runs.map((item) => (item.id === run.id ? run : item)) }]));
  return { ...session, steps };
}

export function createSession({ title = '', text, links = [] }, deps) {
  const at = deps.now();
  const clean = String(text ?? '').trim();
  if (!clean) throw fail(400, 'validation_error', 'Describe the problem to start.');
  checkLength(clean);
  return {
    id: deps.newId(),
    title: (String(title).trim() || clean).slice(0, TITLE_MAX),
    revision: 0,
    kind: 'full',
    status: 'active',
    phase: 'frame',
    frame: {},
    model: null,
    links: links.slice(0, LINKS_MAX).filter((link) => ['task', 'project', 'goal'].includes(link?.kind) && typeof link.id === 'string').map(({ kind, id }) => ({ kind, id })),
    steps: {},
    learnings: [],
    pendingLearning: null,
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
  if (!clean) throw fail(400, 'validation_error', 'Write something first.');
  checkLength(clean);
  return queue(touch({ ...session, turns: [...session.turns, userTurn(clean, deps)] }, deps));
}

/**
 * What comes after a finished tool. In Define: diagnostic, then problem statement,
 * then SMART, then the next step. In every other step: the next step.
 * Null while the active tool is short of its minimum.
 */
export function followOn(session) {
  const run = activeRun(session);
  if (!run || !isRunComplete(run)) return null;
  const def = toolDef(run.tool);
  if (def.step === 'define') {
    const ran = new Set(currentStep(session).runs.map((item) => item.tool));
    if (def.kind === 'diagnostic' && !ran.has('problem_statement')) {
      return { kind: 'next_tool', tool: 'problem_statement', reason: 'The causes are on the page; now pin the problem down in one statement.' };
    }
    if (def.kind !== 'objectives' && !ran.has('smart')) {
      return { kind: 'next_tool', tool: 'smart', reason: 'Turn the problem into a goal you can measure.' };
    }
  }
  return { kind: 'next_step', reason: 'This step has what it needs; move on when you are ready.' };
}

function frameComplete(frame) {
  return FRAME_KEYS.every((key) => Boolean(frame[key]));
}

const slotToId = (run, slot) => run.nodes.find((node) => node.slot === slot)?.id ?? null;

function placeAccepted(next, turn, coachTurnId, deps) {
  const run = activeRun(next);
  let placed = placeNode(run, { id: deps.newId(), slot: turn.node.slot, text: turn.node.text, title: turn.node.title, state: 'accepted', skills: turn.skillsSeen, turnId: coachTurnId });
  for (const edge of turn.edges) {
    const from = slotToId(placed, edge.from);
    const to = slotToId(placed, edge.to);
    if (canEdge(placed, from, to, edge.kind)) placed = addEdge(placed, { from, to, kind: edge.kind });
  }
  return { ...replaceRun(next, placed), pendingKeep: null };
}

/** The tool suggestion a new step opens with when the coach forgets to give one. */
function openingSuggestion(session) {
  if (!session.model || !currentStep(session) || activeRun(session)) return null;
  const tool = defaultToolFor(session.model.id, session.phase);
  return tool ? { kind: 'next_tool', tool, reason: `A good first tool for ${stepName(session.model.id, session.phase)}.` } : null;
}

/** Apply a validated coach turn. Throws `illegal_slot` so the coach can be asked to repair. */
export function applyCoachTurn(session, turn, deps) {
  const mode = session.runner?.mode ?? 'turn';
  let next = { ...session, runner: idle() };
  const coachTurn = { id: deps.newId(), role: 'coach', text: turn.message, verdict: turn.verdict, skillsSeen: turn.skillsSeen, skillsMissing: turn.skillsMissing, createdAt: deps.now() };

  // The learning question is one-shot: the first turn-mode coach turn after a boundary
  // records the answer (if any) and always clears it, so a step can never stall on it.
  if (mode !== 'boundary' && next.pendingLearning) {
    if (turn.learning) next = { ...next, learnings: [...next.learnings, { step: next.pendingLearning, text: turn.learning, at: deps.now() }] };
    next = { ...next, pendingLearning: null };
  }

  if (mode === 'boundary') {
    const leaving = session.runner.leaving;
    if (leaving && next.steps[leaving]) next = withStep(next, leaving, { objection: turn.exitObjection ?? next.steps[leaving].objection });
    next = { ...next, pendingLearning: leaving ?? null };
  } else if (next.phase === 'frame') {
    if (turn.verdict === 'accept' && turn.frame) next = { ...next, frame: { ...next.frame, ...turn.frame } };
    if (frameComplete(next.frame) && turn.model) {
      const first = firstStep(turn.model.id);
      next = { ...next, model: turn.model, phase: first, steps: { [first]: emptyStep() } };
    }
  } else if (currentStep(next)) {
    const run = activeRun(next);
    if (run && turn.node && turn.verdict === 'accept') {
      next = placeAccepted(next, turn, coachTurn.id, deps);
    } else if (run && turn.node && turn.verdict === 'challenge') {
      next = { ...next, pendingKeep: { slot: turn.node.slot, text: turn.node.text, title: turn.node.title, objection: turn.message, skills: turn.skillsSeen, runId: run.id } };
    }
  }

  // A boundary turn asks the learning question first, so it carries no suggestion.
  // Afterwards a finished tool, or a step with no tool open, always leaves a next step.
  const quiet = next.phase === 'finished' || mode === 'boundary';
  const suggestion = quiet ? null : (turn.suggestion ?? followOn(next) ?? (next.pendingLearning ? null : openingSuggestion(next)));
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

export function keepAnyway(session, deps) {
  const keep = session.pendingKeep;
  const run = activeRun(session);
  if (!keep || !run || run.id !== keep.runId) throw fail(409, 'action_not_allowed', 'Nothing to keep.');
  if (!canPlace(run, keep.slot)) throw fail(409, 'action_not_allowed', 'That answer no longer fits here.');
  const placed = placeNode(run, { id: deps.newId(), slot: keep.slot, text: keep.text, title: keep.title, state: 'contested', objection: keep.objection, skills: keep.skills, turnId: null });
  return touch({ ...replaceRun(session, placed), pendingKeep: null, turns: [...session.turns, userTurn('Keep it anyway.', deps)] }, deps);
}

/**
 * Leave the current step. Its active run closes as done; the step is `done` when any
 * kept run is complete, otherwise `skipped`. The next plan step opens (or the session
 * finishes) and a boundary coach turn is queued for the recap, any objection and the
 * "what did you learn about how you solve problems" question.
 */
export function moveOn(session, deps) {
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
  const step = currentStep(session);
  if (!session.model || !step) throw fail(409, 'action_not_allowed', 'Nothing to move on from yet.');
  const leaving = session.phase;
  const runs = step.runs.map((run) => (run.status === 'active' ? { ...run, status: 'done' } : run));
  const status = runs.some((run) => run.status !== 'switched' && isRunComplete(run)) ? 'done' : 'skipped';
  const nextId = nextStepAfter(session.model.id, leaving);
  let next = withStep({ ...session, suggestion: null, pendingKeep: null }, leaving, { runs, status });
  next = { ...next, turns: [...next.turns, userTurn(nextId ? 'Move on.' : 'That is everything.', deps)] };
  next = nextId ? withStep({ ...next, phase: nextId }, nextId, {}) : { ...next, phase: 'finished', status: 'finished' };
  return queue(touch(next, deps), 'boundary', leaving);
}

export function acceptSuggestion(session, deps) {
  const suggestion = session.suggestion;
  if (!suggestion) throw fail(409, 'action_not_allowed', 'No suggestion to accept.');
  if (suggestion.kind === 'next_step' || suggestion.kind === 'finish_define') return moveOn({ ...session, suggestion: null }, deps);
  if (!currentStep(session)) throw fail(409, 'action_not_allowed', 'There is no step open for that tool.');
  const current = activeRun(session);
  let next = { ...session, suggestion: null, pendingKeep: null };
  if (current) next = replaceRun(next, suggestion.kind === 'switch_tool' ? { ...current, status: 'switched', switchReason: suggestion.reason } : { ...current, status: 'done' });
  const step = currentStep(next);
  next = withStep(next, next.phase, { runs: [...step.runs, newRun(suggestion.tool, deps.newId())] });
  return queue(touch(next, deps));
}

export function dismissSuggestion(session, deps) {
  return touch({ ...session, suggestion: null }, deps);
}

/**
 * Score a run (radar, and later force field, decision matrix, Pareto). Uses `runId`
 * when given, else the active run. Allowed in any step and once finished (rescoring
 * tracks progress). The coach is not called.
 */
export function score(session, payload, deps) {
  if (!session.model || session.phase === 'frame') throw fail(409, 'action_not_allowed', 'Scoring opens once the problem is being worked on.');
  const { runId, ...scores } = payload ?? {};
  const run = runId ? allRuns(session).find((item) => item.id === runId) : activeRun(session);
  if (!run) throw fail(409, 'action_not_allowed', 'There is nothing to score.');
  try {
    return touch(replaceRun(session, applyScores(run, scores, deps.now())), deps);
  } catch (error) {
    if (error.code === 'invalid_scores') throw fail(400, 'validation_error', error.message);
    throw error;
  }
}

/** v1 action: score the latest Gap analysis (advanced) run. */
export function rescoreRadar(session, payload, deps) {
  const radars = allRuns(session).filter((run) => run.tool === 'gap_radar');
  const run = radars.find((item) => item.status === 'active') ?? radars.at(-1);
  return score(session, { ...payload, runId: run?.id ?? '__none__' }, deps);
}

export function rename(session, title, deps) {
  const clean = String(title ?? '').trim().slice(0, TITLE_MAX);
  if (!clean) throw fail(400, 'validation_error', 'Title required.');
  return touch({ ...session, title: clean }, deps);
}

export function archive(session, deps) {
  return touch({ ...session, status: 'archived', runner: idle() }, deps);
}

function skillCounts(turns) {
  const counts = {};
  for (const turn of turns) for (const id of turn.skillsSeen ?? []) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** Small list row. Index rows (no turns) pass through unchanged. */
export function summaryRow(session) {
  if (!Array.isArray(session.turns)) return session;
  const last = allRuns(session).at(-1);
  return {
    id: session.id,
    title: session.title,
    kind: session.kind ?? 'full',
    status: session.status,
    phase: session.phase,
    model: session.model?.id ?? null,
    tool: last?.tool ?? null,
    frame: FRAME_KEYS.filter((key) => Boolean(session.frame?.[key])).length,
    skills: skillCounts(session.turns),
    links: session.links,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}
