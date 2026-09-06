import type { Task, TaskDomain } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { openTasks } from '@/domain/queries';
import { BOARD_COLUMNS, columnForTask, statusForColumn, type BoardColumnId } from '@/domain/board';
import { boardTasks, isBoardTask } from '@/domain/hierarchy';
import { errorMessage } from '@/views/feedback';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  createHubFilter,
  createHubToolbar,
  domainFilterOptions,
  el
} from '@/views/hub-kit';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { initBoard, updateBoardCounts, type BoardMoveDetail } from '@/views/sprint-board';
import {
  initBoardColumnNav,
  renderBoardColumnNav,
  syncBoardColumnNavCounts
} from '@/views/board-column-nav';
import { deleteTaskNow } from '@/views/card-actions';
import { mountTaskCard, type TaskCardHandlers } from '@/views/hub-cards';
import { renderDashboardOverview } from '@/views/dashboard-overview';
import { pageHeaderStatusSlot } from '@/shell/shell';
import { requestToggleDone } from '@/views/dashboard';
import { runningProjectIds } from '@/domain/dashboard-overview';

/** Session-scoped project / domain filters for Kanban. */
let boardProjectFilter: string | 'all' = 'all';
let boardDomainFilter: TaskDomain | 'all' = 'all';
let boardRunningOnly = false;
let teardownBoard: (() => void) | null = null;
let teardownColumnNav: (() => void) | null = null;
let showBoardColumn: ((colId: BoardColumnId) => void) | null = null;

function boardLedeSuffix(): string {
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  if (coarse) {
    return 'drag a card to another column, or tap to expand · use the column tabs to browse';
  }
  return 'drag cards between columns, or focus one and press Space';
}

function appendBoardCard(
  list: HTMLElement,
  task: Task,
  column: BoardColumnId,
  projects: Project[],
  editorHost: HTMLElement,
  cardHandlers: TaskCardHandlers,
  onDelete: (task: Task) => void,
  onReload: (task?: Task) => void
): HTMLElement {
  return mountTaskCard(
    list,
    task,
    {
      onEdit: (current) => void renderTaskEditor(editorHost, current, projects, onReload),
      onDelete,
      ...cardHandlers,
      boardColumn: column
    },
    true
  );
}

function persistMove(
  detail: BoardMoveDetail,
  byId: Map<string, Task>,
  errorHost: HTMLElement,
  onReload: () => void
): void {
  const task = byId.get(detail.id);
  if (!task) return;
  const column = detail.column as BoardColumnId;
  const status = statusForColumn(column);
  if (!status || status === task.status) return;
  const previous = task.status;
  void tasksApi.updateTask(task.id, { status }).then(
    (updated) => {
      byId.set(updated.id, updated);
      void import('../../design-kit/js/hub-feedback.js').then(({ offerTimedUndo }) => {
        offerTimedUndo({
          message: `Moved “${task.title}”`,
          onUndo: () => {
            void tasksApi.updateTask(updated.id, { status: previous }).then(
              () => onReload(),
              () => onReload()
            );
          }
        });
      });
    },
    (err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not save the move')));
      onReload();
    }
  );
}

function persistStatus(
  task: Task,
  status: Task['status'],
  byId: Map<string, Task>,
  errorHost: HTMLElement,
  onSuccess: (updated: Task) => void,
  onReload: () => void,
  offerUndo = true
): void {
  if (status === task.status) return;
  const previous = task.status;
  void tasksApi.updateTask(task.id, { status }).then(
    (updated) => {
      byId.set(updated.id, updated);
      onSuccess(updated);
      if (status === 'done' && offerUndo) {
        void import('../../design-kit/js/hub-feedback.js').then(({ offerTimedUndo }) => {
          offerTimedUndo({
            message: `Completed “${task.title}”`,
            onUndo: () => persistStatus(updated, previous, byId, errorHost, onSuccess, onReload, false)
          });
        });
      }
    },
    (err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not save the move')));
      onReload();
    }
  );
}

function inScope(task: Task, runningIds: ReadonlySet<string>): boolean {
  if (task.status === 'dead' || !isBoardTask(task)) return false;
  if (boardProjectFilter !== 'all' && task.parent_project_id !== boardProjectFilter) return false;
  if (boardDomainFilter !== 'all' && task.domain !== boardDomainFilter) return false;
  if (boardRunningOnly && (!task.parent_project_id || !runningIds.has(task.parent_project_id))) {
    return false;
  }
  return true;
}

function listForColumn(board: HTMLElement, column: BoardColumnId): HTMLElement | null {
  return board.querySelector(`.card-list[data-col="${column}"]`);
}

/** Board is the Tasks Hub home surface — sprint-board drag over hub tiles. */
export async function renderBoardView(canvas: HTMLElement): Promise<void> {
  teardownBoard?.();
  teardownBoard = null;
  teardownColumnNav?.();
  teardownColumnNav = null;
  showBoardColumn = null;
  if (!canvas.querySelector('.board')) {
    canvas.replaceChildren(el('p', 'canvas-status', 'Loading dashboard…'));
  }
  let tasks: Awaited<ReturnType<typeof tasksApi.listTasks>>;
  let projects: Awaited<ReturnType<typeof tasksApi.listProjects>>;
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    canvas.replaceChildren(
      el('p', 'empty-state', err instanceof Error ? err.message : 'Could not load dashboard')
    );
    const retry = el('button', 'btn btn--secondary', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', () => void renderBoardView(canvas));
    canvas.append(retry);
    return;
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const runningIds = new Set(runningProjectIds(projects, tasks));
  function scoped(): Task[] {
    const eligible = boardTasks(tasks.filter((t) => t.status !== 'dead'));
    return eligible.filter((t) => inScope(t, runningIds));
  }

  canvas.replaceChildren();

  const confirmHost = el('div', 'board-confirm');
  const reloadBoard = (): void => {
    void renderBoardView(canvas);
  };

  const overviewHost = el('div', 'dashboard-overview');
  const header = canvas.closest('.hub-canvas')?.querySelector('.page-header');
  const statusHost = header instanceof HTMLElement ? pageHeaderStatusSlot(header) : undefined;
  renderDashboardOverview(overviewHost, {
    tasks,
    projects,
    statusHost,
    runningFilterActive: boardRunningOnly,
    onChanged: reloadBoard,
    onFilterRunning: () => {
      boardRunningOnly = !boardRunningOnly;
      reloadBoard();
    },
    onCompleteTask: (task) => requestToggleDone(confirmHost, task, async () => reloadBoard()),
    onStartTask: (task) => {
      void tasksApi.updateTask(task.id, { status: 'in_progress' }).then(reloadBoard, (err: unknown) => {
        confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not start')));
      });
    },
    onRescheduleTask: (task, dateKey) => {
      void tasksApi.updateTask(task.id, { due_date: dateKey }).then(reloadBoard, (err: unknown) => {
        confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not reschedule')));
      });
    }
  });
  canvas.append(overviewHost);

  const boardSection = el('section', 'dashboard-board');
  boardSection.append(el('h2', 'section-title', 'Board'));
  const lede = el('p', 'view-lede');
  boardSection.append(lede);

  const toolbar = createHubToolbar('board-toolbar');
  const filterRow = createCollapsibleFilters({
    id: 'board',
    ariaLabel: 'Filters',
    className: 'board-filter hub-filters--inline',
    active: boardProjectFilter !== 'all' || boardDomainFilter !== 'all' || boardRunningOnly
  });
  const scope = createHubFilter({
    key: 'Scope',
    label: 'Board project scope',
    defaultValue: 'all',
    options: [
      { value: 'all', label: 'All tasks' },
      ...projects.map((project) => ({ value: project.id, label: project.title }))
    ],
    value: boardProjectFilter,
    onChange: (value) => {
      boardProjectFilter = value as string | 'all';
      void renderBoardView(canvas);
    }
  });
  const domain = createHubFilter({
    key: 'Domain',
    label: 'Domain',
    defaultValue: 'all',
    options: domainFilterOptions(),
    value: boardDomainFilter,
    onChange: (value) => {
      boardDomainFilter = value as TaskDomain | 'all';
      void renderBoardView(canvas);
    }
  });
  filterRow.panel.append(scope.el, domain.el);
  toolbar.append(
    filterRow.root,
    renderQuickAdd((created) => {
      upsertTask(created);
    }, boardProjectFilter === 'all' ? null : boardProjectFilter)
  );
  if (boardRunningOnly) {
    const clear = el('button', 'btn btn--secondary', 'Running projects');
    clear.type = 'button';
    clear.setAttribute('aria-pressed', 'true');
    clear.title = 'Clear running-projects filter';
    clear.addEventListener('click', () => {
      boardRunningOnly = false;
      reloadBoard();
    });
    toolbar.append(clear);
  }

  boardSection.append(toolbar);

  const board = el('div', 'board board-grid');
  board.setAttribute('aria-label', 'Task board');

  const boardCardHandlers = (onReload: () => void): TaskCardHandlers => ({
    onToggle: (current) => {
      const next = current.status === 'done' ? 'open' : 'done';
      persistStatus(current, next, byId, confirmHost, upsertTask, onReload);
    },
    onPatch: (current, patch) => {
      void tasksApi.updateTask(current.id, patch).then(
        (updated) => upsertTask(updated),
        (err: unknown) => {
          confirmHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not save')));
          onReload();
        }
      );
    }
  });

  function syncChrome(): void {
    lede.textContent = `${openTasks(scoped()).length} open in scope · ${boardLedeSuffix()}.`;
    updateBoardCounts(board);
    const nav = boardSection.querySelector<HTMLElement>('.board-col-nav');
    if (nav) syncBoardColumnNavCounts(nav, board);
  }

  function upsertTask(task: Task): void {
    const index = tasks.findIndex((entry) => entry.id === task.id);
    if (index >= 0) tasks[index] = task;
    else tasks.push(task);
    byId.set(task.id, task);
    const existing = board.querySelector<HTMLElement>(`[data-id="${task.id}"]`);
    if (!inScope(task, runningIds)) {
      existing?.remove();
      syncChrome();
      return;
    }
    const column = columnForTask(task, byId);
    const list = listForColumn(board, column);
    if (!list) return;
    existing?.remove();
    const card = appendBoardCard(
      list,
      task,
      column,
      projects,
      confirmHost,
      boardCardHandlers(() => void renderBoardView(canvas)),
      (current) => removeTask(current),
      (updated) => {
        if (updated) upsertTask(updated);
        else void tasksApi.getTask(task.id).then(upsertTask);
        confirmHost.replaceChildren();
      }
    );
    card.dataset.col = column;
    const hint = list.querySelector('.empty-hint');
    if (hint) list.insertBefore(card, hint);
    syncChrome();
    showBoardColumn?.(column);
  }

  function dropBoardTask(task: Task): void {
    const card = board.querySelector<HTMLElement>(`[data-id="${task.id}"]`);
    card?.remove();
    tasks = tasks.filter((entry) => entry.id !== task.id);
    byId.delete(task.id);
    syncChrome();
  }

  function removeTask(task: Task): void {
    dropBoardTask(task);
    deleteTaskNow(task, () => undefined, confirmHost);
  }

  boardSection.append(confirmHost);

  for (const col of BOARD_COLUMNS) {
    const section = el('section', 'column board-col');
    section.dataset.col = col.id;
    section.setAttribute('aria-label', col.title);

    const header = el('header', 'column-header');
    const titleRow = el('div', 'column-title-row');
    titleRow.append(el('span', 'column-rail'), el('h2', 'column-title board-col__title', col.title));
    header.append(titleRow, el('span', 'column-count', '00'));
    section.append(header);

    const body = el('div', 'column-body');
    const list = document.createElement('ul');
    list.className = 'card-list board-col__stack';
    list.dataset.col = col.id;

    const items = scoped().filter((t) => columnForTask(t, byId) === col.id);
    const reload = () => void renderBoardView(canvas);
    const handlers = boardCardHandlers(reload);
    for (const task of items) {
      const card = appendBoardCard(
        list,
        task,
        col.id,
        projects,
        confirmHost,
        handlers,
        (current) => removeTask(current),
        (updated) => {
          if (updated) upsertTask(updated);
          else void tasksApi.getTask(task.id).then(upsertTask);
          confirmHost.replaceChildren();
        }
      );
      card.dataset.col = col.id;
    }
    const hint = el('li', 'empty-hint', col.empty);
    hint.hidden = items.length > 0;
    list.append(hint);
    body.append(list);
    section.append(body);
    board.append(section);
  }

  updateBoardCounts(board);
  const columnNav = renderBoardColumnNav(board);
  syncBoardColumnNavCounts(columnNav, board);
  boardSection.append(columnNav, board);
  canvas.append(boardSection);
  syncChrome();

  const columnNavHandle = initBoardColumnNav(board, columnNav);
  showBoardColumn = columnNavHandle.showColumn;
  teardownColumnNav = columnNavHandle.teardown;
  teardownBoard = initBoard(board, {
    onCardMoved: (detail) => persistMove(detail, byId, confirmHost, () => void renderBoardView(canvas))
  });
}

export type { Project };
