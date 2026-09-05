import type { Task, TaskDomain } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { isBoardTask } from '@/domain/hierarchy';
import { getTaskPropertiesSync } from '@/services/task-properties';

const PRIORITY_RANK: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

/** Preferred focus order — only ids still present in Tools → Properties are used. */
const WEEKDAY_FOCUS = ['teaching', 'other'] as const;
const WEEKEND_FOCUS = ['life', 'wedding', 'health', 'other'] as const;

export function isSchoolDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/**
 * Adaptive focus domains for Today / Home.
 * Intersects the weekday/weekend shortlist with the live Properties vocabulary so
 * a removed domain (e.g. wedding) never appears in the Focus line.
 */
export function preferredDomains(date: Date = new Date()): TaskDomain[] {
  const configured = getTaskPropertiesSync().domains.map((entry) => entry.id);
  const configuredSet = new Set(configured);
  const shortlist = isSchoolDay(date) ? WEEKDAY_FOCUS : WEEKEND_FOCUS;
  const prefs = shortlist.filter((id) => configuredSet.has(id));
  return prefs.length ? prefs : configured;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Adam's calendar — Netlify Functions run in UTC; never use process-local "today". */
export const HUB_TZ = 'Australia/Sydney';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Calendar date in the local timezone — never UTC (`toISOString` shifts Sydney/AU dates). */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Calendar day of an instant in Australia/Sydney (DST-safe).
 * Use this whenever "today" means Adam's day — especially on UTC servers.
 */
export function toHubDateKey(date: Date = new Date(), timeZone: string = HUB_TZ): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Weekday name for an instant in Australia/Sydney (e.g. "Sunday"). */
export function hubWeekdayLong(date: Date = new Date(), timeZone: string = HUB_TZ): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'long' }).format(date);
}

export type HubClockParts = {
  hour: number;
  minute: number;
  second: number;
  weekday: string;
  dateKey: string;
};

/** Wall-clock parts in the hub timezone — used by the Today dial now-hand. */
export function hubClockParts(date: Date = new Date(), timeZone: string = HUB_TZ): HubClockParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone,
      weekday: 'long',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday ?? '',
    dateKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

/**
 * Local midnight Date for Adam's current Sydney calendar day.
 * Safe to pass into `toDateKey` / `startOfDay` / `tasksForDay` on a UTC host.
 */
export function hubCalendarDate(date: Date = new Date(), timeZone: string = HUB_TZ): Date {
  const key = toHubDateKey(date, timeZone);
  const local = parseDue(key);
  return local ?? startOfDay(date);
}

/**
 * Date-only `YYYY-MM-DD` values are local calendar days, not UTC midnights.
 * Full ISO timestamps stay instants.
 */
export function parseDue(due: string | null): Date | null {
  if (!due) return null;
  const dateOnly = DATE_ONLY.exec(due);
  if (dateOnly) {
    const local = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const d = new Date(due);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sortByPriorityThenDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const ad = parseDue(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = parseDue(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}

export function tasksForDay(tasks: Task[], day: Date): Task[] {
  const key = toDateKey(day);
  return sortByPriorityThenDue(
    tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'dead') return false;
      const due = parseDue(t.due_date);
      if (!due) return false;
      return toDateKey(due) === key;
    })
  );
}

export function openTasks(tasks: Task[]): Task[] {
  return sortByPriorityThenDue(
    tasks.filter(
      (t) =>
        isBoardTask(t) &&
        (t.status === 'open' || t.status === 'in_progress' || t.status === 'deferred')
    )
  );
}

export function backlogTasks(tasks: Task[]): Task[] {
  return sortByPriorityThenDue(
    tasks.filter(
      (t) =>
        isBoardTask(t) &&
        (t.status === 'open' || t.status === 'deferred') &&
        !t.due_date
    )
  );
}

/** Open work whose due date is a local calendar day before `day`. */
export function overdueTasks(tasks: Task[], day: Date = new Date()): Task[] {
  const start = startOfDay(day);
  return sortByPriorityThenDue(
    tasks.filter((t) => {
      if (!isBoardTask(t)) return false;
      if (t.status === 'done' || t.status === 'dead') return false;
      const due = parseDue(t.due_date);
      if (!due) return false;
      return startOfDay(due).getTime() < start.getTime();
    })
  );
}

export function adaptiveTodayTasks(tasks: Task[], date: Date = new Date()): Task[] {
  const prefs = new Set(preferredDomains(date));
  const day = tasksForDay(tasks, date);
  const preferred = day.filter((t) => prefs.has(t.domain));
  const rest = day.filter((t) => !prefs.has(t.domain));
  // Prefer domain match first, then anything else due today.
  return [...preferred, ...rest];
}

export function weekDays(anchor: Date = new Date()): Date[] {
  const start = startOfDay(anchor);
  const mondayOffset = (start.getDay() + 6) % 7;
  const monday = addDays(start, -mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function milestonesInMonth(projects: Project[], month: Date): Array<{
  project: Project;
  milestone: Project['milestones'][number];
}> {
  const y = month.getFullYear();
  const m = month.getMonth();
  const out: Array<{ project: Project; milestone: Project['milestones'][number] }> = [];
  for (const project of projects) {
    for (const milestone of project.milestones) {
      const due = parseDue(milestone.due_date);
      if (due && due.getFullYear() === y && due.getMonth() === m) {
        out.push({ project, milestone });
      }
    }
  }
  return out.sort(
    (a, b) =>
      (parseDue(a.milestone.due_date)?.getTime() ?? 0) -
      (parseDue(b.milestone.due_date)?.getTime() ?? 0)
  );
}

/** Excursion key dates (permission / staff / risk / payment / event) falling in a month. */
export function excursionKeyDatesInMonth(
  projects: Project[],
  month: Date
): Array<{ project: Project; label: string; due_date: string }> {
  const y = month.getFullYear();
  const m = month.getMonth();
  const out: Array<{ project: Project; label: string; due_date: string }> = [];
  for (const project of projects) {
    if (project.type !== 'excursion') continue;
    const pairs: Array<[string, string | null | undefined]> = [
      ['Permission note', project.key_dates?.permission_note_due],
      ['Staff notification', project.key_dates?.staff_notification_due],
      ['Risk assessment', project.key_dates?.risk_assessment_due],
      ['Payment', project.key_dates?.payment_due],
      ['Event', project.current_end_date]
    ];
    for (const [label, due_date] of pairs) {
      if (!due_date) continue;
      const due = parseDue(due_date);
      if (due && due.getFullYear() === y && due.getMonth() === m) {
        out.push({ project, label, due_date });
      }
    }
  }
  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function searchEntities(
  tasks: Task[],
  projects: Project[],
  query: string
): { tasks: Task[]; projects: Project[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { tasks: [], projects: [] };
  return {
    tasks: tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    ),
    projects: projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.arc_summary.toLowerCase().includes(q)
    )
  };
}
