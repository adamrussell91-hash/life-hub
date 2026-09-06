import { stringList } from '@/domain/task-shape';
import type { Task, TaskDomain, TaskPriority, TaskStatus } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { BoardColumnId } from '@/domain/board';
import {
  dueChipKind,
  dueChipLabel,
  formatRelativeUpdated,
  priorityDotValue,
  projectPageHash,
  projectProgress,
  statusBadgeClass,
  statusLabel,
  taskPageHash
} from '@/domain/cards';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createMorphingClosedFieldPopover } from '../../design-kit/js/morphing-popover.js';
import { cardTransitionName, runContainerTransform } from '@/views/container-transform';
import { closeCardMenu, renderCardMenu, type CardMenuItem } from '@/views/card-menu';
import { domainFilterOptions, priorityFilterOptions, statusFilterOptions } from '@/views/hub-kit';
import { getFocus, isFocusedTaskId, setFocus } from '@/domain/focus';

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

function calendarIcon(): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '2');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML =
    '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/>';
  return node;
}

function chevron(up = false): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '2');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.classList.add('proj-row__chev');
  node.innerHTML = up ? '<path d="M6 15l6-6 6 6"/>' : '<path d="M6 9l6 6 6-6"/>';
  return node;
}

export type TaskFieldPatch = Partial<Pick<Task, 'status' | 'priority' | 'domain'>>;

function titleCase(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function closedFieldChip(spec: {
  faceClass: (value: string) => string;
  text: string;
  dataset?: Record<string, string>;
  title: string;
  value: string;
  choices: Array<{ value: string; label: string }>;
  onSave?: (value: string) => void;
}): HTMLElement {
  if (!spec.onSave) {
    const node = el('span', spec.faceClass(spec.value), spec.text);
    if (spec.dataset) {
      for (const [key, value] of Object.entries(spec.dataset)) node.dataset[key] = value;
    }
    return node;
  }
  const trigger = el('button', spec.faceClass(spec.value), spec.text) as HTMLButtonElement;
  trigger.type = 'button';
  if (spec.dataset) {
    for (const [key, value] of Object.entries(spec.dataset)) trigger.dataset[key] = value;
  }
  const popover = createMorphingClosedFieldPopover({
    root: document,
    trigger,
    title: spec.title,
    supporting: 'Closed list. Save writes it.',
    options: spec.choices,
    value: spec.value,
    onSave(value) {
      trigger.className = `${spec.faceClass(value)} morphing-popover__trigger`;
      if (spec.dataset) {
        for (const key of Object.keys(spec.dataset)) {
          if (key === 'priority' || key === 'area') trigger.dataset[key] = value;
        }
      }
      spec.onSave?.(value);
    }
  });
  return popover.el;
}

function domainChip(domain: string, onSave?: (value: string) => void): HTMLElement {
  return closedFieldChip({
    faceClass: () => 'hub-chip',
    text: titleCase(domain),
    dataset: { area: domain },
    title: 'Domain',
    value: domain,
    choices: domainFilterOptions(false).map((option) => ({
      value: option.value,
      label: titleCase(option.label)
    })),
    onSave
  });
}

function priorityChip(priority: string, onSave?: (value: string) => void): HTMLElement {
  return closedFieldChip({
    faceClass: () => 'priority-chip',
    text: priority,
    dataset: { priority },
    title: 'Priority',
    value: priority,
    choices: priorityFilterOptions(false),
    onSave
  });
}

function statusChip(status: string, onSave?: (value: string) => void): HTMLElement {
  return closedFieldChip({
    faceClass: (value) => statusBadgeClass(value),
    text: statusLabel(status),
    title: 'Status',
    value: status,
    choices: statusFilterOptions(false).filter((option) => option.value !== 'dead'),
    onSave
  });
}

function dateBadge(due: string | null, prefix = ''): HTMLElement | null {
  if (!due) return null;
  const badge = el('span', 'date-badge');
  badge.append(calendarIcon(), document.createTextNode(`${prefix}${formatDisplayDate(due)}`));
  return badge;
}

export type TaskCardHandlers = {
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onToggle?: (task: Task) => void;
  onPatch?: (task: Task, patch: TaskFieldPatch) => void | Promise<void>;
  onOpenPage?: (task: Task) => void;
  onExpand?: (task: Task) => void;
  onCollapse?: (task: Task) => void;
  boardColumn?: BoardColumnId;
};

export type ProjectCardHandlers = {
  onToggleChild?: (task: Task) => void;
  onAddTask?: (project: Project) => void;
  onOpenPage?: (project: Project) => void;
  onClose?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  /** Compact-row click. Defaults to expanding the card in place. */
  onActivate?: (project: Project) => void;
  onExpand?: (project: Project) => void;
  onCollapse?: (project: Project) => void;
};

function morphTarget(slot: HTMLElement): HTMLElement | null {
  return slot.querySelector<HTMLElement>('.hub-row, .hub-card, .proj-row, .proj-card-wrap');
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('button, a, input, textarea, select, label, .morphing-popover'))
  );
}

function boardCardInteractive(target: EventTarget | null): boolean {
  return (
    isInteractive(target) ||
    (target instanceof Element && Boolean(target.closest('.card-menu, .card-menu__panel')))
  );
}

function openTaskPage(task: Task, handlers: TaskCardHandlers): void {
  if (handlers.onOpenPage) handlers.onOpenPage(task);
  else location.hash = taskPageHash(task.id);
}

function openProjectPage(project: Project, handlers: ProjectCardHandlers): void {
  if (handlers.onOpenPage) handlers.onOpenPage(project);
  else location.hash = projectPageHash(project.id);
}

function taskMenuItems(task: Task, handlers: TaskCardHandlers): CardMenuItem[] {
  const items: CardMenuItem[] = [];
  if (handlers.onExpand) {
    items.push({ id: 'expand', label: 'Expand', onSelect: () => handlers.onExpand?.(task) });
  }
  if (handlers.onCollapse) {
    items.push({ id: 'collapse', label: 'Collapse', onSelect: () => handlers.onCollapse?.(task) });
  }
  items.push({ id: 'page', label: 'Full page', onSelect: () => openTaskPage(task, handlers) });
  if (handlers.onEdit) {
    items.push({ id: 'edit', label: 'Edit', onSelect: () => handlers.onEdit?.(task) });
  }
  if (handlers.onToggle) {
    items.push({
      id: 'toggle',
      label: task.status === 'done' ? 'Reopen' : 'Done',
      onSelect: () => handlers.onToggle?.(task)
    });
  }
  if (handlers.onDelete) {
    items.push({ id: 'delete', label: 'Delete', danger: true, onSelect: () => handlers.onDelete?.(task) });
  }
  return items;
}

function projectMenuItems(project: Project, handlers: ProjectCardHandlers): CardMenuItem[] {
  const items: CardMenuItem[] = [];
  if (handlers.onExpand) {
    items.push({ id: 'expand', label: 'Expand', onSelect: () => handlers.onExpand?.(project) });
  }
  if (handlers.onCollapse) {
    items.push({ id: 'collapse', label: 'Collapse', onSelect: () => handlers.onCollapse?.(project) });
  }
  items.push({ id: 'page', label: 'Full page', onSelect: () => openProjectPage(project, handlers) });
  if (handlers.onAddTask) {
    items.push({ id: 'add', label: 'Add task', onSelect: () => handlers.onAddTask?.(project) });
  }
  if (handlers.onClose) {
    items.push({ id: 'close', label: 'Close project', onSelect: () => handlers.onClose?.(project) });
  }
  if (handlers.onDelete) {
    items.push({
      id: 'delete',
      label: 'Delete',
      danger: true,
      onSelect: () => handlers.onDelete?.(project)
    });
  }
  return items;
}

function attachCardMenu(card: HTMLElement, label: string, items: CardMenuItem[]): void {
  card.append(renderCardMenu(label, items));
}

export function renderTaskMicroCard(task: Task, handlers: TaskCardHandlers = {}): HTMLElement {
  const row = el('article', 'hub-row');
  row.dataset.taskId = task.id;
  row.dataset.cardKind = 'task';
  const title = el('p', 'hub-row__title card-title', task.title);
  title.setAttribute('data-hub-morph', 'title');
  const chips = el('div', 'hub-chips');
  chips.append(
    domainChip(task.domain, handlers.onPatch ? (value) => void handlers.onPatch?.(task, { domain: value as TaskDomain }) : undefined)
  );
  chips.append(
    priorityChip(
      task.priority,
      handlers.onPatch ? (value) => void handlers.onPatch?.(task, { priority: value as TaskPriority }) : undefined
    )
  );
  const foot = el('div', 'hub-row__foot');
  const meta = el('div', 'hub-row__foot-meta');
  const due = dateBadge(task.due_date);
  if (due) meta.append(due);
  meta.append(el('span', 'hub-row__updated', formatRelativeUpdated(task.updated_at)));
  foot.append(meta);
  row.append(title, chips, foot);
  attachCardMenu(row, `${task.title} card menu`, taskMenuItems(task, handlers));
  return row;
}

export function renderTaskExpandedCard(task: Task, handlers: TaskCardHandlers = {}): HTMLElement {
  const card = el('article', 'hub-card');
  card.dataset.taskId = task.id;
  card.setAttribute('aria-label', `${task.title} task card`);
  const head = el('header', 'task-card__head');
  head.append(
    el('span', 'hub-card__eyebrow', 'Task'),
    statusChip(
      task.status,
      handlers.onPatch ? (value) => void handlers.onPatch?.(task, { status: value as TaskStatus }) : undefined
    )
  );
  const title = el('h2', 'hub-card__title card-title', task.title);
  title.setAttribute('data-hub-morph', 'title');
  const tags = el('div', 'task-card__tags-row');
  const chips = el('div', 'hub-chips');
  chips.append(
    domainChip(task.domain, handlers.onPatch ? (value) => void handlers.onPatch?.(task, { domain: value as TaskDomain }) : undefined)
  );
  chips.append(
    priorityChip(
      task.priority,
      handlers.onPatch ? (value) => void handlers.onPatch?.(task, { priority: value as TaskPriority }) : undefined
    )
  );
  for (const tag of stringList(task.tags)) chips.append(el('span', 'hub-chip', tag));
  tags.append(chips);
  const due = dateBadge(task.due_date, 'Due ');
  if (due) tags.append(due);
  card.append(head, title, tags);
  if (task.description) card.append(el('p', 'hub-card__meta', task.description));
  const foot = el('footer', 'task-card__foot');
  if (handlers.boardColumn === 'blocked') {
    foot.append(el('p', 'board-move-note', 'Blocked by unfinished dependencies — drag to Doing when ready.'));
  }
  foot.append(el('span', 'hub-card__meta', formatRelativeUpdated(task.updated_at)));
  card.append(foot);
  attachCardMenu(card, `${task.title} card menu`, taskMenuItems(task, handlers));
  return card;
}

export function renderProjectMicroCard(
  project: Project,
  tasks: Task[],
  handlers: ProjectCardHandlers = {}
): HTMLElement {
  const progress = projectProgress(project, tasks);
  const row = el('div', 'hub-row proj-row');
  row.dataset.projectId = project.id;
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.setAttribute('aria-expanded', 'false');
  row.setAttribute('aria-label', `Expand ${project.title} project card`);
  const main = el('div', 'proj-row__main');
  main.append(
    el('span', 'hub-card__eyebrow', project.type === 'excursion' ? 'Excursion' : 'Project'),
    el('p', 'hub-row__title card-title', project.title)
  );
  main.querySelector('.hub-row__title')?.setAttribute('data-hub-morph', 'title');
  const meta = el('div', 'proj-row__meta');
  meta.append(
    el('span', statusBadgeClass(project.status), statusLabel(project.status)),
    el('span', 'proj-row__pct', `${progress.pct}%`),
    chevron(false)
  );
  row.append(main, meta);
  attachCardMenu(row, `${project.title} card menu`, projectMenuItems(project, handlers));
  return row;
}

export function renderProjectExpandedCard(
  project: Project,
  tasks: Task[],
  handlers: ProjectCardHandlers = {}
): HTMLElement {
  const progress = projectProgress(project, tasks);
  const wrap = el('div', 'proj-card-wrap');
  if (progress.dueToday) {
    const float = el('div', 'chip-float');
    float.setAttribute('aria-hidden', 'true');
    float.append(el('span', 'chip-float__dot'), el('span'));
    float.lastElementChild!.innerHTML = `<strong>${progress.dueToday}</strong> due today`;
    wrap.append(float);
  }
  const card = el('article', 'hub-card proj-card');
  card.setAttribute('aria-label', `${project.title} project card`);
  const head = el('header', 'task-card__head');
  head.append(
    el('span', 'hub-card__eyebrow', project.type === 'excursion' ? 'Excursion' : 'Project'),
    el('span', statusBadgeClass(project.status), statusLabel(project.status))
  );
  const title = el('h2', 'hub-card__title card-title', project.title);
  title.setAttribute('data-hub-morph', 'title');
  const tags = el('div', 'task-card__tags-row');
  const chips = el('div', 'hub-chips');
  chips.append(el('span', 'hub-chip', project.type === 'excursion' ? 'excursion' : project.type));
  tags.append(chips);
  const due = dateBadge(project.current_end_date, 'Target ');
  if (due) tags.append(due);
  const metrics = el('div', 'task-card__progress');
  const metric = el('div');
  const pct = el('p', 'hub-hero-metric');
  pct.innerHTML = `${progress.pct}<span class="hub-hero-metric__unit">%</span>`;
  metric.append(
    pct,
    el('p', 'hub-hero-metric__lab', `${progress.done} of ${progress.total} tasks complete`)
  );
  const counts = el('div', 'hub-chips');
  counts.append(el('span', 'hub-chip', `${progress.total - progress.done} to go`));
  if (progress.dueToday) {
    const today = el('span', 'hub-chip is-active', `${progress.dueToday} due today`);
    counts.append(today);
  }
  metrics.append(metric, counts);
  const track = el('div', 'hub-track');
  track.setAttribute('aria-hidden', 'true');
  const fill = el('div', 'hub-track__fill');
  fill.style.width = `${progress.pct}%`;
  track.append(fill);
  const list = el('ul', 'task-list');
  const children = tasks.filter((task) => task.parent_project_id === project.id && task.status !== 'dead');
  children.forEach((child, index) => {
    const item = el('li', 'task-item');
    item.style.setProperty('--i', String(index));
    const label = el('label', 'task-check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = child.status === 'done';
    box.setAttribute('aria-label', `Mark ${child.title} done`);
    box.addEventListener('change', () => handlers.onToggleChild?.(child));
    label.append(box, el('span', 'check-box'));
    const dot = el('span', 'priority-dot');
    dot.dataset.priority = priorityDotValue(child.priority);
    const body = el('div', 'task-body');
    body.append(el('span', 'task-name', child.title));
    const childTags = el('div', 'task-tags');
    childTags.append(domainChip(child.domain));
    const kind = dueChipKind(child.due_date);
    const dueLabel = dueChipLabel(child.due_date);
    if (kind && dueLabel) {
      const chip = el('span', `due-chip due-chip--${kind}`, dueLabel);
      childTags.append(chip);
    }
    body.append(childTags);
    item.append(label, dot, body);
    list.append(item);
  });
  const foot = el('footer', 'task-card__foot');
  foot.append(el('span', 'hub-card__meta', formatRelativeUpdated(project.updated_at)));
  card.append(head, title, tags, metrics, track, list, foot);
  attachCardMenu(card, `${project.title} card menu`, projectMenuItems(project, handlers));
  wrap.append(card);
  return wrap;
}

export function removeMountedProjectCard(host: HTMLElement, projectId: string): boolean {
  const card =
    host.querySelector<HTMLElement>(`[data-project-id="${projectId}"]`)?.closest<HTMLElement>('.hub-card-slot') ??
    host.querySelector<HTMLElement>(`[data-project-id="${projectId}"]`);
  if (!card) return false;
  card.remove();
  return true;
}

export function removeMountedTaskCard(host: HTMLElement, taskId: string): boolean {
  const card =
    host.querySelector<HTMLElement>(`[data-id="${taskId}"]`) ??
    host.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)?.closest<HTMLElement>('.hub-card-slot');
  if (!card) return false;
  card.remove();
  return true;
}

export function mountTaskCard(
  host: HTMLElement,
  task: Task,
  handlers: TaskCardHandlers,
  asListItem = false
): HTMLElement {
  const slot = asListItem ? el('li', 'card board-card hub-card-slot') : el('div', 'hub-card-slot');
  if (asListItem) {
    slot.dataset.id = task.id;
    slot.dataset.domain = task.domain;
    slot.dataset.status = task.status;
    slot.tabIndex = 0;
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-roledescription', 'Task card');
  }
  slot.style.viewTransitionName = cardTransitionName(task.id);
  const guard = { current: false };
  let expanded = false;

  function cardHandlers(): TaskCardHandlers {
    return {
      ...handlers,
      onExpand: expanded
        ? undefined
        : () => {
            toggle();
          },
      onCollapse: expanded
        ? () => {
            toggle();
          }
        : undefined
    };
  }

  function paint(): void {
    closeCardMenu();
    slot.replaceChildren(
      expanded ? renderTaskExpandedCard(task, cardHandlers()) : renderTaskMicroCard(task, cardHandlers())
    );
    slot.dataset.state = expanded ? 'expanded' : 'compact';
    slot.classList.toggle('is-focused', isFocusedTaskId(task.id));
    if (asListItem) {
      slot.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      slot.setAttribute('aria-label', `${task.title} task card`);
    }
    const trigger = slot.querySelector<HTMLElement>(expanded ? '.hub-card' : '.hub-row');
    if (!asListItem && trigger && !expanded) {
      trigger.setAttribute('role', 'button');
      trigger.tabIndex = 0;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', `Expand ${task.title} task card`);
      trigger.addEventListener('click', (event) => {
        if (boardCardInteractive(event.target)) return;
        toggle();
      });
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (boardCardInteractive(event.target)) return;
          toggle();
        }
      });
    }
  }

  function toggle(): void {
    const from = morphTarget(slot);
    runContainerTransform(
      () => {
        expanded = !expanded;
        if (expanded) setFocus({ type: 'task', id: task.id });
        paint();
      },
      guard,
      from,
      () => morphTarget(slot)
    );
  }

  if (asListItem) {
    slot.addEventListener('click', (event) => {
      if (boardCardInteractive(event.target)) return;
      toggle();
    });
  }

  host.append(slot);
  paint();
  return slot;
}

export function mountProjectCard(
  host: HTMLElement,
  project: Project,
  tasks: Task[],
  handlers: ProjectCardHandlers = {}
): HTMLElement {
  const slot = el('div', 'hub-card-slot');
  slot.dataset.projectId = project.id;
  slot.style.viewTransitionName = cardTransitionName(project.id);
  const guard = { current: false };
  let expanded = false;

  function paint(): void {
    const expand = () =>
      runContainerTransform(
        () => {
          expanded = true;
          paint();
          slot.querySelector<HTMLButtonElement>('.card-menu')?.focus();
        },
        guard,
        morphTarget(slot),
        () => morphTarget(slot)
      );
    const collapse = () =>
      runContainerTransform(
        () => {
          expanded = false;
          paint();
        },
        guard,
        morphTarget(slot),
        () => morphTarget(slot)
      );
    const activate = () => {
      setFocus({ type: 'project', id: project.id });
      if (handlers.onActivate) handlers.onActivate(project);
      else expand();
    };
    const next: ProjectCardHandlers = {
      ...handlers,
      onExpand: expanded ? undefined : activate,
      onCollapse: expanded ? collapse : undefined
    };
    closeCardMenu();
    slot.replaceChildren(
      expanded ? renderProjectExpandedCard(project, tasks, next) : renderProjectMicroCard(project, tasks, next)
    );
    slot.dataset.state = expanded ? 'expanded' : 'compact';
    const focus = getFocus();
    slot.classList.toggle('is-focused', focus?.type === 'project' && focus.id === project.id);
    if (!expanded) {
      const row = slot.querySelector<HTMLElement>('.proj-row');
      row?.addEventListener('click', (event) => {
        if (isInteractive(event.target)) return;
        activate();
      });
      row?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (isInteractive(event.target)) return;
          activate();
        }
      });
    }
  }

  host.append(slot);
  paint();
  return slot;
}
