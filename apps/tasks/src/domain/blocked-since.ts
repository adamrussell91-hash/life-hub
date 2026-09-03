import type { Task } from '@/schemas/task';
import { columnForTask } from '@/domain/board';

/** Tasks that transitively depend on `taskId` (downstream). */
export function descendantIds(taskId: string, tasks: Task[]): Set<string> {
  const out = new Set<string>();
  const queue = [taskId];
  while (queue.length) {
    const current = queue.pop()!;
    for (const task of tasks) {
      if (task.depends_on.includes(current) && !out.has(task.id)) {
        out.add(task.id);
        queue.push(task.id);
      }
    }
  }
  return out;
}

export function isBoardBlocked(task: Task, byId: Map<string, Task>): boolean {
  return columnForTask(task, byId) === 'blocked';
}

/** Set or clear blocked_since when Board-derived blocked status changes. */
export function reconcileBlockedSince(
  task: Task,
  byId: Map<string, Task>,
  now = new Date().toISOString()
): Task {
  const blocked = isBoardBlocked(task, byId);
  if (blocked && !task.blocked_since) {
    return { ...task, blocked_since: now };
  }
  if (!blocked && task.blocked_since) {
    return { ...task, blocked_since: null };
  }
  return task;
}

export function affectedIdsForBlockedSince(taskId: string, tasks: Task[]): Set<string> {
  const affected = descendantIds(taskId, tasks);
  affected.add(taskId);
  return affected;
}

export async function reconcileBlockedSinceBatch(
  tasks: Task[],
  ids: Set<string>,
  now = new Date().toISOString()
): Promise<Map<string, Task>> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const updates = new Map<string, Task>();
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) continue;
    const next = reconcileBlockedSince(task, byId, now);
    if (next.blocked_since !== task.blocked_since) {
      byId.set(id, next);
      updates.set(id, next);
    }
  }
  return updates;
}
