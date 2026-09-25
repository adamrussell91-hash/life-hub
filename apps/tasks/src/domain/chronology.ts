import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { Program } from '@/schemas/program';
import { PROGRAM_MONTHS } from '@/schemas/program';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';
import { projectMilestones } from '@/domain/project-milestones';
import { programHash, projectPageHash } from '@/domain/cards';

/** Chronology lane — not Gantt dependencies. Answers “how do the larger pieces unfold?” */
export type ChronologySource = 'project' | 'excursion' | 'program';

export type ChronologyItem = {
  id: string;
  href: string;
  title: string;
  startKey: string;
  endKey: string;
  source: ChronologySource;
  status: string;
  kindLabel: string;
};

const MONTH_INDEX = new Map<string, number>(
  PROGRAM_MONTHS.filter((month) => month !== 'TBA' && month !== 'Various').map((month, index) => [
    month,
    index
  ])
);

const SOURCE_KIND: Record<ChronologySource, string> = {
  project: 'Project',
  excursion: 'Excursion',
  program: 'Program'
};

function pushDate(dates: Date[], value: string | null | undefined): void {
  const parsed = parseDue(value ?? null);
  if (parsed) dates.push(startOfDay(parsed));
}

function sourceFor(project: Project): ChronologySource {
  if (project.type === 'excursion') return 'excursion';
  if (project.type === 'academic_program') return 'program';
  return 'project';
}

function projectEnd(project: Project, extras: Date[]): Date | null {
  const explicit = parseDue(project.current_end_date) ?? parseDue(project.baseline_end_date);
  if (explicit) return startOfDay(explicit);
  if (!extras.length) return null;
  return new Date(Math.max(...extras.map((date) => date.getTime())));
}

export function projectSpan(project: Project, tasks: Task[]): { startKey: string; endKey: string } | null {
  const extras: Date[] = [];
  for (const milestone of projectMilestones(project)) pushDate(extras, milestone.due_date);
  if (project.type === 'excursion' && project.key_dates) {
    pushDate(extras, project.key_dates.permission_note_due);
    pushDate(extras, project.key_dates.staff_notification_due);
    pushDate(extras, project.key_dates.payment_due);
    pushDate(extras, project.key_dates.risk_assessment_due);
  }
  for (const task of tasks) {
    if (task.parent_project_id !== project.id || task.status === 'dead') continue;
    pushDate(extras, task.due_date);
  }

  const end = projectEnd(project, extras);
  if (!end) return null;

  const starts: Date[] = [];
  pushDate(starts, project.created_at);
  for (const date of extras) {
    if (date.getTime() <= end.getTime()) starts.push(date);
  }
  const start = starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : end;
  const startDate = start.getTime() <= end.getTime() ? start : end;
  return { startKey: toDateKey(startDate), endKey: toDateKey(end) };
}

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

function programMonthSpan(program: Program, year: number): { startKey: string; endKey: string } | null {
  const monthIndex = MONTH_INDEX.get(program.month ?? '');
  if (monthIndex == null) return null;
  return {
    startKey: toDateKey(new Date(year, monthIndex, 1)),
    endKey: toDateKey(lastDayOfMonth(year, monthIndex))
  };
}

function itemFromProject(project: Project, tasks: Task[]): ChronologyItem | null {
  if (project.status === 'archived_dead') return null;
  const span = projectSpan(project, tasks);
  if (!span) return null;
  const source = sourceFor(project);
  return {
    id: project.id,
    href: projectPageHash(project.id),
    title: project.title,
    startKey: span.startKey,
    endKey: span.endKey,
    source,
    status: project.status,
    kindLabel: SOURCE_KIND[source]
  };
}

function itemFromProgram(
  program: Program,
  linked: Project | undefined,
  fallbackYear: number
): ChronologyItem | null {
  if (linked?.status === 'archived_dead') return null;
  const year = parseDue(linked?.current_end_date ?? linked?.baseline_end_date ?? null)?.getFullYear() ?? fallbackYear;
  const span = programMonthSpan(program, year) ?? (linked ? projectSpan(linked, []) : null);
  if (!span) return null;
  return {
    id: program.id,
    href: programHash(program.id),
    title: program.name,
    startKey: span.startKey,
    endKey: span.endKey,
    source: 'program',
    status: linked?.status ?? 'active',
    kindLabel: SOURCE_KIND.program
  };
}

/** Build chronology rows from dated projects, excursions, and in-play programs. */
export function collectChronologyItems(
  tasks: Task[],
  projects: Project[],
  programs: Program[] = []
): ChronologyItem[] {
  const items: ChronologyItem[] = [];
  const seen = new Set<string>();

  for (const project of projects) {
    const item = itemFromProject(project, tasks);
    if (!item) continue;
    items.push(item);
    seen.add(item.id);
  }

  const linkedByProgram = new Map<string, Project>();
  for (const project of projects) {
    if (!project.linked_program_id) continue;
    if (project.status === 'archived_dead') continue;
    if (!linkedByProgram.has(project.linked_program_id)) {
      linkedByProgram.set(project.linked_program_id, project);
    }
  }

  const year = new Date().getFullYear();
  for (const program of programs) {
    const linked = linkedByProgram.get(program.id);
    if (!linked) continue;
    if (seen.has(program.id)) continue;
    const item = itemFromProgram(program, linked, year);
    if (!item) continue;
    items.push(item);
  }

  return items.sort(
    (a, b) => a.startKey.localeCompare(b.startKey) || a.title.localeCompare(b.title)
  );
}

/** Greedy interval packing — overlapping work stacks, the rest share a lane. */
export function packChronologyLanes(items: ChronologyItem[]): ChronologyItem[][] {
  const lanes: ChronologyItem[][] = [];
  for (const item of items) {
    const lane = lanes.find((row) => {
      const last = row[row.length - 1];
      return last ? last.endKey < item.startKey : false;
    });
    if (lane) lane.push(item);
    else lanes.push([item]);
  }
  return lanes;
}

export function chronologyBounds(
  items: ChronologyItem[],
  today = new Date()
): { start: Date; end: Date; days: number } {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!items.length) {
    return { start: addDays(todayStart, -14), end: addDays(todayStart, 28), days: 42 };
  }
  let min = parseDue(items[0]!.startKey)!;
  let max = parseDue(items[0]!.endKey)!;
  for (const item of items) {
    const start = parseDue(item.startKey);
    const end = parseDue(item.endKey);
    if (start && start < min) min = start;
    if (end && end > max) max = end;
  }
  const start = addDays(min, -3);
  const end = addDays(max, 7);
  const days = Math.max(14, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return { start, end, days };
}

export function dayOffset(from: Date, key: string): number {
  const date = parseDue(key);
  if (!date) return 0;
  return Math.round((date.getTime() - from.getTime()) / 86_400_000);
}

export function chronologyTickStep(days: number): number {
  if (days > 180) return 30;
  if (days > 70) return 14;
  return 7;
}

export type ChronologyZoom = 'week' | 'month' | 'term' | 'all';

export type ChronologyFilters = {
  source: ChronologySource | 'all';
  status: string;
};

export function filterChronologyItems(
  items: ChronologyItem[],
  filters: ChronologyFilters
): ChronologyItem[] {
  return items.filter((item) => {
    if (filters.source !== 'all' && item.source !== filters.source) return false;
    if (filters.status && filters.status !== 'all' && item.status !== filters.status) return false;
    return true;
  });
}

function mondayOf(date: Date): Date {
  const start = startOfDay(date);
  return addDays(start, -((start.getDay() + 6) % 7));
}

export function chronologyWindow(
  zoom: ChronologyZoom,
  items: ChronologyItem[],
  today = new Date()
): { start: Date; end: Date; days: number } {
  if (zoom === 'all') return chronologyBounds(items, today);
  const todayStart = startOfDay(today);
  if (zoom === 'week') {
    const start = mondayOf(todayStart);
    return { start, end: addDays(start, 20), days: 21 };
  }
  const start = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const months = zoom === 'month' ? 4 : 6;
  const endExclusive = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const days = Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000);
  return { start, end: addDays(endExclusive, -1), days };
}

export function chronologyItemsInWindow(
  items: ChronologyItem[],
  start: Date,
  end: Date
): ChronologyItem[] {
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  return items.filter((item) => item.endKey >= startKey && item.startKey <= endKey);
}

export function clipChronologySpan(
  item: ChronologyItem,
  boundsStart: Date,
  days: number
): { left: number; span: number } | null {
  const left = Math.max(0, dayOffset(boundsStart, item.startKey));
  const right = Math.min(days, dayOffset(boundsStart, item.endKey) + 1);
  const span = right - left;
  return span > 0 ? { left, span } : null;
}

export function chronologyAxisKeys(start: Date, days: number): string[] {
  const step = chronologyTickStep(days);
  if (step < 30) {
    const keys: string[] = [];
    for (let i = 0; i < days; i += step) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      keys.push(toDateKey(date));
    }
    return keys;
  }
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  if (cursor < start) cursor.setMonth(cursor.getMonth() + 1);
  const end = addDays(start, days - 1);
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys.length ? keys : [toDateKey(start)];
}
