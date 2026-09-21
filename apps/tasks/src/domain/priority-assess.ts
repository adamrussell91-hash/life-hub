import type { Task, TaskPriority } from '@/schemas/task';
import { hubCalendarDate, parseDue, startOfDay } from '@/domain/queries';

export const PRIORITY_ASSESS_RANKS: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

export type PriorityAssessMode = 'floor' | 'full';

export type PriorityAssessment = {
  id: string;
  title: string;
  current: string;
  suggested: string;
  reason: string;
  changed: boolean;
};

export type PriorityAssessResult = {
  mode: PriorityAssessMode;
  changes: PriorityAssessment[];
  skipped: number;
  applied: boolean;
  tasks: Task[];
};

const CLOSED = new Set(['done', 'dead']);
const PARKED = new Set(['deferred']);

export function daysUntilDue(task: Pick<Task, 'due_date'>, from: Date = new Date()): number | null {
  const due = parseDue(task.due_date);
  if (!due) return null;
  const today = startOfDay(hubCalendarDate(from));
  return Math.round((startOfDay(due).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function priorityBandFromDays(days: number): { priority: TaskPriority; reason: string } {
  if (days < 0) return { priority: 'urgent', reason: `Overdue ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` };
  if (days === 0) return { priority: 'urgent', reason: 'Due today' };
  if (days === 1) return { priority: 'high', reason: 'Due tomorrow' };
  if (days <= 3) return { priority: 'high', reason: `Due in ${days} days` };
  if (days <= 7) return { priority: 'medium', reason: 'Due this week' };
  return { priority: 'low', reason: 'Due later' };
}

function isParked(task: Pick<Task, 'status' | 'bucket' | 'waiting_status'>): boolean {
  if (PARKED.has(task.status)) return true;
  if (task.bucket === 'someday') return true;
  return task.waiting_status === 'waiting';
}

export function assessTaskPriority(
  task: Pick<Task, 'id' | 'title' | 'status' | 'bucket' | 'priority' | 'due_date' | 'waiting_status'>,
  from: Date = new Date(),
  mode: PriorityAssessMode = 'full'
): PriorityAssessment {
  const current = task.priority;
  const unchanged = (reason: string): PriorityAssessment => ({
    id: task.id,
    title: task.title,
    current,
    suggested: current,
    reason,
    changed: false
  });

  if (CLOSED.has(task.status)) return unchanged('Closed — leave the tag');
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

export function assessOpenTaskPriorities(
  tasks: Task[],
  from: Date = new Date(),
  mode: PriorityAssessMode = 'full'
): Omit<PriorityAssessResult, 'applied' | 'tasks'> {
  const changes: PriorityAssessment[] = [];
  let skipped = 0;
  for (const task of tasks) {
    const row = assessTaskPriority(task, from, mode);
    if (row.changed) changes.push(row);
    else skipped += 1;
  }
  return { mode, changes, skipped };
}

export function applyDueDatePriorityFloor<T extends Pick<Task, 'id' | 'title' | 'status' | 'bucket' | 'priority' | 'due_date' | 'waiting_status'>>(
  task: T,
  patch: { priority?: unknown; due_date?: unknown },
  from: Date = new Date()
): T {
  if (patch.priority != null) return task;
  if (!Object.prototype.hasOwnProperty.call(patch, 'due_date')) return task;
  const assessed = assessTaskPriority(task, from, 'floor');
  if (!assessed.changed) return task;
  return { ...task, priority: assessed.suggested };
}
