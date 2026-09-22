import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { TaskDomain, TaskPriority } from '@/schemas/task';
import { sanitizeTaskPatch } from '@/domain/agent-mutations';
import {
  type BacklogGroup,
  type BacklogGroupBy,
  type BacklogRow,
  type BacklogSort,
  type BacklogSuggestion,
  type BacklogView,
  type ScheduleTarget,
  type TriageOutcome,
  type TriageState,
  ageLabel,
  backlogView,
  detectSuggestions,
  formatShortWeekday,
  initialTriageState,
  lastTriageUndo,
  scheduleTargets,
  snapshotFields,
  suggestionsForTask,
  triageQueue,
  triageReducer
} from '@/domain/backlog';
import { addDays, startOfDay, toDateKey } from '@/domain/queries';
import { projectPageHash } from '@/domain/cards';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, onTasksDeleted } from '@/services/task-cache';
import { getTaskPropertiesSync } from '@/services/task-properties';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { renderCardMenu } from '@/views/card-menu';
import { errorMessage, renderLoadError, showConfirmWrite, showViewLoading } from '@/views/feedback';
import {
  createHubFilter,
  domainFilterOptions,
  el,
  priorityFilterOptions
} from '@/views/hub-kit';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { parseBacklogTriage } from '@/shell/shell';
import { createOutlineIcon } from '@/shell/icons';
import { prefersReducedMotion } from '../../design-kit/js/hub-motion.js';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { enhanceInlineEdit } from '../../design-kit/js/hub-inline-edit.js';
import { offerTimedUndo, showHubToast } from '../../design-kit/js/hub-feedback.js';

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const OVERSHOOT = 'cubic-bezier(.34,1.3,.64,1)';
const UNDO_MS = 5000;

type Pending = { updatedAt: string; snapshot: Task };

type Session = {
  canvas: HTMLElement;
  page: HTMLElement;
  tasks: Task[];
  projects: Project[];
  domain: TaskDomain | 'all';
  priority: TaskPriority | 'all';
  tag: string;
  sort: BacklogSort;
  groupBy: BacklogGroupBy;
  selected: Set<string>;
  focusedId: string | null;
  pending: Map<string, Pending>;
  animating: Set<string>;
  deferred: Task[];
  exiting: Set<string>;
  staleOpen: boolean;
  snoozedOpen: boolean;
  triage: TriageState | null;
  scrollTop: number;
  firstPaint: boolean;
  stops: Array<() => void>;
};

let session: Session | null = null;
let teardownBacklog: (() => void) | null = null;

function reduced(): boolean {
  return prefersReducedMotion();
}

function duration(ms: number): number {
  return reduced() ? Math.min(ms, 80) : ms;
}

function announce(page: HTMLElement, text: string): void {
  const live = page.querySelector('.backlog-live');
  if (live) live.textContent = text;
}

function upsert(list: Task[], task: Task): Task[] {
  const index = list.findIndex((entry) => entry.id === task.id);
  if (index >= 0) list[index] = task;
  else list.push(task);
  return list;
}

function findTask(id: string): Task | undefined {
  return session?.tasks.find((task) => task.id === id);
}

function viewNow(): Date {
  return new Date();
}

function computeView(state: Session): BacklogView {
  return backlogView(state.tasks, state.projects, viewNow(), {
    sort: state.sort,
    groupBy: state.groupBy,
    domain: state.domain,
    priority: state.priority,
    tag: state.tag
  });
}

function suggestionSet(state: Session): BacklogSuggestion[] {
  return detectSuggestions(state.tasks, state.projects, viewNow());
}

function motion(el: HTMLElement, keyframes: Keyframe[], ms: number, easing = EASE): Promise<void> {
  if (reduced() && ms > 80) {
    const last = keyframes[keyframes.length - 1];
    if (last && 'opacity' in last) el.style.opacity = String(last.opacity ?? '');
    return Promise.resolve();
  }
  el.style.willChange = 'transform, opacity';
  const run = el.animate(keyframes, { duration: duration(ms), easing, fill: 'forwards' });
  return run.finished.finally(() => {
    el.style.willChange = '';
  }).then(() => undefined);
}

function flip(nodes: HTMLElement[], mutate: () => void): void {
  if (reduced()) {
    mutate();
    return;
  }
  const first = new Map(nodes.filter((node) => node.isConnected).map((node) => [node, node.getBoundingClientRect()]));
  mutate();
  requestAnimationFrame(() => {
    for (const node of nodes) {
      if (!node.isConnected) continue;
      const before = first.get(node);
      if (!before) continue;
      const after = node.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      node.style.willChange = 'transform';
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: duration(240), easing: EASE }
      ).finished.then(() => {
        node.style.willChange = '';
      }, () => {
        node.style.willChange = '';
      });
    }
  });
}

function flyGhost(from: HTMLElement, to: HTMLElement | null): Promise<void> {
  if (reduced() || !to) return Promise.resolve();
  const start = from.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.classList.add('backlog-ghost');
  ghost.style.cssText = `position:fixed;left:${start.left}px;top:${start.top}px;width:${start.width}px;height:${start.height}px;margin:0;`;
  document.body.append(ghost);
  return motion(
    ghost,
    [
      { transform: 'none', opacity: 1 },
      {
        transform: `translate(${end.left + end.width / 2 - start.left - start.width / 2}px, ${end.top - start.top}px) scale(.4)`,
        opacity: 0
      }
    ],
    280,
    OVERSHOOT
  ).finally(() => ghost.remove());
}

function leaveRow(row: HTMLElement): Promise<void> {
  if (row.dataset.exiting === '1') return Promise.resolve();
  row.dataset.exiting = '1';
  const height = row.getBoundingClientRect().height;
  return motion(row, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(12px)' }], 160)
    .then(() => {
      row.style.height = `${height}px`;
      row.style.overflow = 'hidden';
      return motion(row, [{ height: `${height}px` }, { height: '0px' }], 200);
    })
    .then(() => {
      row.remove();
    });
}

function enterRow(row: HTMLElement): void {
  row.classList.add('is-entering');
  void motion(row, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], 220).then(
    () => row.classList.remove('is-entering')
  );
}

function domainLabel(id: string): string {
  return getTaskPropertiesSync().domains.find((entry) => entry.id === id)?.label ?? id;
}

function effortLabel(row: BacklogRow): string | null {
  if (!row.effort) return null;
  if (row.effort === 'quick') return '15m';
  if (row.effort === 'hour') return '1h';
  return 'Big';
}

function iconBtn(label: string, shortcut: string, paths: string[], onClick: () => void): HTMLButtonElement {
  const btn = el('button', 'hub-icon-btn') as HTMLButtonElement;
  btn.type = 'button';
  btn.setAttribute('aria-label', label);
  btn.title = `${label} · ${shortcut}`;
  btn.append(createOutlineIcon(paths));
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return btn;
}

function applyPatch(task: Task, patch: Partial<Task>): Task {
  return { ...task, ...patch, updated_at: patch.updated_at ?? new Date().toISOString() };
}

function restoreFocus(state: Session): void {
  const next =
    (state.focusedId && state.page.querySelector<HTMLElement>(`[data-task-id="${state.focusedId}"]`)) ||
    state.page.querySelector<HTMLElement>('.backlog-row');
  next?.focus();
}

function focusRow(state: Session, id: string | null): void {
  state.focusedId = id;
  for (const row of state.page.querySelectorAll('.backlog-row')) {
    row.classList.toggle('is-focused', row.getAttribute('data-task-id') === id);
  }
  const node = id ? state.page.querySelector<HTMLElement>(`[data-task-id="${id}"]`) : null;
  node?.focus();
}

function visibleRowIds(state: Session): string[] {
  return [...state.page.querySelectorAll<HTMLElement>('.backlog-row[data-task-id]')].map(
    (row) => row.dataset.taskId ?? ''
  );
}

function toastUndo(message: string, onUndo: () => void): void {
  offerTimedUndo({ message, durationMs: UNDO_MS, onUndo });
}

function toastError(onRetry: () => void): void {
  showHubToast("Couldn't save. Retry", {
    tone: 'danger',
    action: { label: 'Retry', onClick: onRetry }
  });
}

async function persist(id: string, patch: Partial<Task> | 'delete'): Promise<void> {
  if (patch === 'delete') {
    await tasksApi.deleteTask(id, { agent: 'Tasks Hub', reason: 'Backlog delete' });
    return;
  }
  await tasksApi.updateTask(id, patch);
}

function selectedIds(state: Session, fallback: string): string[] {
  if (state.selected.has(fallback) && state.selected.size > 1) return [...state.selected];
  if (state.selected.size > 1) return [...state.selected];
  return [fallback];
}

async function mutate(
  state: Session,
  ids: string[],
  patch: Partial<Task> | 'delete',
  opts: {
    toast?: string;
    leave?: boolean;
    flyTo?: HTMLElement | null;
    complete?: boolean;
    outcome?: TriageOutcome;
  } = {}
): Promise<void> {
  const snaps = ids
    .map((id) => findTask(id))
    .filter((task): task is Task => Boolean(task))
    .map((task) => ({
      task,
      before:
        patch === 'delete'
          ? { ...task }
          : { ...snapshotFields(task, patch), updated_at: task.updated_at }
    }));
  if (!snaps.length) return;

  for (const { task } of snaps) {
    if (state.exiting.has(task.id)) continue;
    const next =
      patch === 'delete'
        ? { ...task, status: 'dead', updated_at: new Date().toISOString() }
        : applyPatch(task, patch);
    upsert(state.tasks, next);
    state.pending.set(task.id, { updatedAt: next.updated_at, snapshot: task });
  }

  const leaveIds = opts.leave ? snaps.map((item) => item.task.id) : [];
  if (state.focusedId && leaveIds.includes(state.focusedId)) {
    const visible = visibleRowIds(state);
    const index = visible.indexOf(state.focusedId);
    state.focusedId = visible[index + 1] ?? visible[index - 1] ?? null;
  }
  const siblings = [...state.page.querySelectorAll<HTMLElement>('.backlog-row')];
  if (opts.flyTo && snaps[0]) {
    const row = state.page.querySelector<HTMLElement>(`[data-task-id="${snaps[0].task.id}"]`);
    if (row) void flyGhost(row, opts.flyTo);
  }
  if (opts.complete && snaps[0]) {
    const row = state.page.querySelector<HTMLElement>(`[data-task-id="${snaps[0].task.id}"]`);
    row?.classList.add('is-completing');
    await new Promise((resolve) => setTimeout(resolve, reduced() ? 80 : 600));
  }
  if (leaveIds.length) {
    for (const id of leaveIds) state.exiting.add(id);
    flip(siblings, () => {
      for (const id of leaveIds) {
        const row = state.page.querySelector<HTMLElement>(`[data-task-id="${id}"]`);
        if (row) void leaveRow(row);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, duration(360)));
    for (const id of leaveIds) state.exiting.delete(id);
  }

  reconcile(state);

  const run = async () => {
    try {
      await Promise.all(snaps.map((item) => persist(item.task.id, patch)));
      for (const { task } of snaps) state.pending.delete(task.id);
      if (opts.toast) {
        toastUndo(opts.toast, () => {
          void undoPersisted(state, snaps, patch === 'delete');
        });
      }
      if (state.triage && opts.outcome && opts.outcome !== 'skipped') {
        state.triage = triageReducer(state.triage, {
          type: 'record',
          taskId: snaps[0]!.task.id,
          before: snaps[0]!.before,
          outcome: opts.outcome
        });
        paintTriage(state);
      }
    } catch {
      await rollback(state, snaps, opts.leave, true);
      toastError(() => void mutate(state, ids, patch, opts));
    }
  };
  await run();
}

async function rollback(
  state: Session,
  snaps: Array<{ task: Task; before: Partial<Task> }>,
  wasLeave?: boolean,
  danger?: boolean
): Promise<void> {
  for (const { task, before } of snaps) {
    const current = findTask(task.id) ?? task;
    const restored = { ...current, ...before };
    upsert(state.tasks, restored);
    state.pending.delete(task.id);
  }
  reconcile(state);
  if (wasLeave || danger) {
    for (const { task } of snaps) {
      const row = state.page.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
      row?.classList.add('is-rollback');
      setTimeout(() => row?.classList.remove('is-rollback'), 1200);
    }
  }
}

async function undoPersisted(
  state: Session,
  snaps: Array<{ task: Task; before: Partial<Task> }>,
  wasDelete: boolean
): Promise<void> {
  if (wasDelete) {
    for (const { task } of snaps) upsert(state.tasks, task);
    reconcile(state);
    try {
      await Promise.all(
        snaps.map(async ({ task }) => {
          const created = await tasksApi.createTask({
            title: task.title,
            domain: task.domain,
            description: task.description,
            parent_project_id: task.parent_project_id,
            estimated_duration: task.estimated_duration,
            tags: task.tags,
            kind: 'task',
            bucket: task.bucket === 'someday' ? 'active' : task.bucket,
            due_date: task.due_date ?? undefined,
            review_at: task.review_at,
            status: task.status
          });
          state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
          upsert(state.tasks, created);
        })
      );
      reconcile(state);
    } catch {
      toastError(() => void undoPersisted(state, snaps, wasDelete));
    }
    return;
  }
  for (const { task, before } of snaps) {
    await mutate(state, [task.id], before);
  }
}

function scheduleIds(state: Session, ids: string[], dateKey: string, label: string): void {
  const zone = state.page.querySelector<HTMLElement>(`[data-zone-key="${dateKey}"]`);
  void mutate(state, ids, { due_date: dateKey }, {
    toast: `Scheduled for ${label} · Undo`,
    leave: true,
    flyTo: zone,
    outcome: 'scheduled'
  });
  announce(state.page, `Scheduled ${ids.length} task${ids.length === 1 ? '' : 's'} for ${label}`);
}

function snoozeIds(state: Session, ids: string[], days: number): void {
  const when = toDateKey(addDays(startOfDay(viewNow()), days));
  void mutate(state, ids, { review_at: when }, {
    toast: `Snoozed until ${formatShortWeekday(when)} · Undo`,
    leave: true,
    outcome: 'snoozed'
  });
}

function archiveIds(state: Session, ids: string[]): void {
  void mutate(state, ids, { status: 'dead' }, {
    toast: 'Archived · Undo',
    leave: true,
    outcome: 'archived'
  });
}

function deleteIds(state: Session, ids: string[]): void {
  void mutate(state, ids, 'delete', {
    toast: 'Deleted · Undo',
    leave: true,
    outcome: 'deleted'
  });
}

function keepIds(state: Session, ids: string[]): void {
  for (const id of ids) {
    const task = findTask(id);
    if (!task) continue;
    void mutate(state, [id], { title: task.title }, { toast: 'Kept · Undo', outcome: 'kept' });
  }
}

function unsnoozeIds(state: Session, ids: string[]): void {
  void mutate(state, ids, { review_at: null }, { toast: 'Unsnoozed · Undo' });
}

function moveToProject(state: Session, ids: string[], projectId: string | null): void {
  void mutate(state, ids, { parent_project_id: projectId }, {
    toast: 'Moved · Undo'
  });
  announce(state.page, projectId ? 'Moved to project' : 'Moved to no project');
}

function openEditor(state: Session, task: Task): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-confirm') ?? state.page;
  void renderTaskEditor(host, task, state.projects, (updated) => {
    upsert(state.tasks, updated);
    reconcile(state);
  });
}

function pickDate(state: Session, ids: string[]): void {
  const input = el('input') as HTMLInputElement;
  input.type = 'date';
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.addEventListener('change', () => {
    if (input.value) scheduleIds(state, ids, input.value, formatShortWeekday(input.value));
    input.remove();
  });
  input.addEventListener('blur', () => setTimeout(() => input.remove(), 300));
  if (typeof input.showPicker === 'function') input.showPicker();
  else input.click();
}

function snoozeMenu(state: Session, ids: string[]): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-confirm') ?? state.page;
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.append(el('p', 'page-header__eyebrow', 'Snooze'));
  const choices: Array<[string, () => void]> = [
    ['1 day', () => snoozeIds(state, ids, 1)],
    ['3 days', () => snoozeIds(state, ids, 3)],
    ['1 week', () => snoozeIds(state, ids, 7)],
    [
      'Custom date',
      () => {
        const input = el('input') as HTMLInputElement;
        input.type = 'date';
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.addEventListener('change', () => {
          if (input.value) {
            void mutate(state, ids, { review_at: input.value }, {
              toast: `Snoozed until ${formatShortWeekday(input.value)} · Undo`,
              leave: true,
              outcome: 'snoozed'
            });
          }
          input.remove();
        });
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.click();
      }
    ]
  ];
  for (const [label, fn] of choices) {
    const btn = el('button', 'btn btn--ghost', label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      host.replaceChildren();
      fn();
    });
    card.append(btn);
  }
  host.append(card);
}

function projectMenu(state: Session, ids: string[]): void {
  const items = [
    { id: 'none', label: 'No project', onSelect: () => moveToProject(state, ids, null) },
    ...state.projects
      .filter((project) => project.status === 'active')
      .map((project) => ({
        id: project.id,
        label: project.title,
        onSelect: () => moveToProject(state, ids, project.id)
      }))
  ];
  const host = state.page.querySelector<HTMLElement>('.backlog-confirm') ?? state.page;
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.append(el('p', 'page-header__eyebrow', 'Move to'));
  for (const item of items) {
    const btn = el('button', 'btn btn--ghost', item.label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      host.replaceChildren();
      item.onSelect();
    });
    card.append(btn);
  }
  host.append(card);
}

function bindRowChrome(state: Session, row: HTMLElement, task: Task): void {
  const check = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
  check?.addEventListener('change', () => {
    if (check.checked) {
      void mutate(state, [task.id], { status: 'done' }, {
        toast: 'Completed · Undo',
        leave: true,
        complete: true
      });
    }
  });
  const title = row.querySelector<HTMLElement>('.backlog-row__title');
  if (title) {
    enhanceInlineEdit(title, {
      onCommit: (value: string) => {
        if (value && value !== task.title) void mutate(state, [task.id], { title: value });
      }
    });
    title.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
  }
  row.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button, input, a, .hub-inline-edit__input')) return;
    focusRow(state, task.id);
  });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !(event.target as HTMLElement).closest('input')) {
      event.preventDefault();
      openEditor(state, task);
    }
  });

  row.querySelector('[data-act="today"]')?.addEventListener('click', () =>
    scheduleIds(state, selectedIds(state, task.id), toDateKey(viewNow()), 'today')
  );
  row.querySelector('[data-act="week"]')?.addEventListener('click', () => {
    const week = scheduleTargets(viewNow()).find((item) => item.id === 'this_week');
    if (week) scheduleIds(state, selectedIds(state, task.id), week.dateKey, 'this week');
  });
  row.querySelector('[data-act="date"]')?.addEventListener('click', () =>
    pickDate(state, selectedIds(state, task.id))
  );
  row.querySelector('[data-act="snooze"]')?.addEventListener('click', () =>
    snoozeMenu(state, selectedIds(state, task.id))
  );
  row.querySelector('[data-act="move"]')?.addEventListener('click', () =>
    projectMenu(state, selectedIds(state, task.id))
  );
  row.querySelector('[data-act="delete"]')?.addEventListener('click', () =>
    deleteIds(state, selectedIds(state, task.id))
  );
  row.querySelector('[data-act="keep"]')?.addEventListener('click', () => keepIds(state, [task.id]));
  row.querySelector('[data-act="archive"]')?.addEventListener('click', () => archiveIds(state, [task.id]));
  row.querySelector('[data-act="unsnooze"]')?.addEventListener('click', () => unsnoozeIds(state, [task.id]));

  bindDrag(state, row, task);
  void bindPragmaticRow(state, row, task);
  bindSwipe(state, row, task);
}

function buildRow(state: Session, rowModel: BacklogRow, extras: { stale?: boolean; snoozed?: boolean; vague?: boolean }): HTMLElement {
  const task = rowModel.task;
  const row = el('article', 'backlog-row');
  row.dataset.taskId = task.id;
  row.dataset.domain = task.domain;
  row.dataset.ageTier = rowModel.ageTier;
  row.tabIndex = 0;
  row.setAttribute('draggable', 'true');
  if (state.selected.has(task.id)) row.classList.add('is-selected');
  if (state.focusedId === task.id) row.classList.add('is-focused');

  const check = el('label', 'backlog-row__check');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.setAttribute('aria-label', `Complete ${task.title}`);
  const box = el('span', 'backlog-row__box');
  const tick = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tick.setAttribute('class', 'backlog-row__tick');
  tick.setAttribute('viewBox', '0 0 16 16');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3 8.5 6.5 12 13 4.5');
  tick.append(path);
  check.append(input, box, tick);

  const main = el('div', 'backlog-row__main');
  const title = el('span', 'backlog-row__title', task.title);
  title.setAttribute('data-hub-inline-edit', '');
  title.setAttribute('aria-label', 'Rename task');
  main.append(title);
  if (extras.vague) main.append(el('span', 'backlog-row__flag', 'Vague date'));
  const effort = effortLabel(rowModel);
  if (effort) main.append(el('span', 'hub-chip backlog-row__effort', effort));

  const age = el('span', 'backlog-row__age', rowModel.ageLabel);
  const actions = el('div', 'backlog-row__actions');
  const today = iconBtn('Today', 'T', ['M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'], () => undefined);
  today.dataset.act = 'today';
  const week = iconBtn('This week', 'W', ['M5 7h14', 'M5 12h9'], () => undefined);
  week.dataset.act = 'week';
  const date = iconBtn('Pick date', 'D', ['M5 7h14v13H5z', 'M5 11h14'], () => undefined);
  date.dataset.act = 'date';
  const snooze = iconBtn('Snooze', 'S', ['M12 7v5l3 2', 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z'], () => undefined);
  snooze.dataset.act = 'snooze';
  const move = iconBtn('Move to project', 'P', ['M4 8h6l2 2h8v10H4z'], () => undefined);
  move.dataset.act = 'move';
  const del = iconBtn('Delete', 'Backspace', ['M5 7h14', 'M10 11v6', 'M14 11v6', 'M6 7l1 12h10l1-12'], () => undefined);
  del.dataset.act = 'delete';
  actions.append(today, week, date, snooze, move, del);

  const menu = renderCardMenu(`${task.title} actions`, [
    { id: 'today', label: 'Move to… Today', onSelect: () => scheduleIds(state, selectedIds(state, task.id), toDateKey(viewNow()), 'today') },
    {
      id: 'week',
      label: 'Move to… This week',
      onSelect: () => {
        const target = scheduleTargets(viewNow()).find((item) => item.id === 'this_week');
        if (target) scheduleIds(state, selectedIds(state, task.id), target.dateKey, 'this week');
      }
    },
    { id: 'date', label: 'Pick date', onSelect: () => pickDate(state, selectedIds(state, task.id)) },
    { id: 'snooze', label: 'Snooze', onSelect: () => snoozeIds(state, selectedIds(state, task.id), 1) },
    { id: 'move', label: 'Move to project', onSelect: () => projectMenu(state, selectedIds(state, task.id)) },
    { id: 'delete', label: 'Delete', danger: true, onSelect: () => deleteIds(state, selectedIds(state, task.id)) }
  ]);
  menu.classList.add('backlog-row__menu');
  actions.append(menu);

  row.append(check, main, age, actions);

  if (extras.stale) {
    const extra = el('div', 'backlog-stale__row-actions');
    const keep = el('button', 'btn btn--secondary', 'Keep');
    keep.type = 'button';
    keep.dataset.act = 'keep';
    const archive = el('button', 'btn btn--ghost', 'Archive');
    archive.type = 'button';
    archive.dataset.act = 'archive';
    extra.append(keep, archive);
    row.append(extra);
  }
  if (extras.snoozed) {
    const unsnooze = el('button', 'btn btn--ghost', 'Unsnooze');
    unsnooze.type = 'button';
    unsnooze.dataset.act = 'unsnooze';
    row.append(unsnooze);
  }

  bindRowChrome(state, row, task);
  return row;
}

function updateRow(row: HTMLElement, model: BacklogRow): void {
  row.dataset.domain = model.task.domain;
  row.dataset.ageTier = model.ageTier;
  const title = row.querySelector('.backlog-row__title');
  if (title && !title.querySelector('input') && title.textContent !== model.task.title) {
    title.textContent = model.task.title;
  }
  const age = row.querySelector('.backlog-row__age');
  if (age) age.textContent = model.ageLabel;
}

function reconcileList(
  host: HTMLElement,
  models: BacklogRow[],
  state: Session,
  extras: { stale?: boolean; snoozed?: boolean; vagueIds?: Set<string> }
): void {
  const existing = new Map(
    [...host.querySelectorAll<HTMLElement>(':scope > .backlog-row')].map((row) => [row.dataset.taskId ?? '', row])
  );
  const used = new Set<string>();
  let index = 0;
  for (const model of models) {
    used.add(model.task.id);
    let row = existing.get(model.task.id);
    if (!row) {
      row = buildRow(state, model, {
        stale: extras.stale,
        snoozed: extras.snoozed,
        vague: extras.vagueIds?.has(model.task.id)
      });
      const next = host.children[index] ?? null;
      host.insertBefore(row, next);
      if (!state.firstPaint) enterRow(row);
    } else {
      updateRow(row, model);
      const next = host.children[index] ?? null;
      if (row !== next) host.insertBefore(row, next);
    }
    index += 1;
  }
  for (const [id, row] of existing) {
    if (!used.has(id) && !state.exiting.has(id)) void leaveRow(row);
  }
}

function renderGroup(state: Session, group: BacklogGroup, vagueIds: Set<string>): HTMLElement {
  const wrap = el('section', 'backlog-group');
  wrap.dataset.groupId = group.id;
  const inner = el('div', 'backlog-group__inner');
  const head = el('header', 'backlog-group__head');
  head.dataset.groupId = group.id;
  head.dataset.domain = group.domain;
  if (group.projectId) head.dataset.projectId = group.projectId;
  const label = `${domainLabel(group.domain)} · ${group.projectTitle}`;
  if (group.projectId) {
    const link = el('a', '', label) as HTMLAnchorElement;
    link.href = projectPageHash(group.projectId);
    head.append(link);
  } else {
    head.append(el('span', '', label));
  }
  const count = el('span', 'hub-count', String(group.rows.length));
  count.setAttribute('data-hub-count', '');
  head.append(count);
  const rows = el('div', 'backlog-rows');
  reconcileList(rows, group.rows, state, { vagueIds });
  inner.append(head, rows);
  wrap.append(inner);
  bindGroupDrop(state, head);
  return wrap;
}

function reconcileGroups(state: Session, view: BacklogView, vagueIds: Set<string>): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-fresh');
  if (!host) return;
  const existing = new Map(
    [...host.querySelectorAll<HTMLElement>(':scope > .backlog-group')].map((node) => [
      node.dataset.groupId ?? '',
      node
    ])
  );
  let index = 0;
  const used = new Set<string>();
  for (const group of view.fresh) {
    used.add(group.id);
    let node = existing.get(group.id);
    if (!node) {
      node = renderGroup(state, group, vagueIds);
      host.insertBefore(node, host.children[index] ?? null);
    } else {
      const count = node.querySelector('.hub-count');
      if (count) count.textContent = String(group.rows.length);
      const rows = node.querySelector<HTMLElement>('.backlog-rows');
      if (rows) reconcileList(rows, group.rows, state, { vagueIds });
      if (node !== host.children[index]) host.insertBefore(node, host.children[index] ?? null);
    }
    index += 1;
  }
  for (const [id, node] of existing) {
    if (used.has(id)) continue;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), duration(200));
  }
}

function paintZones(state: Session): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-zones');
  if (!host) return;
  const targets = scheduleTargets(viewNow(), state.tasks);
  if (!host.childElementCount) {
    for (const target of targets) {
      const btn = el('button', 'backlog-zone') as HTMLButtonElement;
      btn.type = 'button';
      btn.dataset.zone = target.id;
      btn.dataset.zoneKey = target.dateKey;
      btn.append(el('span', 'backlog-zone__label', target.label));
      btn.append(el('span', 'backlog-zone__date', formatShortWeekday(target.dateKey)));
      const count = el('span', 'hub-count', String(target.count));
      count.setAttribute('data-hub-count', '');
      btn.append(count);
      btn.addEventListener('click', () => {
        const ids = state.selected.size ? [...state.selected] : state.focusedId ? [state.focusedId] : [];
        if (ids.length) scheduleIds(state, ids, target.dateKey, target.label.toLowerCase());
      });
      bindZoneDrop(state, btn, target);
      host.append(btn);
    }
    return;
  }
  for (const target of targets) {
    const btn = host.querySelector<HTMLElement>(`[data-zone="${target.id}"]`);
    if (!btn) continue;
    btn.dataset.zoneKey = target.dateKey;
    const date = btn.querySelector('.backlog-zone__date');
    if (date) date.textContent = formatShortWeekday(target.dateKey);
    const count = btn.querySelector('.hub-count');
    if (count) count.textContent = String(target.count);
  }
}

function paintHeader(state: Session, view: BacklogView): void {
  const titleRow = document.querySelector('.page-header__title-row');
  if (titleRow) {
    let pill = titleRow.querySelector<HTMLElement>('.backlog-count');
    if (!pill) {
      pill = el('span', 'hub-chip backlog-count');
      titleRow.append(pill);
    }
    pill.textContent = String(view.total);
    pill.setAttribute('data-hub-count', '');
  }
  const actions = document.querySelector('.page-header__actions');
  if (actions && !actions.querySelector('.backlog-header-actions')) {
    const cluster = el('div', 'backlog-header-actions');
    const triage = el('button', 'btn btn--secondary', 'Triage') as HTMLButtonElement;
    triage.type = 'button';
    triage.addEventListener('click', () => enterTriage(state));
    const group = createHubFilter({
      key: 'Group',
      label: 'Group',
      defaultValue: 'hub',
      value: state.groupBy,
      options: [
        { value: 'hub', label: 'Hub' },
        { value: 'project', label: 'Project' },
        { value: 'none', label: 'None' }
      ],
      onChange: (value) => {
        state.groupBy = value as BacklogGroupBy;
        reconcile(state);
      }
    });
    const sort = createHubFilter({
      key: 'Sort',
      label: 'Sort',
      defaultValue: 'oldest',
      value: state.sort,
      options: [
        { value: 'oldest', label: 'Oldest' },
        { value: 'newest', label: 'Newest' },
        { value: 'effort', label: 'Effort' },
        { value: 'title', label: 'Title' }
      ],
      onChange: (value) => {
        state.sort = value as BacklogSort;
        reconcile(state);
      }
    });
    cluster.append(triage, group.el, sort.el);
    const utilities = actions.querySelector('.hub-utilities');
    actions.insertBefore(cluster, utilities);
  }
}

function paintSuggestions(state: Session, suggestions: BacklogSuggestion[]): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-suggestions');
  if (!host) return;
  if (!suggestions.length) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  host.replaceChildren();
  const line = el('p', '', `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'} from Clare`);
  const open = el('button', 'btn btn--ghost', 'Review');
  open.type = 'button';
  open.addEventListener('click', () => enterTriage(state, suggestions[0]?.taskIds[0]));
  host.append(line, open);
}

function paintStale(state: Session, view: BacklogView, vagueIds: Set<string>): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-stale');
  if (!host) return;
  host.hidden = view.stale.length === 0;
  host.classList.toggle('is-open', state.staleOpen);
  const toggle = host.querySelector('.backlog-stale__toggle span');
  if (toggle) toggle.textContent = 'Still want these?';
  const list = host.querySelector<HTMLElement>('.backlog-stale__list');
  if (list) reconcileList(list, view.stale, state, { stale: true, vagueIds });
}

function paintSnoozed(state: Session, view: BacklogView): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-snoozed');
  if (!host) return;
  host.hidden = view.snoozedCount === 0;
  host.classList.toggle('is-open', state.snoozedOpen);
  const toggle = host.querySelector('.backlog-snoozed__toggle');
  if (toggle) toggle.textContent = `${view.snoozedCount} snoozed`;
  const list = host.querySelector<HTMLElement>('.backlog-snoozed__list');
  if (list) reconcileList(list, view.snoozed, state, { snoozed: true });
}

function paintEmpty(state: Session, view: BacklogView): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-empty');
  if (!host) return;
  const show = view.total === 0 && view.stale.length === 0;
  host.hidden = !show;
  if (show && !host.childElementCount) {
    host.append(el('h2', '', 'Backlog is clear'), el('p', '', 'New tasks without a date land here.'));
  }
}

function paintBulk(state: Session): void {
  const bar = state.page.querySelector<HTMLElement>('.backlog-bulk');
  if (!bar) return;
  const on = state.selected.size > 1;
  bar.classList.toggle('is-in', on);
  bar.hidden = !on;
}

function reconcile(state: Session): void {
  const scroll = state.canvas.scrollTop;
  const view = computeView(state);
  const suggestions = suggestionSet(state);
  const vagueIds = new Set(
    suggestions.filter((item) => item.kind === 'vague_date').flatMap((item) => item.taskIds)
  );
  paintHeader(state, view);
  paintZones(state);
  paintSuggestions(state, suggestions);
  reconcileGroups(state, view, vagueIds);
  paintStale(state, view, vagueIds);
  paintSnoozed(state, view);
  paintEmpty(state, view);
  paintBulk(state);
  if (state.firstPaint) {
    const rows = [...state.page.querySelectorAll<HTMLElement>('.backlog-row')];
    rows.forEach((row, index) => {
      if (index >= 12) return;
      row.classList.add('hub-reveal');
      row.style.setProperty('--hub-reveal-delay', `${index * 45}ms`);
      requestAnimationFrame(() => row.classList.add('is-in'));
    });
    state.firstPaint = false;
  }
  state.canvas.scrollTop = scroll;
  if (parseBacklogTriage()) {
    if (!state.triage) enterTriage(state);
    else paintTriage(state);
  } else if (state.triage && !parseBacklogTriage()) {
    exitTriage(state, false);
  }
  restoreFocus(state);
}

function bindDrag(state: Session, row: HTMLElement, task: Task): void {
  row.addEventListener('dragstart', (event) => {
    const ids = selectedIds(state, task.id);
    event.dataTransfer?.setData('text/task-ids', ids.join(','));
    event.dataTransfer?.setData('text/plain', ids.join(','));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    row.classList.add('is-dragging');
    if (ids.length > 1 && event.dataTransfer) {
      const badge = el('div', 'hub-chip', String(ids.length));
      badge.style.position = 'absolute';
      badge.style.left = '-999px';
      document.body.append(badge);
      event.dataTransfer.setDragImage(badge, 0, 0);
      setTimeout(() => badge.remove(), 0);
    }
  });
  row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
}

function dropIds(event: DragEvent): string[] {
  const raw = event.dataTransfer?.getData('text/task-ids') || event.dataTransfer?.getData('text/plain') || '';
  return raw.split(',').filter(Boolean);
}

function bindZoneDrop(state: Session, zone: HTMLElement, target: ScheduleTarget): void {
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-hot');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-hot'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-hot');
    const ids = dropIds(event);
    if (ids.length) scheduleIds(state, ids, target.dateKey, target.label.toLowerCase());
  });
  void bindPragmaticDrop(zone, (ids) => scheduleIds(state, ids, zone.dataset.zoneKey ?? target.dateKey, target.label.toLowerCase()));
}

function bindGroupDrop(state: Session, head: HTMLElement): void {
  head.addEventListener('dragover', (event) => {
    event.preventDefault();
    head.classList.add('is-hot');
  });
  head.addEventListener('dragleave', () => head.classList.remove('is-hot'));
  head.addEventListener('drop', (event) => {
    event.preventDefault();
    head.classList.remove('is-hot');
    const ids = dropIds(event);
    const projectId = head.dataset.projectId || null;
    const domain = head.dataset.domain;
    if (!ids.length) return;
    if (projectId) moveToProject(state, ids, projectId);
    else if (domain) void mutate(state, ids, { domain, parent_project_id: null }, { toast: 'Moved · Undo' });
  });
  void bindPragmaticDrop(head, (ids) => {
    const projectId = head.dataset.projectId || null;
    if (projectId) moveToProject(state, ids, projectId);
    else if (head.dataset.domain) {
      void mutate(state, ids, { domain: head.dataset.domain, parent_project_id: null }, { toast: 'Moved · Undo' });
    }
  });
}

async function bindPragmaticDrop(el: HTMLElement, onDrop: (ids: string[]) => void): Promise<void> {
  try {
    const { dropTargetForElements } = await import(
      '@atlaskit/pragmatic-drag-and-drop/element/adapter'
    );
    dropTargetForElements({
      element: el,
      onDragEnter: () => el.classList.add('is-hot'),
      onDragLeave: () => el.classList.remove('is-hot'),
      onDrop: ({ source }) => {
        el.classList.remove('is-hot');
        const ids = source.data.taskIds;
        if (Array.isArray(ids)) onDrop(ids.filter((id): id is string => typeof id === 'string'));
      }
    });
  } catch {
    // Native drag already bound.
  }
}

async function bindPragmaticRow(state: Session, row: HTMLElement, task: Task): Promise<void> {
  try {
    const { draggable } = await import('@atlaskit/pragmatic-drag-and-drop/element/adapter');
    draggable({
      element: row,
      getInitialData: () => ({ taskIds: selectedIds(state, task.id), type: 'backlog-row' }),
      onDragStart: () => row.classList.add('is-dragging'),
      onDrop: () => row.classList.remove('is-dragging')
    });
  } catch {
    // Native drag already bound.
  }
}

function bindSwipe(state: Session, row: HTMLElement, task: Task): void {
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let swiping = false;
  row.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') return;
      startX = event.clientX;
      startY = event.clientY;
      startT = performance.now();
      swiping = true;
    },
    { passive: true }
  );
  row.addEventListener(
    'pointermove',
    (event) => {
      if (!swiping) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      row.style.transform = `translateX(${dx}px)`;
      row.classList.toggle('is-swipe-today', dx > 0);
      row.classList.toggle('is-swipe-snooze', dx < 0);
    },
    { passive: true }
  );
  row.addEventListener('pointerup', (event) => {
    if (!swiping) return;
    swiping = false;
    const dx = event.clientX - startX;
    const dt = Math.max(1, performance.now() - startT);
    const velocity = Math.abs(dx) / dt;
    const width = row.getBoundingClientRect().width;
    const snap = Math.abs(dx) > width * 0.4 || velocity > 0.6;
    row.style.transform = '';
    row.classList.remove('is-swipe-today', 'is-swipe-snooze');
    if (!snap) return;
    if (dx > 0) {
      if (navigator.vibrate) navigator.vibrate(10);
      scheduleIds(state, [task.id], toDateKey(viewNow()), 'today');
    } else {
      if (navigator.vibrate) navigator.vibrate(10);
      snoozeIds(state, [task.id], 1);
    }
  });
}

function onKey(state: Session, event: KeyboardEvent): void {
  if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable], select')) return;
  if (state.triage) {
    handleTriageKey(state, event);
    return;
  }
  const key = event.key;
  const ids = visibleRowIds(state);
  const current = state.focusedId ?? ids[0] ?? null;
  const index = current ? ids.indexOf(current) : -1;

  if (key === '/' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    state.page.querySelector<HTMLInputElement>('input[aria-label="New task title"]')?.focus();
    return;
  }
  if (event.shiftKey && key.toLowerCase() === 't') {
    event.preventDefault();
    enterTriage(state);
    return;
  }
  if (key === 'j' || key === 'J' || key === 'k' || key === 'K') {
    event.preventDefault();
    const dir = key.toLowerCase() === 'j' ? 1 : -1;
    const next = ids[Math.max(0, Math.min(ids.length - 1, (index < 0 ? 0 : index) + dir))] ?? null;
    if (event.shiftKey && current && next) {
      state.selected.add(current);
      state.selected.add(next);
    }
    focusRow(state, next);
    paintBulk(state);
    return;
  }
  if (key === 'x' || key === 'X') {
    if (!current) return;
    if (state.selected.has(current)) state.selected.delete(current);
    else state.selected.add(current);
    reconcile(state);
    return;
  }
  if (key === 'e' || key === 'E') {
    const row = current
      ? state.page.querySelector<HTMLElement>(`[data-task-id="${current}"] .backlog-row__title`)
      : null;
    row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return;
  }
  if (key === 'Enter' && current) {
    const task = findTask(current);
    if (task) openEditor(state, task);
    return;
  }
  const targets = current ? selectedIds(state, current) : [...state.selected];
  if (!targets.length) return;
  if (key === 't' || key === 'T') {
    event.preventDefault();
    scheduleIds(state, targets, toDateKey(viewNow()), 'today');
    return;
  }
  if (key === 'w' || key === 'W') {
    event.preventDefault();
    const week = scheduleTargets(viewNow()).find((item) => item.id === 'this_week');
    if (week) scheduleIds(state, targets, week.dateKey, 'this week');
    return;
  }
  if (key === 's' || key === 'S') {
    event.preventDefault();
    snoozeIds(state, targets, 1);
    return;
  }
  if (key === 'Backspace') {
    event.preventDefault();
    deleteIds(state, targets);
  }
}

function enterTriage(state: Session, startId?: string): void {
  state.scrollTop = state.canvas.scrollTop;
  const view = computeView(state);
  const suggestions = suggestionSet(state);
  const queue = triageQueue(view, suggestions);
  const start = startId ? Math.max(0, queue.indexOf(startId)) : 0;
  state.triage = { ...initialTriageState(queue), index: start };
  if (location.hash !== '#/backlog/triage') location.hash = '#/backlog/triage';
  state.page.classList.add('is-triage');
  paintTriage(state);
}

function exitTriage(state: Session, writeHash = true): void {
  state.triage = null;
  state.page.classList.remove('is-triage');
  if (writeHash && parseBacklogTriage()) location.hash = '#/backlog';
  state.canvas.scrollTop = state.scrollTop;
  restoreFocus(state);
}

function currentTriageTask(state: Session): Task | undefined {
  const id = state.triage?.queue[state.triage.index];
  return id ? findTask(id) : undefined;
}

function paintTriage(state: Session): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-triage');
  if (!host || !state.triage) return;
  host.hidden = false;
  const triage = state.triage;
  if (triage.index >= triage.queue.length) {
    host.replaceChildren();
    const total = Object.values(triage.counts).reduce((sum, value) => sum + value, 0);
    host.append(
      el(
        'h2',
        '',
        `${total} triaged: ${triage.counts.scheduled} scheduled, ${triage.counts.snoozed} snoozed, ${triage.counts.archived} archived, ${triage.counts.kept} kept`
      )
    );
    const actions = el('div', 'backlog-triage__keys');
    const back = el('button', 'btn btn--primary', 'Back to backlog');
    back.type = 'button';
    back.addEventListener('click', () => exitTriage(state));
    const undo = el('button', 'btn btn--ghost', 'Undo last');
    undo.type = 'button';
    undo.addEventListener('click', () => undoTriage(state));
    actions.append(back, undo);
    host.append(actions);
    return;
  }
  const task = currentTriageTask(state);
  if (!task) {
    exitTriage(state);
    return;
  }
  host.replaceChildren();
  const progress = el('div', 'backlog-triage__progress');
  progress.append(el('span', '', `Triage · ${triage.index + 1} of ${triage.queue.length}`));
  const bar = el('div', 'backlog-triage__bar');
  const fill = el('span');
  fill.style.width = `${((triage.index + 1) / Math.max(1, triage.queue.length)) * 100}%`;
  bar.append(fill);
  progress.append(bar, el('span', '', 'Esc to exit'));
  const card = el('article', 'backlog-triage__card is-enter');
  const chips = el('div', 'hub-chips');
  chips.append(el('span', 'hub-chip', domainLabel(task.domain)));
  chips.append(el('span', 'hub-chip', `Sitting ${ageLabel(task, viewNow()).replace('d', ' days').replace('w', ' weeks')}`));
  card.append(chips, el('h2', 'backlog-triage__title', task.title));
  if (task.parent_project_id) {
    const project = state.projects.find((entry) => entry.id === task.parent_project_id);
    if (project) card.append(el('p', '', project.title));
  }
  if (task.description) card.append(el('p', '', task.description));
  const suggestions = suggestionsForTask(suggestionSet(state), task.id);
  const confirm = el('div', 'backlog-confirm');
  for (const suggestion of suggestions) {
    const banner = el('div', 'confirm-card');
    banner.append(el('p', 'page-header__eyebrow', 'Clare'));
    banner.append(el('p', '', suggestion.message));
    const apply = el('button', 'btn btn--primary', 'Confirm');
    apply.type = 'button';
    apply.addEventListener('click', () => applySuggestion(state, suggestion));
    banner.append(apply);
    card.append(banner);
  }
  const keys = el('div', 'backlog-triage__keys');
  const buttons: Array<[string, string, () => void]> = [
    ['T', 'Today', () => scheduleIds(state, [task.id], toDateKey(viewNow()), 'today')],
    [
      'W',
      'This week',
      () => {
        const week = scheduleTargets(viewNow()).find((item) => item.id === 'this_week');
        if (week) scheduleIds(state, [task.id], week.dateKey, 'this week');
      }
    ],
    ['D', 'Pick date', () => pickDate(state, [task.id])],
    ['S', 'Snooze', () => paintSnoozeChoice(state, task, confirm)],
    ['P', 'Make project', () => paintProjectChoice(state, task, confirm)],
    ['X', 'Delete', () => deleteIds(state, [task.id])],
    ['A', 'Archive', () => archiveIds(state, [task.id])],
    ['Space', 'Skip', () => skipTriage(state)],
    ['Z', 'Undo', () => undoTriage(state)],
    ['Enter', 'Open', () => openEditor(state, task)],
    ['Esc', 'Exit', () => exitTriage(state)]
  ];
  for (const [key, label, fn] of buttons) {
    const btn = el('button', 'btn btn--ghost backlog-triage__key', `${key} ${label}`);
    btn.type = 'button';
    btn.dataset.key = key;
    btn.addEventListener('click', () => {
      btn.classList.add('is-pressed');
      setTimeout(() => btn.classList.remove('is-pressed'), 120);
      fn();
    });
    keys.append(btn);
  }
  host.append(progress, card, confirm, keys);
  bindTriageSwipe(state, card, task);
}

function paintSnoozeChoice(state: Session, task: Task, host: HTMLElement): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.append(el('p', '', 'Snooze for'));
  for (const days of [1, 2, 3]) {
    const btn = el('button', 'btn btn--secondary', `${days} day${days === 1 ? '' : 's'}`);
    btn.type = 'button';
    btn.addEventListener('click', () => snoozeIds(state, [task.id], days));
    card.append(btn);
  }
  host.append(card);
}

function paintProjectChoice(state: Session, task: Task, host: HTMLElement): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  const field = el('input', 'hub-search__input') as HTMLInputElement;
  field.value = task.title;
  field.setAttribute('aria-label', 'Project name');
  const create = el('button', 'btn btn--primary', 'Create project');
  create.type = 'button';
  create.addEventListener('click', async () => {
    const title = field.value.trim() || task.title;
    const project = await tasksApi.createProject({ title });
    state.projects.push(project);
    void mutate(state, [task.id], { parent_project_id: project.id }, { toast: 'Moved · Undo' });
  });
  card.append(el('p', '', 'Make a project'), field, create);
  for (const project of state.projects.filter((entry) => entry.status === 'active')) {
    const btn = el('button', 'btn btn--ghost', project.title);
    btn.type = 'button';
    btn.addEventListener('click', () => moveToProject(state, [task.id], project.id));
    card.append(btn);
  }
  host.append(card);
}

function applySuggestion(state: Session, suggestion: BacklogSuggestion): void {
  const host = state.page.querySelector<HTMLElement>('.backlog-confirm') ?? state.page;
  showConfirmWrite(host, 'Apply Clare’s suggestion', suggestion.message, async () => {
    if (suggestion.kind === 'likely_cluster') {
      const project = await tasksApi.createProject({
        title: suggestion.proposedProjectTitle || 'Cluster'
      });
      state.projects.push(project);
      await mutate(state, suggestion.taskIds, { parent_project_id: project.id }, { toast: 'Moved · Undo' });
      return;
    }
    for (const mutation of suggestion.proposedMutations) {
      if (mutation.kind !== 'task_update') continue;
      const patch = sanitizeTaskPatch(mutation.patch);
      await mutate(state, [mutation.task_id], patch, {
        toast: suggestion.kind === 'stale' ? 'Archived · Undo' : 'Scheduled · Undo',
        leave: Boolean(patch.due_date || patch.status === 'dead'),
        outcome: patch.status === 'dead' ? 'archived' : patch.due_date ? 'scheduled' : undefined
      });
    }
  });
}

function skipTriage(state: Session): void {
  if (!state.triage) return;
  state.triage = triageReducer(state.triage, { type: 'skip' });
  paintTriage(state);
}

function undoTriage(state: Session): void {
  if (!state.triage) return;
  const last = lastTriageUndo(state.triage);
  if (!last) return;
  const task = findTask(last.taskId);
  if (task && Object.keys(last.before).length) {
    void mutate(state, [last.taskId], last.before);
  }
  state.triage = triageReducer(state.triage, { type: 'undo' });
  paintTriage(state);
}

function handleTriageKey(state: Session, event: KeyboardEvent): void {
  const task = currentTriageTask(state);
  const key = event.key;
  if (key === 'Escape') {
    event.preventDefault();
    exitTriage(state);
    return;
  }
  if (key === 'z' || key === 'Z') {
    event.preventDefault();
    undoTriage(state);
    return;
  }
  if (key === ' ' || key === 'Spacebar') {
    event.preventDefault();
    skipTriage(state);
    return;
  }
  if (!task) return;
  const flash = (code: string) => {
    const btn = state.page.querySelector<HTMLElement>(`[data-key="${code}"]`);
    btn?.classList.add('is-pressed');
    setTimeout(() => btn?.classList.remove('is-pressed'), 120);
  };
  if (key === 't' || key === 'T') {
    flash('T');
    scheduleIds(state, [task.id], toDateKey(viewNow()), 'today');
  } else if (key === 'w' || key === 'W') {
    flash('W');
    const week = scheduleTargets(viewNow()).find((item) => item.id === 'this_week');
    if (week) scheduleIds(state, [task.id], week.dateKey, 'this week');
  } else if (key === 'd' || key === 'D') {
    flash('D');
    pickDate(state, [task.id]);
  } else if (key === 's' || key === 'S') {
    flash('S');
    const host = state.page.querySelector<HTMLElement>('.backlog-confirm') ?? state.page;
    paintSnoozeChoice(state, task, host);
  } else if (key === 'p' || key === 'P') {
    flash('P');
    const host = state.page.querySelector<HTMLElement>('.backlog-confirm') ?? state.page;
    paintProjectChoice(state, task, host);
  } else if (key === 'x' || key === 'X') {
    flash('X');
    deleteIds(state, [task.id]);
  } else if (key === 'a' || key === 'A') {
    flash('A');
    archiveIds(state, [task.id]);
  } else if (key === 'Enter') {
    openEditor(state, task);
  }
}

function bindTriageSwipe(state: Session, card: HTMLElement, task: Task): void {
  let x = 0;
  let y = 0;
  card.addEventListener('pointerdown', (event) => {
    x = event.clientX;
    y = event.clientY;
  });
  card.addEventListener('pointerup', (event) => {
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) scheduleIds(state, [task.id], toDateKey(viewNow()), 'today');
      else snoozeIds(state, [task.id], 1);
    } else if (dy < 0) {
      const week = scheduleTargets(viewNow()).find((item) => item.id === 'this_week');
      if (week) scheduleIds(state, [task.id], week.dateKey, 'this week');
    } else {
      deleteIds(state, [task.id]);
    }
  });
}

function buildShell(state: Session): void {
  const page = el('div', 'backlog-page backlog-view');
  if (reduced()) page.dataset.reduced = '1';
  const live = el('div', 'backlog-live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  page.append(live);
  const filters = createCollapsibleFilters({
    id: 'backlog',
    ariaLabel: 'Filters',
    className: 'board-filter',
    active: state.domain !== 'all' || state.priority !== 'all' || Boolean(state.tag)
  });
  const tags = [...new Set(state.tasks.flatMap((task) => task.tags))].sort();
  filters.panel.append(
    createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: state.domain,
      onChange: (value) => {
        state.domain = value as TaskDomain | 'all';
        reconcile(state);
      }
    }).el,
    createHubFilter({
      key: 'Priority',
      label: 'Priority',
      defaultValue: 'all',
      options: priorityFilterOptions(),
      value: state.priority,
      onChange: (value) => {
        state.priority = value as TaskPriority | 'all';
        reconcile(state);
      }
    }).el,
    createHubFilter({
      key: 'Tag',
      label: 'Tag',
      defaultValue: '',
      options: [{ value: '', label: 'All tags' }, ...tags.map((tag) => ({ value: tag, label: tag }))],
      value: state.tag,
      onChange: (value) => {
        state.tag = value;
        reconcile(state);
      }
    }).el
  );
  page.append(filters.root);
  page.append(el('div', 'backlog-zones'));
  page.append(
    renderQuickAdd(
      (created) => {
        upsert(state.tasks, created);
        if (created.due_date) {
          showHubToast(`Added to ${formatShortWeekday(created.due_date)}`);
        }
        reconcile(state);
        const row = state.page.querySelector<HTMLElement>(`[data-task-id="${created.id}"]`);
        if (row) enterRow(row);
      },
      null,
      {
        parse: true,
        inline: true,
        placeholder: 'Add a task… try "email Simone re room fri #teaching"'
      }
    )
  );
  const suggestions = el('div', 'backlog-suggestions');
  suggestions.hidden = true;
  page.append(suggestions);
  page.append(el('div', 'backlog-fresh'));
  page.append(el('p', 'backlog-empty'));
  const stale = el('section', 'backlog-stale');
  stale.hidden = true;
  const staleToggle = el('button', 'backlog-stale__toggle');
  staleToggle.type = 'button';
  staleToggle.append(el('span', 'backlog-stale__chev', '▸'), el('span', '', 'Still want these?'));
  staleToggle.addEventListener('click', () => {
    state.staleOpen = !state.staleOpen;
    stale.classList.toggle('is-open', state.staleOpen);
  });
  const stalePanel = el('div', 'backlog-stale__panel');
  const archiveAll = el('button', 'btn btn--ghost', 'Archive all');
  archiveAll.type = 'button';
  archiveAll.addEventListener('click', () => {
    const ids = computeView(state).stale.map((row) => row.task.id);
    showConfirmWrite(page.querySelector('.backlog-confirm') ?? page, 'Archive all stale tasks', 'Moves every stale task to dead.', async () => {
      archiveIds(state, ids);
    });
  });
  stalePanel.append(archiveAll, el('div', 'backlog-stale__list'));
  stale.append(staleToggle, stalePanel);
  page.append(stale);
  const snoozed = el('section', 'backlog-snoozed');
  snoozed.hidden = true;
  const snoozeToggle = el('button', 'backlog-snoozed__toggle', '0 snoozed');
  snoozeToggle.type = 'button';
  snoozeToggle.addEventListener('click', () => {
    state.snoozedOpen = !state.snoozedOpen;
    snoozed.classList.toggle('is-open', state.snoozedOpen);
  });
  const snoozePanel = el('div', 'backlog-snoozed__panel');
  snoozePanel.append(el('div', 'backlog-snoozed__list'));
  snoozed.append(snoozeToggle, snoozePanel);
  page.append(snoozed);
  const bulk = el('div', 'backlog-bulk');
  bulk.hidden = true;
  const bulkActs: Array<[string, () => void]> = [
    ['Today', () => scheduleIds(state, [...state.selected], toDateKey(viewNow()), 'today')],
    [
      'This week',
      () => {
        const week = scheduleTargets(viewNow()).find((item) => item.id === 'this_week');
        if (week) scheduleIds(state, [...state.selected], week.dateKey, 'this week');
      }
    ],
    ['Snooze', () => snoozeIds(state, [...state.selected], 1)],
    ['Move to project', () => projectMenu(state, [...state.selected])],
    ['Archive', () => archiveIds(state, [...state.selected])],
    ['Delete', () => deleteIds(state, [...state.selected])]
  ];
  for (const [label, fn] of bulkActs) {
    const btn = el('button', 'btn btn--ghost', label);
    btn.type = 'button';
    btn.addEventListener('click', fn);
    bulk.append(btn);
  }
  page.append(bulk);
  page.append(el('div', 'backlog-confirm'));
  const triage = el('div', 'backlog-triage');
  triage.hidden = true;
  page.append(triage);
  state.canvas.replaceChildren(page);
  state.page = page;
}

export async function renderListView(canvas: HTMLElement): Promise<void> {
  if (session && session.canvas === canvas && canvas.querySelector('.backlog-page')) {
    session.canvas = canvas;
    reconcile(session);
    return;
  }
  teardownBacklog?.();
  teardownBacklog = null;
  showViewLoading(canvas, 'Loading…', '.backlog-view');
  let tasks: Task[];
  let projects: Project[];
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderListView(canvas), 'Could not load Backlog');
    return;
  }

  const state: Session = {
    canvas,
    page: canvas,
    tasks,
    projects,
    domain: 'all',
    priority: 'all',
    tag: '',
    sort: 'oldest',
    groupBy: 'hub',
    selected: new Set(),
    focusedId: null,
    pending: new Map(),
    animating: new Set(),
    deferred: [],
    exiting: new Set(),
    staleOpen: false,
    snoozedOpen: false,
    triage: null,
    scrollTop: 0,
    firstPaint: true,
    stops: []
  };
  session = state;
  buildShell(state);
  reconcile(state);

  const onKeydown = (event: KeyboardEvent) => onKey(state, event);
  window.addEventListener('keydown', onKeydown);
  state.stops.push(() => window.removeEventListener('keydown', onKeydown));
  state.stops.push(
    onTasksChanged((incoming) => {
      for (const task of incoming) {
        if (state.pending.has(task.id)) continue;
        if (state.exiting.has(task.id) || state.animating.has(task.id)) {
          state.deferred.push(task);
          continue;
        }
        upsert(state.tasks, task);
      }
      reconcile(state);
    })
  );
  state.stops.push(
    onTasksDeleted((ids) => {
      state.tasks = state.tasks.filter((task) => !ids.includes(task.id));
      reconcile(state);
    })
  );

  teardownBacklog = () => {
    for (const stop of state.stops) stop();
    if (session === state) session = null;
  };
}

export function resetBacklogForTests(): void {
  teardownBacklog?.();
  teardownBacklog = null;
  session = null;
}
