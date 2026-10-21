import { stringList } from '@/domain/task-shape';
import type { Task } from '@/schemas/task';

export type BoardColumnId = 'todo' | 'doing' | 'blocked' | 'done';

export type BoardColumn = {
  id: BoardColumnId;
  title: string;
  empty: string;
};

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { id: 'todo', title: 'To do', empty: 'Nothing waiting — drop a card here.' },
  { id: 'doing', title: 'Doing', empty: 'Nothing in progress — drop a card here.' },
  { id: 'blocked', title: 'Blocked', empty: 'Nothing blocked.' },
  { id: 'done', title: 'Done', empty: 'Nothing done yet — drop a card here.' }
];

export function isBlocked(task: Task, byId: Map<string, Task>): boolean {
  if (task.status === 'done' || task.status === 'dead') return false;
  return stringList(task.depends_on).some((id) => {
    const dep = byId.get(id);
    return !dep || dep.status !== 'done';
  });
}

/** Parked by hand — dropped into Blocked, or waiting on someone. */
export function isManuallyBlocked(task: Pick<Task, 'waiting_status'>): boolean {
  return task.waiting_status === 'waiting' || task.waiting_status === 'follow_up_due';
}

/** Persist target for a drop. Blocked is a manual park, not a status — see `patchForColumn`. */
export function statusForColumn(column: BoardColumnId): Task['status'] | null {
  if (column === 'todo') return 'open';
  if (column === 'doing') return 'in_progress';
  if (column === 'done') return 'done';
  return null;
}

/**
 * Fields to write when a card is dropped on `column`, or null when nothing changes.
 * Blocked parks the task as waiting so the move survives a reload; leaving Blocked clears it.
 */
export function patchForColumn(
  task: Task,
  column: BoardColumnId,
  now = new Date().toISOString()
): Partial<Task> | null {
  if (column === 'blocked') {
    if (isManuallyBlocked(task) && task.status === 'open') return null;
    return {
      status: 'open',
      waiting_status: 'waiting',
      waiting_since: task.waiting_since ?? now
    };
  }
  const status = statusForColumn(column);
  if (!status) return null;
  const patch: Partial<Task> = {};
  if (status !== task.status) patch.status = status;
  if (isManuallyBlocked(task)) {
    patch.waiting_status = null;
    patch.waiting_on = null;
    patch.waiting_since = null;
    patch.follow_up_at = null;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Blocked when parked by hand, or when still waiting on unfinished dependencies.
 * Dragging a dependency-blocked card into Doing keeps it there via in_progress.
 */
export function columnForTask(task: Task, byId: Map<string, Task>): BoardColumnId {
  if (task.status === 'done' || task.status === 'dead') return 'done';
  if (isManuallyBlocked(task)) return 'blocked';
  if (task.status === 'in_progress') return 'doing';
  if (isBlocked(task, byId)) return 'blocked';
  return 'todo';
}
