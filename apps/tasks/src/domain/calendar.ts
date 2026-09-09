import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { WorkBlock } from '@/schemas/work-block';
import { KEY_DATE_DEFS, matchAdminTask } from '@/domain/excursion';
import { projectMilestones } from '@/domain/project-milestones';
import { addDays, parseDue, startOfDay, toDateKey, weekDays } from '@/domain/queries';

export type CalendarKind = 'task' | 'milestone' | 'key_date' | 'work_block';

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
  work_block?: WorkBlock | null;
  start_time?: string | null;
  duration_minutes?: number | null;
  ghost?: boolean;
  layer?: PlanningLayer | null;
};

export type PlanningLayer =
  | 'hard_deadline'
  | 'planned_work'
  | 'protected_time'
  | 'target'
  | 'review'
  | 'deep_filter';

export type CalendarFilters = {
  domain: TaskDomain | 'all';
  projectId: string | 'all';
  query: string;
  includeDone: boolean;
  includeDates: boolean;
  planningLens?: boolean;
  layers?: PlanningLayer[];
};

export type CalendarMode = 'day' | 'week' | 'month';

const KIND_RANK: Record<CalendarKind, number> = {
  key_date: 0,
  milestone: 1,
  work_block: 2,
  task: 3
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

export function calendarHash(view: CalendarMode, anchor: Date, hash = typeof location === 'undefined' ? '' : location.hash): string {
  const date = toDateKey(anchor);
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  query.set('date', date);
  if (view === 'day') {
    query.set('layout', 'day');
    const qs = query.toString();
    return `#/week?${qs}`;
  }
  query.delete('layout');
  const qs = query.toString();
  return `#/${view}?${qs}`;
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
      movable: true,
      start_time: task.due_time,
      layer: 'hard_deadline'
    });
  }

  for (const project of projects) {
    for (const milestone of projectMilestones(project)) {
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

/** Target / review markers — only for planning lens. */
export function collectPlanningMarkers(tasks: Task[], projects: Project[] = []): CalendarItem[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items: CalendarItem[] = [];
  for (const task of tasks) {
    const target = parseDue(task.target_date);
    if (target) {
      const project = task.parent_project_id ? projectById.get(task.parent_project_id) : undefined;
      items.push({
        id: `target:${task.id}`,
        kind: 'task',
        title: task.title,
        date_key: toDateKey(target),
        domain: task.domain,
        priority: task.priority,
        status: task.status,
        project_id: task.parent_project_id,
        project_title: project?.title ?? null,
        subtitle: 'Target',
        task,
        movable: false,
        layer: 'target'
      });
    }
    const review = parseDue(task.review_at);
    if (review) {
      const project = task.parent_project_id ? projectById.get(task.parent_project_id) : undefined;
      items.push({
        id: `review:${task.id}`,
        kind: 'task',
        title: task.title,
        date_key: toDateKey(review),
        domain: task.domain,
        priority: task.priority,
        status: task.status,
        project_id: task.parent_project_id,
        project_title: project?.title ?? null,
        subtitle: 'Review',
        task,
        movable: false,
        layer: 'review'
      });
    }
  }
  return items.sort(sortItems);
}

/** Collect planned work blocks as calendar items (distinct from hard deadlines). */
export function collectWorkBlockItems(
  blocks: WorkBlock[],
  projects: Project[] = [],
  opts: { ghost?: boolean } = {}
): CalendarItem[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items: CalendarItem[] = [];
  for (const block of blocks) {
    if (block.status === 'cancelled') continue;
    const project = block.project_id ? projectById.get(block.project_id) : undefined;
    items.push({
      id: `work_block:${block.id}`,
      kind: 'work_block',
      title: block.title,
      date_key: block.date,
      domain: null,
      priority: null,
      status: block.status,
      project_id: block.project_id,
      project_title: project?.title ?? null,
      subtitle: `Work · ${block.start_time} · ${block.duration_minutes}m`,
      task: null,
      movable: !block.locked && block.status !== 'done',
      work_block: block,
      start_time: block.start_time,
      duration_minutes: block.duration_minutes,
      ghost: Boolean(opts.ghost || block.status === 'proposed'),
      layer: 'planned_work'
    });
  }
  return items.sort(sortItems);
}

export function itemsForDay(items: CalendarItem[], day: Date | string): CalendarItem[] {
  const key = typeof day === 'string' ? day : toDateKey(day);
  return items.filter((item) => item.date_key === key).sort(sortItems);
}

export function filterCalendarItems(items: CalendarItem[], filters: CalendarFilters): CalendarItem[] {
  const query = filters.query.trim().toLowerCase();
  const layers = filters.layers;
  return items.filter((item) => {
    if (!filters.includeDates && item.kind !== 'task' && item.kind !== 'work_block') return false;
    if (!filters.includeDone && (item.status === 'done' || item.status === 'dead' || item.status === 'cancelled')) {
      return false;
    }
    if (filters.domain !== 'all') {
      if (item.kind === 'work_block') {
        /* work blocks stay visible in planning lens regardless of domain */
        if (!filters.planningLens) return false;
      } else if (item.kind !== 'task' || item.domain !== filters.domain) {
        return false;
      }
    }
    if (filters.projectId !== 'all' && item.project_id !== filters.projectId) return false;
    if (layers && layers.length) {
      if (item.kind === 'task' && !layers.includes('hard_deadline') && !item.ghost) {
        /* hard deadline chips */
        if (!item.layer || item.layer === 'hard_deadline') {
          if (!layers.includes('hard_deadline')) return false;
        }
      }
      if (item.kind === 'work_block') {
        const wantPlanned = layers.includes('planned_work');
        const wantDeep = layers.includes('deep_filter');
        if (!wantPlanned && !wantDeep) return false;
        if (wantDeep && item.work_block?.depth !== 'deep') return false;
      }
      if (item.layer === 'target' && !layers.includes('target')) return false;
      if (item.layer === 'review' && !layers.includes('review')) return false;
      if (item.layer === 'deep_filter' && !layers.includes('deep_filter')) return false;
      if (item.layer === 'protected_time' && !layers.includes('protected_time')) return false;
    }
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
