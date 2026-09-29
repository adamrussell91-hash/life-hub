/**
 * Day Sense step 10 (docs/proposals/calendar-day-sense.md §3.5): how long work really
 * takes, whether the plan still holds, and what waits on what.
 *
 * Pure. Shared by the calendar model (client) and the runway planner (server).
 *
 * Honesty (CURSOR-UI-FAILURES D1, D6):
 * - A range needs clean observations (tracked sessions that counted something and
 *   were not blocked). Until then the estimate is shown as an estimate, never a range.
 * - Blocked or interrupted time is reported separately and never makes a task "slower".
 * - No estimate means unknown: nothing is guessed into minutes.
 */

export const DURATION = Object.freeze({
  minObservations: 3, // clean sessions before a pace range is shown
  minTrackedMinutes: 30,
  defaultMaxBlock: 90, // longest continuous block the planner proposes, unless the task says otherwise
  minBlock: 25,
  runupMinBlock: 45 // "needs a run-up" tasks are never given a slot shorter than this
});

const round5 = (minutes) => Math.max(0, Math.round(minutes / 5) * 5);

function minutesBetween(time, end) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(time ?? ''));
  const n = /^(\d{2}):(\d{2})$/.exec(String(end ?? ''));
  if (!m || !n) return 0;
  return Math.max(0, Number(n[1]) * 60 + Number(n[2]) - (Number(m[1]) * 60 + Number(m[2])));
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/** What is left of a task, as a share of its whole (from count progress), or 1. */
export function remainingShare(progress) {
  if (!progress || !(progress.total > 0)) return 1;
  return Math.max(0, (progress.total - Math.min(progress.total, progress.done)) / progress.total);
}

/**
 * Minutes still needed at the task's own estimate. The estimate is for the whole task,
 * so count progress takes its share off. null when there is no estimate.
 */
export function remainingByEstimate(task) {
  const estimate = Number(task?.estimated_duration);
  if (!(estimate > 0)) return null;
  return round5(estimate * remainingShare(task.progress));
}

/**
 * Tracked sessions on one task, split into productive / blocked / interrupted minutes,
 * plus the per-unit pace of each clean session that counted something.
 * @param {Array<{ task_id?: string, time?: string, end_time?: string, result?: string, open?: boolean, scripts_marked?: number }>} sessions
 */
export function sessionSummary(sessions, taskId) {
  const out = { productive: 0, blocked: 0, interrupted: 0, paces: [] };
  for (const session of sessions ?? []) {
    if (!session || session.task_id !== taskId) continue;
    const minutes = minutesBetween(session.time, session.end_time);
    if (!minutes) continue;
    if (session.result === 'blocked') {
      out.blocked += minutes;
      continue;
    }
    if (session.result === 'interrupted') {
      out.interrupted += minutes;
      continue;
    }
    out.productive += minutes;
    if (!session.open && Number(session.scripts_marked) > 0) out.paces.push(minutes / Number(session.scripts_marked));
  }
  return out;
}

/**
 * How long the rest of a task will take.
 * @returns {null | {
 *   kind: 'range' | 'estimate',
 *   low: number, high: number,           // minutes; equal for an estimate
 *   observations: number,
 *   blocked: number, interrupted: number, productive: number,
 *   text: string                          // "about 1½–2 h left (from 4 sessions)"
 * }}
 */
export function durationRange(task, sessions = []) {
  if (!task) return null;
  const summary = sessionSummary(sessions, task.id);
  const progress = task.progress;
  const left = progress && progress.total > 0 ? progress.total - Math.min(progress.total, progress.done) : null;
  const base = {
    observations: summary.paces.length,
    blocked: summary.blocked,
    interrupted: summary.interrupted,
    productive: summary.productive
  };
  const tracked = summary.paces.length >= DURATION.minObservations && summary.productive >= DURATION.minTrackedMinutes;
  if (left != null && tracked) {
    const paces = [...summary.paces].sort((a, b) => a - b);
    const fast = quantile(paces, 0.25);
    const usual = quantile(paces, 0.5);
    const low = round5(left * fast);
    const high = Math.max(low, round5(left * usual));
    return { kind: 'range', low, high, ...base, text: left === 0 ? 'nothing left' : `about ${hoursText(low, high)} left (${paces.length} tracked sessions)` };
  }
  const estimate = remainingByEstimate(task);
  if (estimate == null) return null;
  return { kind: 'estimate', low: estimate, high: estimate, ...base, text: `estimate ${hoursText(estimate)} left` };
}

function halfHours(minutes) {
  const value = Math.round(minutes / 30) / 2;
  if (value < 1) return value === 0.5 ? '½' : '<½';
  return `${Math.floor(value)}${value % 1 ? '½' : ''}`;
}

/** "1½–2 h", "45 min", "2 h". */
export function hoursText(low, high = low) {
  if (high < 60) return low === high ? `${round5(low)} min` : `${round5(low)}–${round5(high)} min`;
  const a = halfHours(low);
  const b = halfHours(high);
  return a === b ? `${b} h` : `${a}–${b} h`;
}

/**
 * Does the rest of a task fit in the time planned for it plus the free time before it is due?
 * - fits: even the slow end fits
 * - fragile: fits only at the fast end (a range) — "fits only at your fastest pace"
 * - short: does not fit even at the fast end (or at the estimate)
 * @param {{ range: ReturnType<typeof durationRange>, planned: number, free: number }} input  minutes
 * @returns {null | { status: 'fits'|'fragile'|'short', shortBy: number, text: string }}
 */
export function fragility({ range, planned = 0, free = 0 }) {
  if (!range) return null;
  const room = Math.max(0, planned) + Math.max(0, free);
  if (range.high <= room) return { status: 'fits', shortBy: 0, text: '' };
  if (range.low <= room) {
    return {
      status: 'fragile',
      shortBy: range.high - room,
      text: `Fits only at your fastest pace. At your usual pace it needs about ${hoursText(range.high - room)} more.`
    };
  }
  return {
    status: 'short',
    shortBy: range.low - room,
    text: range.kind === 'range'
      ? `Does not fit even at your fastest pace: about ${hoursText(range.low - room)} short.`
      : `Does not fit at your estimate: about ${hoursText(range.low - room)} short.`
  };
}

/**
 * Dependencies from the Tasks schema (`depends_on: string[]`). Only explicit links
 * affect scheduling. A step that follows an open earlier step (step_order) is an
 * inferred link: proposed for confirmation, never used until confirmed.
 * @param {object[]} tasks all tasks (raw Tasks records)
 * @returns {Map<string, { blockedBy: Array<{ id, title }>, unlocks: number, inferredAfter: null | { id, title } }>}
 */
export function dependencyIndex(tasks) {
  const byId = new Map();
  for (const task of tasks ?? []) if (task && typeof task.id === 'string') byId.set(task.id, task);
  const open = (task) => task && task.status !== 'done' && task.status !== 'dead';
  const title = (task) => (typeof task?.title === 'string' && task.title) || task?.id || '';
  const out = new Map();
  const row = (id) => {
    if (!out.has(id)) out.set(id, { blockedBy: [], unlocks: 0, inferredAfter: null });
    return out.get(id);
  };
  for (const task of byId.values()) {
    const deps = (typeof task.depends_on === 'string' ? [task.depends_on] : Array.isArray(task.depends_on) ? task.depends_on : []).filter((id) => typeof id === 'string' && id && id !== task.id);
    for (const id of deps) {
      const blocker = byId.get(id);
      if (!open(blocker) || !open(task)) continue;
      row(task.id).blockedBy.push({ id, title: title(blocker), due: blocker.due_date ?? null });
      row(id).unlocks += 1;
    }
  }
  // Inferred: open step N of a parent whose step N-1 is still open, with no explicit link.
  const stepsOf = new Map();
  for (const task of byId.values()) {
    if (typeof task.parent_task_id === 'string' && Number.isFinite(task.step_order)) {
      stepsOf.set(task.parent_task_id, [...(stepsOf.get(task.parent_task_id) ?? []), task]);
    }
  }
  for (const steps of stepsOf.values()) {
    steps.sort((a, b) => a.step_order - b.step_order);
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      const before = steps[i - 1];
      if (!open(step) || !open(before)) continue;
      if ((Array.isArray(step.depends_on) && step.depends_on.length) || (typeof step.depends_on === 'string' && step.depends_on)) continue;
      if (Array.isArray(step.dismissed_inferred) && step.dismissed_inferred.includes(before.id)) continue;
      row(step.id).inferredAfter = { id: before.id, title: title(before) };
    }
  }
  return out;
}
