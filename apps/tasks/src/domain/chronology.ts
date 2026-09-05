import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { addDays, parseDue, toDateKey } from '@/domain/queries';

/** Chronology lane — not Gantt dependencies. Answers “how does this unfold?” */
export type ChronologyItem = {
  id: string;
  taskId: string;
  title: string;
  startKey: string;
  endKey: string;
  projectId: string | null;
  projectTitle: string | null;
  status: string;
};

function workdaysBefore(end: Date, workdays: number): Date {
  let left = Math.max(1, workdays);
  const cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (left > 1) {
    cursor.setDate(cursor.getDate() - 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return cursor;
}

/** Build chronology rows from dated tasks. Undated tasks are omitted (park in board/list). */
export function collectChronologyItems(tasks: Task[], projects: Project[]): ChronologyItem[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items: ChronologyItem[] = [];
  for (const task of tasks) {
    if (task.status === 'dead') continue;
    const due = parseDue(task.due_date);
    if (!due) continue;
    const minutes = task.estimated_duration ?? 480;
    const days = Math.max(1, Math.ceil(minutes / 480));
    const start = workdaysBefore(due, days);
    const project = task.parent_project_id ? projectById.get(task.parent_project_id) : undefined;
    items.push({
      id: `task:${task.id}`,
      taskId: task.id,
      title: task.title,
      startKey: toDateKey(start),
      endKey: toDateKey(due),
      projectId: task.parent_project_id,
      projectTitle: project?.title ?? null,
      status: task.status
    });
  }
  return items.sort((a, b) => a.startKey.localeCompare(b.startKey) || a.title.localeCompare(b.title));
}

export function chronologyBounds(items: ChronologyItem[], today = new Date()): { start: Date; end: Date; days: number } {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!items.length) {
    return { start: addDays(todayStart, -14), end: addDays(todayStart, 28), days: 42 };
  }
  let min = parseDue(items[0]!.startKey)!;
  let max = parseDue(items[0]!.endKey)!;
  for (const item of items) {
    const start = parseDue(item.startKey);
    const end = parseDue(item.endKey);
    if (start && start < min) min = start;
    if (end && end > max) max = end;
  }
  const start = addDays(min, -3);
  const end = addDays(max, 7);
  const days = Math.max(14, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return { start, end, days };
}

export function dayOffset(from: Date, key: string): number {
  const date = parseDue(key);
  if (!date) return 0;
  return Math.round((date.getTime() - from.getTime()) / 86_400_000);
}
