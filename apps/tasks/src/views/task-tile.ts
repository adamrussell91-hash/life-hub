import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderTaskEditor } from '@/views/task-editor';

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

export type TaskTileOptions = {
  editorHost: HTMLElement;
  projects: Project[];
  onSaved: () => void;
  open?: boolean;
  onToggle?: (taskId: string, open: boolean) => void;
};

/** Teaching-density board card — click to expand, then Full page opens the editor. */
export function renderBoardTaskTile(
  task: Task,
  supporting: string,
  detail: HTMLElement,
  opts: TaskTileOptions
): HTMLElement {
  const card = el('article', 'card board-card task-tile');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.dataset.taskId = task.id;
  card.setAttribute('aria-expanded', opts.open ? 'true' : 'false');

  const title = el('p', 'card-title board-card__title', task.title);
  const meta = el('div', 'card-meta board-card__meta');
  meta.append(
    el('span', 'chip', task.domain),
    el('span', 'chip chip--muted', task.status.replace('_', ' ')),
    el('span', 'chip chip--muted', supporting)
  );
  if (task.due_date) {
    meta.append(el('span', 'chip chip--muted card-date', formatDisplayDate(task.due_date)));
  }

  const detailWrap = el('div', 'task-tile__detail');
  detailWrap.hidden = !opts.open;
  detailWrap.append(detail);

  const actions = el('div', 'board-card__actions');
  const fullPage = el('button', 'btn btn--ghost', 'Full page');
  fullPage.type = 'button';
  fullPage.setAttribute('aria-label', `Open full page editor for ${task.title}`);
  fullPage.addEventListener('click', (event) => {
    event.stopPropagation();
    renderTaskEditor(opts.editorHost, task, opts.projects, opts.onSaved);
  });
  actions.append(fullPage);
  detailWrap.append(actions);

  const setOpen = (open: boolean) => {
    detailWrap.hidden = !open;
    card.classList.toggle('task-tile--open', open);
    card.setAttribute('aria-expanded', open ? 'true' : 'false');
    opts.onToggle?.(task.id, open);
  };

  card.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    setOpen(detailWrap.hidden);
  });
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    setOpen(detailWrap.hidden);
  });

  if (opts.open) card.classList.add('task-tile--open');
  card.append(title, meta, detailWrap);
  return card;
}

export function renderTaskLinkList(label: string, items: Array<{ title: string; meta: string }>): HTMLElement {
  const wrap = el('div', 'task-tile__section');
  wrap.append(el('p', 'task-tile__section-label', label));
  const list = el('ul', 'hierarchy-task-list');
  for (const item of items) {
    const row = el('li', 'hierarchy-task-row');
    row.append(el('span', 'hierarchy-milestone__title', item.title), el('span', 'chip chip--muted', item.meta));
    list.append(row);
  }
  wrap.append(list);
  return wrap;
}
