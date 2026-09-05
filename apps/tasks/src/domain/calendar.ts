import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { KEY_DATE_DEFS, matchAdminTask } from '@/domain/excursion';
import { addDays, parseDue, startOfDay, toDateKey, weekDays } from '@/domain/queries';

export type CalendarKind = 'task' | 'milestone' | 'key_date';

export type CalendarItem = {
  id: string;
  kind: CalendarKind;
  title: string;
  date_key: string;
  domain: TaskDomain | null;
  priority: TaskPriority | null;
  status: string;
  project_id: string | null;
  project_title: string | null;
  subtitle: string | null;
  task: Task | null;
  movable: boolean;
};

export type CalendarFilters = {
  domain: TaskDomain | 'all';
  projectId: string | 'all';
  query: string;
  includeDone: boolean;
  includeDates: boolean;
};

export type CalendarMode = 'day' | 'week' | 'month';

const KIND_RANK: Record<CalendarKind, number> = {
  key_date: 0,
  milestone: 1,
  task: 2
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

export const WEEKDAY_HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(startOfDay(date), weeks * 7);
}

/** Shift by calendar months, clamping the day so 31 Jan + 1 month stays in February. */
export function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

export function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(startOfDay(first), -mondayOffset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function visibleDays(anchor: Date, mode: CalendarMode): Date[] {
  if (mode === 'day') return [startOfDay(anchor)];
  return mode === 'week' ? weekDays(anchor) : monthGrid(anchor);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function parseCalendarAnchor(raw: string | null | undefined, fallback = new Date()): Date {
  if (!raw) return startOfDay(fallback);
  const parsed = parseDue(raw);
  return parsed ? startOfDay(parsed) : startOfDay(fallback);
}

export function calendarHash(view: CalendarMode, anchor: Date): string {
  const date = toDateKey(anchor);
  if (view === 'day') return `#/week?date=${date}&layout=day`;
  return `#/${view}?date=${date}`;
}

export function parseCalendarMode(hash = typeof location === 'undefined' ? '' : location.hash): CalendarMode {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  if (path === 'month') return 'month';
  if (query.get('layout') === 'day') return 'day';
  return 'week';
}

export function addCalendarRange(date: Date, mode: CalendarMode, delta: number): Date {
  if (mode === 'day') return addDays(startOfDay(date), delta);
  if (mode === 'week') return addWeeks(date, delta);
  return addMonths(date, delta);
}

export function monthTitle(month: Date): string {
  return month.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

export function weekdayShort(day: Date): string {
  return day.toLocaleDateString('en-AU', { weekday: 'short' });
}

function sortItems(a: CalendarItem, b: CalendarItem): number {
  const date = a.date_key.localeCompare(b.date_key);
  if (date !== 0) return date;
  const kind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (kind !== 0) return kind;
  const pa = a.priority ? PRIORITY_RANK[a.priority] : 9;
  const pb = b.priority ? PRIORITY_RANK[b.priority] : 9;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
}

export function collectCalendarItems(tasks: Task[], projects: Project[]): CalendarItem[] {
  const items: CalendarItem[] = [];
  const projectById = new Map(projects.map((project) => [project.id, project]));

  for (const task of tasks) {
    const due = parseDue(task.due_date);
    if (!due) continue;
    const project = task.parent_project_id ? projectById.get(task.parent_project_id) : undefined;
    items.push({
      id: `task:${task.id}`,
      kind: 'task',
      title: task.title,
      date_key: toDateKey(due),
      domain: task.domain,
      priority: task.priority,
      status: task.status,
      project_id: task.parent_project_id,
      project_title: project?.title ?? null,
      subtitle: null,
      task,
      movable: true
    });
  }

  for (const project of projects) {
    for (const milestone of project.milestones) {
      const due = parseDue(milestone.due_date);
      if (!due) continue;
      items.push({
        id: `milestone:${project.id}:${milestone.id}`,
        kind: 'milestone',
        title: milestone.title,
        date_key: toDateKey(due),
        domain: null,
        priority: null,
        status: milestone.status,
        project_id: project.id,
        project_title: project.title,
        subtitle: 'Milestone',
        task: null,
        movable: false
      });
    }
    if (project.type !== 'excursion') continue;
    const children = tasks.filter(
      (task) => task.parent_project_id === project.id && task.status !== 'dead'
    );
    for (const row of KEY_DATE_DEFS) {
      if (matchAdminTask(children, row.kind)) continue;
      const due_date = row.read(project);
      if (!due_date) continue;
      const due = parseDue(due_date);
      if (!due) continue;
      items.push({
        id: `key:${project.id}:${row.label}`,
        kind: 'key_date',
        title: row.label,
        date_key: toDateKey(due),
        domain: null,
        priority: null,
        status: 'open',
        project_id: project.id,
        project_title: project.title,
        subtitle: 'Key date',
        task: null,
        movable: false
      });
    }
  }

  return items.sort(sortItems);
}

export function itemsForDay(items: CalendarItem[], day: Date | string): CalendarItem[] {
  const key = typeof day === 'string' ? day : toDateKey(day);
  return items.filter((item) => item.date_key === key).sort(sortItems);
}

export function filterCalendarItems(items: CalendarItem[], filters: CalendarFilters): CalendarItem[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (!filters.includeDates && item.kind !== 'task') return false;
    if (!filters.includeDone && (item.status === 'done' || item.status === 'dead')) return false;
    if (filters.domain !== 'all') {
      if (item.kind !== 'task' || item.domain !== filters.domain) return false;
    }
    if (filters.projectId !== 'all' && item.project_id !== filters.projectId) return false;
    if (query) {
      const haystack = `${item.title} ${item.project_title ?? ''} ${item.subtitle ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function visibleOverflow(
  items: CalendarItem[],
  limit: number
): { visible: CalendarItem[]; hidden: number } {
  if (items.length <= limit) return { visible: items, hidden: 0 };
  return { visible: items.slice(0, Math.max(0, limit)), hidden: items.length - limit };
}

export function dayTaskMinutes(items: CalendarItem[], fallback = 45): number {
  return items
    .filter((item) => item.kind === 'task' && item.status !== 'done' && item.status !== 'dead')
    .reduce((sum, item) => sum + (item.task?.estimated_duration ?? fallback), 0);
}

export function formatLoad(minutes: number): string {
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

export function overdueItems(items: CalendarItem[], today: Date): CalendarItem[] {
  const todayKey = toDateKey(today);
  return items.filter(
    (item) =>
      item.kind === 'task' &&
      item.status !== 'done' &&
      item.status !== 'dead' &&
      item.date_key < todayKey
  );
}

export function itemsInRange(items: CalendarItem[], start: Date, end: Date): CalendarItem[] {
  const from = toDateKey(start);
  const to = toDateKey(end);
  return items.filter((item) => item.date_key >= from && item.date_key <= to);
}

export function pickSelectedDateKey(
  current: string | null,
  days: Date[],
  today: Date,
  preferred?: Date
): string {
  const keys = new Set(days.map(toDateKey));
  if (current && keys.has(current)) return current;
  if (preferred) {
    const preferredKey = toDateKey(preferred);
    if (keys.has(preferredKey)) return preferredKey;
  }
  const todayKey = toDateKey(today);
  if (keys.has(todayKey)) return todayKey;
  return toDateKey(days[0] ?? today);
}
