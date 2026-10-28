// packages/walkthrus/goal.mjs
// The WalkThru section of a professional goal: its shape, the one-active-technique rule, the
// piece the board shows for it and what "keep going" and "move on" write. Pure, so the server
// (goal-record.mjs) and the Professional hub read it the same way.
import { isTechniqueId, techniqueById } from './catalogue.mjs';
import { isProblemType } from './problem-types.mjs';

/** The ADAPT chain: attempt it, develop it, adapt it, practise it, test it. */
export const STAGES = Object.freeze(['attempt', 'develop', 'adapt', 'practise', 'test']);
export const ORIGIN_KINDS = Object.freeze(['pattern', 'manual']);
export const DECISIONS = Object.freeze(['keep', 'move_on']);
/** At most one technique is being worked on at a time. */
export const ACTIVE_CAP = 1;
/** A gain smaller than this, or on fewer students than this, does not count. */
export const GAIN_MIN = 0.05;
export const GAIN_MIN_N = 3;

const STEP_KEYS = ['1', '2', '3', '4', '5'];
const ISO_AT = /^\d{4}-\d{2}-\d{2}T/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}/;
const MAX_NOTE = 600;
const MAX_CYCLES = 40;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Where the class stood on the problem the goal came from: a class-level mean, never names. */
export function normalizeSnapshot(value) {
  if (!isObject(value)) return null;
  const mean = typeof value.mean === 'number' && Number.isFinite(value.mean) && value.mean >= 0 && value.mean <= 1 ? value.mean : null;
  const n = Number.isInteger(value.n) && value.n >= 0 ? Math.min(value.n, 1000) : null;
  const at = typeof value.at === 'string' && ISO_AT.test(value.at) ? value.at : null;
  if (mean === null || n === null || !at) return null;
  return {
    at,
    class_id: typeof value.class_id === 'string' && value.class_id ? value.class_id.slice(0, 120) : null,
    label: text(value.label, 80),
    mean,
    n
  };
}

function normalizeCycle(value) {
  if (!isObject(value)) return null;
  const started = typeof value.started === 'string' && DATE_KEY.test(value.started) ? value.started : null;
  if (!started) return null;
  return {
    started,
    ended: typeof value.ended === 'string' && DATE_KEY.test(value.ended) ? value.ended : null,
    decision: DECISIONS.includes(value.decision) ? value.decision : null,
    reps: Number.isInteger(value.reps) && value.reps >= 0 ? Math.min(value.reps, 500) : 0,
    evidence_before: normalizeSnapshot(value.evidence_before),
    evidence_after: normalizeSnapshot(value.evidence_after)
  };
}

function normalizeOrigin(value) {
  if (!isObject(value) || !ORIGIN_KINDS.includes(value.kind)) return { kind: 'manual' };
  const suggestion = typeof value.suggestion_id === 'string' && value.suggestion_id ? value.suggestion_id.slice(0, 120) : null;
  return suggestion ? { kind: value.kind, suggestion_id: suggestion } : { kind: value.kind };
}

/**
 * The goal's `walkthru` section, or null when it isn't one (unknown technique, not an object).
 * @param {any} value
 * @returns {any}
 */
export function normalizeWalkthru(value) {
  if (!isObject(value) || !isTechniqueId(value.technique_id)) return null;
  const entry = techniqueById(value.technique_id);
  const adaptedIn = isObject(value.adapted) ? value.adapted : {};
  const adapted = {};
  for (const key of STEP_KEYS) {
    const note = text(adaptedIn[key], MAX_NOTE);
    if (note) adapted[key] = note;
  }
  return {
    set: entry.set,
    technique_id: entry.id,
    stage: STAGES.includes(value.stage) ? value.stage : 'attempt',
    problem_type: isProblemType(value.problem_type) ? value.problem_type : null,
    adapted,
    cycles: (Array.isArray(value.cycles) ? value.cycles : []).map(normalizeCycle).filter(Boolean).slice(0, MAX_CYCLES),
    origin: normalizeOrigin(value.origin)
  };
}

/** Counts toward the one-active rule: a WalkThru goal that is still being worked on. */
export const isLiveWalkthruGoal = (goal) => isObject(goal) && Boolean(normalizeWalkthru(goal.walkthru)) && (goal.status ?? 'active') === 'active';

/**
 * The one-active rule, same shape as the lane cap in goal-hosting.ts but a cap of one.
 * @returns {{ code: string, message: string, status: number } | null}
 */
export function checkOneActive(goals, candidate) {
  if (!isLiveWalkthruGoal(candidate)) return null;
  const other = (Array.isArray(goals) ? goals : []).find((g) => isObject(g) && g.id !== candidate.id && isLiveWalkthruGoal(g));
  if (!other) return null;
  const name = techniqueById(normalizeWalkthru(other.walkthru).technique_id)?.name ?? 'another technique';
  return { code: 'walkthru_active', status: 409, message: `You’re already working on ${name}. Finish, park or drop it first.` };
}

/** The open cycle (not yet ended), if any. */
/** @param {any} wt @returns {any} */
export const openCycle = (wt) => [...(wt?.cycles ?? [])].reverse().find((c) => c.ended === null) ?? null;

/** Did the class gain on the problem it set out to fix? Needs a real gain on enough students. */
export function evidenceGain(before, after, { min = GAIN_MIN, minN = GAIN_MIN_N } = {}) {
  const b = normalizeSnapshot(before);
  const a = normalizeSnapshot(after);
  if (!b || !a || b.n < minN || a.n < minN) return { gain: false, change: null };
  const change = a.mean - b.mean;
  return { gain: change >= min, change };
}

/** Did the most recent finished or open cycle show a gain? */
export function lastGain(wt) {
  const last = [...(wt?.cycles ?? [])].reverse().find((c) => c.evidence_before || c.evidence_after);
  return last ? evidenceGain(last.evidence_before, last.evidence_after).gain : false;
}

/**
 * The piece on the board: a dashed house while the technique is being tried, a house once it is
 * being built into practice, a city only once the Test shows a gain on the problem it came from.
 */
export function pieceFor(goal) {
  const wt = isObject(goal) ? normalizeWalkthru(goal.walkthru) : null;
  if (!wt) return null;
  if (goal.status === 'dropped' || goal.status === 'archived') return null;
  if (lastGain(wt) && (wt.stage === 'test' || goal.status === 'achieved')) return 'city';
  return wt.stage === 'attempt' || wt.stage === 'develop' ? 'dashed_house' : 'house';
}

/** The year and term a date falls in, by the usual Australian school-term spread (labelling only). */
export function termRefFor(isoDate) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  const month = d.getUTCMonth() + 1;
  const term = month <= 4 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return { year: d.getUTCFullYear(), term };
}

/**
 * Keep going or move on. Writes what the term decision picker writes (carried, achieved or
 * dropped in `term_history`, and the goal's status), and closes the open cycle. Keep opens a
 * fresh cycle at Practise; the text is already adapted and the reps carry on.
 * @param {any} goal
 * @param {string} decision
 * @param {{ at?: string, reps?: number }} [opts]
 * @returns {any} a patch for the goal, or `{ error }`.
 */
export function applyCycleDecision(goal, decision, { at, reps = 0 } = {}) {
  const wt = normalizeWalkthru(goal?.walkthru);
  if (!wt) return { error: { code: 'validation_error', message: 'This goal has no WalkThru section.' } };
  if (!DECISIONS.includes(decision)) return { error: { code: 'validation_error', message: 'decision must be keep or move_on' } };
  const stamp = typeof at === 'string' && ISO_AT.test(at) ? at : new Date().toISOString();
  const day = stamp.slice(0, 10);
  const cycles = wt.cycles.map((c) => ({ ...c }));
  let open = openCycle({ cycles });
  if (!open) {
    open = { started: day, ended: null, decision: null, reps: 0, evidence_before: null, evidence_after: null };
    cycles.push(open);
  }
  open.ended = day;
  open.decision = decision;
  open.reps = Math.max(open.reps, reps);
  const gained = evidenceGain(open.evidence_before, open.evidence_after).gain;
  const outcome = decision === 'keep' ? 'carried' : gained ? 'achieved' : 'dropped';
  const ref = goal.term && Number.isInteger(goal.term.year) && Number.isInteger(goal.term.term) ? goal.term : termRefFor(day);
  const history = [...(Array.isArray(goal.term_history) ? goal.term_history : []), { ...ref, outcome, at: stamp }];
  if (decision === 'keep') {
    cycles.push({ started: day, ended: null, decision: null, reps: 0, evidence_before: null, evidence_after: null });
    return { walkthru: { ...wt, stage: 'practise', cycles }, term_history: history, status: 'active' };
  }
  return { walkthru: { ...wt, cycles }, term_history: history, status: outcome === 'achieved' ? 'achieved' : 'dropped' };
}

/** The section with an open cycle, starting one today if the last has ended (or none yet). */
/** @param {any} wt @param {string} day @returns {any} */
export function withOpenCycle(wt, day) {
  if (openCycle(wt)) return wt;
  return { ...wt, cycles: [...wt.cycles, { started: day, ended: null, decision: null, reps: 0, evidence_before: null, evidence_after: null }] };
}

/** Record where the class stands: `before` when the work starts, `after` at the Test. */
/** @param {any} wt @param {'before'|'after'} which @param {any} snapshot @param {string} day @returns {any} */
export function withSnapshot(wt, which, snapshot, day) {
  const base = withOpenCycle(wt, day);
  const cycles = base.cycles.map((c) => ({ ...c }));
  const open = openCycle({ cycles });
  open[which === 'before' ? 'evidence_before' : 'evidence_after'] = snapshot;
  return { ...base, cycles };
}
