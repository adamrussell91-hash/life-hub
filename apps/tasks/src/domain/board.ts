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

/** Persist target for a drop. Blocked is derived from deps — no status write. */
export function statusForColumn(column: BoardColumnId): Task['status'] | null {
  if (column === 'todo') return 'open';
  if (column === 'doing') return 'in_progress';
  if (column === 'done') return 'done';
  return null;
}

/**
 * Blocked only when the task is still waiting (not already started).
 * Dragging a blocked card into Doing keeps it there via in_progress.
 */
export function columnForTask(task: Task, byId: Map<string, Task>): BoardColumnId {
  if (task.status === 'done' || task.status === 'dead') return 'done';
  if (task.status === 'in_progress') return 'doing';
  if (isBlocked(task, byId)) return 'blocked';
  return 'todo';
}
