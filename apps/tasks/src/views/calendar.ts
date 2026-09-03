import type { Task, TaskDomain } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import { toDateKey } from '@/domain/queries';
import { detectPinchPoints } from '@/domain/pinch';
import {
  addMonths,
  addWeeks,
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
  pickSelectedDateKey,
  visibleDays,
  visibleOverflow,
  weekdayShort,
  type CalendarFilters,
  type CalendarItem,
  type CalendarMode
} from '@/domain/calendar';
import { formatDisplayDate, formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';
import { keyDateKindFromLabel } from '@/domain/excursion';
import { errorMessage, renderLoadError, showViewLoading } from '@/views/feedback';
import { materializeExcursionAdminTask } from '@/views/excursion-admin';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { openPlusAdd } from '@/views/plus-add';
import { renderPressureStrips } from '@/views/pinch-strip';
import { requestToggleDone } from '@/views/dashboard';
import { mountTaskCard } from '@/views/hub-cards';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
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
let lastMonthDelta = 0;

type LiveCalendar = {
  canvas: HTMLElement;
  mode: CalendarMode;
  apply: (mode: CalendarMode) => void;
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
  onDropTask: (taskId: string, dateKey: string) => void
): void {
  node.dataset.dropDate = dateKey;
  node.addEventListener('dragover', (event) => {
    event.preventDefault();
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
    onDropTask(taskId, dateKey);
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
  const session: LiveCalendar = {
    canvas,
    mode,
    apply: (next) => {
      const fromHash = parseCalendarAnchor(hashQuery().get('date'), today);
      if (session.mode === next && toDateKey(anchor) === toDateKey(fromHash)) return;
      session.mode = next;
      anchor = fromHash;
      paint();
    }
  };
  liveCalendar = session;

  function allItems(): CalendarItem[] {
    return filterCalendarItems(collectCalendarItems(tasks, projects), sessionFilters);
  }

  async function reload(): Promise<void> {
    liveCalendar = null;
    await renderCalendarView(canvas, session.mode);
  }

  async function openItem(item: CalendarItem, preview: HTMLElement): Promise<void> {
    selectedDateKey = item.date_key;
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

  function dropTask(taskId: string, dateKey: string): void {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || task.due_date === dateKey) return;
    const previous = task.due_date;
    task.due_date = dateKey;
    paint();
    void tasksApi.updateTask(taskId, { due_date: dateKey }).then(
      (updated) => {
        const index = tasks.findIndex((entry) => entry.id === updated.id);
        if (index >= 0) tasks[index] = updated;
      },
      (err: unknown) => {
        if (task) task.due_date = previous;
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
    anchor = session.mode === 'week' ? addWeeks(anchor, delta) : addMonths(anchor, delta);
    selectedDateKey = null;
    replaceHash(session.mode, anchor);
    paint();
  }

  function goTo(date: Date): void {
    lastMonthDelta = 0;
    anchor = date;
    selectedDateKey = toDateKey(date);
    replaceHash(session.mode, date);
    paint();
  }

  function selectDay(day: Date): void {
    selectedDateKey = toDateKey(day);
    if (session.mode === 'month' && !isSameMonth(day, anchor)) {
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

    const preview = el('aside', 'graph-preview week-preview calendar-preview');
    preview.hidden = true;
    preview.setAttribute('aria-live', 'polite');

    const showPreview = (item: CalendarItem) => {
      selectedDateKey = item.date_key;
      void openItem(item, preview);
    };

    const calendar = el('div', 'hub-calendar');
    calendar.append(renderCalendarNav(session.mode, anchor, shiftRange, goTo, today, switchMode));
    const body = el('div', 'hub-calendar__body');
    if (session.mode === 'week') {
      body.append(
        renderWeekGrid(
          days,
          items,
          pinchesByKey,
          todayKey,
          selectedDateKey!,
          showPreview,
          selectDay,
          dropTask
        )
      );
    } else {
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
    }
    calendar.append(body);
    calendar.append(
      renderAgenda(items, selectedDateKey!, session.mode, showPreview, (created) => {
        const index = tasks.findIndex((entry) => entry.id === created.id);
        if (index >= 0) tasks[index] = created;
        else tasks.push(created);
        if (created.due_date) selectedDateKey = created.due_date;
        paint();
      }, switchMode)
    );
    canvas.append(calendar);
    canvas.append(preview);

    canvas.scrollTop = scrollTop;
    if (searchFocused) {
      const input = canvas.querySelector<HTMLInputElement>('.calendar-search');
      if (input) {
        input.focus();
        if (searchPos != null) input.setSelectionRange(searchPos, searchPos);
      }
    }
  }

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
  paging.setAttribute('aria-label', mode === 'week' ? 'Week navigation' : 'Month navigation');

  const prev = el('button', 'hub-calendar__nav-btn');
  prev.type = 'button';
  prev.setAttribute('aria-label', mode === 'week' ? 'Previous week' : 'Previous month');
  prev.textContent = '‹';
  prev.addEventListener('click', () => shiftRange(-1));

  const label = el(
    'span',
    'hub-calendar__month-label',
    mode === 'week' ? formatDisplayDateRange(rangeStart, rangeEnd) : monthTitle(anchor)
  );

  const next = el('button', 'hub-calendar__nav-btn');
  next.type = 'button';
  next.setAttribute('aria-label', mode === 'week' ? 'Next week' : 'Next month');
  next.textContent = '›';
  next.addEventListener('click', () => shiftRange(1));

  const todayBtn = el('button', 'hub-calendar__today', 'Today');
  todayBtn.type = 'button';
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
  onSelect: (day: Date) => void,
  onDrop: (taskId: string, dateKey: string) => void
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
      onSelect(day);
      queueMicrotask(() => {
        const detail = document.querySelector('.hub-calendar__detail');
        if (detail) openPlusAdd(detail)?.focus();
      });
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
  onSelect: (day: Date) => void,
  onDrop: (taskId: string, dateKey: string) => void,
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
      onSelect(day);
      queueMicrotask(() => {
        const detail = document.querySelector('.hub-calendar__detail');
        if (detail) openPlusAdd(detail)?.focus();
      });
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

function renderAgenda(
  items: CalendarItem[],
  dateKey: string,
  mode: CalendarMode,
  onOpen: (item: CalendarItem) => void,
  onCreated: (task: Task) => void,
  onSwitch: (mode: CalendarMode, date?: Date) => void
): HTMLElement {
  const dayItems = itemsForDay(items, dateKey);
  const agenda = el('section', 'hub-calendar__detail');
  const heading = el('h3', 'hub-calendar__detail-heading', formatDisplayDate(dateKey));
  agenda.append(heading);

  const headActions = el('div', 'calendar-agenda__head');
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
      : el('p', 'hub-calendar__detail-empty', 'Nothing on this day yet — add one below.')
  );

  const stack = el('div', 'task-stack calendar-agenda__stack');
  for (const item of dayItems) {
    if (item.task) {
      mountTaskCard(stack, item.task, {
        onEdit: () => onOpen(item)
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
  agenda.append(renderQuickAdd(onCreated, null, { dueDate: dateKey }));
  return agenda;
}

export async function renderWeekView(canvas: HTMLElement): Promise<void> {
  return renderCalendarView(canvas, 'week');
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
  lastMonthDelta = 0;
  liveCalendar = null;
}
