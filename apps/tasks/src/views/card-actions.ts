import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One-click card delete — no proposed-write banner. */
export function deleteTaskNow(
  task: Task,
  reload: () => void | Promise<void>,
  errorHost: HTMLElement
): void {
  void tasksApi
    .deleteTask(task.id, { agent: 'Tasks Hub', reason: 'Card delete' })
    .then(() => reload())
    .catch((err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    });
}

/** One-click card delete — no proposed-write banner. */
export function deleteProjectNow(
  project: Project,
  reload: () => void | Promise<void>,
  errorHost: HTMLElement
): void {
  void tasksApi
    .deleteProject(project.id, { agent: 'Tasks Hub', reason: 'Card delete' })
    .then(() => reload())
    .catch((err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    });
}
