import type { Project, ProjectStatus, PermissionNote } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';
import type { Block } from '@/schemas/block';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import { renderEntityBanner } from '@/teacher/entity-banner';
import { tasksApi } from '@/services/client-api';
import {
  formatRelativeUpdated,
  projectProgress,
  statusBadgeClass,
  statusLabel,
  taskPageHash
} from '@/domain/cards';
import { adminTaskKind, shiftExcursionDates } from '@/domain/excursion';
import {
  collectExcursionStops,
  layoutExcursionTimeline,
  TIMELINE_NODE_R,
  type LaidTimelineStop
} from '@/domain/excursion-timeline';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { errorMessage } from '@/views/feedback';
import { deleteTaskNow } from '@/views/card-actions';
import { requestToggleDone } from '@/views/dashboard';
import { materializeExcursionAdminTask } from '@/views/excursion-admin';
import { mountTaskCard } from '@/views/hub-cards';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { mountBlockInsert } from '@/views/block-insert';
import {
  createHubField,
  createHubFilter,
  el,
  type HubFilterOption
} from '@/views/hub-kit';

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'stalled', 'revived', 'archived_dead'];

function pageBlocksOf(entity: Project): Block[] {
  return Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
}

function backLink(href: string, label: string): HTMLAnchorElement {
  const link = el('a', 'page-card__back', label) as HTMLAnchorElement;
  link.href = href;
  return link;
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

function renderProgress(project: Project, tasks: Task[]): HTMLElement {
  const progress = projectProgress(project, tasks);
  const host = el('section', 'excursion-progress');
  host.setAttribute('aria-label', 'Excursion progress');
  const copy = el('div', 'excursion-progress__copy');
  const pct = el('p', 'hub-hero-metric');
  pct.innerHTML = `${progress.pct}<span class="hub-hero-metric__unit">%</span>`;
  copy.append(
    pct,
    el('p', 'hub-hero-metric__lab', `${progress.done} of ${progress.total} tasks complete`)
  );
  const track = el('div', 'hub-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(progress.pct));
  track.setAttribute('aria-label', `${progress.pct} percent complete`);
  const fill = el('div', 'hub-track__fill');
  fill.style.width = `${progress.pct}%`;
  track.append(fill);
  host.append(copy, track);
  return host;
}

function renderJoiner(kind: 'up' | 'down'): HTMLElement {
  const joiner = el('div', `excursion-timeline__joiner excursion-timeline__joiner--${kind}`);
  joiner.setAttribute('aria-hidden', 'true');
  return joiner;
}

function renderNode(stop: LaidTimelineStop): SVGSVGElement {
  const size = TIMELINE_NODE_R * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute(
    'class',
    `excursion-timeline__node${stop.kind === 'event' ? ' is-event' : ''}${stop.task?.status === 'done' ? ' is-done' : ''}`
  );
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('class', 'map-tick__mark');
  circle.setAttribute('cx', String(TIMELINE_NODE_R));
  circle.setAttribute('cy', String(TIMELINE_NODE_R));
  circle.setAttribute('r', String(TIMELINE_NODE_R - 1.75));
  circle.setAttribute('fill', 'var(--paper)');
  circle.setAttribute('stroke', 'var(--marine)');
  circle.setAttribute('stroke-width', '3.5');
  svg.append(circle);
  return svg;
}

function afterTaskSave(
  task: Task,
  saved: Task | undefined,
  reload: () => Promise<void>,
  onEventDate?: (date: string) => void
): void | Promise<void> {
  if (
    adminTaskKind(task) === 'event' &&
    saved?.due_date &&
    saved.due_date !== task.due_date &&
    onEventDate
  ) {
    onEventDate(saved.due_date);
    return;
  }
  return reload();
}

function renderMissingCard(
  stop: LaidTimelineStop,
  project: Project,
  confirmHost: HTMLElement,
  reload: () => Promise<void>,
  onEventDate?: (date: string) => void
): HTMLElement {
  const row = el('article', 'hub-row');
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.dataset.cardKind = 'task';
  if (stop.adminKind) row.dataset.adminKind = stop.adminKind;
  row.setAttribute('aria-label', `Edit ${stop.label}`);
  const chips = el('div', 'hub-chips');
  const domain = el('span', 'hub-chip', 'Teaching');
  domain.dataset.area = 'teaching';
  chips.append(domain);
  const foot = el('div', 'hub-row__foot');
  const meta = el('div', 'hub-row__foot-meta');
  meta.append(el('span', 'date-badge', formatDisplayDate(stop.date)));
  foot.append(meta);
  row.append(el('p', 'hub-row__title card-title', stop.label), chips, foot);

  const open = async () => {
    if (!stop.adminKind) return;
    row.setAttribute('aria-busy', 'true');
    try {
      const created = await materializeExcursionAdminTask(project, stop.adminKind, stop.date);
      await renderTaskEditor(confirmHost, created, [project], (saved) =>
        afterTaskSave(created, saved, reload, onEventDate)
      );
    } catch (err) {
      confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    } finally {
      row.removeAttribute('aria-busy');
    }
  };
  row.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    void open();
  });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void open();
    }
  });
  return row;
}

function renderStop(
  stop: LaidTimelineStop,
  project: Project,
  confirmHost: HTMLElement,
  reload: () => Promise<void>,
  join: { up: boolean; down: boolean },
  onEventDate?: (date: string) => void
): HTMLElement {
  const row = el('li', 'excursion-timeline__stop');
  row.dataset.kind = stop.kind;
  row.dataset.id = stop.id;
  const when = document.createElement('time');
  when.className = 'excursion-timeline__when';
  when.dateTime = stop.date;
  when.textContent = formatDisplayDate(stop.date);
  const rail = el('div', 'excursion-timeline__mark');
  if (join.up) rail.append(renderJoiner('up'));
  rail.append(renderNode(stop));
  if (join.down) rail.append(renderJoiner('down'));
  const body = el('div', 'excursion-timeline__card');
  if (stop.task) {
    mountTaskCard(body, stop.task, {
      onToggle: (task) => requestToggleDone(confirmHost, task, reload),
      onEdit: (task) =>
        void renderTaskEditor(confirmHost, task, [project], (saved) =>
          afterTaskSave(task, saved, reload, onEventDate)
        ),
      onOpenPage: (task) => {
        location.hash = taskPageHash(task.id);
      },
      onDelete: (task) => deleteTaskNow(task, reload, confirmHost),
      onPatch: (task, patch) => {
        void tasksApi.updateTask(task.id, patch).then(
          (saved) => afterTaskSave(task, saved, reload, onEventDate),
          (err: unknown) => {
            confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not save')));
          }
        );
      }
    });
  } else {
    body.append(renderMissingCard(stop, project, confirmHost, reload, onEventDate));
  }
  row.append(when, rail, body);
  return row;
}

function renderPermissionTracker(
  project: Project,
  persist: (patch: Partial<Project>) => void
): HTMLElement {
  const notes: PermissionNote[] = [...(project.permission_notes ?? [])];
  const host = el('section', 'excursion-tracker');
  host.append(el('p', 'hub-card__eyebrow', 'Permission notes'));
  const list = el('ul', 'task-list');

  const paintItems = () => {
    list.replaceChildren();
    if (!notes.length) {
      list.append(el('li', 'empty-state', 'Add names as permission notes go out.'));
      return;
    }
    notes.forEach((note, index) => {
      const item = el('li', 'task-item');
      item.style.setProperty('--i', String(index));
      const label = el('label', 'task-check');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = note.returned;
      box.setAttribute('aria-label', `${note.name} returned`);
      box.addEventListener('change', () => {
        notes[index] = { ...note, returned: box.checked };
        persist({ permission_notes: [...notes] });
      });
      label.append(box, el('span', 'check-box'));
      const body = el('div', 'task-body');
      body.append(el('span', 'task-name', note.name));
      item.append(label, body);
      list.append(item);
    });
  };
  paintItems();

  const add = createHubField({
    ariaLabel: 'Student name',
    placeholder: 'Add a name'
  });
  const addBtn = el('button', 'btn btn--secondary', 'Add');
  addBtn.type = 'button';
  const submit = () => {
    const name = add.input.value.trim();
    if (!name) return;
    notes.push({ id: crypto.randomUUID(), name, returned: false });
    add.input.value = '';
    persist({ permission_notes: [...notes] });
    paintItems();
  };
  addBtn.addEventListener('click', submit);
  add.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  const addRow = el('div', 'page-card__fields');
  addRow.append(add.el, addBtn);
  host.append(list, addRow);
  return host;
}

function renderTimeline(
  project: Project,
  tasks: Task[],
  confirmHost: HTMLElement,
  reload: () => Promise<void>,
  onEventDate?: (date: string) => void
): HTMLElement {
  const stops = layoutExcursionTimeline(collectExcursionStops(project, tasks)).stops;
  const scroller = el('div', 'excursion-timeline');
  scroller.setAttribute('tabindex', '0');
  scroller.setAttribute('aria-label', 'Excursion timeline');
  const inner = el('div', 'excursion-timeline__inner');
  const list = el('ol', 'excursion-timeline__list');
  if (!stops.length) {
    list.append(el('p', 'empty-state', 'No dated tasks or key dates on this excursion yet.'));
  } else {
    stops.forEach((stop, index) => {
      list.append(
        renderStop(
          stop,
          project,
          confirmHost,
          reload,
          {
            up: index > 0,
            down: index < stops.length - 1
          },
          onEventDate
        )
      );
    });
  }
  inner.append(list);
  scroller.append(inner);
  return scroller;
}

/** Lesson page + progress, permission tracker, and a date-tied timeline. */
export function paintExcursionPage(
  canvas: HTMLElement,
  project: Project,
  tasks: Task[],
  _template: ExcursionTemplate | undefined,
  onReload: () => Promise<void>,
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
          status: current.status,
          current_end_date: current.current_end_date,
          key_dates: current.key_dates,
          milestones: current.milestones,
          permission_notes: current.permission_notes,
          cover: current.cover ?? null,
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

  if (header) {
    header.classList.add('page-header--cover');
    const heading = header.querySelector('.page-header__title, .page-header__title-input');
    if (heading instanceof HTMLElement) heading.classList.add('visually-hidden');
  }

  const page = el('div', 'page-editor lesson-page excursion-page');
  const coverHost = el('div', 'lesson-page__cover');
  renderEntityBanner(coverHost, {
    cover: project.cover ?? null,
    title: project.title,
    eyebrow: 'Excursion',
    entityId: project.id,
    editable: true,
    size: 'hero',
    fallback: 'marine',
    onSave: (cover) => persist({ cover: cover ? { url: (cover as { url: string }).url } : null })
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'lesson-page__title';
  title.value = project.title;
  title.placeholder = 'Untitled excursion';
  title.setAttribute('aria-label', 'Title');
  title.addEventListener('input', () => {
    const next = title.value.trim();
    if (!next) return;
    persist({ title: next });
    const heading = header?.querySelector('.page-header__title, .page-header__title-input');
    if (heading) heading.textContent = next;
  });
  title.addEventListener('blur', () => {
    if (!title.value.trim()) title.value = current.title;
  });
  const banner = coverHost.querySelector('.entity-banner');
  (banner ?? coverHost).append(title);

  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(backLink('#/excursions', '← Excursions'));
  if (project.status !== 'active') {
    head.append(el('span', statusBadgeClass(project.status), statusLabel(project.status)));
  }

  const fields = el('div', 'page-card__fields hub-toolbar');
  const status = pageFilter(
    'page-card__status',
    'Status',
    PROJECT_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
    project.status,
    (value) => persist({ status: value as ProjectStatus })
  );
  fields.append(status.el);

  const confirmHost = el('div', 'excursion-confirm');
  const reload = () => onReload();
  const foot = el('footer', 'task-card__foot');
  foot.append(updated);

  const applyEventDate = async (nextDate: string) => {
    try {
      const shifted = shiftExcursionDates(current, tasks, nextDate);
      await Promise.all([
        tasksApi.updateProject(current.id, shifted.project),
        ...shifted.tasks.map((task) => tasksApi.updateTask(task.id, { due_date: task.due_date }))
      ]);
      await onReload();
    } catch (err) {
      errorHost.hidden = false;
      errorHost.textContent = errorMessage(err);
    }
  };

  card.append(
    head,
    fields,
    renderProgress(project, tasks),
    renderPermissionTracker(project, persist),
    renderQuickAdd(() => void reload(), project.id),
    foot
  );

  const canvasHost = el('div', 'block-canvas');
  const layout = el('div', 'page-editor__layout');
  try {
    const handle = mountBlockCanvas(canvasHost, {
      blocks: pageBlocksOf(current),
      idFactory: nextBlockIdFactory('block', pageBlocksOf(current)),
      onChange: (blocks) => persist({ page_blocks: blocks })
    });
    const add = el('div', 'page-editor__add');
    mountBlockInsert(add, {
      onInsert: (type) => handle.insertType(type)
    });
    layout.append(add, canvasHost);
  } catch (err) {
    layout.replaceChildren(
      el('p', 'empty-state', `Could not open the lesson canvas: ${errorMessage(err)}`)
    );
  }

  page.append(
    coverHost,
    card,
    errorHost,
    confirmHost,
    renderTimeline(project, tasks, confirmHost, reload, (date) => void applyEventDate(date)),
    layout
  );
  canvas.replaceChildren(page);
}
