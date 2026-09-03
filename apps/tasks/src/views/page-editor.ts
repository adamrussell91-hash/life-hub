import type { Task, TaskDomain, TaskPriority, TaskStatus } from '@/schemas/task';
import type { Project, ProjectStatus } from '@/schemas/project';
import type { Block } from '@/schemas/block';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { mountBlockCanvas, type BlockCanvasHandle } from '@/teacher/lesson-canvas/mount-page';
import { tasksApi } from '@/services/client-api';
import { formatRelativeUpdated, projectProgress, statusLabel } from '@/domain/cards';
import type { ExcursionTemplate } from '@/schemas/templates';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { renderQuickAdd } from '@/views/task-editor';
import { mountBlockInsert } from '@/views/block-insert';
import { paintExcursionPage } from '@/views/excursion-timeline';
import { bindEditablePageTitle } from '@/shell/shell';
import {
  createHubField,
  createHubFilter,
  createHubTextarea,
  domainFilterOptions,
  priorityFilterOptions,
  statusFilterOptions,
  type HubFilterOption
} from '@/views/hub-kit';

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

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'stalled', 'revived', 'archived_dead'];

export type EntityPageRef = { kind: 'task' | 'project'; id: string };

export type PageEditorOptions = { header?: HTMLElement };

function pageBlocksOf(entity: Task | Project): Block[] {
  return Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
}

function pageFilter(
  className: string,
  key: string,
  options: HubFilterOption[],
  value: string,
  onChange: (value: string) => void
) {
  const filter = createHubFilter({
    key,
    label: key,
    defaultValue: value,
    options,
    value,
    onChange
  });
  filter.el.classList.add(className);
  return filter;
}

function backLink(href: string, label: string): HTMLAnchorElement {
  const link = el('a', 'page-card__back', label) as HTMLAnchorElement;
  link.href = href;
  return link;
}

function mountEngine(
  layout: HTMLElement,
  canvasHost: HTMLElement,
  blocks: Block[],
  onChange: (blocks: Block[]) => void
): BlockCanvasHandle {
  const handle = mountBlockCanvas(canvasHost, {
    blocks,
    idFactory: nextBlockIdFactory('block', blocks),
    onChange
  });

  const add = el('div', 'page-editor__add');
  mountBlockInsert(add, {
    onInsert: (type) => handle.insertType(type)
  });
  layout.append(add, canvasHost);
  return handle;
}

export async function renderPageEditor(
  canvas: HTMLElement,
  ref: EntityPageRef,
  options: PageEditorOptions = {}
): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading page…'));
  const reload = () => renderPageEditor(canvas, ref, options);
  try {
    if (ref.kind === 'task') {
      const [task, projects] = await Promise.all([
        tasksApi.getTask(ref.id),
        tasksApi.listProjects().catch(() => [] as Project[])
      ]);
      if (!task) throw new Error('Task not found');
      paintTaskPage(canvas, task, projects, options.header);
      return;
    }
    const [project, tasks, templates] = await Promise.all([
      tasksApi.getProject(ref.id),
      tasksApi.listTasks(),
      tasksApi.listTemplates().catch(() => null)
    ]);
    if (!project) throw new Error('Project not found');
    if (project.type === 'excursion') {
      const template =
        templates?.excursion_templates.find(
          (item: ExcursionTemplate) => item.id === project.competition_or_event_type
        ) ?? templates?.excursion_templates[0];
      paintExcursionPage(canvas, project, tasks, template, reload, options.header);
      return;
    }
    paintProjectPage(canvas, project, tasks, options.header);
  } catch (err) {
    renderLoadError(canvas, err, () => void reload(), 'Could not open page');
  }
}

function paintTaskPage(
  canvas: HTMLElement,
  task: Task,
  projects: Project[],
  header?: HTMLElement
): void {
  let current = task;
  let saveTimer: number | undefined;
  const errorHost = el('p', 'empty-state');
  errorHost.hidden = true;
  const updated = el('span', 'hub-card__meta', formatRelativeUpdated(task.updated_at));

  const persist = (patch: Partial<Task>) => {
    current = { ...current, ...patch };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void tasksApi
        .updateTask(current.id, {
          title: current.title,
          description: current.description,
          domain: current.domain,
          priority: current.priority,
          status: current.status,
          due_date: current.due_date,
          parent_project_id: current.parent_project_id,
          page_blocks: current.page_blocks
        })
        .then(
          (next) => {
            current = { ...current, ...next };
            updated.textContent = formatRelativeUpdated(next.updated_at);
            errorHost.hidden = true;
            errorHost.textContent = '';
          },
          (err) => {
            errorHost.hidden = false;
            errorHost.textContent = errorMessage(err);
          }
        );
    }, 400);
  };

  bindEditablePageTitle(header, task.title, {
    onChange: (value) => persist({ title: value }),
    current: () => current.title
  });

  const page = el('div', 'page-editor');
  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(backLink('#/board', '← Dashboard'));

  const fields = el('div', 'page-card__fields hub-toolbar');
  const status = pageFilter(
    'page-card__status',
    'Status',
    statusFilterOptions(false),
    task.status,
    (value) => persist({ status: value as TaskStatus })
  );
  const domain = pageFilter(
    'page-card__domain',
    'Domain',
    domainFilterOptions(false),
    task.domain,
    (value) => persist({ domain: value as TaskDomain })
  );
  const priority = pageFilter(
    'page-card__priority',
    'Priority',
    priorityFilterOptions(false),
    task.priority,
    (value) => persist({ priority: value as TaskPriority })
  );
  const due = createHubField({
    type: 'date',
    ariaLabel: 'Due date',
    value: task.due_date ?? '',
    className: 'page-card__due',
    onChange: (value) => persist({ due_date: value || null })
  });
  const project = pageFilter(
    'page-card__project',
    'Project',
    [
      { value: '', label: 'No project' },
      ...projects
        .filter((item) => item.status !== 'archived_dead')
        .map((item) => ({ value: item.id, label: item.title }))
    ],
    task.parent_project_id ?? '',
    (value) => persist({ parent_project_id: value || null })
  );

  fields.append(status.el, domain.el, priority.el, due.el, project.el);

  const notes = createHubTextarea({
    ariaLabel: 'Notes',
    className: 'page-card__notes',
    value: task.description
  });
  notes.input.addEventListener('input', () => persist({ description: notes.input.value }));

  const foot = el('footer', 'task-card__foot');
  foot.append(updated);

  card.append(head, fields, notes.el, foot);

  const canvasHost = el('div', 'block-canvas');
  const layout = el('div', 'page-editor__layout');
  try {
    mountEngine(layout, canvasHost, pageBlocksOf(current), (blocks) => persist({ page_blocks: blocks }));
  } catch (err) {
    layout.replaceChildren(
      el('p', 'empty-state', `Could not open the lesson canvas: ${errorMessage(err)}`)
    );
  }

  page.append(card, errorHost, layout);
  canvas.replaceChildren(page);
}

function paintProjectPage(
  canvas: HTMLElement,
  project: Project,
  tasks: Task[],
  header?: HTMLElement
): void {
  let current = project;
  let saveTimer: number | undefined;
  const errorHost = el('p', 'empty-state');
  errorHost.hidden = true;
  const updated = el('span', 'hub-card__meta', formatRelativeUpdated(project.updated_at));

  const persist = (patch: Partial<Project>) => {
    current = { ...current, ...patch };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void tasksApi
        .updateProject(current.id, {
          title: current.title,
          description: current.description,
          arc_summary: current.arc_summary,
          status: current.status,
          current_end_date: current.current_end_date,
          page_blocks: current.page_blocks
        })
        .then(
          (next) => {
            current = { ...current, ...next };
            updated.textContent = formatRelativeUpdated(next.updated_at);
            errorHost.hidden = true;
            errorHost.textContent = '';
          },
          (err) => {
            errorHost.hidden = false;
            errorHost.textContent = errorMessage(err);
          }
        );
    }, 400);
  };

  bindEditablePageTitle(header, project.title, {
    onChange: (value) => persist({ title: value }),
    current: () => current.title
  });

  const progress = projectProgress(project, tasks);
  const page = el('div', 'page-editor');
  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(backLink('#/projects', '← Projects'));

  const fields = el('div', 'page-card__fields hub-toolbar');
  const status = pageFilter(
    'page-card__status',
    'Status',
    PROJECT_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
    project.status,
    (value) => persist({ status: value as ProjectStatus })
  );
  const due = createHubField({
    type: 'date',
    ariaLabel: 'Target date',
    value: project.current_end_date ?? '',
    className: 'page-card__due',
    onChange: (value) => persist({ current_end_date: value || null })
  });
  fields.append(status.el, due.el);

  const notes = createHubTextarea({
    ariaLabel: 'Summary',
    className: 'page-card__notes',
    value: project.arc_summary || project.description
  });
  notes.input.addEventListener('input', () =>
    persist({ arc_summary: notes.input.value, description: notes.input.value })
  );

  const metrics = el('div', 'task-card__progress');
  const metric = el('div');
  const pct = el('p', 'hub-hero-metric');
  pct.innerHTML = `${progress.pct}<span class="hub-hero-metric__unit">%</span>`;
  metric.append(pct, el('p', 'hub-hero-metric__lab', `${progress.done} of ${progress.total} tasks complete`));
  metrics.append(metric);
  const track = el('div', 'hub-track');
  const fill = el('div', 'hub-track__fill');
  fill.style.width = `${progress.pct}%`;
  track.append(fill);
  const foot = el('footer', 'task-card__foot');
  foot.append(updated);

  card.append(head, fields, notes.el, metrics, track);
  card.append(
    renderQuickAdd(
      () => void renderPageEditor(canvas, { kind: 'project', id: project.id }, { header }),
      project.id
    )
  );
  card.append(foot);

  const canvasHost = el('div', 'block-canvas');
  const layout = el('div', 'page-editor__layout');
  try {
    mountEngine(layout, canvasHost, pageBlocksOf(current), (blocks) => persist({ page_blocks: blocks }));
  } catch (err) {
    layout.replaceChildren(
      el('p', 'empty-state', `Could not open the lesson canvas: ${errorMessage(err)}`)
    );
  }

  page.append(card, errorHost, layout);
  canvas.replaceChildren(page);
}
