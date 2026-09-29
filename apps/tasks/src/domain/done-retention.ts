import { completionStamp } from '@/domain/dashboard-overview';
import type { Task } from '@/schemas/task';

/** Rolling window for Board Done column (locked: CLARE-TASKS-PA-ASSUMPTIONS Slice A). */
export const DONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function isRecentDone(task: Task, now: Date = new Date()): boolean {
  if (task.status !== 'done') return false;
  const stamp = completionStamp(task);
  if (!stamp) return false;
  return stamp.getTime() >= now.getTime() - DONE_RETENTION_MS;
}

export function countOlderDone(tasks: readonly Task[], now: Date = new Date()): number {
  let n = 0;
  for (const task of tasks) {
    if (task.status !== 'done') continue;
    if (!isRecentDone(task, now)) n += 1;
  }
  return n;
}

/** Done-column membership only — open/doing/blocked lists are unchanged. */
export function filterDoneColumnTasks(
  tasks: readonly Task[],
  opts: { now?: Date; showOlder: boolean }
): Task[] {
  const now = opts.now ?? new Date();
  return tasks.filter((task) => {
    if (task.status !== 'done') return false;
    return opts.showOlder || isRecentDone(task, now);
  });
}

export function showOlderDoneLabel(olderCount: number, showing: boolean): string {
  if (showing) return 'Hide older';
  return `Show ${olderCount} older`;
}
