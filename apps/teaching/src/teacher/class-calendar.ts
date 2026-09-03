import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { pastelFromId } from '@/design/pastel';
import { addCalendarDays, enumerateDateKeys, weekStartMonday } from '@/schedule/calendar-dates';
import type { CalendarDayLesson, ClassCalendarModel } from '@/schedule/class-calendar-model';

export type ScheduleCalendarView = 'week' | 'month' | 'timeline';

export interface RenderClassCalendarOptions {
  onSelectDate: (date: string) => void;
  onShiftMonth: (delta: -1 | 1) => void;
  monthDelta?: number;
  unitTitles?: Map<string, string>;
  /** SPA navigation for lesson links; when set, anchors preventDefault then call this. */
  onNavigate?: (path: string) => void;
  /** Empty-day CTA — opens schedule flow when provided. */
  onScheduleLesson?: () => void;
  /** Lesson path, or null to render a non-link chip (e.g. unpublished student lessons). */
  lessonHref?: (lesson: CalendarDayLesson) => string | null;
  view?: ScheduleCalendarView;
  onViewChange?: (view: ScheduleCalendarView) => void;
  /** Secondary line on lesson chips (e.g. class code on the dashboard). */
  chipMeta?: (lesson: CalendarDayLesson) => string | undefined;
  /** Teacher ⋯ on day-detail rows. Dashboard omits this. */
  onLessonOverflow?: (scheduledId: string, anchor: HTMLElement) => void;
}

type CalendarHandlers = {
  onSelectDate: (date: string) => void;
  onShiftMonth: (delta: -1 | 1) => void;
  onNavigate?: (path: string) => void;
  onScheduleLesson?: () => void;
  lessonHref?: (lesson: CalendarDayLesson) => string | null;
  onViewChange?: (view: ScheduleCalendarView) => void;
  chipMeta?: (lesson: CalendarDayLesson) => string | undefined;
  onLessonOverflow?: (scheduledId: string, anchor: HTMLElement) => void;
  today: string;
  selectedDate: string;
  view: ScheduleCalendarView;
};

const VIEWS: ReadonlyArray<{ id: ScheduleCalendarView; label: string }> = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'timeline', label: 'Timeline' }
];

const handlersByRoot = new WeakMap<HTMLElement, CalendarHandlers>();

/**
 * Shared week / month / timeline calendar. Nav buttons bind once via dataset.bound;
 * callbacks stay fresh via WeakMap. Body and detail rebuild each render.
 */
export function renderClassCalendar(
  host: HTMLElement,
  model: ClassCalendarModel,
  {
    onSelectDate,
    onShiftMonth,
    monthDelta = 0,
    unitTitles,
    onNavigate,
    onScheduleLesson,
    lessonHref,
    view = 'month',
    onViewChange,
    chipMeta,
    onLessonOverflow
  }: RenderClassCalendarOptions
): void {
  let root = host.querySelector<HTMLElement>(':scope > .class-calendar');
  if (!root) {
    root = document.createElement('div');
    root.className = 'class-calendar';

    const nav = document.createElement('div');
    nav.className = 'class-calendar__nav';

    const paging = document.createElement('div');
    paging.className = 'class-calendar__paging';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'class-calendar__nav-btn';
    prev.dataset.calendar = 'prev';

    const label = document.createElement('span');
    label.className = 'class-calendar__month-label';
    label.dataset.calendar = 'month-label';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'class-calendar__nav-btn';
    next.dataset.calendar = 'next';

    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'class-calendar__today';
    todayBtn.dataset.calendar = 'today';
    todayBtn.textContent = 'Today';

    paging.append(prev, label, next, todayBtn);

    const tabs = document.createElement('div');
    tabs.className = 'hub-pills calendar-view-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Calendar view');

    for (const item of VIEWS) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'hub-pills__btn calendar-view-tabs__tab';
      tab.setAttribute('role', 'tab');
      tab.dataset.calendarView = item.id;
      tab.textContent = item.label;
      tabs.append(tab);
    }

    nav.append(paging, tabs);

    const body = document.createElement('div');
    body.className = 'class-calendar__body';
    body.dataset.calendar = 'body';

    const detail = document.createElement('div');
    detail.className = 'class-calendar__detail';

    root.append(nav, body, detail);
    host.replaceChildren(root);
  }

  handlersByRoot.set(root, {
    onSelectDate,
    onShiftMonth,
    onNavigate,
    onScheduleLesson,
    lessonHref,
    onViewChange,
    chipMeta,
    onLessonOverflow,
    today: model.today,
    selectedDate: model.selectedDate,
    view
  });

  const label = root.querySelector<HTMLElement>('[data-calendar="month-label"]');
  if (label) label.textContent = labelForView(model, view);

  const prev = root.querySelector<HTMLButtonElement>('[data-calendar="prev"]');
  const next = root.querySelector<HTMLButtonElement>('[data-calendar="next"]');
  if (prev) {
    prev.setAttribute('aria-label', view === 'week' ? 'Previous week' : 'Previous month');
    prev.textContent = '‹';
  }
  if (next) {
    next.setAttribute('aria-label', view === 'week' ? 'Next week' : 'Next month');
    next.textContent = '›';
  }

  for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-calendar-view]')) {
    const selected = tab.dataset.calendarView === view;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.classList.toggle('is-selected', selected);
  }

  const body = root.querySelector<HTMLElement>('[data-calendar="body"]');
  if (body) {
    body.replaceChildren();
    if (view === 'week') {
      body.append(buildWeekBody(model, root));
    } else if (view === 'timeline') {
      body.append(buildTimelineBody(model, root));
    } else {
      const grid = document.createElement('div');
      grid.className = 'class-calendar__grid';
      grid.setAttribute('role', 'grid');
      for (const heading of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
        const cell = document.createElement('span');
        cell.className = 'class-calendar__weekday';
        cell.textContent = heading;
        grid.append(cell);
      }
      for (const day of model.monthDays) {
        grid.append(buildDayCell(day, root));
      }
      applyMonthMotion(grid, monthDelta);
      body.append(grid);
    }
  }

  const detail = root.querySelector<HTMLElement>('.class-calendar__detail');
  if (detail) {
    detail.replaceChildren();
    renderDayDetail(detail, model, unitTitles, root);
  }

  bindNav(root);
}

function bindNav(root: HTMLElement): void {
  const prev = root.querySelector<HTMLButtonElement>('[data-calendar="prev"]');
  const next = root.querySelector<HTMLButtonElement>('[data-calendar="next"]');
  const todayBtn = root.querySelector<HTMLButtonElement>('[data-calendar="today"]');
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = '1';
    prev.addEventListener('click', () => shiftView(root, -1));
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = '1';
    next.addEventListener('click', () => shiftView(root, 1));
  }
  if (todayBtn && !todayBtn.dataset.bound) {
    todayBtn.dataset.bound = '1';
    todayBtn.addEventListener('click', () => {
      const handlers = handlersByRoot.get(root);
      if (!handlers) return;
      handlers.onSelectDate(handlers.today);
    });
  }
  for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-calendar-view]')) {
    if (tab.dataset.bound) continue;
    tab.dataset.bound = '1';
    tab.addEventListener('click', () => {
      const nextView = tab.dataset.calendarView as ScheduleCalendarView | undefined;
      if (!nextView) return;
      handlersByRoot.get(root)?.onViewChange?.(nextView);
    });
  }
}

function shiftView(root: HTMLElement, delta: -1 | 1): void {
  const handlers = handlersByRoot.get(root);
  if (!handlers) return;
  if (handlers.view === 'week') {
    const monday = weekStartMonday(handlers.selectedDate);
    handlers.onSelectDate(addCalendarDays(monday, delta * 7));
    return;
  }
  handlers.onShiftMonth(delta);
}

function applyMonthMotion(grid: HTMLElement, monthDelta: number): void {
  delete grid.dataset.motion;
  if (!monthDelta) return;
  void grid.offsetWidth;
  grid.dataset.motion = monthDelta > 0 ? 'forward' : 'back';
}

function wireSpaLink(anchor: HTMLAnchorElement, root: HTMLElement): void {
  anchor.addEventListener('click', (event) => {
    event.stopPropagation();
    const navigate = handlersByRoot.get(root)?.onNavigate;
    if (!navigate) return;
    event.preventDefault();
    navigate(anchor.getAttribute('href') ?? '/');
  });
}

function buildDayCell(
  day: ClassCalendarModel['monthDays'][number],
  root: HTMLElement
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'class-calendar__day';
  cell.setAttribute('role', 'gridcell');
  cell.tabIndex = 0;
  cell.dataset.date = day.date;
  if (!day.inMonth) cell.dataset.outside = 'true';
  if (day.isToday) {
    cell.dataset.today = 'true';
    cell.setAttribute('aria-current', 'date');
  }
  if (day.isSelected) cell.dataset.selected = 'true';
  cell.setAttribute('aria-label', accessibleDayLabel(day.date, day.lessons));
  const selectDay = (): void => {
    handlersByRoot.get(root)?.onSelectDate(day.date);
  };
  cell.addEventListener('click', selectDay);
  cell.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectDay();
  });

  const num = document.createElement('span');
  num.className = 'class-calendar__day-num';
  num.textContent = String(day.day);
  cell.append(num);

  const visible = day.lessons.slice(0, 2);
  for (const lesson of visible) {
    cell.append(buildLessonChip(lesson, root));
  }

  const overflow = day.lessons.length - visible.length;
  if (overflow > 0) {
    const more = document.createElement('span');
    more.className = 'event-chip-more';
    more.textContent = `+${overflow} more`;
    cell.append(more);
  }

  return cell;
}

function buildWeekBody(model: ClassCalendarModel, root: HTMLElement): HTMLElement {
  const monday = weekStartMonday(model.selectedDate);
  const days = enumerateDateKeys(monday, addCalendarDays(monday, 4));
  const byDate = new Map(model.monthDays.map((day) => [day.date, day]));

  const columns = document.createElement('div');
  columns.className = 'class-calendar__week';

  for (const date of days) {
    const day = byDate.get(date);
    const lessons = day?.lessons ?? [];
    const column = document.createElement('div');
    column.className = 'class-calendar__week-day';
    column.dataset.date = date;
    if (date === model.today) {
      column.dataset.today = 'true';
      column.setAttribute('aria-current', 'date');
    }
    if (date === model.selectedDate) column.dataset.selected = 'true';
    column.addEventListener('click', () => {
      handlersByRoot.get(root)?.onSelectDate(date);
    });

    const heading = document.createElement('div');
    heading.className = 'class-calendar__week-heading';

    const weekday = document.createElement('span');
    weekday.className = 'class-calendar__week-weekday';
    weekday.textContent = formatWeekdayShort(date);

    const num = document.createElement('span');
    num.className = 'class-calendar__day-num';
    num.textContent = String(Number(date.slice(8, 10)));

    heading.append(weekday, num);

    const schedule = handlersByRoot.get(root)?.onScheduleLesson;
    if (schedule) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'icon-plus-btn';
      addBtn.setAttribute('aria-label', `Create for ${date}`);
      addBtn.textContent = '+';
      addBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        handlersByRoot.get(root)?.onSelectDate(date);
        schedule();
      });
      heading.append(addBtn);
    }

    column.append(heading);

    if (lessons.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'class-calendar__week-empty';
      empty.textContent = 'No lessons';
      column.append(empty);
    } else {
      for (const lesson of lessons) {
        column.append(buildLessonChip(lesson, root));
      }
    }

    columns.append(column);
  }

  return columns;
}

function buildTimelineBody(model: ClassCalendarModel, root: HTMLElement): HTMLElement {
  const list = document.createElement('div');
  list.className = 'class-calendar__timeline';

  const rows: HTMLElement[] = [];
  for (const day of model.monthDays) {
    if (!day.inMonth || day.lessons.length === 0) continue;
    const { date, lessons } = day;

    const row = document.createElement('div');
    row.className = 'class-calendar__timeline-row';
    if (date === model.today) row.dataset.today = 'true';
    if (date === model.selectedDate) row.dataset.selected = 'true';
    row.addEventListener('click', () => {
      handlersByRoot.get(root)?.onSelectDate(date);
    });

    const when = document.createElement('p');
    when.className = 'class-calendar__timeline-date';
    when.textContent = formatDetailHeading(date);
    if (date === model.today) {
      const mark = document.createElement('span');
      mark.className = 'class-calendar__timeline-today';
      mark.textContent = 'Today';
      when.append(' ', mark);
    }

    const events = document.createElement('div');
    events.className = 'class-calendar__timeline-events';
    for (const lesson of lessons) {
      events.append(buildLessonChip(lesson, root));
    }

    row.append(when, events);
    rows.push(row);
  }

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'class-calendar__detail-empty';
    empty.textContent = 'No lessons in this period.';
    list.append(empty);
    return list;
  }

  list.append(...rows);
  return list;
}

function renderDayDetail(
  detail: HTMLElement,
  model: ClassCalendarModel,
  unitTitles: Map<string, string> | undefined,
  root: HTMLElement
): void {
  const heading = document.createElement('h3');
  heading.className = 'class-calendar__detail-heading';
  heading.textContent = formatDetailHeading(model.selectedDate);
  detail.append(heading);

  if (model.dayLessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'class-calendar__detail-empty';
    empty.textContent = 'No lessons scheduled this day.';
    detail.append(empty);

    if (handlersByRoot.get(root)?.onScheduleLesson) {
      const scheduleBtn = document.createElement('button');
      scheduleBtn.type = 'button';
      scheduleBtn.className = 'icon-plus-btn class-calendar__schedule-plus';
      scheduleBtn.setAttribute('aria-label', 'Schedule a lesson');
      scheduleBtn.textContent = '+';
      scheduleBtn.addEventListener('click', () => {
        handlersByRoot.get(root)?.onScheduleLesson?.();
      });
      detail.append(scheduleBtn);
    }
    return;
  }

  const list = document.createElement('div');
  list.className = 'class-calendar__detail-list';

  for (const lesson of model.dayLessons) {
    const wrap = document.createElement('div');
    wrap.className = 'class-calendar__detail-row';

    const href = resolveLessonHref(root, lesson);
    const row = document.createElement(href ? 'a' : 'div');
    row.className = 'class-calendar__detail-lesson';
    if (href && row instanceof HTMLAnchorElement) {
      row.href = href;
      wireSpaLink(row, root);
    }

    const title = document.createElement('span');
    title.className = 'class-calendar__detail-title';
    title.textContent = lesson.title;

    const meta = document.createElement('span');
    meta.className = 'class-calendar__detail-meta';
    const unitName = unitTitles?.get(lesson.unitId);
    const chip = handlersByRoot.get(root)?.chipMeta?.(lesson);
    meta.textContent = [chip, unitName, lesson.status].filter(Boolean).join(' · ');

    row.append(title, meta);
    wrap.append(row);

    const overflow = handlersByRoot.get(root)?.onLessonOverflow;
    if (overflow) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'class-calendar__detail-more';
      more.setAttribute('aria-label', 'More actions');
      more.textContent = '⋯';
      more.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handlersByRoot.get(root)?.onLessonOverflow?.(lesson.scheduledId, more);
      });
      wrap.append(more);
    }

    list.append(wrap);
  }

  detail.append(list);
}

function resolveLessonHref(root: HTMLElement, lesson: CalendarDayLesson): string | null {
  const custom = handlersByRoot.get(root)?.lessonHref;
  if (custom) return custom(lesson);
  return `/lessons/${lesson.lessonId}`;
}

function buildLessonChip(lesson: CalendarDayLesson, root: HTMLElement): HTMLElement {
  const href = resolveLessonHref(root, lesson);
  const chip = document.createElement(href ? 'a' : 'span');
  chip.className = 'event-chip';
  chip.dataset.tint = pastelFromId(lesson.unitId);
  chip.title = lesson.title;
  if (href && chip instanceof HTMLAnchorElement) {
    chip.href = href;
    wireSpaLink(chip, root);
  }

  const title = document.createElement('span');
  title.className = 'event-chip__title';
  title.textContent = lesson.title;
  chip.append(title);

  const metaText = handlersByRoot.get(root)?.chipMeta?.(lesson);
  if (metaText) {
    const meta = document.createElement('span');
    meta.className = 'event-chip__meta';
    meta.textContent = metaText;
    chip.append(meta);
  }

  return chip;
}

function parseDateKey(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function accessibleDayLabel(date: string, lessons: CalendarDayLesson[]): string {
  const monthDay = formatDisplayDate(date);
  if (lessons.length === 0) return monthDay;
  return `${monthDay}, ${lessons.map((lesson) => lesson.title).join(', ')}`;
}

function formatDetailHeading(date: string): string {
  const weekday = parseDateKey(date).toLocaleDateString('en-AU', {
    weekday: 'long',
    timeZone: 'UTC'
  });
  return `${weekday} ${formatDisplayDate(date)}`;
}

function formatWeekdayShort(date: string): string {
  return parseDateKey(date).toLocaleDateString('en-AU', {
    weekday: 'short',
    timeZone: 'UTC'
  });
}

function labelForView(model: ClassCalendarModel, view: ScheduleCalendarView): string {
  if (view !== 'week') return model.monthLabel;
  const monday = weekStartMonday(model.selectedDate);
  return formatMonthRange(monday, addCalendarDays(monday, 4));
}

function formatMonthRange(start: string, end: string): string {
  const startDate = parseDateKey(start);
  const endDate = parseDateKey(end);
  const startLabel = startDate.toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
  const endLabel = endDate.toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}
