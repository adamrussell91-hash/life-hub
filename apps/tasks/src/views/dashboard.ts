import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  adaptiveTodayTasks,
  backlogTasks,
  hubCalendarDate,
  preferredDomains,
  searchEntities,
  snapHubDueTime,
  toDateKey
} from '@/domain/queries';
import { parseDueTimeHours } from '@/domain/daily-dial';
import { hoursToDueTime } from '@/domain/time-grid';
import { tasksApi } from '@/services/client-api';
import type { TaskTemplate, ProjectTemplate, ExcursionTemplate } from '@/schemas/templates';
import { renderPressureStrips } from '@/views/pinch-strip';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { openPlusAdd } from '@/views/plus-add';
import { deleteProjectNow, deleteTaskNow } from '@/views/card-actions';
import { mountProjectCard, mountTaskCard, removeMountedProjectCard, removeMountedTaskCard } from '@/views/hub-cards';
import { projectPageHash } from '@/domain/cards';
import { defaultExcursionEventDate } from '@/domain/excursion';
import { DEFAULT_EXCURSION_TITLE } from '@/domain/excursion-catalog';
import type { TaskDomain, TaskPriority } from '@/schemas/task';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  createHubField,
  createHubFilter,
  createHubPills,
  createHubSearch,
  domainFilterOptions,
  el,
  priorityFilterOptions
} from '@/views/hub-kit';
import { mountDailyDial, type DailyDialHandle } from '@/views/daily-dial';

export { renderProjectsView } from '@/views/projects';

let dayDomain: TaskDomain | 'all' = 'all';
let dayPriority: TaskPriority | 'all' = 'all';
let backlogDomain: TaskDomain | 'all' = 'all';
let backlogPriority: TaskPriority | 'all' = 'all';
let backlogTag = '';
let searchDomain: TaskDomain | 'all' = 'all';
let searchKind: 'all' | 'tasks' | 'projects' = 'all';
let templateKind: 'all' | 'task' | 'project' | 'excursion' = 'all';

function appendTaskCard(
  host: HTMLElement,
  task: Task,
  confirmHost: HTMLElement,
  handlers: {
    onRemoved: () => void | Promise<void>;
    onChanged: () => void | Promise<void>;
  },
  projects: Project[] = []
): void {
  mountTaskCard(host, task, {
    onToggle: (current) => requestToggleDone(confirmHost, current, async () => {
      await handlers.onChanged();
    }),
    onDelete: (current) => deleteTaskNow(current, handlers.onRemoved, confirmHost),
    onEdit: (current) => void renderTaskEditor(confirmHost, current, projects, () => void handlers.onChanged()),
    onPatch: (current, patch) => {
      void tasksApi.updateTask(current.id, patch).then(
        () => void handlers.onChanged(),
        (err: unknown) => {
          confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not save')));
        }
      );
    }
  });
}

function upsertTask(list: Task[], task: Task): Task[] {
  const index = list.findIndex((entry) => entry.id === task.id);
  if (index >= 0) {
    list[index] = task;
    return list;
  }
  list.push(task);
  return list;
}

function dropTask(list: Task[], id: string): Task[] {
  return list.filter((entry) => entry.id !== id);
}

export async function markTaskOpen(task: Task): Promise<void> {
  await tasksApi.updateTask(task.id, { status: 'open' });
}

export async function markTaskDone(task: Task, actualMinutes?: number): Promise<void> {
  if (actualMinutes != null && !Number.isNaN(actualMinutes)) {
    await tasksApi.recordClareActual(task.id, actualMinutes);
    return;
  }
  await tasksApi.updateTask(task.id, { status: 'done' });
}

/** Done that needs an actual: confirm card. Discard / cancel leaves status unchanged. */
export function requestToggleDone(
  host: HTMLElement,
  task: Task,
  onDone: () => Promise<void>
): void {
  if (task.status === 'done') {
    void markTaskOpen(task).then(onDone).catch((err) => {
      host.append(el('p', 'empty-state', errorMessage(err)));
    });
    return;
  }
  if (!(task.estimated_duration && task.actual_duration == null)) {
    void markTaskDone(task).then(onDone).catch((err) => {
      host.append(el('p', 'empty-state', errorMessage(err)));
    });
    return;
  }

  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm done');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', `Done — ${task.title}`));
  card.append(
    el(
      'p',
      'page-header__supporting',
      `Clare guessed ${task.estimated_duration} minutes. Discard leaves this task open.`
    )
  );
  const minutes = createHubField({
    type: 'number',
    ariaLabel: 'Actual minutes',
    min: '1',
    step: '5',
    value: String(task.estimated_duration)
  });
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    const value = Number(minutes.input.value);
    if (!value || Number.isNaN(value)) {
      host.append(el('p', 'empty-state', 'Enter actual minutes, or Discard.'));
      return;
    }
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await markTaskDone(task, value);
      await onDone();
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, confirm);
  card.append(minutes.el, actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export async function renderDayView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading…', '.day-view');
  let tasks: Task[];
  let projects: Project[];
  let liveDial: DailyDialHandle | null = null;
  let dialFocusHour: number | null = null;
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderDayView(canvas), 'Could not load Today');
    return;
  }

  function paint(): void {
    liveDial?.destroy();
    liveDial = null;
    const today = hubCalendarDate();
    const todayKey = toDateKey(today);
    const defaultDueTime = snapHubDueTime();
    const list = adaptiveTodayTasks(tasks, today).filter((t) => {
      if (dayDomain !== 'all' && t.domain !== dayDomain) return false;
      if (dayPriority !== 'all' && t.priority !== dayPriority) return false;
      return true;
    });
    const prefs = preferredDomains(today);
    const scrollTop = canvas.scrollTop;

    canvas.replaceChildren();
    canvas.append(
      el('p', 'view-lede day-view', `Focus: ${prefs.join(', ')} · ${formatDisplayDate(today)}`)
    );

    const filters = createCollapsibleFilters({
      id: 'today',
      ariaLabel: 'Filters',
      active: dayDomain !== 'all' || dayPriority !== 'all'
    });
    filters.panel.append(
      createHubFilter({
        key: 'Domain',
        label: 'Domain',
        defaultValue: 'all',
        options: domainFilterOptions(),
        value: dayDomain,
        onChange: (value) => {
          dayDomain = value as TaskDomain | 'all';
          paint();
        }
      }).el,
      createHubFilter({
        key: 'Priority',
        label: 'Priority',
        defaultValue: 'all',
        options: priorityFilterOptions(),
        value: dayPriority,
        onChange: (value) => {
          dayPriority = value as TaskPriority | 'all';
          paint();
        }
      }).el
    );
    canvas.append(filters.root);

    const confirmHost = el('div', 'task-confirm');
    const dialHost = el('div', 'daily-dial-host');
    canvas.append(dialHost);

    function seedComposeAtHour(hour: number): void {
      dialFocusHour = hour;
      openPlusAdd(canvas);
      const time = canvas.querySelector<HTMLInputElement>('input[aria-label="Start time"]');
      if (time) time.value = hoursToDueTime(hour);
      canvas.querySelector<HTMLInputElement>('input[aria-label="New task title"]')?.focus();
    }

    function remountDial(): void {
      liveDial?.destroy();
      liveDial = mountDailyDial(dialHost, {
        tasks,
        projects,
        date: today,
        filters: { domain: dayDomain, priority: dayPriority },
        focusHour: dialFocusHour,
        onOpen: (task) => {
          void renderTaskEditor(confirmHost, task, projects, async () => {
            tasks = await tasksApi.listTasks().catch(() => tasks);
            paint();
          });
        },
        onHourSelect: seedComposeAtHour
      });
    }

    const clareLink = el('p', 'clare-inline');
    const goClare = el('button', 'btn btn--secondary', 'Talk to Clare');
    goClare.type = 'button';
    goClare.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('tasks-hub:open-clare'));
    });
    clareLink.append(goClare);
    canvas.append(clareLink);

    const pressure = el('div', 'pressure-host');
    renderPressureStrips(pressure, tasks, today, () => void paint());
    canvas.append(pressure);
    canvas.append(
      renderQuickAdd(
        (created) => {
          upsertTask(tasks, created);
          const start = parseDueTimeHours(created.due_time);
          dialFocusHour = start != null ? Math.floor(start) : dialFocusHour;
          // Full in-memory repaint so the dial + list show the new task immediately.
          paint();
        },
        null,
        { dueDate: todayKey, dueTime: defaultDueTime }
      )
    );
    canvas.append(confirmHost);

    async function afterDayMutation(taskId: string): Promise<void> {
      removeMountedTaskCard(canvas, taskId);
      tasks = dropTask(tasks, taskId);
      const pressure = canvas.querySelector('.pressure-host');
      if (pressure instanceof HTMLElement) {
        renderPressureStrips(pressure, tasks, today, () => void paint());
      }
      if (!canvas.querySelector('.hub-card-slot') && !canvas.querySelector('.empty-state')) {
        canvas.append(
          el('p', 'empty-state', 'Nothing due today in the preferred domains. Check Backlog or Week.')
        );
      }
      remountDial();
    }

    remountDial();

    if (!list.length) {
      canvas.append(
        el('p', 'empty-state', 'Nothing due today in the preferred domains. Check Backlog or Week.')
      );
      canvas.scrollTop = scrollTop;
      return;
    }
    const stack = el('div', 'task-stack');
    for (const task of list) {
      appendTaskCard(
        stack,
        task,
        confirmHost,
        {
          onRemoved: () => afterDayMutation(task.id),
          onChanged: async () => {
            tasks = await tasksApi.listTasks().catch(() => tasks);
            paint();
          }
        },
        projects
      );
    }
    canvas.append(stack);
    canvas.scrollTop = scrollTop;
  }

  paint();
}

export async function renderListView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading…', '.backlog-view');
  let tasks: Task[];
  let projects: Project[];
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderListView(canvas), 'Could not load Backlog');
    return;
  }

  function paint(): void {
    const tags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
    let list = backlogTasks(tasks);
    if (backlogDomain !== 'all') list = list.filter((t) => t.domain === backlogDomain);
    if (backlogPriority !== 'all') list = list.filter((t) => t.priority === backlogPriority);
    if (backlogTag) list = list.filter((t) => t.tags.includes(backlogTag));
    const scrollTop = canvas.scrollTop;

    canvas.replaceChildren();
    const filters = createCollapsibleFilters({
      id: 'backlog',
      ariaLabel: 'Filters',
      className: 'board-filter backlog-view',
      active: backlogDomain !== 'all' || backlogPriority !== 'all' || Boolean(backlogTag)
    });
    filters.panel.append(
      createHubFilter({
        key: 'Domain',
        label: 'Domain',
        defaultValue: 'all',
        options: domainFilterOptions(),
        value: backlogDomain,
        onChange: (value) => {
          backlogDomain = value as TaskDomain | 'all';
          paint();
        }
      }).el,
      createHubFilter({
        key: 'Priority',
        label: 'Priority',
        defaultValue: 'all',
        options: priorityFilterOptions(),
        value: backlogPriority,
        onChange: (value) => {
          backlogPriority = value as TaskPriority | 'all';
          paint();
        }
      }).el,
      createHubFilter({
        key: 'Tag',
        label: 'Tag',
        defaultValue: '',
        options: [{ value: '', label: 'All tags' }, ...tags.map((tag) => ({ value: tag, label: tag }))],
        value: backlogTag,
        onChange: (value) => {
          backlogTag = value;
          paint();
        }
      }).el
    );
    canvas.append(filters.root);
    const confirmHost = el('div', 'task-confirm');
    canvas.append(
      renderQuickAdd((created) => {
        upsertTask(tasks, created);
        canvas.querySelector('.empty-state')?.remove();
        let stack = canvas.querySelector<HTMLElement>('.task-stack');
        if (!stack) {
          stack = el('div', 'task-stack');
          canvas.append(stack);
        }
        if (!stack.querySelector(`[data-task-id="${created.id}"]`) && backlogTasks([created]).length) {
          appendTaskCard(stack, created, confirmHost, backlogHandlers(created.id), projects);
          return;
        }
        paint();
      })
    );
    canvas.append(confirmHost);

    function backlogHandlers(taskId: string): {
      onRemoved: () => void;
      onChanged: () => Promise<void>;
    } {
      return {
        onRemoved: () => {
          removeMountedTaskCard(canvas, taskId);
          tasks = dropTask(tasks, taskId);
          if (!canvas.querySelector('.hub-card-slot') && !canvas.querySelector('.empty-state')) {
            canvas.append(el('p', 'empty-state', 'Backlog is clear.'));
          }
        },
        onChanged: async () => {
          tasks = await tasksApi.listTasks().catch(() => tasks);
          paint();
        }
      };
    }

    if (!list.length) {
      canvas.append(el('p', 'empty-state', 'Backlog is clear.'));
      canvas.scrollTop = scrollTop;
      return;
    }
    const stack = el('div', 'task-stack');
    for (const task of list) {
      appendTaskCard(stack, task, confirmHost, backlogHandlers(task.id), projects);
    }
    canvas.append(stack);
    canvas.scrollTop = scrollTop;
  }

  paint();
}

export async function renderSearchView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = el('form', 'search-form hub-toolbar');
  const search = createHubSearch({
    placeholder: 'Search tasks and projects…',
    ariaLabel: 'Search'
  });
  const results = el('div', 'task-stack');
  const runSearch = async () => {
    const q = search.input.value.trim();
    if (q.length < 2) {
      results.replaceChildren();
      return;
    }
    try {
      const data = await tasksApi.search(q);
      const filtered = applySearchFilters(data.tasks, data.projects);
      paintSearch(results, filtered.tasks, filtered.projects);
    } catch {
      const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
      const data = searchEntities(tasks, projects, q);
      const filtered = applySearchFilters(data.tasks, data.projects);
      paintSearch(results, filtered.tasks, filtered.projects);
    }
  };
  const filters = createCollapsibleFilters({
    id: 'search',
    ariaLabel: 'Filters',
    className: 'hub-filters--inline',
    active: searchDomain !== 'all' || searchKind !== 'all'
  });
  filters.panel.append(
    createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: searchDomain,
      onChange: (value) => {
        searchDomain = value as TaskDomain | 'all';
        void runSearch();
      }
    }).el,
    createHubPills({
      label: 'Search in',
      items: [
        { id: 'all', label: 'All' },
        { id: 'tasks', label: 'Tasks' },
        { id: 'projects', label: 'Projects' }
      ],
      value: searchKind,
      onSelect: (id) => {
        searchKind = id;
        void runSearch();
      }
    })
  );
  form.append(search.el, filters.root);
  form.addEventListener('submit', (e) => e.preventDefault());
  search.input.addEventListener('input', () => void runSearch());
  const confirmHost = el('div', 'task-confirm');
  canvas.append(form, results, confirmHost);
}

function applySearchFilters(tasks: Task[], projects: Project[]): { tasks: Task[]; projects: Project[] } {
  const nextTasks =
    searchKind === 'projects'
      ? []
      : searchDomain === 'all'
        ? tasks
        : tasks.filter((task) => task.domain === searchDomain);
  const nextProjects = searchKind === 'tasks' ? [] : projects;
  return { tasks: nextTasks, projects: nextProjects };
}

async function refreshSearch(host: HTMLElement): Promise<void> {
  const input = host.previousElementSibling?.querySelector('input');
  const q = input instanceof HTMLInputElement ? input.value.trim() : '';
  if (q.length < 2) {
    host.replaceChildren();
    return;
  }
  try {
    const data = await tasksApi.search(q);
    const filtered = applySearchFilters(data.tasks, data.projects);
    paintSearch(host, filtered.tasks, filtered.projects);
  } catch {
    const [allTasks, allProjects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
    const data = searchEntities(allTasks, allProjects, q);
    const filtered = applySearchFilters(data.tasks, data.projects);
    paintSearch(host, filtered.tasks, filtered.projects);
  }
}

function paintSearch(host: HTMLElement, tasks: Task[], projects: Project[]): void {
  host.replaceChildren();
  if (!tasks.length && !projects.length) {
    host.append(el('p', 'empty-state', 'No matches.'));
    return;
  }
  const confirmHost = host.parentElement?.querySelector('.task-confirm');
  for (const project of projects) {
    mountProjectCard(host, project, tasks, {
      onOpenPage: (current) => {
        location.hash = projectPageHash(current.id);
      },
      onDelete:
        confirmHost instanceof HTMLElement
          ? (current) =>
              deleteProjectNow(
                current,
                () => {
                  removeMountedProjectCard(host, current.id);
                },
                confirmHost
              )
          : undefined
    });
  }
  for (const task of tasks) {
    if (confirmHost instanceof HTMLElement) {
      appendTaskCard(
        host,
        task,
        confirmHost,
        {
          onRemoved: () => {
            removeMountedTaskCard(host, task.id);
          },
          onChanged: () => refreshSearch(host)
        },
        projects
      );
    }
  }
}

function showTemplateConfirm(
  host: HTMLElement,
  title: string,
  summary: string,
  onConfirm: () => Promise<void>
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm template use');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', title));
  card.append(el('p', 'page-header__supporting', `${summary} Do not apply until Confirm.`));
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await onConfirm();
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export async function renderTemplatesView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading…', '.template-confirm');
  let data: Awaited<ReturnType<typeof tasksApi.listTemplates>>;
  try {
    data = await tasksApi.listTemplates();
  } catch (err) {
    renderLoadError(canvas, err, () => void renderTemplatesView(canvas), 'Could not load templates');
    return;
  }
  canvas.replaceChildren();
  const confirmHost = el('div', 'template-confirm');
  const toolbar = createCollapsibleFilters({
    id: 'templates',
    ariaLabel: 'Filters',
    active: templateKind !== 'all'
  });
  toolbar.panel.append(
    createHubPills({
      label: 'Template type',
      role: 'tablist',
      items: [
        { id: 'all', label: 'All' },
        { id: 'task', label: 'Task' },
        { id: 'project', label: 'Project' },
        { id: 'excursion', label: 'Excursion' }
      ],
      value: templateKind,
      onSelect: (id) => {
        templateKind = id;
        void renderTemplatesView(canvas);
      }
    })
  );
  canvas.append(toolbar.root);

  if (templateKind === 'all' || templateKind === 'task') {
  canvas.append(el('h2', 'section-title', 'Task templates'));
  const taskStack = el('div', 'task-stack');
  for (const tt of data.task_templates as TaskTemplate[]) {
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => {
      showTemplateConfirm(
        confirmHost,
        `Create “${tt.name}”`,
        `This will create a ${tt.domain} task from the template and open Today.`,
        async () => {
          await tasksApi.createTaskFromTemplate(tt.id);
          location.hash = '#/day';
        }
      );
    });
    actions.append(use);
    row.append(el('h3', 'task-row__title', tt.name), el('span', 'chip', tt.domain), actions);
    taskStack.append(row);
  }
  canvas.append(taskStack);
  }

  if (templateKind === 'all' || templateKind === 'project' || templateKind === 'excursion') {
  canvas.append(el('h2', 'section-title', 'Project & excursion templates'));
  const projStack = el('div', 'task-stack');
  for (const pt of data.project_templates as ProjectTemplate[]) {
    if (templateKind === 'excursion' && pt.type !== 'excursion') continue;
    if (templateKind === 'project' && pt.type === 'excursion') continue;
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => {
      if (pt.type === 'excursion' && pt.excursion_template_id) {
        const excursionTemplateId = pt.excursion_template_id;
        showTemplateConfirm(
          confirmHost,
          `Create “${DEFAULT_EXCURSION_TITLE}”`,
          `This will create the excursion with dated admin tasks and open its page.`,
          async () => {
            const result = await tasksApi.createExcursionFromTemplate({
              excursion_template_id: excursionTemplateId,
              title: DEFAULT_EXCURSION_TITLE,
              event_date: defaultExcursionEventDate()
            });
            location.hash = projectPageHash(result.project.id);
          }
        );
        return;
      }
      showTemplateConfirm(
        confirmHost,
        `Create “${pt.name}”`,
        `This will create a ${pt.type} project with ${pt.default_milestones.length} default milestone(s) and open Projects.`,
        async () => {
          await tasksApi.createProjectFromTemplate(pt.id);
          location.hash = '#/projects';
        }
      );
    });
    actions.append(use);
    row.append(el('h3', 'task-row__title', pt.name), el('span', 'chip', pt.type), actions);
    projStack.append(row);
  }
  for (const et of data.excursion_templates as ExcursionTemplate[]) {
    if (templateKind === 'project') continue;
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => {
      showTemplateConfirm(
        confirmHost,
        `Create “${DEFAULT_EXCURSION_TITLE}”`,
        `This will create the excursion with dated admin tasks and open its page.`,
        async () => {
          const result = await tasksApi.createExcursionFromTemplate({
            excursion_template_id: et.id,
            title: DEFAULT_EXCURSION_TITLE,
            event_date: defaultExcursionEventDate()
          });
          location.hash = projectPageHash(result.project.id);
        }
      );
    });
    actions.append(use);
    row.append(
      el('h3', 'task-row__title', et.name),
      el('span', 'chip', 'excursion'),
      el('p', 'task-row__desc', et.checklist_items.join(' · ')),
      actions
    );
    projStack.append(row);
  }
  canvas.append(projStack);
  }
  canvas.append(confirmHost);
}
