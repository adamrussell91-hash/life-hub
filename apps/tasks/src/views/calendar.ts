import type { Task, TaskDomain } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import { toDateKey } from '@/domain/queries';
import { detectPinchPoints } from '@/domain/pinch';
import {
  addCalendarRange,
  calendarHash,
  collectCalendarItems,
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
  type CalendarMode
} from '@/domain/calendar';
import {
  blockStyle,
  formatBlockTime,
  hoursFromOffset,
  hoursToDueTime,
  layoutTimedBlocks,
  nowLineOffset,
  parseGoToDate,
  splitDayItems,
  timeGridHours
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
  includeDates: true
};

let selectedDateKey: string | null = null;
let selectedItemId: string | null = null;
let composeDraft: { dateKey: string; dueTime: string | null } = { dateKey: '', dueTime: null };
let lastMonthDelta = 0;
let focusComposeOnPaint = false;

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
  chip.setAttribute('aria-label', eventLabel(item));
  chip.draggable = item.movable;

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
  try {
    [tasks, projects] = await Promise.all([
      tasksApi.listTasks(),
      tasksApi.listProjects().catch(() => [] as Project[])
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
    return filterCalendarItems(collectCalendarItems(tasks, projects), sessionFilters);
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
    paint();
    const nextHash = calendarHash(next, anchor);
    if (location.hash !== nextHash) location.hash = nextHash;
  }

  function shiftRange(delta: number): void {
    if (session.mode === 'month') lastMonthDelta = delta;
    anchor = addCalendarRange(anchor, session.mode, delta);
    if (session.mode === 'day') selectedDateKey = toDateKey(anchor);
    else selectedDateKey = null;
    replaceHash(session.mode, anchor);
    paint();
  }

  function goTo(date: Date): void {
    lastMonthDelta = 0;
    anchor = date;
    selectedDateKey = toDateKey(date);
    paint();
    const nextHash = calendarHash(session.mode, date);
    if (location.hash !== nextHash) location.hash = nextHash;
  }

  function selectDay(day: Date, dueTime?: string | null, focusCompose = false): void {
    selectedDateKey = toDateKey(day);
    selectedItemId = null;
    composeDraft = { dateKey: selectedDateKey, dueTime: dueTime ?? null };
    if (focusCompose) focusComposeOnPaint = true;
    if (session.mode === 'month' && !isSameMonth(day, anchor)) {
      anchor = day;
      replaceHash(session.mode, day);
    }
    if (session.mode === 'day') {
      anchor = day;
      replaceHash(session.mode, day);
    }
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
      })
    );
    canvas.append(filters.root);

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
          lastMonthDelta
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
          dropTask
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
    workspace.append(body, rail);
    calendar.append(workspace);
    canvas.append(calendar);

    const selected = items.find((item) => item.id === selectedItemId);
    if (selected) {
      agenda.hidden = true;
      void openItem(selected, preview).finally(() => {
        canvas.scrollTop = scrollTop;
      });
    } else {
      preview.hidden = true;
    }

    canvas.scrollTop = scrollTop;
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
  monthDelta: number
): HTMLElement {
  const grid = el('div', 'hub-calendar__grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Month calendar');
  if (monthDelta > 0) grid.dataset.motion = 'forward';
  if (monthDelta < 0) grid.dataset.motion = 'back';

  for (const heading of WEEKDAY_HEADINGS) {
    grid.append(el('span', 'hub-calendar__weekday', heading));
  }
  for (const day of days) {
    const key = toDateKey(day);
    const pinch = pinchesByKey.get(key);
    const outside = !isSameMonth(day, monthAnchor);
    const cell = el('div', 'hub-calendar__day');
    cell.setAttribute('role', 'gridcell');
    cell.tabIndex = 0;
    cell.dataset.date = key;
    if (!outside) {
      /* in-month — no data-outside */
    } else {
      cell.dataset.outside = 'true';
    }
    if (key === todayKey) {
      cell.dataset.today = 'true';
      cell.setAttribute('aria-current', 'date');
    }
    if (key === selectedKey) cell.dataset.selected = 'true';
    if (pinch) cell.dataset.pinch = pinch.severity;
    wireDropTarget(cell, key, onDrop);
    const selectDay = (): void => onSelect(day);
    cell.addEventListener('click', selectDay);
    cell.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectDay();
    });
    cell.addEventListener('dblclick', (event) => {
      event.preventDefault();
      onSelect(day, null, true);
    });

    const num = el('span', 'hub-calendar__day-num', String(day.getDate()));
    cell.append(num);

    const dayItems = itemsForDay(items, day);
    const { visible, hidden } = visibleOverflow(dayItems, MONTH_EVENT_LIMIT);
    for (const item of visible) cell.append(renderEventChip(item, onOpen));
    if (hidden) {
      const more = el('button', 'event-chip-more', `+${hidden} more`);
      more.type = 'button';
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(day);
      });
      cell.append(more);
    }
    grid.append(cell);
  }
  return grid;
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
  onDrop: (taskId: string, dateKey: string, dueTime?: string | null) => void
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
    heading.append(
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
  selectedDateKey = null;
  selectedItemId = null;
  composeDraft = { dateKey: '', dueTime: null };
  focusComposeOnPaint = false;
  lastMonthDelta = 0;
  liveCalendar?.dispose();
  liveCalendar = null;
}
