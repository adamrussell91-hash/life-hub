/** Due-date urgency for the closed priority vocabulary. Priority means how soon. */

import { hubCalendarDate, parseDue, startOfDay } from './clare-dates.mjs';

export const PRIORITY_ASSESS_RANKS = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

const CLOSED = new Set(['done', 'dead']);
const PARKED = new Set(['deferred']);

export function daysUntilDue(task, from = new Date()) {
  const due = parseDue(task?.due_date ?? null);
  if (!due) return null;
  const today = startOfDay(hubCalendarDate(from));
  return Math.round((startOfDay(due).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function priorityBandFromDays(days) {
  if (days < 0) {
    const n = Math.abs(days);
    return { priority: 'urgent', reason: `Overdue ${n} day${n === 1 ? '' : 's'}` };
  }
  if (days === 0) return { priority: 'urgent', reason: 'Due today' };
  if (days === 1) return { priority: 'high', reason: 'Due tomorrow' };
  if (days <= 3) return { priority: 'high', reason: `Due in ${days} days` };
  if (days <= 7) return { priority: 'medium', reason: 'Due this week' };
  return { priority: 'low', reason: 'Due later' };
}

function isParked(task) {
  if (PARKED.has(task?.status)) return true;
  if (task?.bucket === 'someday') return true;
  return task?.waiting_status === 'waiting';
}

export function assessTaskPriority(task, from = new Date(), mode = 'full') {
  const current = task?.priority;
  const unchanged = (reason) => ({
    id: task?.id,
    title: task?.title,
    current,
    suggested: current,
    reason,
    changed: false
  });

  if (CLOSED.has(task?.status)) return unchanged('Closed — leave the tag');
  if (isParked(task)) return unchanged('Parked — leave the tag');
  if (!(current in PRIORITY_ASSESS_RANKS)) return unchanged('Unknown priority — leave the tag');

  const days = daysUntilDue(task, from);
  if (days == null) return unchanged('No due date — set a date or keep the current tag');

  const band = priorityBandFromDays(days);
  const currentRank = PRIORITY_ASSESS_RANKS[current] ?? 2;
  const bandRank = PRIORITY_ASSESS_RANKS[band.priority] ?? 2;
  const suggested = mode === 'floor' && bandRank > currentRank ? current : band.priority;
  return {
    id: task.id,
    title: task.title,
    current,
    suggested,
    reason: suggested === current ? `${band.reason} — already ${current}` : band.reason,
    changed: suggested !== current
  };
}

export function assessOpenTaskPriorities(tasks, from = new Date(), mode = 'full') {
  const changes = [];
  let skipped = 0;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const row = assessTaskPriority(task, from, mode);
    if (row.changed) changes.push(row);
    else skipped += 1;
  }
  return { mode, changes, skipped };
}

export function applyDueDatePriorityFloor(task, patch, from = new Date()) {
  if (!task || !patch || typeof patch !== 'object') return task;
  if (patch.priority != null) return task;
  if (!Object.prototype.hasOwnProperty.call(patch, 'due_date')) return task;
  const assessed = assessTaskPriority(task, from, 'floor');
  if (!assessed.changed) return task;
  return { ...task, priority: assessed.suggested };
}

export async function applyPriorityAssessments(store, { listJSON, setJSON, taskKey, TASK_PREFIX }, {
  mode = 'full',
  apply = false,
  now = new Date()
} = {}) {
  const tasks = await listJSON(store, TASK_PREFIX);
  const preview = assessOpenTaskPriorities(tasks, now, mode === 'floor' ? 'floor' : 'full');
  if (!apply || !preview.changes.length) {
    return { ...preview, applied: false, tasks: [] };
  }
  const stamp = now.toISOString();
  const byId = new Map(preview.changes.map(change => [change.id, change]));
  const updated = [];
  for (const task of tasks) {
    const change = byId.get(task.id);
    if (!change) continue;
    const next = { ...task, priority: change.suggested, updated_at: stamp };
    await setJSON(store, taskKey(task.id), next);
    updated.push(next);
  }
  return { ...preview, applied: true, tasks: updated };
}
