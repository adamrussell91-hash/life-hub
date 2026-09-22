import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { doFirst, nodeState, unlockCount } from '@/domain/graph-model';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { el } from '@/views/hub-kit';

export type GraphDrawerHandlers = {
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onReschedule: (task: Task) => void;
  onSnooze: (task: Task) => void;
  onAskClare: (task: Task) => void;
  onClose: () => void;
};

export function renderGraphDrawer(
  host: HTMLElement,
  task: Task | null,
  tasks: Task[],
  projects: Project[],
  handlers: GraphDrawerHandlers
): void {
  host.replaceChildren();
  host.hidden = !task;
  if (!task) return;
  host.className = 'graph-drawer glass-panel';
  const project = projects.find((p) => p.id === task.parent_project_id);
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const blockedBy = (task.depends_on ?? []).map((id) => byId.get(id)).filter((item): item is Task => Boolean(item));
  const blocking = tasks.filter((item) => (item.depends_on ?? []).includes(task.id));
  const rank = doFirst(tasks).find((row) => row.taskId === task.id);
  const state = nodeState(task, tasks);

  const head = el('div', 'graph-drawer__head');
  head.append(el('p', 'page-header__eyebrow', project?.title ?? 'Loose'));
  head.append(el('h2', 'graph-drawer__title', task.title));
  const close = el('button', 'btn btn--ghost graph-drawer__close', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close drawer');
  close.addEventListener('click', handlers.onClose);
  head.append(close);
  host.append(head);

  host.append(
    el(
      'p',
      'graph-drawer__meta',
      [
        task.domain,
        task.status.replace('_', ' '),
        state.state,
        task.due_date ? formatDisplayDate(task.due_date) : 'No date'
      ].join(' · ')
    )
  );
  if (rank) host.append(el('p', 'graph-drawer__score', rank.explanation));
  else host.append(el('p', 'graph-drawer__score', `Unlocks ${unlockCount(task.id, tasks)}`));

  if (blockedBy.length) {
    host.append(el('p', 'graph-drawer__label', 'Depends on'));
    host.append(el('p', 'graph-drawer__list', blockedBy.map((item) => item.title).join(', ')));
  }
  if (blocking.length) {
    host.append(el('p', 'graph-drawer__label', 'Unlocks'));
    host.append(el('p', 'graph-drawer__list', blocking.map((item) => item.title).join(', ')));
  }

  const actions = el('div', 'graph-drawer__actions');
  const complete = el('button', 'btn btn--primary', 'Complete');
  complete.type = 'button';
  complete.setAttribute('aria-label', 'Complete task');
  complete.addEventListener('click', () => handlers.onComplete(task));
  const open = el('button', 'btn btn--secondary', 'Open in editor');
  open.type = 'button';
  open.addEventListener('click', () => handlers.onOpen(task));
  const reschedule = el('button', 'btn btn--ghost', 'Reschedule');
  reschedule.type = 'button';
  reschedule.addEventListener('click', () => handlers.onReschedule(task));
  const snooze = el('button', 'btn btn--ghost', 'Snooze');
  snooze.type = 'button';
  snooze.addEventListener('click', () => handlers.onSnooze(task));
  const ask = el('button', 'btn btn--ghost', 'Ask Clare about this');
  ask.type = 'button';
  ask.addEventListener('click', () => handlers.onAskClare(task));
  actions.append(complete, open, reschedule, snooze, ask);
  host.append(actions);
}
