import type { Task } from '@/schemas/task';

const listed = new Map<string, Task>();
const deleted = new Set<string>();
const tombstones = new Map<string, Task>();

function pickNewer(a: Task, b: Task): Task {
  return a.updated_at >= b.updated_at ? a : b;
}

/** Drop locally deleted ids and prefer cached updates. Does not add extra rows. */
export function filterCachedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => !deleted.has(task.id))
    .map((task) => listed.get(task.id) ?? task);
}

/** Merge a fresh list with locally created/updated/deleted tasks. */
export function mergeListedTasks(fetched: Task[]): Task[] {
  for (const task of fetched) {
    if (deleted.has(task.id)) continue;
    const current = listed.get(task.id);
    listed.set(task.id, current ? pickNewer(task, current) : task);
  }
  return [...listed.values()].filter((task) => !deleted.has(task.id));
}

export function rememberCreatedTask(task: Task): void {
  deleted.delete(task.id);
  tombstones.delete(task.id);
  listed.set(task.id, task);
}

export function rememberUpdatedTask(task: Task): void {
  rememberCreatedTask(task);
}

export function rememberDeletedTask(id: string, task?: Task): void {
  const existing = task ?? listed.get(id);
  if (existing) tombstones.set(id, existing);
  listed.delete(id);
  deleted.add(id);
}

export function restoreDeletedTask(id: string): Task | null {
  deleted.delete(id);
  const task = tombstones.get(id) ?? null;
  tombstones.delete(id);
  if (task) listed.set(id, task);
  return task;
}

/** Test hook — drop session overlays between specs. */
export function resetTaskCache(): void {
  listed.clear();
  deleted.clear();
  tombstones.clear();
}
