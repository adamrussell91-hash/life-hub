import type { Task } from '@/schemas/task';
import { isBoardTask } from '@/domain/hierarchy';
import { parseDue } from '@/domain/queries';

export type RemindPreset = 'none' | 'morning_of' | '1_day_before' | '1_hour_before' | 'custom';

export type PendingReminder = {
  task: Task;
  remind_at: string;
  label: string;
};

function localDateTime(dateKey: string, hours: number, minutes = 0): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hours, minutes, 0, 0);
}

function parseDueTime(dueTime: string | null | undefined): { hours: number; minutes: number } {
  if (!dueTime) return { hours: 9, minutes: 0 };
  const match = /^(\d{1,2}):(\d{2})$/.exec(dueTime.trim());
  if (!match) return { hours: 9, minutes: 0 };
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Compute remind_at ISO from a preset and due date/time. */
export function remindAtFromPreset(
  preset: RemindPreset,
  dueDate: string | null,
  dueTime: string | null,
  customIso?: string | null
): string | null {
  if (preset === 'none') return null;
  if (preset === 'custom') return customIso?.trim() || null;
  if (!dueDate) return null;

  const { hours, minutes } = parseDueTime(dueTime);
  const due = localDateTime(dueDate, hours, minutes);

  switch (preset) {
    case 'morning_of':
      return localDateTime(dueDate, 9, 0).toISOString();
    case '1_day_before': {
      const dayBefore = new Date(due);
      dayBefore.setDate(dayBefore.getDate() - 1);
      dayBefore.setHours(9, 0, 0, 0);
      return dayBefore.toISOString();
    }
    case '1_hour_before': {
      const hourBefore = new Date(due);
      hourBefore.setHours(hourBefore.getHours() - 1);
      return hourBefore.toISOString();
    }
    default:
      return null;
  }
}

export function inferRemindPreset(
  remindAt: string | null,
  dueDate: string | null,
  dueTime: string | null
): RemindPreset {
  if (!remindAt) return 'none';
  const targets = ['morning_of', '1_day_before', '1_hour_before'] as const;
  for (const preset of targets) {
    const computed = remindAtFromPreset(preset, dueDate, dueTime);
    if (computed && Math.abs(new Date(computed).getTime() - new Date(remindAt).getTime()) < 60_000) {
      return preset;
    }
  }
  return 'custom';
}

export function isReminderPending(task: Task, now: Date = new Date()): boolean {
  if (!isBoardTask(task)) return false;
  if (task.status === 'done' || task.status === 'dead') return false;
  if (!task.remind_at) return false;
  const remindMs = new Date(task.remind_at).getTime();
  if (Number.isNaN(remindMs) || remindMs > now.getTime()) return false;
  if (task.remind_dismissed_at) {
    const dismissedMs = new Date(task.remind_dismissed_at).getTime();
    if (!Number.isNaN(dismissedMs) && dismissedMs >= remindMs) return false;
  }
  return true;
}

export function pendingReminders(tasks: Task[], now: Date = new Date()): PendingReminder[] {
  return tasks
    .filter((task) => isReminderPending(task, now))
    .map((task) => ({
      task,
      remind_at: task.remind_at!,
      label: formatReminderLabel(task)
    }))
    .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
}

export function formatReminderLabel(task: Task): string {
  if (task.due_date) {
    const due = parseDue(task.due_date);
    const duePart = due
      ? due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      : task.due_date;
    return `${task.title} · due ${duePart}`;
  }
  return task.title;
}

/** Shift remind_at by the same offset when a recurring task spawns its next instance. */
export function carryReminderForward(
  previous: Task,
  nextDueDate: string | null
): string | null {
  if (!previous.remind_at || !previous.due_date || !nextDueDate) return null;
  const oldDue = parseDue(previous.due_date);
  const newDue = parseDue(nextDueDate);
  const oldRemind = new Date(previous.remind_at);
  if (!oldDue || !newDue || Number.isNaN(oldRemind.getTime())) return null;
  const offsetMs = oldRemind.getTime() - oldDue.getTime();
  const next = new Date(newDue);
  next.setTime(next.getTime() + offsetMs);
  return next.toISOString();
}

export function snoozeReminder(task: Task, minutes: number, now: Date = new Date()): string {
  const base = Math.max(now.getTime(), new Date(task.remind_at ?? now).getTime());
  return new Date(base + minutes * 60_000).toISOString();
}
