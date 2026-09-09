import type { Task, TaskDomain } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { Area } from '@/schemas/area';
import type { Goal } from '@/schemas/goal';
import type { ClareDumpResult, ClareProposal } from '@/domain/clare';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import { backlogTasks, openTasks, parseDue, toDateKey } from '@/domain/queries';
import { somedayTasks } from '@/domain/hierarchy';
import { detectPinchPoints, type PinchPoint } from '@/domain/pinch';
import { buildDayCapacity } from '@/domain/capacity';
import { findStallCandidates } from '@/domain/stall';
import { buildProjectPulseCard, projectEnergy } from '@/domain/projects-pulse';
import { projectPageHash } from '@/domain/cards';
import { getTaskPropertiesSync } from '@/services/task-properties';
import {
  addCalendarRange,
  calendarHash,
  collectCalendarItems,
  collectPlanningMarkers,
  collectWorkBlockItems,
  dayTaskMinutes,
  filterCalendarItems,
  formatLoad,
  itemsForDay,
  itemsInRange,
  isSameMonth,
  monthTitle,
  overdueItems,
  parseCalendarAnchor,
  parseCalendarMode,
  pickSelectedDateKey,
  visibleDays,
  visibleOverflow,
  weekdayShort,
  type CalendarFilters,
  type CalendarItem,
  type CalendarMode,
  type PlanningLayer
} from '@/domain/calendar';
import type { WorkBlock } from '@/schemas/work-block';
import type { PlanningProfile } from '@/schemas/planning-profile';
import { dayCapacity, protectedSpansForDate } from '@/domain/hammond-capacity';
import { DEFAULT_PLANNING_PROFILE } from '@/schemas/planning-profile';
import {
  blockStyle,
  formatBlockTime,
  hoursFromOffset,
  hoursToDueTime,
  layoutTimedBlocks,
  nowLineOffset,
  parseGoToDate,
  splitDayItems,
  timeGridHours,
  TIME_GRID_START_HOUR,
  TIME_GRID_HOUR_PX
} from '@/domain/time-grid';
import { hourCaption } from '@/domain/daily-dial';
import { formatDisplayDate, formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';
import { keyDateKindFromLabel } from '@/domain/excursion';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { materializeExcursionAdminTask } from '@/views/excursion-admin';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { renderPressureStrips } from '@/views/pinch-strip';
import { requestToggleDone } from '@/views/dashboard';
import { mountTaskCard } from '@/views/hub-cards';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  calendarItemIdForFocus,
  getFocus,
  hydrateFocusFromHash,
  normalizeCalendarItemId,
  setFocus
} from '@/domain/focus';
import {
  createHubFilter,
  createHubPills,
  createHubSearch,
  domainFilterOptions,
  el
} from '@/views/hub-kit';

const MONTH_EVENT_LIMIT = 2;
const WEEKDAY_HEADINGS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const sessionFilters: CalendarFilters = {
  domain: 'all',
  projectId: 'all',
  query: '',
  includeDone: false,
  includeDates: true,
  planningLens: false,
  layers: ['hard_deadline', 'planned_work', 'protected_time', 'target', 'review']
};

/** Pending schedule-diff ghosts keyed by immutable proposal id (preview only — no write). */
const ghostBlocksByProposalId = new Map<string, WorkBlock[]>();

function rebuildCalendarGhostBlocks(): WorkBlock[] {
  const merged: WorkBlock[] = [];
  for (const blocks of ghostBlocksByProposalId.values()) merged.push(...blocks);
  return merged;
}

let pendingGhostBlocks: WorkBlock[] = [];

/** Replace all ghosts (legacy). Prefer proposal-scoped helpers for Productivity OS. */
export function setCalendarGhostBlocks(blocks: WorkBlock[]): void {
  ghostBlocksByProposalId.clear();
  if (blocks.length) ghostBlocksByProposalId.set('__legacy__', blocks);
  pendingGhostBlocks = rebuildCalendarGhostBlocks();
}

export function setCalendarGhostBlocksForProposal(proposalId: string, blocks: WorkBlock[]): void {
  const id = proposalId.trim();
  if (!id) return;
  if (!blocks.length) ghostBlocksByProposalId.delete(id);
  else ghostBlocksByProposalId.set(id, blocks);
  pendingGhostBlocks = rebuildCalendarGhostBlocks();
}

export function clearCalendarGhostBlocksForProposal(proposalId: string): void {
  const id = proposalId.trim();
  if (!id) return;
  ghostBlocksByProposalId.delete(id);
  pendingGhostBlocks = rebuildCalendarGhostBlocks();
}

export function getCalendarGhostBlocks(): WorkBlock[] {
  return pendingGhostBlocks;
}

export function getCalendarGhostBlocksForProposal(proposalId: string): WorkBlock[] {
  return ghostBlocksByProposalId.get(proposalId.trim()) ?? [];
}

let planWorkMode = false;

let selectedDateKey: string | null = null;
let selectedItemId: string | null = null;
let composeDraft: { dateKey: string; dueTime: string | null } = { dateKey: '', dueTime: null };
let lastMonthDelta = 0;
let focusComposeOnPaint = false;
/** Month view: the date_key whose "bloom" drawer (full item list, inline) is open. */
let bloomDateKey: string | null = null;
let scrollToPreviewOnPaint = false;

type LiveCalendar = {
  canvas: HTMLElement;
  mode: CalendarMode;
  apply: (mode: CalendarMode) => void;
  dispose: () => void;
};

let liveCalendar: LiveCalendar | null = null;

type EventTint = 'blue' | 'sage' | 'peach' | 'gold' | 'lilac' | 'sand';

function eventTint(item: CalendarItem): EventTint {
  if (item.kind === 'key_date') return 'sand';
  if (item.kind === 'milestone') return 'gold';
  if (item.kind === 'work_block') return 'lilac';
  switch (item.domain) {
    case 'teaching':
      return 'blue';
    case 'life':
      return 'gold';
    case 'wedding':
      return 'peach';
    case 'health':
      return 'lilac';
    default:
      return 'sage';
  }
}

function eventLabel(item: CalendarItem): string {
  const bits = [
    item.title,
    item.kind === 'task' ? item.priority : item.subtitle,
    item.project_title,
    `due ${formatDisplayDate(item.date_key)}`
  ].filter(Boolean);
  return bits.join(', ');
}

function replaceHash(mode: CalendarMode, anchor: Date): void {
  const next = calendarHash(mode, anchor);
  if (location.hash !== next) history.replaceState(null, '', next);
}

function renderEventChip(
  item: CalendarItem,
  onOpen: (item: CalendarItem) => void
): HTMLButtonElement {
  const chip = el('button', 'event-chip');
  chip.type = 'button';
  chip.dataset.tint = eventTint(item);
  chip.dataset.kind = item.kind;
  chip.dataset.date = item.date_key;
  chip.dataset.eventId = item.id;
  if (item.domain) chip.dataset.domain = item.domain;
  if (item.task) chip.dataset.taskId = item.task.id;
  if (item.status === 'done' || item.status === 'dead') chip.classList.add('is-done');
  if (item.priority === 'urgent') chip.classList.add('is-urgent');
  if (item.ghost) chip.classList.add('is-ghost');
  chip.setAttribute('aria-label', eventLabel(item));
  chip.draggable = item.movable && item.kind === 'task';

  const title = el('span', 'event-chip__title', item.title);
  chip.append(title);
  const metaBits = [item.kind === 'task' ? item.priority : item.subtitle, item.project_title]
    .filter(Boolean)
    .join(' · ');
  if (metaBits) chip.append(el('span', 'event-chip__meta', metaBits));

  chip.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen(item);
  });
  if (item.movable && item.task) {
    chip.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/task-id', item.task!.id);
      event.dataTransfer?.setData('text/plain', item.task!.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      chip.classList.add('is-dragging');
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('is-dragging');
    });
  }
  return chip;
}

function wireDropTarget(
  node: HTMLElement,
  dateKey: string,
  onDropTask: (taskId: string, dateKey: string, dueTime?: string | null) => void,
  timeFromEvent?: (event: DragEvent) => string | null | undefined
): void {
  node.dataset.dropDate = dateKey;
  node.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    node.classList.add('is-drop-target');
  });
  node.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
    node.classList.remove('is-drop-target');
  });
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    node.classList.remove('is-drop-target');
    const taskId =
      event.dataTransfer?.getData('text/task-id') || event.dataTransfer?.getData('text/plain');
    if (!taskId) return;
    onDropTask(taskId, dateKey, timeFromEvent?.(event));
  });
}

function renderViewTabs(
  mode: CalendarMode,
  onSwitch: (mode: CalendarMode, date?: Date) => void
): HTMLElement {
  const tabs = el('div', 'hub-pills calendar-view-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Calendar view');
  for (const item of [
    { id: 'day' as const, label: 'Day' },
    { id: 'week' as const, label: 'Week' },
    { id: 'month' as const, label: 'Month' }
  ]) {
    const btn = el(
      'button',
      `hub-pills__btn calendar-view-tabs__tab${item.id === mode ? ' is-active' : ''}`,
      item.label
    );
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', item.id === mode ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (item.id !== mode) onSwitch(item.id);
    });
    tabs.append(btn);
  }
  return tabs;
}

export async function renderCalendarView(canvas: HTMLElement, mode: CalendarMode): Promise<void> {
  if (liveCalendar && liveCalendar.canvas === canvas && canvas.querySelector('.hub-calendar')) {
    liveCalendar.apply(mode);
    return;
  }

  showViewLoading(canvas, 'Loading…', '.hub-calendar');
  let tasks: Task[];
  let projects: Project[];
  let areas: Area[];
  let goals: Goal[];
  let workBlocks: WorkBlock[] = [];
  let planningProfile: PlanningProfile = DEFAULT_PLANNING_PROFILE;
  try {
    [tasks, projects, areas, goals, workBlocks, planningProfile] = await Promise.all([
      tasksApi.listTasks(),
      tasksApi.listProjects().catch(() => [] as Project[]),
      tasksApi.listAreas().catch(() => [] as Area[]),
      tasksApi.listGoals().catch(() => [] as Goal[]),
      typeof tasksApi.listWorkBlocks === 'function'
        ? tasksApi.listWorkBlocks().catch(() => [] as WorkBlock[])
        : Promise.resolve([] as WorkBlock[]),
      typeof tasksApi.getPlanningProfile === 'function'
        ? tasksApi.getPlanningProfile().catch(() => DEFAULT_PLANNING_PROFILE)
        : Promise.resolve(DEFAULT_PLANNING_PROFILE)
    ]);
  } catch (err) {
    liveCalendar = null;
    renderLoadError(canvas, err, () => void renderCalendarView(canvas, mode), 'Could not load calendar');
    return;
  }

  const today = new Date();
  let anchor = parseCalendarAnchor(hashQuery().get('date'), today);
  const keys = new AbortController();
  const session: LiveCalendar = {
    canvas,
    mode: mode === 'week' ? parseCalendarMode() : mode,
    apply: (next) => {
      const rawDate = hashQuery().get('date');
      const fromHash = rawDate ? parseCalendarAnchor(rawDate, today) : anchor;
      const resolved = next === 'week' ? parseCalendarMode() : next;
      if (session.mode === resolved && toDateKey(anchor) === toDateKey(fromHash)) return;
      session.mode = resolved;
      anchor = fromHash;
      paint();
    },
    dispose: () => keys.abort()
  };
  if (liveCalendar) liveCalendar.dispose();
  liveCalendar = session;
  hydrateFocusFromHash();
  const focusRef = getFocus();
  const focusItemId = focusRef ? calendarItemIdForFocus(focusRef) : null;
  if (focusItemId) {
    selectedItemId = focusItemId;
    const focused = filterCalendarItems(collectCalendarItems(tasks, projects), sessionFilters).find(
      (item) => item.id === focusItemId
    );
    if (focused?.date_key) {
      const focusedDay = parseCalendarAnchor(focused.date_key, today);
      const days = visibleDays(anchor, session.mode);
      const startKey = toDateKey(days[0]!);
      const endKey = toDateKey(days[days.length - 1]!);
      if (focused.date_key < startKey || focused.date_key > endKey) {
        anchor = focusedDay;
        selectedDateKey = focused.date_key;
      }
    }
  }

  function allItems(): CalendarItem[] {
    const base = collectCalendarItems(tasks, projects);
    const blocks = collectWorkBlockItems(workBlocks, projects);
    const ghosts = collectWorkBlockItems(pendingGhostBlocks, projects, { ghost: true });
    const markers = sessionFilters.planningLens
      ? collectPlanningMarkers(tasks, projects)
      : [];
    const merged = [...base, ...blocks, ...ghosts, ...markers];
    const filters: CalendarFilters = {
      ...sessionFilters,
      layers: sessionFilters.planningLens ? sessionFilters.layers : undefined
    };
    return filterCalendarItems(merged, filters);
  }

  async function reload(): Promise<void> {
    liveCalendar?.dispose();
    liveCalendar = null;
    await renderCalendarView(canvas, session.mode);
  }

  async function openItem(item: CalendarItem, preview: HTMLElement): Promise<void> {
    selectedDateKey = item.date_key;
    selectedItemId = item.id;
    setFocus(normalizeCalendarItemId(item.id));
    composeDraft = { dateKey: item.date_key, dueTime: item.task?.due_time ?? composeDraft.dueTime };
    preview.hidden = false;
    let task = item.task;
    if (!task && item.kind === 'key_date' && item.project_id) {
      const project = projects.find((entry) => entry.id === item.project_id);
      const kind = keyDateKindFromLabel(item.title);
      if (project && kind) {
        try {
          task = await materializeExcursionAdminTask(project, kind, item.date_key);
        } catch (err) {
          preview.replaceChildren(el('p', 'empty-state', errorMessage(err)));
          return;
        }
      }
    }
    if (task) {
      await openBacklogTask(task, preview, projects, reload);
      return;
    }
    if (item.kind === 'work_block' && item.work_block) {
      const block = item.work_block;
      preview.replaceChildren(
        el('p', 'graph-preview__eyebrow', item.ghost ? 'Ghost work block' : 'Planned work'),
        el('h3', 'graph-preview__title', block.title),
        el(
          'p',
          'graph-preview__meta',
          [
            formatDisplayDate(block.date),
            block.start_time,
            `${block.duration_minutes}m`,
            block.depth,
            block.status
          ]
            .filter(Boolean)
            .join(' · ')
        ),
        el(
          'p',
          'task-editor__planned-link',
          'Planned work is a block — not a deadline. Drag on the calendar still moves deadlines unless Plan work is on.'
        )
      );
      return;
    }
    preview.replaceChildren(
      el('p', 'graph-preview__eyebrow', item.subtitle ?? item.kind.replace('_', ' ')),
      el('h3', 'graph-preview__title', item.title),
      el(
        'p',
        'graph-preview__meta',
        [item.project_title, formatDisplayDate(item.date_key)].filter(Boolean).join(' · ')
      )
    );
  }

  function dropTask(taskId: string, dateKey: string, dueTime?: string | null): void {
    if (planWorkMode) {
      const task = tasks.find((entry) => entry.id === taskId);
      const title = task?.title ?? 'Work block';
      const start = dueTime || '09:00';
      void tasksApi
        .createWorkBlock({
          title,
          date: dateKey,
          start_time: start,
          duration_minutes: task?.estimated_duration ?? 60,
          task_id: task?.id ?? null,
          project_id: task?.parent_project_id ?? null,
          depth: task?.depth ?? 'shallow',
          status: 'confirmed',
          source: 'manual'
        })
        .then((block) => {
          workBlocks = [...workBlocks, block];
          paint();
        })
        .catch((err: unknown) => {
          const host = canvas.querySelector('.calendar-preview');
          if (host instanceof HTMLElement) {
            host.hidden = false;
            host.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not create work block')));
          }
        });
      return;
    }
    const task = tasks.find((entry) => entry.id === taskId);
    const timeUnchanged = dueTime === undefined || task?.due_time === dueTime;
    if (!task || (task.due_date === dateKey && timeUnchanged)) return;
    const previous = { due_date: task.due_date, due_time: task.due_time };
    task.due_date = dateKey;
    if (dueTime !== undefined) task.due_time = dueTime;
    paint();
    const patch: { due_date: string; due_time?: string | null } = { due_date: dateKey };
    if (dueTime !== undefined) patch.due_time = dueTime;
    void tasksApi.updateTask(taskId, patch).then(
      (updated) => {
        const index = tasks.findIndex((entry) => entry.id === updated.id);
        if (index >= 0) tasks[index] = updated;
      },
      (err: unknown) => {
        if (task) {
          task.due_date = previous.due_date;
          task.due_time = previous.due_time;
        }
        paint();
        const host = canvas.querySelector('.calendar-preview');
        if (host instanceof HTMLElement) {
          host.hidden = false;
          host.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not reschedule')));
        }
      }
    );
  }

  function switchMode(next: CalendarMode, date?: Date): void {
    if (date) {
      anchor = date;
      selectedDateKey = toDateKey(date);
    }
    if (session.mode === next && !date) return;
    session.mode = next;
    bloomDateKey = null;
    paint();
    const nextHash = calendarHash(next, anchor);
    if (location.hash !== nextHash) location.hash = nextHash;
  }

  function shiftRange(delta: number): void {
    if (session.mode === 'month') lastMonthDelta = delta;
    anchor = addCalendarRange(anchor, session.mode, delta);
    if (session.mode === 'day') selectedDateKey = toDateKey(anchor);
    else selectedDateKey = null;
    bloomDateKey = null;
    replaceHash(session.mode, anchor);
    paint();
  }

  function goTo(date: Date): void {
    lastMonthDelta = 0;
    anchor = date;
    selectedDateKey = toDateKey(date);
    bloomDateKey = null;
    paint();
    const nextHash = calendarHash(session.mode, date);
    if (location.hash !== nextHash) location.hash = nextHash;
  }

  function applySelection(day: Date, dueTime?: string | null): void {
    selectedDateKey = toDateKey(day);
    selectedItemId = null;
    composeDraft = { dateKey: selectedDateKey, dueTime: dueTime ?? null };
    if (session.mode === 'month' && !isSameMonth(day, anchor)) {
      anchor = day;
      replaceHash(session.mode, day);
    }
    if (session.mode === 'day') {
      anchor = day;
      replaceHash(session.mode, day);
    }
  }

  function selectDay(day: Date, dueTime?: string | null, focusCompose = false): void {
    applySelection(day, dueTime);
    if (focusCompose) focusComposeOnPaint = true;
    paint();
  }

  /** Month view only: select the day and toggle its inline "bloom" drawer — the
   * full-text item list unfolded directly under that week, so overflow never
   * costs a scroll to the rail on a small screen. */
  function toggleBloom(day: Date): void {
    applySelection(day);
    const key = toDateKey(day);
    bloomDateKey = bloomDateKey === key ? null : key;
    paint();
  }

  function paint(): void {
    const active = document.activeElement;
    const searchFocused =
      active instanceof HTMLInputElement && active.classList.contains('calendar-search');
    const searchPos = searchFocused ? active.selectionStart : null;
    const scrollTop = canvas.scrollTop;

    const items = allItems();
    const days = visibleDays(anchor, session.mode);
    selectedDateKey = pickSelectedDateKey(selectedDateKey, days, today, anchor);
    const todayKey = toDateKey(today);
    const rangeStart = days[0]!;
    const rangeEnd = days[days.length - 1]!;
    const rangeItems = itemsInRange(items, rangeStart, rangeEnd);
    const overdue = overdueItems(items, today);
    const pinchesByKey = new Map(
      detectPinchPoints(tasks, rangeStart, { days: days.length }).map((pinch) => [
        pinch.date_key,
        pinch
      ])
    );

    canvas.replaceChildren();

    const summary = el(
      'p',
      'calendar-summary',
      `${rangeItems.length} on this ${session.mode} · ${formatLoad(dayTaskMinutes(rangeItems)) || 'no timed work'}`
    );
    canvas.append(summary);

    if (overdue.length) {
      const earliest = overdue[0]!;
      const strip = el('div', 'calendar-overdue');
      const jump = el(
        'button',
        'btn btn--ghost',
        `${overdue.length} overdue · earliest ${formatDisplayDate(earliest.date_key)}`
      );
      jump.type = 'button';
      jump.addEventListener('click', () => goTo(parseCalendarAnchor(earliest.date_key)));
      strip.append(jump);
      canvas.append(strip);
    }

    const filters = createCollapsibleFilters({
      id: 'calendar',
      ariaLabel: 'Filters',
      className: 'board-filter calendar-filters',
      active:
        sessionFilters.domain !== 'all' ||
        sessionFilters.projectId !== 'all' ||
        Boolean(sessionFilters.query.trim()) ||
        sessionFilters.includeDone ||
        !sessionFilters.includeDates
    });
    const search = createHubSearch({
      placeholder: 'Filter this calendar…',
      ariaLabel: 'Filter calendar',
      value: sessionFilters.query,
      inputClass: 'hub-search__input calendar-search',
      onInput: (value) => {
        sessionFilters.query = value;
        paint();
      }
    });
    filters.panel.append(
      search.el,
      createHubFilter({
        key: 'Domain',
        label: 'Domain',
        defaultValue: 'all',
        options: domainFilterOptions(),
        value: sessionFilters.domain,
        onChange: (value) => {
          sessionFilters.domain = value as TaskDomain | 'all';
          paint();
        }
      }).el,
      createHubFilter({
        key: 'Project',
        label: 'Project',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All projects' },
          ...projects
            .filter((project) => project.status !== 'archived_dead')
            .map((project) => ({ value: project.id, label: project.title }))
        ],
        value: sessionFilters.projectId,
        onChange: (value) => {
          sessionFilters.projectId = value;
          paint();
        }
      }).el,
      createHubPills({
        label: 'Calendar layers',
        items: [
          { id: 'done', label: 'Completed' },
          { id: 'dates', label: 'Milestones' }
        ],
        value: [
          ...(sessionFilters.includeDone ? (['done'] as const) : []),
          ...(sessionFilters.includeDates ? (['dates'] as const) : [])
        ],
        onSelect: (id) => {
          if (id === 'done') sessionFilters.includeDone = !sessionFilters.includeDone;
          else sessionFilters.includeDates = !sessionFilters.includeDates;
          paint();
        }
      }),
      createHubPills({
        label: 'Planning',
        items: [
          { id: 'lens', label: 'Planning lens' },
          { id: 'plan_work', label: planWorkMode ? 'Plan work · on' : 'Plan work' }
        ],
        value: [
          ...(sessionFilters.planningLens ? (['lens'] as const) : []),
          ...(planWorkMode ? (['plan_work'] as const) : [])
        ],
        onSelect: (id) => {
          if (id === 'lens') sessionFilters.planningLens = !sessionFilters.planningLens;
          else planWorkMode = !planWorkMode;
          paint();
        }
      })
    );
    if (sessionFilters.planningLens) {
      const layerIds = (sessionFilters.layers ?? []) as PlanningLayer[];
      filters.panel.append(
        createHubPills({
          label: 'Planning layers',
          items: [
            { id: 'hard_deadline', label: 'Deadlines' },
            { id: 'planned_work', label: 'Planned work' },
            { id: 'protected_time', label: 'Protected' },
            { id: 'target', label: 'Target' },
            { id: 'review', label: 'Review' },
            { id: 'deep_filter', label: 'Deep' }
          ],
          value: layerIds,
          onSelect: (id) => {
            const next = new Set(sessionFilters.layers ?? []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            sessionFilters.layers = [...next] as PlanningLayer[];
            paint();
          }
        })
      );
    }
    canvas.append(filters.root);

    const capacity = dayCapacity(selectedDateKey || toDateKey(today), planningProfile);
    canvas.append(
      el(
        'p',
        'hub-calendar__capacity',
        `Capacity ${Math.round(capacity.available_minutes / 60)}h available (${capacity.work_source === 'profile' ? 'profile' : 'fallback 08:00–16:30'})`
      )
    );

    if (session.mode === 'week') {
      const pressure = el('div', 'pressure-host');
      renderPressureStrips(pressure, tasks, today, () => void reload());
      canvas.append(pressure);
    }

    if (!composeDraft.dateKey) composeDraft = { dateKey: selectedDateKey!, dueTime: composeDraft.dueTime };

    const preview = el('aside', 'graph-preview week-preview calendar-preview');
    preview.setAttribute('aria-live', 'polite');

    const showPreview = (item: CalendarItem) => {
      selectedDateKey = item.date_key;
      selectedItemId = item.id;
      setFocus(normalizeCalendarItemId(item.id));
      composeDraft = { dateKey: item.date_key, dueTime: item.task?.due_time ?? composeDraft.dueTime };
      paint();
    };

    const onCreated = (created: Task) => {
      const index = tasks.findIndex((entry) => entry.id === created.id);
      if (index >= 0) tasks[index] = created;
      else tasks.push(created);
      if (created.due_date) {
        selectedDateKey = created.due_date;
        composeDraft = { dateKey: created.due_date, dueTime: created.due_time };
      }
      paint();
    };

    const calendar = el('div', 'hub-calendar hub-calendar--workspace');
    calendar.append(renderCalendarNav(session.mode, anchor, shiftRange, goTo, today, switchMode));
    const workspace = el('div', 'hub-calendar__workspace');
    const body = el('div', 'hub-calendar__body');
    if (session.mode === 'month') {
      body.append(renderHorizonBreadcrumb(areas, goals, projects, tasks));
      const stallBanner = renderStalledProjectsBanner(projects, tasks);
      if (stallBanner) body.append(stallBanner);
      const pulseStrip = renderProjectPulseStrip(projects, tasks);
      if (pulseStrip) body.append(pulseStrip);
      const touchedStrip = renderDomainActivityStrip(tasks);
      if (touchedStrip) body.append(touchedStrip);
      body.append(
        renderMonthGrid(
          days,
          items,
          pinchesByKey,
          todayKey,
          selectedDateKey!,
          anchor,
          showPreview,
          selectDay,
          dropTask,
          lastMonthDelta,
          bloomDateKey,
          toggleBloom
        )
      );
    } else {
      body.append(
        renderTimeGrid(
          days,
          items,
          todayKey,
          selectedDateKey!,
          today,
          showPreview,
          selectDay,
          dropTask,
          tasks,
          pinchesByKey,
          sessionFilters.planningLens &&
          (sessionFilters.layers ?? []).includes('protected_time')
            ? planningProfile
            : null
        )
      );
    }
    const rail = el('div', 'hub-calendar__rail');
    const agenda = renderAgenda(
      items,
      selectedDateKey!,
      session.mode,
      showPreview,
      onCreated,
      switchMode,
      false,
      () => void reload()
    );
    rail.append(renderStandingCompose(composeDraft, onCreated), agenda, preview, renderShortcutHint());
    if (session.mode === 'week') {
      rail.append(renderLocksWidget(days, items, showPreview));
      rail.append(renderDeepHoursWidget(tasks, projects, days));
      rail.append(
        renderNextActionsWidget(tasks, (task) => openBacklogTask(task, preview, projects, reload))
      );
      rail.append(renderDumpWidget(onCreated));
      rail.append(renderQuickLinksWidget(tasks));
    }
    workspace.append(body, rail);
    calendar.append(workspace);
    canvas.append(calendar);

    const scrollToPreview = scrollToPreviewOnPaint;
    scrollToPreviewOnPaint = false;

    const selected = items.find((item) => item.id === selectedItemId);
    if (selected) {
      agenda.hidden = true;
      void openItem(selected, preview).finally(() => {
        if (scrollToPreview) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else canvas.scrollTop = scrollTop;
      });
    } else {
      preview.hidden = true;
    }

    if (!scrollToPreview) canvas.scrollTop = scrollTop;
    if (searchFocused) {
      const input = canvas.querySelector<HTMLInputElement>('.calendar-search');
      if (input) {
        input.focus();
        if (searchPos != null) input.setSelectionRange(searchPos, searchPos);
      }
    } else if (focusComposeOnPaint) {
      focusComposeOnPaint = false;
      focusCalendarCompose(canvas);
    }
  }

  const goDate = (raw: string) => {
    const next = parseGoToDate(raw, today);
    if (next) goTo(next);
  };
  bindCalendarKeys(canvas, keys.signal, {
    onAdd: () => {
      focusComposeOnPaint = true;
      paint();
    },
    onToday: () => goTo(today),
    onGoToDate: () => openCalendarCommand(canvas, 'date', goDate),
    onShortcuts: () => openCalendarCommand(canvas, 'help', goDate),
    onSwitch: switchMode
  });

  paint();
}

function renderCalendarNav(
  mode: CalendarMode,
  anchor: Date,
  shiftRange: (delta: number) => void,
  goTo: (date: Date) => void,
  today: Date,
  onSwitch: (mode: CalendarMode, date?: Date) => void
): HTMLElement {
  const days = visibleDays(anchor, mode);
  const rangeStart = days[0]!;
  const rangeEnd = days[days.length - 1]!;

  const nav = el('div', 'hub-calendar__nav');
  const paging = el('div', 'hub-calendar__paging');
  paging.setAttribute('role', 'group');
  paging.setAttribute(
    'aria-label',
    mode === 'day' ? 'Day navigation' : mode === 'week' ? 'Week navigation' : 'Month navigation'
  );

  const prev = el('button', 'hub-calendar__nav-btn');
  prev.type = 'button';
  prev.setAttribute(
    'aria-label',
    mode === 'day' ? 'Previous day' : mode === 'week' ? 'Previous week' : 'Previous month'
  );
  prev.textContent = '‹';
  prev.addEventListener('click', () => shiftRange(-1));

  const label = el(
    'span',
    'hub-calendar__month-label',
    mode === 'month'
      ? monthTitle(anchor)
      : mode === 'week'
        ? formatDisplayDateRange(rangeStart, rangeEnd)
        : formatDisplayDate(toDateKey(anchor))
  );

  const next = el('button', 'hub-calendar__nav-btn');
  next.type = 'button';
  next.setAttribute(
    'aria-label',
    mode === 'day' ? 'Next day' : mode === 'week' ? 'Next week' : 'Next month'
  );
  next.textContent = '›';
  next.addEventListener('click', () => shiftRange(1));

  const todayBtn = el('button', 'hub-calendar__today', 'Today');
  todayBtn.type = 'button';
  todayBtn.append(el('span', 'hub-kbd', 'T'));
  todayBtn.addEventListener('click', () => goTo(today));

  paging.append(prev, label, next, todayBtn);
  nav.append(paging, renderViewTabs(mode, onSwitch));
  return nav;
}

function renderWeekGrid(
  days: Date[],
  items: CalendarItem[],
  pinchesByKey: Map<string, { severity: string }>,
  todayKey: string,
  selectedKey: string,
  onOpen: (item: CalendarItem) => void,
  onSelect: (day: Date, dueTime?: string | null, focusCompose?: boolean) => void,
  onDrop: (taskId: string, dateKey: string, dueTime?: string | null) => void
): HTMLElement {
  const grid = el('div', 'hub-calendar__week');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Week calendar');
  for (const day of days) {
    const key = toDateKey(day);
    const pinch = pinchesByKey.get(key);
    const col = el('div', 'hub-calendar__week-day');
    col.setAttribute('role', 'gridcell');
    col.dataset.date = key;
    if (key === todayKey) {
      col.dataset.today = 'true';
      col.setAttribute('aria-current', 'date');
    }
    if (key === selectedKey) col.dataset.selected = 'true';
    if (pinch) col.dataset.pinch = pinch.severity;
    wireDropTarget(col, key, onDrop);
    col.addEventListener('click', () => onSelect(day));

    const head = el('div', 'hub-calendar__week-heading');
    const weekday = el('span', 'hub-calendar__week-weekday', weekdayShort(day));
    const num = el('span', 'hub-calendar__day-num', String(day.getDate()));
    const add = el('button', 'icon-plus-btn');
    add.type = 'button';
    add.textContent = '+';
    add.setAttribute('aria-label', `Add task on ${formatDisplayDate(day)}`);
    add.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect(day, null, true);
    });
    head.append(weekday, num, add);
    col.append(head);

    const dayItems = itemsForDay(items, day);
    const minutes = dayTaskMinutes(dayItems);
    if (pinch || minutes) {
      const meta = el(
        'p',
        'hub-calendar__week-empty',
        [pinch ? (pinch.severity === 'overloaded' ? 'overloaded' : 'watch') : null, formatLoad(minutes)]
          .filter(Boolean)
          .join(' · ')
      );
      col.append(meta);
    }
    if (!dayItems.length) col.append(el('p', 'hub-calendar__week-empty', 'Nothing due.'));
    for (const item of dayItems) col.append(renderEventChip(item, onOpen));
    grid.append(col);
  }
  return grid;
}

function renderMonthGrid(
  days: Date[],
  items: CalendarItem[],
  pinchesByKey: Map<string, { severity: string }>,
  todayKey: string,
  selectedKey: string,
  monthAnchor: Date,
  onOpen: (item: CalendarItem) => void,
  onSelect: (day: Date, dueTime?: string | null, focusCompose?: boolean) => void,
  onDrop: (taskId: string, dateKey: string, dueTime?: string | null) => void,
  monthDelta: number,
  bloomKey: string | null,
  onToggleBloom: (day: Date) => void
): HTMLElement {
  const grid = el('div', 'hub-calendar__grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Month calendar');
  if (monthDelta > 0) grid.dataset.motion = 'forward';
  if (monthDelta < 0) grid.dataset.motion = 'back';

  for (const heading of WEEKDAY_HEADINGS) {
    grid.append(el('span', 'hub-calendar__weekday', heading));
  }

  for (let w = 0; w < days.length; w += 7) {
    const week = days.slice(w, w + 7);
    let bloomDay: Date | null = null;

    for (const day of week) {
      const key = toDateKey(day);
      const pinch = pinchesByKey.get(key);
      const outside = !isSameMonth(day, monthAnchor);
      const cell = el('div', 'hub-calendar__day');
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = 0;
      cell.dataset.date = key;
      if (outside) cell.dataset.outside = 'true';
      if (key === todayKey) {
        cell.dataset.today = 'true';
        cell.setAttribute('aria-current', 'date');
      }
      if (key === selectedKey) cell.dataset.selected = 'true';
      if (pinch) cell.dataset.pinch = pinch.severity;
      wireDropTarget(cell, key, onDrop);

      const dayItems = itemsForDay(items, day);
      if (key === bloomKey) {
        cell.dataset.bloom = 'true';
        bloomDay = day;
      }

      const activate = (): void => {
        if (dayItems.length) onToggleBloom(day);
        else onSelect(day);
      };
      cell.addEventListener('click', activate);
      cell.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      });
      cell.addEventListener('dblclick', (event) => {
        event.preventDefault();
        onSelect(day, null, true);
      });

      const num = el('span', 'hub-calendar__day-num', String(day.getDate()));
      cell.append(num);

      const { visible, hidden } = visibleOverflow(dayItems, MONTH_EVENT_LIMIT);
      for (const item of visible) cell.append(renderEventChip(item, onOpen));
      if (hidden) {
        const more = el('button', 'event-chip-more', `+${hidden} more`);
        more.type = 'button';
        more.setAttribute('aria-label', `${hidden} more on ${formatDisplayDate(key)}`);
        more.addEventListener('click', (event) => {
          event.stopPropagation();
          onToggleBloom(day);
        });
        cell.append(more);
      }
      grid.append(cell);
    }

    if (bloomDay) {
      grid.append(renderBloomDrawer(bloomDay, itemsForDay(items, bloomDay), onOpen, onToggleBloom));
    }
  }
  return grid;
}

/** Month view: the full-text item list for one day, unfolded inline directly
 * below its week. Tapping an item opens the same task card the rest of the
 * calendar opens — it just also scrolls that card into view, since on a
 * phone the preview pane sits well below the fold. */
function renderBloomDrawer(
  day: Date,
  dayItems: CalendarItem[],
  onOpen: (item: CalendarItem) => void,
  onToggleBloom: (day: Date) => void
): HTMLElement {
  const wrap = el('div', 'hub-calendar__bloom');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', `${formatDisplayDate(toDateKey(day))} — full list`);

  const head = el('div', 'hub-calendar__bloom-head');
  head.append(el('span', 'hub-calendar__bloom-date', formatDisplayDate(toDateKey(day))));
  const close = el('button', 'hub-calendar__bloom-close', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', `Close ${formatDisplayDate(toDateKey(day))}`);
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    onToggleBloom(day);
  });
  head.append(close);
  wrap.append(head);

  const list = el('div', 'hub-calendar__bloom-list');
  if (!dayItems.length) {
    list.append(el('p', 'hub-calendar__detail-empty', 'Nothing on this day.'));
  } else {
    for (const item of dayItems) {
      list.append(
        renderEventChip(item, (opened) => {
          scrollToPreviewOnPaint = true;
          onOpen(opened);
        })
      );
    }
  }
  wrap.append(list);
  return wrap;
}

function renderStandingCompose(
  draft: { dateKey: string; dueTime: string | null },
  onCreated: (task: Task) => void
): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-compose-card');
  const heading = el('div', 'calendar-agenda__head');
  heading.append(el('h3', 'hub-calendar__detail-heading', 'Add'));
  heading.append(el('span', 'hub-kbd', 'A'));
  card.append(heading);
  card.append(
    renderQuickAdd(onCreated, null, {
      dueDate: draft.dateKey,
      dueTime: draft.dueTime,
      standing: true
    })
  );
  return card;
}

function renderShortcutHint(): HTMLElement {
  const hint = el('p', 'calendar-shortcuts');
  for (const [key, label] of [
    ['A', 'Add'],
    ['T', 'Today'],
    ['G', 'Date'],
    ['?', 'Keys']
  ]) {
    const item = el('span');
    item.append(el('kbd', 'hub-kbd', key), ` ${label}`);
    hint.append(item);
  }
  return hint;
}

function focusCalendarCompose(host: ParentNode): HTMLElement | null {
  const input = host.querySelector<HTMLInputElement>('[aria-label="New task title"]');
  input?.focus();
  return input;
}

function renderAgenda(
  items: CalendarItem[],
  dateKey: string,
  mode: CalendarMode,
  onOpen: (item: CalendarItem) => void,
  onCreated: (task: Task) => void,
  onSwitch: (mode: CalendarMode, date?: Date) => void,
  includeAdd = true,
  onReload?: () => void
): HTMLElement {
  const dayItems = itemsForDay(items, dateKey);
  const agenda = el('section', 'hub-calendar__detail');
  const heading = el('h3', 'hub-calendar__detail-heading', formatDisplayDate(dateKey));
  agenda.append(heading);

  const headActions = el('div', 'calendar-agenda__head');
  if (mode !== 'day') {
    const openDay = el('button', 'btn btn--secondary', 'Open day');
    openDay.type = 'button';
    openDay.addEventListener('click', () => onSwitch('day', parseCalendarAnchor(dateKey)));
    headActions.append(openDay);
  }
  if (mode === 'month') {
    const openWeek = el('button', 'btn btn--secondary', 'Open week');
    openWeek.type = 'button';
    openWeek.addEventListener('click', () => onSwitch('week', parseCalendarAnchor(dateKey)));
    headActions.append(openWeek);
  } else {
    const openMonth = el('button', 'btn btn--secondary', 'Open month');
    openMonth.type = 'button';
    openMonth.addEventListener('click', () => onSwitch('month', parseCalendarAnchor(dateKey)));
    headActions.append(openMonth);
  }
  agenda.append(headActions);

  agenda.append(
    dayItems.length
      ? el(
          'p',
          'hub-calendar__detail-empty',
          `${dayItems.length} on this day · ${formatLoad(dayTaskMinutes(dayItems)) || 'no timed work'}`
        )
      : el(
          'p',
          'hub-calendar__detail-empty',
          includeAdd ? 'Nothing on this day yet — add one below.' : 'Nothing on this day yet — add one above.'
        )
  );

  const stack = el('div', 'task-stack calendar-agenda__stack');
  for (const item of dayItems) {
    if (item.task) {
      mountTaskCard(stack, item.task, {
        onEdit: () => onOpen(item),
        onPatch: onReload
          ? (task, patch) => {
              void tasksApi.updateTask(task.id, patch).then(
                () => onReload(),
                (err: unknown) => {
                  stack.append(el('p', 'empty-state', errorMessage(err, 'Could not save')));
                }
              );
            }
          : undefined
      });
      continue;
    }
    const row = el('article', 'hub-row');
    row.dataset.kind = item.kind;
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.setAttribute('aria-label', `Edit ${item.title}`);
    row.append(el('p', 'hub-row__title', item.title));
    const chips = el('div', 'hub-chips');
    if (item.domain) {
      const chip = el('span', 'hub-chip', item.domain);
      chip.dataset.area = item.domain;
      chips.append(chip);
    }
    if (item.subtitle) chips.append(el('span', 'hub-chip', item.subtitle));
    if (item.priority) {
      const priority = el('span', 'priority-chip', item.priority);
      priority.dataset.priority = item.priority;
      chips.append(priority);
    }
    if (item.project_title) chips.append(el('span', 'hub-chip', item.project_title));
    row.append(chips);
    const foot = el('div', 'hub-row__foot');
    const meta = el('div', 'hub-row__foot-meta');
    const due = el('span', 'date-badge', formatDisplayDate(item.date_key));
    meta.append(due);
    foot.append(meta);
    row.append(foot);
    row.addEventListener('click', () => onOpen(item));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen(item);
      }
    });
    stack.append(row);
  }
  agenda.append(stack);
  if (includeAdd) agenda.append(renderQuickAdd(onCreated, null, { dueDate: dateKey }));
  return agenda;
}

function hourTimeFromEvent(event: DragEvent, host: HTMLElement): string {
  const rect = host.getBoundingClientRect();
  const y = event.clientY ? event.clientY - rect.top : 0;
  return hoursToDueTime(hoursFromOffset(y));
}

function renderTimeGrid(
  days: Date[],
  items: CalendarItem[],
  todayKey: string,
  selectedKey: string,
  now: Date,
  onOpen: (item: CalendarItem) => void,
  onSelect: (day: Date, dueTime?: string | null, focusCompose?: boolean) => void,
  onDrop: (taskId: string, dateKey: string, dueTime?: string | null) => void,
  tasks: Task[] = [],
  pinchesByKey: Map<string, PinchPoint> = new Map(),
  planningProfile: PlanningProfile | null = null
): HTMLElement {
  const grid = el('div', 'hub-calendar__timegrid');
  grid.style.setProperty('--days', String(days.length));
  grid.dataset.days = String(days.length);
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', days.length === 1 ? 'Day time grid' : 'Week time grid');

  grid.append(el('div', 'hub-calendar__time-corner'));
  for (const day of days) {
    const key = toDateKey(day);
    const heading = el('div', 'hub-calendar__time-heading hub-calendar__week-day');
    heading.dataset.date = key;
    if (key === todayKey) heading.dataset.today = 'true';
    if (key === selectedKey) heading.dataset.selected = 'true';
    const pinch = pinchesByKey.get(key);
    if (pinch) {
      heading.dataset.pinch = pinch.severity;
      heading.title = pinch.summary;
    }
    const capacity = buildDayCapacity(tasks, day);
    const capDot = el('span', `calendar-cap-dot calendar-cap-dot--${capacity.level}`);
    capDot.setAttribute('aria-hidden', 'true');
    heading.append(
      capDot,
      el('span', 'hub-calendar__week-weekday', weekdayShort(day)),
      el('span', 'hub-calendar__day-num', String(day.getDate()))
    );
    heading.addEventListener('click', () => onSelect(day));
    wireDropTarget(heading, key, onDrop);
    grid.append(heading);
  }

  grid.append(el('div', 'hub-calendar__time-allday-label', 'All day'));
  for (const day of days) {
    const key = toDateKey(day);
    const { allDay } = splitDayItems(itemsForDay(items, day));
    const cell = el('div', 'hub-calendar__all-day');
    cell.dataset.date = key;
    if (key === selectedKey) cell.dataset.selected = 'true';
    wireDropTarget(cell, key, onDrop, () => null);
    cell.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.event-chip')) return;
      onSelect(day, null, true);
    });
    for (const item of allDay) cell.append(renderEventChip(item, onOpen));
    grid.append(cell);
  }

  const gutter = el('div', 'hub-calendar__time-gutter');
  for (const hour of timeGridHours()) {
    gutter.append(el('p', 'hub-calendar__time-label', hourCaption(hour)));
  }
  grid.append(gutter);

  for (const day of days) {
    const key = toDateKey(day);
    const { timed } = splitDayItems(itemsForDay(items, day));
    const hours = el('div', 'hub-calendar__hours');
    hours.dataset.date = key;
    hours.dataset.dropDate = key;
    if (key === selectedKey) hours.dataset.selected = 'true';
    if (planningProfile) {
      for (const span of protectedSpansForDate(key, planningProfile)) {
        const top = ((span.start / 60 - TIME_GRID_START_HOUR) * TIME_GRID_HOUR_PX);
        const height = ((span.end - span.start) / 60) * TIME_GRID_HOUR_PX;
        if (height <= 0) continue;
        const bg = el('div', 'hub-calendar__protected-bg');
        bg.style.top = `${Math.max(0, top)}px`;
        bg.style.height = `${height}px`;
        bg.setAttribute('aria-hidden', 'true');
        bg.title = span.title;
        hours.append(bg);
      }
    }
    if (key === todayKey) {
      const offset = nowLineOffset(now);
      if (offset != null) {
        const line = el('div', 'hub-calendar__now');
        line.style.top = `${offset}px`;
        hours.append(line);
      }
    }
    wireDropTarget(hours, key, onDrop, (event) => hourTimeFromEvent(event, hours));
    hours.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.event-chip')) return;
      const rect = hours.getBoundingClientRect();
      const dueTime = hoursToDueTime(hoursFromOffset(event.clientY - rect.top));
      onSelect(day, dueTime, true);
    });
    for (const block of layoutTimedBlocks(timed)) {
      const chip = renderEventChip(block.item, onOpen);
      chip.classList.add('event-chip--timed');
      const meta = chip.querySelector('.event-chip__meta');
      if (meta) meta.textContent = formatBlockTime(block);
      else chip.append(el('span', 'event-chip__meta', formatBlockTime(block)));
      Object.assign(chip.style, blockStyle(block));
      hours.append(chip);
    }
    grid.append(hours);
  }
  return grid;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    : false;
}

function bindCalendarKeys(
  canvas: HTMLElement,
  signal: AbortSignal,
  handlers: {
    onAdd: () => void;
    onToday: () => void;
    onGoToDate: () => void;
    onShortcuts: () => void;
    onSwitch: (mode: CalendarMode) => void;
  }
): void {
  document.addEventListener(
    'keydown',
    (event) => {
      if (!canvas.isConnected || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        document.querySelector('.calendar-command')?.remove();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handlers.onShortcuts();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        handlers.onAdd();
      } else if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        handlers.onToday();
      } else if (event.key === 'g' || event.key === 'G' || event.key === '.') {
        event.preventDefault();
        handlers.onGoToDate();
      } else if (event.key === '?') {
        event.preventDefault();
        handlers.onShortcuts();
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        handlers.onSwitch('day');
      } else if (event.key === 'w' || event.key === 'W') {
        event.preventDefault();
        handlers.onSwitch('week');
      } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        handlers.onSwitch('month');
      }
    },
    { signal }
  );
}

function openCalendarCommand(
  canvas: HTMLElement,
  mode: 'date' | 'help',
  onDate: (value: string) => void
): void {
  document.querySelector('.calendar-command')?.remove();
  const overlay = el('div', 'calendar-command');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', mode === 'date' ? 'Go to date' : 'Calendar shortcuts');
  const panel = el('div', 'calendar-command__panel');
  if (mode === 'date') {
    panel.append(el('h3', 'hub-calendar__detail-heading', 'Go to date'));
    const form = el('form', 'quick-add hub-toolbar');
    const field = document.createElement('input');
    field.className = 'hub-search__input';
    field.type = 'text';
    field.placeholder = 'dd/mm/yy or today';
    field.setAttribute('aria-label', 'Go to date');
    const go = el('button', 'btn btn--primary', 'Go');
    go.type = 'submit';
    form.append(field, go);
    const submitDate = () => {
      onDate(field.value);
      overlay.remove();
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitDate();
    });
    go.addEventListener('click', (event) => {
      event.preventDefault();
      submitDate();
    });
    panel.append(form);
  } else {
    panel.append(el('h3', 'hub-calendar__detail-heading', 'Shortcuts'));
    const list = el('ul', 'calendar-command__list');
    for (const [key, label] of [
      ['A', 'Add to this day'],
      ['T', 'Jump to today'],
      ['G', 'Go to date'],
      ['D / W / M', 'Day, week, month'],
      ['⌘K / ?', 'This menu']
    ]) {
      const row = el('li');
      const btn = el('button');
      btn.type = 'button';
      btn.append(el('span', '', label), el('kbd', 'hub-kbd', key));
      btn.addEventListener('click', () => {
        overlay.remove();
        if (key === 'A') focusCalendarCompose(canvas);
        if (key === 'T') onDate('today');
        if (key === 'G') openCalendarCommand(canvas, 'date', onDate);
      });
      row.append(btn);
      list.append(row);
    }
    panel.append(list);
  }
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.append(panel);
  document.body.append(overlay);
  overlay.querySelector('input')?.focus();
}

/** Open a raw Task (no due date — not a CalendarItem) in the preview pane. Shared by
 *  `openItem`'s task branch and every rail widget that lists undated tasks. */
async function openBacklogTask(
  task: Task,
  preview: HTMLElement,
  projects: Project[],
  reload: () => Promise<void>
): Promise<void> {
  preview.hidden = false;
  preview.replaceChildren();
  await renderTaskEditor(preview, task, projects, () => void reload());
  const actions = el('div', 'calendar-preview__actions');
  const done = el('button', 'btn btn--secondary', task.status === 'done' ? 'Reopen' : 'Done');
  done.type = 'button';
  done.addEventListener('click', () => {
    requestToggleDone(preview, task, () => reload());
  });
  actions.append(done);
  preview.append(actions);
}

/** The single highest-priority dated task per visible day — real data, not invented. */
function renderLocksWidget(
  days: Date[],
  items: CalendarItem[],
  onOpen: (item: CalendarItem) => void
): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-locks');
  card.append(el('h3', 'hub-calendar__detail-heading', "This week's locks"));
  card.append(
    el('p', 'hub-calendar__detail-empty', "Each day's single highest-priority dated task.")
  );
  const list = el('div', 'calendar-locks__list');
  for (const day of days) {
    const lock = itemsForDay(items, day).find((item) => item.kind === 'task' && item.task);
    const row = el('button', `calendar-lock-row${lock ? ' is-locked' : ''}`);
    row.type = 'button';
    row.disabled = !lock;
    row.append(
      el('span', 'calendar-lock-row__day', weekdayShort(day).slice(0, 3).toUpperCase()),
      el('span', 'calendar-lock-row__task', lock ? lock.title : 'Nothing due')
    );
    if (lock) row.addEventListener('click', () => onOpen(lock));
    list.append(row);
  }
  card.append(list);
  return card;
}

/** GTD-style next actions: real backlog tasks (open/deferred, no due date), grouped by
 *  whatever tag they actually carry — there is no reserved "context" convention in this
 *  app, so this groups on real data rather than inventing a taxonomy. */
function renderNextActionsWidget(tasks: Task[], openTask: (task: Task) => void): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-next-actions');
  card.append(el('h3', 'hub-calendar__detail-heading', 'Next actions'));
  const backlog = backlogTasks(tasks);
  if (!backlog.length) {
    card.append(
      el('p', 'hub-calendar__detail-empty', 'Backlog is empty — everything has a date or is done.')
    );
    return card;
  }
  const groups = new Map<string, Task[]>();
  for (const task of backlog.slice(0, 12)) {
    const tag = task.tags[0] ?? 'No tag';
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push(task);
  }
  const stack = el('div', 'task-stack');
  for (const [tag, group] of groups) {
    stack.append(el('p', 'calendar-next-actions__group', tag));
    for (const task of group) {
      mountTaskCard(stack, task, { onEdit: () => openTask(task) });
    }
  }
  card.append(stack);
  if (backlog.length > 12) {
    const more = el('a', 'calendar-next-actions__more', `+${backlog.length - 12} more in Backlog →`);
    more.href = '#/backlog';
    card.append(more);
  }
  return card;
}

/** Clare's real dump → propose → accept flow, embedded in the calendar rail instead of
 *  the full chat UI. No LLM required — `processDumpWithClare` runs the same rule-based
 *  parser Clare's desk uses; `acceptClareProposal` is the same Confirm-before-write call
 *  that creates a real task. */
function renderDumpWidget(onCreated: (task: Task) => void): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-dump');
  card.append(el('h3', 'hub-calendar__detail-heading', 'Brain dump'));
  const form = el('form', 'calendar-dump__form');
  const textarea = document.createElement('textarea');
  textarea.className = 'hub-search__input calendar-dump__input';
  textarea.rows = 2;
  textarea.placeholder = 'Dump away.';
  textarea.setAttribute('aria-label', 'Brain dump');
  const submit = el('button', 'btn btn--primary', 'Sort it');
  submit.type = 'submit';
  form.append(textarea, submit);
  const results = el('div', 'calendar-dump__results');
  card.append(form, results);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    submit.disabled = true;
    const previousLabel = submit.textContent ?? 'Sort it';
    submit.textContent = 'Sorting…';
    tasksApi.processDumpWithClare({ text }).then(
      (result) => {
        submit.disabled = false;
        submit.textContent = previousLabel;
        textarea.value = '';
        renderDumpResults(results, result, onCreated);
      },
      (err: unknown) => {
        submit.disabled = false;
        submit.textContent = previousLabel;
        results.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not process that dump')));
      }
    );
  });
  return card;
}

function renderDumpResults(
  host: HTMLElement,
  result: ClareDumpResult,
  onCreated: (task: Task) => void
): void {
  host.replaceChildren();
  if (!result.proposals.length) {
    const note =
      result.questions[0] ?? result.notes[0] ?? 'Nothing actionable in that — try naming a concrete next step.';
    host.append(el('p', 'hub-calendar__detail-empty', note));
    return;
  }
  for (const proposal of result.proposals) {
    host.append(renderDumpProposalRow(proposal, onCreated));
  }
}

function renderDumpProposalRow(proposal: ClareProposal, onCreated: (task: Task) => void): HTMLElement {
  const row = el('div', 'calendar-dump__proposal');
  row.append(el('p', 'calendar-dump__proposal-title', proposal.title));
  const meta = el('div', 'hub-chips');
  const priority = el('span', 'priority-chip', proposal.priority);
  priority.dataset.priority = proposal.priority;
  meta.append(el('span', 'hub-chip', proposal.domain), priority);
  if (proposal.due_date) meta.append(el('span', 'hub-chip', formatDisplayDate(proposal.due_date)));
  row.append(meta);

  const actions = el('div', 'calendar-dump__proposal-actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  discard.addEventListener('click', () => row.remove());
  const confirm = el('button', 'btn btn--primary', 'Add');
  confirm.type = 'button';
  confirm.addEventListener('click', () => {
    confirm.disabled = true;
    discard.disabled = true;
    tasksApi.acceptClareProposal({ proposal, accepted_minutes: proposal.suggested_accepted_minutes }).then(
      (accepted) => {
        row.remove();
        onCreated(accepted.task);
      },
      (err: unknown) => {
        confirm.disabled = false;
        discard.disabled = false;
        row.append(el('p', 'empty-state', errorMessage(err, 'Could not save that task')));
      }
    );
  });
  actions.append(discard, confirm);
  row.append(actions);
  return row;
}

/** Real, always-live counts — clicking always lands on the real route, never a stub. */
function renderQuickLinksWidget(tasks: Task[]): HTMLElement {
  const card = el('section', 'hub-calendar__detail calendar-quick-links');
  const row = el('div', 'calendar-quick-links__row');
  const someday = el('a', 'btn btn--secondary', `Someday · ${somedayTasks(tasks).length}`);
  someday.href = '#/someday';
  const backlog = el('a', 'btn btn--secondary', `Backlog · ${backlogTasks(tasks).length}`);
  backlog.href = '#/backlog';
  row.append(someday, backlog);
  card.append(row);
  return card;
}

/** Real project-pulse cards (energy, drift vs. plan) — reuses the same domain logic the
 *  Projects view renders, so the numbers always match. Omitted entirely when there are
 *  no active projects, rather than showing an empty strip. */
function renderProjectPulseStrip(projects: Project[], tasks: Task[]): HTMLElement | null {
  const active = projects.filter((p) => p.status !== 'archived_dead');
  if (!active.length) return null;
  const stallIds = new Set(findStallCandidates(projects, tasks).map((c) => c.project.id));
  const strip = el('div', 'calendar-pulse-strip');
  for (const project of active.slice(0, 8)) {
    const card = buildProjectPulseCard(project, tasks, stallIds);
    const btn = el('button', 'calendar-pulse-card');
    btn.type = 'button';
    btn.append(
      el('span', 'calendar-pulse-card__name', card.project.title),
      el('span', 'calendar-pulse-card__meta', card.energyLabel),
      el('span', `calendar-pulse-card__drift calendar-pulse-card__drift--${card.driftKind}`, card.driftLabel)
    );
    btn.addEventListener('click', () => {
      location.hash = projectPageHash(card.project.id);
    });
    strip.append(btn);
  }
  return strip;
}

/** Real hours logged on tasks under "deep-focus" projects (the same energy
 *  heuristic `projectEnergy` already uses in the Projects view), summed over the
 *  visible week. The weekly target is a stated goal, not derived data — labeled
 *  as such rather than presented as something computed from real history. */
function renderDeepHoursWidget(tasks: Task[], projects: Project[], days: Date[]): HTMLElement {
  const TARGET_HOURS = 8;
  const deepProjectIds = new Set(
    projects.filter((project) => projectEnergy(project, tasks) === 'deep_focus').map((p) => p.id)
  );
  const startKey = toDateKey(days[0]!);
  const endKey = toDateKey(days[days.length - 1]!);
  let minutes = 0;
  for (const task of tasks) {
    if (!task.parent_project_id || !deepProjectIds.has(task.parent_project_id)) continue;
    const due = parseDue(task.due_date);
    if (!due) continue;
    const key = toDateKey(due);
    if (key < startKey || key > endKey) continue;
    minutes += task.actual_duration ?? task.estimated_duration ?? 45;
  }
  const hours = minutes / 60;
  const pct = Math.min(100, Math.round((hours / TARGET_HOURS) * 100));

  const card = el('section', 'hub-calendar__detail calendar-deep-hours');
  card.append(el('h3', 'hub-calendar__detail-heading', 'Deep hours this week'));
  card.append(
    el(
      'p',
      'hub-calendar__detail-empty',
      'Logged on tasks under deep-focus projects — target is a goal you set, not a measurement.'
    )
  );
  const row = el('div', 'calendar-deep-hours__row');
  const track = el('div', 'calendar-deep-hours__track');
  const fill = el('div', 'calendar-deep-hours__fill');
  fill.style.width = `${pct}%`;
  track.append(fill);
  row.append(track, el('span', 'calendar-deep-hours__label', `${hours.toFixed(1)}h / ${TARGET_HOURS}h target`));
  card.append(row);
  return card;
}

/** Real 4-level hierarchy — Areas of Focus, Goals, Projects, Actions — all real
 *  entities in this app (unlike "Purpose"/"Vision", which have no backing here
 *  and are deliberately not shown). Counts are live; each segment links to the
 *  real page for that altitude. */
function renderHorizonBreadcrumb(areas: Area[], goals: Goal[], projects: Project[], tasks: Task[]): HTMLElement {
  const segments: Array<{ label: string; count: number; href: string }> = [
    { label: 'Areas', count: areas.length, href: '#/goals' },
    { label: 'Goals', count: goals.filter((g) => g.status === 'active').length, href: '#/goals' },
    { label: 'Projects', count: projects.filter((p) => p.status !== 'archived_dead').length, href: '#/projects' },
    { label: 'Actions', count: openTasks(tasks).length, href: '#/board' }
  ];
  const bar = el('nav', 'calendar-horizon-bar');
  bar.setAttribute('aria-label', 'Areas to actions hierarchy');
  segments.forEach((segment, index) => {
    if (index > 0) {
      const arrow = el('span', 'calendar-horizon-bar__arrow', '→');
      arrow.setAttribute('aria-hidden', 'true');
      bar.append(arrow);
    }
    const link = el('a', 'calendar-horizon-bar__segment', `${segment.label} · ${segment.count}`);
    link.href = segment.href;
    bar.append(link);
  });
  return bar;
}

/** Real per-domain "last touched" signal, most-stale first. Reads the live domain
 *  list from Tools → Properties rather than a hardcoded set, and uses the most
 *  recent task `updated_at` in each domain as the activity timestamp — there is
 *  no explicit "review" action in this app, so this is honestly "last touched",
 *  not "last reviewed". Domains with no tasks ever show "no activity yet" rather
 *  than a fabricated date. */
function renderDomainActivityStrip(tasks: Task[]): HTMLElement | null {
  const domains = getTaskPropertiesSync().domains;
  if (!domains.length) return null;
  const rows = domains
    .map((entry) => {
      let lastTouched: Date | null = null;
      for (const task of tasks) {
        if (task.domain !== entry.id) continue;
        const stamp = parseDue(task.updated_at);
        if (stamp && (!lastTouched || stamp.getTime() > lastTouched.getTime())) lastTouched = stamp;
      }
      const idleDays = lastTouched
        ? Math.floor((Date.now() - lastTouched.getTime()) / 86_400_000)
        : null;
      return { label: entry.label, idleDays };
    })
    .sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1));

  const strip = el('div', 'calendar-touched-strip');
  for (const row of rows) {
    const level = row.idleDays == null ? 'stale' : row.idleDays <= 7 ? 'ok' : row.idleDays <= 21 ? 'watch' : 'stale';
    const chip = el('span', 'calendar-touched-chip');
    const dot = el('span', `calendar-touched-dot calendar-touched-dot--${level}`);
    dot.setAttribute('aria-hidden', 'true');
    chip.append(
      dot,
      el('span', 'calendar-touched-chip__name', row.label),
      el('span', 'calendar-touched-chip__age', row.idleDays == null ? 'no activity yet' : `${row.idleDays}d ago`)
    );
    strip.append(chip);
  }
  return strip;
}

/** Real stalled-project count from the same `findStallCandidates` the Projects view
 *  uses for its own stall flagging. Omitted when nothing is stalled. */
function renderStalledProjectsBanner(projects: Project[], tasks: Task[]): HTMLElement | null {
  const stalled = findStallCandidates(projects, tasks);
  if (!stalled.length) return null;
  const banner = el('a', 'calendar-stall-banner');
  banner.href = '#/projects';
  banner.append(
    el('span', '', `${stalled.length} project${stalled.length === 1 ? '' : 's'} stalled`),
    el('span', 'calendar-stall-banner__cta', 'Review →')
  );
  return banner;
}

export async function renderWeekView(canvas: HTMLElement): Promise<void> {
  return renderCalendarView(canvas, parseCalendarMode() === 'day' ? 'day' : 'week');
}

export async function renderMonthView(canvas: HTMLElement): Promise<void> {
  return renderCalendarView(canvas, 'month');
}

/** Test hook — reset session filters between specs. */
export function resetCalendarSession(): void {
  sessionFilters.domain = 'all';
  sessionFilters.projectId = 'all';
  sessionFilters.query = '';
  sessionFilters.includeDone = false;
  sessionFilters.includeDates = true;
  sessionFilters.planningLens = false;
  sessionFilters.layers = [
    'hard_deadline',
    'planned_work',
    'protected_time',
    'target',
    'review'
  ];
  planWorkMode = false;
  ghostBlocksByProposalId.clear();
  pendingGhostBlocks = [];
  selectedDateKey = null;
  selectedItemId = null;
  composeDraft = { dateKey: '', dueTime: null };
  focusComposeOnPaint = false;
  lastMonthDelta = 0;
  bloomDateKey = null;
  scrollToPreviewOnPaint = false;
  liveCalendar?.dispose();
  liveCalendar = null;
}
