import type { Task, TaskDomain, TaskPriority, TaskStatus } from '@/schemas/task';
import type { Project, ProjectStatus, QualityBar } from '@/schemas/project';
import type { Block } from '@/schemas/block';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { mountBlockCanvas, type BlockCanvasHandle } from '@/teacher/lesson-canvas/mount-page';
import { tasksApi } from '@/services/client-api';
import { formatRelativeUpdated, projectChildTasks, projectProgress, statusLabel } from '@/domain/cards';
import type { ExcursionTemplate } from '@/schemas/templates';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { deleteProjectNow, deleteTaskNow } from '@/views/card-actions';
import { renderCardMenu } from '@/views/card-menu';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { openPlusAdd } from '@/views/plus-add';
import { mountTaskCard } from '@/views/hub-cards';
import { requestToggleDone } from '@/views/dashboard';
import { mountBlockInsert } from '@/views/block-insert';
import { paintExcursionPage } from '@/views/excursion-timeline';
import { bindEditablePageTitle } from '@/shell/shell';
import {
  createHubField,
  createHubFilter,
  createHubPills,
  createHubTextarea,
  domainFilterOptions,
  labeledField,
  priorityFilterOptions,
  statusFilterOptions,
  type HubFilterOption
} from '@/views/hub-kit';
import { durationMinutesBetween, endTimeFromStart } from '@/domain/time-grid';
import { projectNextActionHealth } from '@/views/projects';

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
          due_time: current.due_time,
          estimated_duration: current.estimated_duration,
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
    ariaLabel: 'Deadline',
    value: task.due_date ?? '',
    className: 'page-card__due',
    onChange: (value) => persist({ due_date: value || null })
  });
  const target = createHubField({
    type: 'date',
    ariaLabel: 'Target date',
    value: task.target_date ?? '',
    className: 'page-card__target',
    onChange: (value) => persist({ target_date: value || null })
  });
  const review = createHubField({
    type: 'date',
    ariaLabel: 'Review date',
    value: task.review_at ?? '',
    className: 'page-card__review',
    onChange: (value) => persist({ review_at: value || null })
  });
  const start = createHubField({
    type: 'time',
    ariaLabel: 'Start time',
    value: task.due_time ?? '',
    className: 'page-card__start'
  });
  const end = createHubField({
    type: 'time',
    ariaLabel: 'End time',
    value: endTimeFromStart(task.due_time, task.estimated_duration),
    className: 'page-card__end'
  });
  start.input.addEventListener('change', onStartChange);
  start.input.addEventListener('input', onStartChange);
  function onStartChange() {
    const due_time = start.input.value || null;
    persist({ due_time });
    end.input.value = endTimeFromStart(due_time, current.estimated_duration);
  }
  function onEndChange() {
    const value = end.input.value;
    if (!value) {
      persist({ estimated_duration: null });
      return;
    }
    const startVal = start.input.value || current.due_time;
    if (!startVal) {
      // End alone is not a span — treat it as the start (point in time).
      persist({ due_time: value, estimated_duration: null });
      start.input.value = value;
      end.input.value = '';
      return;
    }
    const minutes = durationMinutesBetween(startVal, value);
    if (minutes == null) {
      end.input.value = endTimeFromStart(startVal, current.estimated_duration);
      return;
    }
    persist({ estimated_duration: minutes });
  }
  end.input.addEventListener('change', onEndChange);
  end.input.addEventListener('input', onEndChange);
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

  const dueField = labeledField('Deadline', due.el);
  dueField.classList.add('page-card__when');
  const targetField = labeledField('Target', target.el);
  targetField.classList.add('page-card__when');
  const reviewField = labeledField('Review', review.el);
  reviewField.classList.add('page-card__when');
  const startField = labeledField('Start', start.el);
  startField.classList.add('page-card__when');
  const endField = labeledField('End', end.el);
  endField.classList.add('page-card__when');

  fields.append(
    status.el,
    domain.el,
    priority.el,
    dueField,
    targetField,
    reviewField,
    startField,
    endField,
    project.el
  );

  const notes = createHubTextarea({
    ariaLabel: 'Notes',
    className: 'page-card__notes',
    value: task.description
  });
  notes.input.addEventListener('input', () => persist({ description: notes.input.value }));

  const foot = el('footer', 'task-card__foot');
  foot.append(updated);

  card.append(head, fields, notes.el, foot);
  card.append(
    renderCardMenu(`${task.title} card menu`, [
      {
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => deleteTaskNow(current, () => {
          location.hash = '#/board';
        }, errorHost)
      }
    ])
  );

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
  let liveTasks = tasks;
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
          quality_bar: current.quality_bar,
          purpose: current.purpose,
          desired_outcome: current.desired_outcome,
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

  let qualityValue = (project.quality_bar ?? 'good_enough') as QualityBar;
  const qualityHost = el('div', 'page-card__quality');
  const paintQuality = () => {
    qualityHost.replaceChildren(
      createHubPills({
        label: 'Quality bar',
        role: 'tablist',
        items: [
          { id: 'good_enough', label: 'Good enough' },
          { id: 'high_quality', label: 'High quality' },
          { id: 'exceptional', label: 'Exceptional' }
        ],
        value: qualityValue,
        onSelect: (id) => {
          qualityValue = id as QualityBar;
          persist({ quality_bar: qualityValue });
          paintQuality();
        }
      })
    );
  };
  paintQuality();

  const notes = createHubTextarea({
    ariaLabel: 'Summary',
    className: 'page-card__notes',
    value: project.arc_summary || project.description
  });
  notes.input.addEventListener('input', () =>
    persist({ arc_summary: notes.input.value, description: notes.input.value })
  );

  const metrics = el('div', 'task-card__progress');
  const track = el('div', 'hub-track');
  const confirmHost = el('div', 'task-confirm');
  const taskList = el('div', 'task-stack page-card__tasks');
  taskList.setAttribute('aria-label', 'Project tasks');
  const foot = el('footer', 'task-card__foot');
  foot.append(updated);
  let healthNode: HTMLElement | null = null;

  const acceptTask = (updated: Task) => {
    const index = liveTasks.findIndex((item) => item.id === updated.id);
    liveTasks =
      index >= 0
        ? liveTasks.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...liveTasks];
    paintProjectTasks();
  };

  const paintProjectTasks = () => {
    const progress = projectProgress(current, liveTasks);
    const metric = el('div');
    const pct = el('p', 'hub-hero-metric');
    pct.innerHTML = `${progress.pct}<span class="hub-hero-metric__unit">%</span>`;
    metric.append(pct, el('p', 'hub-hero-metric__lab', `${progress.done} of ${progress.total} tasks complete`));
    metrics.replaceChildren(metric);
    const fill = el('div', 'hub-track__fill');
    fill.style.width = `${progress.pct}%`;
    track.replaceChildren(fill);

    healthNode?.remove();
    healthNode = projectNextActionHealth(current, liveTasks, () => openPlusAdd(card));
    if (healthNode) head.append(healthNode);

    const children = projectChildTasks(current, liveTasks);
    if (!children.length) {
      taskList.replaceChildren(el('p', 'empty-state', 'No tasks on this project yet.'));
      return;
    }
    taskList.replaceChildren();
    for (const child of children) {
      mountTaskCard(taskList, child, {
        onToggle: (item) =>
          requestToggleDone(confirmHost, item, async () => {
            const nextStatus = item.status === 'done' ? 'open' : 'done';
            acceptTask({ ...item, status: nextStatus });
          }),
        onDelete: (item) =>
          deleteTaskNow(item, () => {
            liveTasks = liveTasks.filter((entry) => entry.id !== item.id);
            paintProjectTasks();
          }, confirmHost),
        onEdit: (item) =>
          void renderTaskEditor(confirmHost, item, [current], (saved) => {
            if (saved) acceptTask(saved);
          }),
        onPatch: (item, patch) => {
          void tasksApi.updateTask(item.id, patch).then(acceptTask, (err) => {
            confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err)));
          });
        }
      });
    }
  };

  paintProjectTasks();

  card.append(
    head,
    fields,
    labeledField('Quality bar', qualityHost),
    notes.el,
    metrics,
    track,
    renderQuickAdd((created) => {
      acceptTask(created);
    }, project.id),
    confirmHost,
    taskList,
    foot
  );
  card.append(
    renderCardMenu(`${project.title} card menu`, [
      {
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => deleteProjectNow(current, () => {
          location.hash = '#/projects';
        }, errorHost)
      }
    ])
  );

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
