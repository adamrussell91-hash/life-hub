import { normalizeTask } from '@/domain/task-shape';
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
    const incoming = normalizeTask(task);
    listed.set(task.id, current ? pickNewer(incoming, current) : incoming);
  }
  return [...listed.values()].filter((task) => !deleted.has(task.id));
}

export function rememberCreatedTask(task: Task): void {
  deleted.delete(task.id);
  tombstones.delete(task.id);
  listed.set(task.id, normalizeTask(task));
}

export const TASKS_CHANGED = 'tasks-hub:tasks-changed';

/** Cache + tell open Today/Board/Backlog views to live-insert. */
export function notifyTasksChanged(tasks: Task[]): void {
  const incoming = tasks.filter((task) => task && typeof task.id === 'string' && task.id);
  if (!incoming.length) return;
  for (const task of incoming) rememberCreatedTask(task);
  window.dispatchEvent(new CustomEvent<Task[]>(TASKS_CHANGED, { detail: incoming }));
}

export function onTasksChanged(handler: (tasks: Task[]) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<Task[]>).detail;
    if (!Array.isArray(detail) || !detail.length) return;
    handler(detail);
  };
  window.addEventListener(TASKS_CHANGED, listener);
  return () => window.removeEventListener(TASKS_CHANGED, listener);
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
