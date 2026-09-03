import type { Task } from '@/schemas/task';

export function isStep(task: Task): boolean {
  return task.kind === 'step' || Boolean(task.parent_task_id && task.kind !== 'task');
}

export function isSomeday(task: Task): boolean {
  return task.bucket === 'someday';
}

/** Tasks that belong on the sprint board and day/week focus views. */
export function isBoardTask(task: Task): boolean {
  return !isStep(task) && !isSomeday(task);
}

export function boardTasks(tasks: Task[]): Task[] {
  return tasks.filter(isBoardTask);
}

export function somedayTasks(tasks: Task[]): Task[] {
  return tasks.filter(isSomeday);
}

export function stepsForTask(tasks: Task[], parentTaskId: string): Task[] {
  return tasks
    .filter((task) => task.parent_task_id === parentTaskId && (task.kind === 'step' || isStep(task)))
    .sort((a, b) => a.step_order - b.step_order || a.title.localeCompare(b.title));
}

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatTagsInput(tags: string[]): string {
  return tags.join(', ');
}
