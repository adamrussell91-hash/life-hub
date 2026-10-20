// netlify/functions/_shared/problem-solver/session.mjs
import { acceptProblem, addEdge, applyScores, canEdge, canPlace, canPropose, isComplete as isRunComplete, newRun, placeNode, toolDef } from '../../../../packages/problem-solver/machine.mjs';
import { defaultToolFor, firstStep, nextPhase, planStep, planStepForBook, stepName } from '../../../../packages/problem-solver/steps.mjs';
import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { isDate } from './coach-schema.mjs';
import { cleanOverdue, reviewLive, reviewStart, SNAPSHOT_STATUSES, waitingForReview } from '../../../../packages/problem-solver/review.mjs';

export { waitingForReview };

const TITLE_MAX = 120;
const TEXT_MAX = 12000;
const LINKS_MAX = 20;
const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone'];
const PROPOSALS_MAX = 40;
const REVIEW_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

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

const reviewTitle = (session) => `Review: ${session.title}`.slice(0, TITLE_MAX);
const addDays = (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
/** A coach date counts only when it is after today; a date in the past cannot be a plan. */
const afterToday = (due, deps) => typeof due === 'string' && due > deps.now().slice(0, 10);
const inBook = (session, stepId, book) => Boolean(session.model && planStep(session.model.id, stepId)?.book.includes(book));

/** A clean snapshot, or null when none was sent. Unknown statuses are dropped; removed tasks are never counted. */
function cleanSnapshot(raw, deps) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw fail(400, 'validation_error', 'A task snapshot must be an object.');
  const count = (value) => (Number.isInteger(value) && value >= 0 ? Math.min(value, 500) : 0);
  return {
    at: deps.now(),
    byStatus: Object.fromEntries(SNAPSHOT_STATUSES.map((key) => [key, count(raw.byStatus?.[key])])),
    overdue: cleanOverdue(raw.overdue)
  };
}

const sameSnapshot = (a, b) => Boolean(a && b) && JSON.stringify([a.byStatus, a.overdue]) === JSON.stringify([b.byStatus, b.overdue]);

/** Add the coach's proposals for placed nodes the tool lets become tasks, once per node. */
function addProposals(session, items, deps) {
  const run = activeRun(session);
  if (!run || !items?.length) return session;
  let list = session.proposedTasks ?? [];
  for (const item of items) {
    const node = run.nodes.find((n) => n.slot === item.slot);
    if (!node || !canPropose(run, node)) continue;
    // One live proposal per node. A node whose task was deleted in Tasks is never proposed again.
    if (list.some((p) => p.source.nodeId === node.id && (p.status !== 'dismissed' || p.removed))) continue;
    if (list.length >= PROPOSALS_MAX) break;
    list = [...list, { id: deps.newId(), title: item.title.slice(0, TITLE_MAX), status: 'proposed', due: afterToday(item.due, deps) ? item.due : null, source: { runId: run.id, nodeId: node.id } }];
  }
  return { ...session, proposedTasks: list };
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
    proposedTasks: [],
    reviewProposal: null,
    reviewTaskId: null,
    reviewState: null,
    taskSnapshot: null,
    detour: null,
    caseFile: null,
    caseFileDeclined: null,
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

/** Add the links the tool allows between nodes already placed. */
function addAllowedEdges(run, edges) {
  let placed = run;
  for (const edge of edges) {
    const from = slotToId(placed, edge.from);
    const to = slotToId(placed, edge.to);
    if (canEdge(placed, from, to, edge.kind)) placed = addEdge(placed, { from, to, kind: edge.kind });
  }
  return placed;
}

function placeAccepted(next, turn, coachTurnId, deps) {
  const run = activeRun(next);
  let placed = placeNode(run, { id: deps.newId(), slot: turn.node.slot, text: turn.node.text, title: turn.node.title, ...(turn.node.tag ? { tag: turn.node.tag } : {}), state: 'accepted', skills: turn.skillsSeen, turnId: coachTurnId });
  for (const edge of turn.edges) {
    const from = slotToId(placed, edge.from);
    const to = slotToId(placed, edge.to);
    if (canEdge(placed, from, to, edge.kind)) placed = addEdge(placed, { from, to, kind: edge.kind });
  }
  return { ...replaceRun(next, placed), pendingKeep: null };
}

/** The tool suggestion a new step opens with when the coach forgets to give one. */
function openingSuggestion(session) {
  if (session.dismissedOpening === session.phase || waitingForReview(session)) return null;
  if (!session.model || !currentStep(session) || activeRun(session)) return null;
  const tool = defaultToolFor(session.model.id, session.phase);
  return tool ? { kind: 'next_tool', tool, reason: `A good first tool for ${stepName(session.model.id, session.phase)}.` } : null;
}

/** A step left without any tool run: there is nothing to have learned from it. */
export function skippedUntouched(step) {
  return Boolean(step) && (step.status === 'skipped' || step.status === 'waiting') && step.runs.length === 0;
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
    // A step that is only waiting for its review is not objected to.
    if (leaving && next.steps[leaving] && next.steps[leaving].status !== 'waiting') next = withStep(next, leaving, { objection: turn.exitObjection ?? next.steps[leaving].objection });
    next = { ...next, pendingLearning: leaving && !skippedUntouched(next.steps[leaving]) ? leaving : null };
  } else if (next.phase === 'frame') {
    if (turn.verdict === 'accept' && turn.frame) next = { ...next, frame: { ...next.frame, ...turn.frame } };
    if (frameComplete(next.frame) && turn.model) {
      const first = firstStep(turn.model.id);
      next = { ...next, model: turn.model, phase: first, steps: { [first]: emptyStep() } };
    }
  } else if (currentStep(next)) {
    const run = activeRun(next);
    if (run && turn.node && turn.verdict === 'accept') {
      // A node the tool refuses to accept (a name breaking a strict rule) is not placed; the turn stays.
      if (!acceptProblem(run, turn.node)) next = placeAccepted(next, turn, coachTurn.id, deps);
    } else if (run && !turn.node && turn.verdict === 'accept' && turn.edges?.length) {
      next = replaceRun(next, addAllowedEdges(run, turn.edges));
    } else if (run && turn.node && turn.verdict === 'challenge') {
      next = { ...next, pendingKeep: { slot: turn.node.slot, text: turn.node.text, title: turn.node.title, tag: turn.node.tag, edges: turn.edges ?? [], objection: turn.message, skills: turn.skillsSeen, runId: run.id } };
    }
  }

  if (mode !== 'boundary' && currentStep(next)) {
    next = addProposals(next, turn.proposeTasks, deps);
    // A review the person set aside stays aside; a date that is not after today is no review.
    const reviewOpen = !next.reviewTaskId && next.reviewProposal?.status !== 'dismissed';
    if (turn.proposeReview && reviewOpen && afterToday(turn.proposeReview.due, deps) && inBook(next, next.phase, 'implement')) {
      next = { ...next, reviewProposal: { title: reviewTitle(next), due: turn.proposeReview.due, reason: turn.proposeReview.reason, status: 'proposed' } };
    }
  }

  // A boundary turn asks the learning question first, so it carries no suggestion.
  // Afterwards a finished tool, or a step with no tool open, always leaves a next step.
  const quiet = next.phase === 'finished' || mode === 'boundary' || waitingForReview(next);
  const suggestion = quiet ? null : (turn.suggestion ?? followOn(next) ?? (next.pendingLearning ? null : openingSuggestion(next)));
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

export function keepAnyway(session, deps) {
  const keep = session.pendingKeep;
  const run = activeRun(session);
  if (!keep || !run || run.id !== keep.runId) throw fail(409, 'action_not_allowed', 'Nothing to keep.');
  if (!canPlace(run, keep.slot)) throw fail(409, 'action_not_allowed', 'That answer no longer fits here.');
  const refused = acceptProblem(run, keep);
  if (refused) throw fail(409, 'action_not_allowed', refused);
  let placed = placeNode(run, { id: deps.newId(), slot: keep.slot, text: keep.text, title: keep.title, ...(keep.tag ? { tag: keep.tag } : {}), state: 'contested', objection: keep.objection, skills: keep.skills, turnId: null });
  for (const edge of keep.edges ?? []) {
    const from = slotToId(placed, edge.from);
    const to = slotToId(placed, edge.to);
    if (canEdge(placed, from, to, edge.kind)) placed = addEdge(placed, { from, to, kind: edge.kind });
  }
  return touch({ ...replaceRun(session, placed), pendingKeep: null, turns: [...session.turns, userTurn('Keep it anyway.', deps)] }, deps);
}

/**
 * Leave the current step. Its active run closes as done; the step is `done` when any
 * kept run is complete, otherwise `skipped`. The next plan step opens (or the session
 * finishes) and a boundary coach turn is queued for the recap, any objection and the
 * "what did you learn about how you solve problems" question.
 */
export function moveOn(session, deps, options = {}) {
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
  const step = currentStep(session);
  if (!session.model || !step) throw fail(409, 'action_not_allowed', 'Nothing to move on from yet.');
  const leaving = session.phase;
  const runs = step.runs.map((run) => (run.status === 'active' ? { ...run, status: 'done' } : run));
  const kept = runs.some((run) => run.status !== 'switched' && isRunComplete(run));
  const status = kept ? 'done' : waitingForReview(session) ? 'waiting' : 'skipped';
  const nextId = nextPhase(session);
  let next = withStep({ ...session, suggestion: null, pendingKeep: null }, leaving, { runs, status });
  if (inBook(session, leaving, 'implement') && status === 'done' && !session.reviewTaskId && !session.reviewProposal) {
    next = { ...next, reviewProposal: { title: reviewTitle(session), due: addDays(deps.now(), REVIEW_AFTER_DAYS), reason: 'A first look at how the plan is going.', status: 'proposed' } };
  }
  // Back from a reopened step: the detour is over.
  if (session.detour?.to === leaving) next = { ...next, detour: null };
  // Leaving the review: done. Leaving Implement for Improve with a review in place: wait for it.
  if (session.reviewState?.status === 'reviewing' && inBook(session, leaving, 'improve')) {
    next = { ...next, reviewState: { ...session.reviewState, status: 'done' } };
  } else if (nextId && inBook(session, leaving, 'implement') && inBook(session, nextId, 'improve') && reviewLive(next)) {
    const due = next.reviewProposal?.due ?? null;
    next = { ...next, reviewState: options.review ? { status: 'reviewing', due, returnTo: null, startedAt: deps.now() } : { status: 'waiting', due, returnTo: null, startedAt: null } };
  }
  next = { ...next, turns: [...next.turns, userTurn(nextId ? 'Move on.' : 'That is everything.', deps)] };
  next = nextId ? withStep({ ...next, phase: nextId }, nextId, { status: 'open' }) : { ...next, phase: 'finished', status: 'finished' };
  return queue(touch(next, deps), 'boundary', leaving);
}

/**
 * Start Improve's review on real results. From the step before Improve it leaves that step
 * straight into the review. In Improve it starts now. Past Improve (a later step, or
 * finished) it reopens Improve for a new pass and returns afterwards. Idempotent once reviewing.
 */
export function startReview(session, payload, deps) {
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
  const improve = session.model ? planStepForBook(session.model.id, 'improve') : null;
  if (!improve) throw fail(409, 'action_not_allowed', 'This problem has no Improve step.');
  if (session.reviewState?.status === 'reviewing' && session.phase === improve) return session;
  if (session.reviewState?.status === 'done') throw fail(409, 'action_not_allowed', 'This review is already done.');
  if (!reviewLive(session)) throw fail(409, 'action_not_allowed', 'There is no review to start.');
  if (session.detour) throw fail(409, 'action_not_allowed', 'Finish the reopened step first.');
  const snap = cleanSnapshot(payload?.snapshot, deps);
  const kind = reviewStart(session);
  if (!kind) throw fail(409, 'action_not_allowed', 'The review opens once Implement is done.');
  let next = snap ? { ...session, taskSnapshot: snap } : session;
  if (kind === 'move') return moveOn(next, deps, { review: true });
  // A late review deliberately leaves the interrupted step's active run alone so it resumes on return
  // (unlike reopenStep, which closes Improve's run because the detour starts fresh work elsewhere).
  const due = session.reviewProposal?.due ?? null;
  const returnTo = kind === 'reopen' ? session.phase : null;
  next = { ...next, status: 'active', phase: improve, suggestion: null, pendingKeep: null, reviewState: { status: 'reviewing', due, returnTo, startedAt: deps.now() } };
  next = withStep(next, improve, { status: 'open' });
  const text = returnTo ? 'Time to review how it went.' : 'Let\'s review how it went.';
  return queue(touch({ ...next, turns: [...next.turns, userTurn(text, deps)] }, deps));
}

/** The page's latest snapshot of the problem's tasks. No coach call; an unchanged snapshot is a no-op. */
export function taskStatus(session, payload, deps) {
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
  if (!session.model) throw fail(409, 'action_not_allowed', 'There are no tasks yet.');
  if (payload?.snapshot == null) throw fail(400, 'validation_error', 'A task snapshot is required.');
  const snap = cleanSnapshot(payload.snapshot, deps);
  return sameSnapshot(snap, session.taskSnapshot) ? session : touch({ ...session, taskSnapshot: snap }, deps);
}

/** Why `book` cannot be reopened now, or null when it can. Read by the coach parser and the accept. */
export function reopenProblem(session, book) {
  if (!session.model || !inBook(session, session.phase, 'improve')) return 'Reopen only from Improve.';
  if (session.detour) return 'A step is already reopened.';
  if (waitingForReview(session)) return 'Improve is waiting for the review; do not reopen now.';
  const target = planStepForBook(session.model.id, book);
  if (!target || !session.steps[target]) return `There is no ${book} step in this problem to reopen.`;
  const named = currentStep(session).runs.some((run) => run.tool === 'double_loop' && run.status !== 'switched' && run.nodes.some((node) => parseSlot(node.slot)?.name === 'governing'));
  return named ? null : 'Reopen only after double-loop learning has named a governing assumption.';
}

function reopenStep(session, suggestion, deps) {
  const problem = reopenProblem(session, suggestion.step);
  if (problem) throw fail(409, 'action_not_allowed', problem);
  const from = session.phase;
  const target = planStepForBook(session.model.id, suggestion.step);
  const runs = currentStep(session).runs.map((run) => (run.status === 'active' ? { ...run, status: 'done' } : run));
  let next = withStep({ ...session, suggestion: null, pendingKeep: null }, from, { runs });
  next = withStep({ ...next, phase: target, detour: { from, to: target, reason: suggestion.reason, at: deps.now() } }, target, { status: 'open' });
  return queue(touch({ ...next, turns: [...next.turns, userTurn(`Reopen ${stepName(session.model.id, target)}.`, deps)] }, deps));
}

export function acceptSuggestion(session, deps) {
  const suggestion = session.suggestion;
  if (!suggestion) throw fail(409, 'action_not_allowed', 'No suggestion to accept.');
  if (suggestion.kind === 'reopen_step') return reopenStep({ ...session, suggestion: null }, suggestion, deps);
  if (suggestion.kind === 'next_step' || suggestion.kind === 'finish_define') return moveOn({ ...session, suggestion: null }, deps);
  if (!currentStep(session)) throw fail(409, 'action_not_allowed', 'There is no step open for that tool.');
  const current = activeRun(session);
  let next = { ...session, suggestion: null, pendingKeep: null };
  if (current) next = replaceRun(next, suggestion.kind === 'switch_tool' ? { ...current, status: 'switched', switchReason: suggestion.reason } : { ...current, status: 'done' });
  // A run switched away from is no longer the plan: its open proposals are set aside (not removed).
  if (current && suggestion.kind === 'switch_tool' && next.proposedTasks?.length) {
    next = { ...next, proposedTasks: next.proposedTasks.map((p) => (p.source.runId === current.id && p.status === 'proposed' ? { ...p, status: 'dismissed' } : p)) };
  }
  const step = currentStep(next);
  next = withStep(next, next.phase, { runs: [...step.runs, newRun(suggestion.tool, deps.newId())] });
  return queue(touch(next, deps));
}

export function dismissSuggestion(session, deps) {
  const opening = session.suggestion?.kind === 'next_tool' && currentStep(session) && !activeRun(session);
  return touch({ ...session, suggestion: null, ...(opening ? { dismissedOpening: session.phase } : {}) }, deps);
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

const findProposal = (session, id) => {
  if (typeof id !== 'string' || !id) throw fail(400, 'validation_error', 'A proposal id is required.');
  const proposal = (session.proposedTasks ?? []).find((p) => p.id === id);
  if (!proposal) throw fail(404, 'not_found', 'That proposed task is gone.');
  return proposal;
};
const withProposal = (session, id, patch) => ({ ...session, proposedTasks: session.proposedTasks.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

/** The page created the task through the Tasks API; record its id. Same id again is a no-op. */
export function confirmTask(session, payload, deps) {
  const taskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';
  if (!taskId || taskId.length > 200) throw fail(400, 'validation_error', 'A task id is required.');
  const proposal = findProposal(session, payload.proposalId);
  if (proposal.status === 'confirmed' && proposal.taskId === taskId) return session;
  if (proposal.status !== 'proposed') throw fail(409, 'action_not_allowed', proposal.status === 'confirmed' ? 'That task is already created.' : 'That proposal was set aside.');
  return touch(withProposal(session, proposal.id, { status: 'confirmed', taskId }), deps);
}

/**
 * Set a proposal aside; a confirmed one only reverts when its task was deleted in Tasks.
 * Deleted tasks (Adam's decision): the Kanban card shows "Task removed", the proposal is
 * dismissed with `removed: true`, the coach is not told (it never appears in the prompt)
 * and the node is never proposed again.
 */
export function dismissTask(session, payload, deps) {
  const proposal = findProposal(session, payload?.proposalId);
  if (proposal.status === 'dismissed') return session;
  if (proposal.status === 'confirmed' && payload?.reason !== 'removed') throw fail(409, 'action_not_allowed', 'That task already exists; change it in Tasks.');
  return touch(withProposal(session, proposal.id, { status: 'dismissed', ...(proposal.status === 'confirmed' ? { removed: true } : {}) }), deps);
}

/** The page created the review task; record it with the date the person picked. */
export function setReviewTask(session, payload, deps) {
  const taskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';
  if (!taskId || taskId.length > 200) throw fail(400, 'validation_error', 'A task id is required.');
  if (session.reviewTaskId && session.reviewTaskId !== taskId) throw fail(409, 'action_not_allowed', 'This problem already has a review task.');
  if (session.reviewTaskId === taskId) return session;
  const due = isDate(payload?.due) ? payload.due : session.reviewProposal?.due ?? addDays(deps.now(), REVIEW_AFTER_DAYS);
  const proposal = session.reviewProposal ?? { title: reviewTitle(session), reason: '', due };
  const waiting = session.reviewState?.status === 'waiting' ? { reviewState: { ...session.reviewState, due } } : {};
  return touch({ ...session, ...waiting, reviewTaskId: taskId, reviewProposal: { ...proposal, due, status: 'confirmed' } }, deps);
}

export function dismissReview(session, deps) {
  if (!session.reviewProposal || session.reviewProposal.status !== 'proposed') throw fail(409, 'action_not_allowed', 'There is no review to set aside.');
  let next = { ...session, reviewProposal: { ...session.reviewProposal, status: 'dismissed' } };
  if (session.reviewState?.status === 'waiting') {
    next = { ...next, reviewState: null };
    if (currentStep(next) && inBook(next, next.phase, 'improve')) {
      if (!activeRun(next) && !next.pendingLearning) next = { ...next, suggestion: openingSuggestion(next) };
    } else if (session.model) {
      // Left Improve while it waited: the waiting status resolves now.
      const improve = planStepForBook(session.model.id, 'improve');
      const step = improve && next.steps[improve];
      if (step?.status === 'waiting') next = withStep(next, improve, { status: step.runs.some((run) => run.status !== 'switched' && isRunComplete(run)) ? 'done' : 'skipped' });
    }
  }
  return touch(next, deps);
}

const DIGEST_RE = /^[0-9a-f]{8}$/;
const SECTION_KEYS_MAX = 20;

function cleanTarget(raw) {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (!['task', 'project'].includes(raw?.kind) || !id || id.length > 200) throw fail(400, 'validation_error', 'A case file needs a task or project to go on.');
  return { kind: raw.kind, id };
}

function cleanDigests(raw) {
  const entries = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw) : [];
  if (!entries.length || entries.length > SECTION_KEYS_MAX || entries.some(([key, value]) => !/^[a-z_]{1,24}$/.test(key) || !DIGEST_RE.test(String(value)))) {
    throw fail(400, 'validation_error', 'The case file sections are not valid.');
  }
  return Object.fromEntries(entries);
}

const sameTarget = (a, b) => Boolean(a && b) && a.kind === b.kind && a.id === b.id;

/**
 * The page wrote the case file (or an update) to a task or project page; record it. No coach call.
 * A first write or a move (`moved`: the old page is gone) replaces the section digests; an update
 * merges them and must be the next version on the same page. The same version on the same page
 * again is a no-op, so a retry after a lost response is safe. The page joins the problem's links.
 */
export function linkCaseFile(session, payload, deps) {
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
  if (!session.model || !planStepForBook(session.model.id, 'document')) throw fail(409, 'action_not_allowed', 'This problem has no Document step.');
  const target = cleanTarget(payload?.target);
  const version = payload?.version;
  if (!Number.isInteger(version) || version < 1 || version > 999) throw fail(400, 'validation_error', 'A case file version is required.');
  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 260) : '';
  if (!title) throw fail(400, 'validation_error', 'A case file title is required.');
  const sections = cleanDigests(payload?.sections);
  const record = session.caseFile;
  if (record && record.version === version && sameTarget(record.target, target)) return session;
  const moved = payload?.moved === true;
  if (record && version !== record.version + 1) throw fail(409, 'action_not_allowed', `The next case file version is v${record.version + 1}.`);
  if (record && !moved && !sameTarget(record.target, target)) throw fail(409, 'action_not_allowed', 'An update goes on the page the case file is already on.');
  const at = deps.now();
  const caseFile = {
    title,
    version,
    target,
    writtenAt: at,
    sections: record && !moved ? { ...record.sections, ...sections } : sections,
    history: [...(record?.history ?? []), { version, at, target }]
  };
  const linked = session.links.some((link) => sameTarget(link, target));
  const links = linked || session.links.length >= LINKS_MAX ? session.links : [...session.links, target];
  return touch({ ...session, caseFile, caseFileDeclined: null, links }, deps);
}

/** Not now on the case-file card: hidden until its content changes again (`key` is the offer's). */
export function dismissCaseFile(session, payload, deps) {
  const key = typeof payload?.key === 'string' ? payload.key : '';
  if (!DIGEST_RE.test(key)) throw fail(400, 'validation_error', 'A case file key is required.');
  return session.caseFileDeclined === key ? session : touch({ ...session, caseFileDeclined: key }, deps);
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
    taskIds: (session.proposedTasks ?? []).filter((p) => p.status === 'confirmed').map((p) => p.taskId),
    reviewTaskId: session.reviewTaskId ?? null,
    reviewDue: session.reviewState?.status === 'waiting' ? session.reviewState.due : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}
