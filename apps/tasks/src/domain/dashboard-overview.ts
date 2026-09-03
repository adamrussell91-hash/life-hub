import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { isBoardTask } from '@/domain/hierarchy';
import {
  adaptiveTodayTasks,
  addDays,
  overdueTasks,
  parseDue,
  startOfDay,
  toDateKey
} from '@/domain/queries';
import { findStallCandidates } from '@/domain/stall';
import { classifyProjectLifecycle, type ProjectLifecycle } from '@/domain/projects-pulse';

export type UpcomingExcursionItem = {
  project: Project;
  label: string;
  due_date: string;
  daysOut: number;
};

export type TimelineSource = 'task' | 'project' | 'excursion';
export type TimelineBucket = 'today' | 'this_week' | 'this_month';
export type ChipUrgency = 'danger' | 'warning' | 'success' | 'calm';
export type LoadTone = 'clear' | 'ok' | 'hot' | 'over';

export type DashboardFocusStats = {
  today: number;
  overdue: number;
  needsAttention: number;
  activeProjects: number;
};

export type DashboardTimelineItem = {
  id: string;
  source: TimelineSource;
  title: string;
  due_date: string;
  daysOut: number;
  bucket: TimelineBucket;
  urgency: ChipUrgency;
  meta: string;
  href: string;
  task?: Task;
  project?: Project;
};

export type DashboardHeatDay = {
  date_key: string;
  weekday: string;
  day: number;
  isToday: boolean;
  count: number;
  heat: 0 | 1 | 2 | 3;
  items: DashboardTimelineItem[];
};

export type CompletionTrend = {
  thisWeek: number;
  lastWeek: number;
  delta: number;
  daily: number[];
};

export type DashboardNextAction = {
  kind: 'complete' | 'start';
  title: string;
  source: TimelineSource;
  href: string;
  task?: Task;
  project?: Project;
};

const EXCURSION_DATE_LABELS: Array<[string, (project: Project) => string | null | undefined]> = [
  ['Permission note', (p) => p.key_dates?.permission_note_due],
  ['Staff notification', (p) => p.key_dates?.staff_notification_due],
  ['Risk assessment', (p) => p.key_dates?.risk_assessment_due],
  ['Payment', (p) => p.key_dates?.payment_due],
  ['Event', (p) => p.current_end_date]
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const SOURCE_LABEL: Record<TimelineSource, string> = {
  task: 'Task',
  project: 'Project',
  excursion: 'Excursion'
};

export const TIMELINE_BUCKETS: Array<{ id: TimelineBucket; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' }
];

/** Excursion admin key dates within a forward horizon (default 90 days). */
export function upcomingExcursionDates(
  projects: Project[],
  now: Date = new Date(),
  horizonDays = 90
): UpcomingExcursionItem[] {
  const start = startOfDay(now);
  const end = addDays(start, horizonDays);
  const out: UpcomingExcursionItem[] = [];

  for (const project of projects) {
    if (project.type !== 'excursion') continue;
    if (project.status === 'archived_dead') continue;
    for (const [label, read] of EXCURSION_DATE_LABELS) {
      const due_date = read(project);
      if (!due_date) continue;
      const due = parseDue(due_date);
      if (!due) continue;
      const day = startOfDay(due);
      if (day < start || day > end) continue;
      const daysOut = Math.round((day.getTime() - start.getTime()) / 86_400_000);
      out.push({ project, label, due_date, daysOut });
    }
  }

  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function daysOutFor(dueDate: string, now: Date): number | null {
  const due = parseDue(dueDate);
  if (!due) return null;
  const start = startOfDay(now);
  return Math.round((startOfDay(due).getTime() - start.getTime()) / 86_400_000);
}

export function timelineBucketFor(daysOut: number): TimelineBucket | null {
  if (daysOut <= 0) return 'today';
  if (daysOut <= 7) return 'this_week';
  if (daysOut <= 31) return 'this_month';
  return null;
}

export function urgencyForDaysOut(daysOut: number): ChipUrgency {
  if (daysOut < 0) return 'danger';
  if (daysOut === 0) return 'warning';
  if (daysOut <= 7) return 'warning';
  return 'calm';
}

export function urgencyForLifecycle(lifecycle: ProjectLifecycle): ChipUrgency {
  if (lifecycle === 'needs_attention' || lifecycle === 'stalled') return 'danger';
  if (lifecycle === 'planning') return 'warning';
  if (lifecycle === 'on_the_go' || lifecycle === 'completed') return 'success';
  return 'calm';
}

export function chipUrgencyClass(urgency: ChipUrgency): string {
  return `chip chip--urgency-${urgency}`;
}

export function sourceChipClass(source: TimelineSource): string {
  return `chip chip--source-${source}`;
}

export function loadToneFor(running: number, sustainable = 3): LoadTone {
  if (running <= 0) return 'clear';
  if (running < sustainable) return 'ok';
  if (running === sustainable) return 'hot';
  return 'over';
}

function liveProjects(projects: Project[]): Project[] {
  return projects.filter((project) => project.status !== 'archived_dead');
}

export function dashboardFocusStats(
  tasks: Task[],
  projects: Project[],
  now: Date = new Date()
): DashboardFocusStats {
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const live = liveProjects(projects);
  const needsAttention = live.filter(
    (project) => classifyProjectLifecycle(project, tasks, stallIds, now) === 'needs_attention'
  ).length;
  return {
    today: adaptiveTodayTasks(tasks, now).length,
    overdue: overdueTasks(tasks, now).length,
    needsAttention,
    activeProjects: live.length
  };
}

export function runningProjectIds(
  projects: Project[],
  tasks: Task[],
  now: Date = new Date()
): string[] {
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  return liveProjects(projects)
    .filter((project) => {
      const life = classifyProjectLifecycle(project, tasks, stallIds, now);
      return life === 'on_the_go' || life === 'planning' || life === 'needs_attention';
    })
    .map((project) => project.id);
}

function taskHref(id: string): string {
  return `#/task/${encodeURIComponent(id)}`;
}

function projectHref(id: string): string {
  return `#/project/${encodeURIComponent(id)}`;
}

function pushItem(out: DashboardTimelineItem[], item: DashboardTimelineItem): void {
  if (out.some((existing) => existing.id === item.id)) return;
  out.push(item);
}

export function dashboardTimeline(
  tasks: Task[],
  projects: Project[],
  now: Date = new Date()
): DashboardTimelineItem[] {
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const items: DashboardTimelineItem[] = [];

  for (const task of tasks) {
    if (!isBoardTask(task) || task.status === 'done' || task.status === 'dead') continue;
    if (!task.due_date) continue;
    const daysOut = daysOutFor(task.due_date, now);
    if (daysOut == null) continue;
    const bucket = timelineBucketFor(daysOut);
    if (!bucket) continue;
    pushItem(items, {
      id: `task:${task.id}`,
      source: 'task',
      title: task.title,
      due_date: task.due_date,
      daysOut,
      bucket,
      urgency: urgencyForDaysOut(daysOut),
      meta: task.domain,
      href: taskHref(task.id),
      task
    });
  }

  for (const project of liveProjects(projects)) {
    const lifecycle = classifyProjectLifecycle(project, tasks, stallIds, now);
    if (project.type === 'excursion') {
      for (const excursion of upcomingExcursionDates([project], now, 31)) {
        const bucket = timelineBucketFor(excursion.daysOut);
        if (!bucket) continue;
        pushItem(items, {
          id: `excursion:${project.id}:${excursion.label}:${excursion.due_date}`,
          source: 'excursion',
          title: `${excursion.label} · ${project.title}`,
          due_date: excursion.due_date,
          daysOut: excursion.daysOut,
          bucket,
          urgency: urgencyForDaysOut(excursion.daysOut),
          meta: SOURCE_LABEL.excursion,
          href: projectHref(project.id),
          project
        });
      }
      continue;
    }
    const due = project.current_end_date ?? project.baseline_end_date;
    if (!due) continue;
    const daysOut = daysOutFor(due, now);
    if (daysOut == null) continue;
    const bucket = timelineBucketFor(daysOut);
    if (!bucket) continue;
    pushItem(items, {
      id: `project:${project.id}`,
      source: 'project',
      title: project.title,
      due_date: due,
      daysOut,
      bucket,
      urgency:
        lifecycle === 'needs_attention' || lifecycle === 'stalled'
          ? urgencyForLifecycle(lifecycle)
          : urgencyForDaysOut(daysOut),
      meta: SOURCE_LABEL.project,
      href: projectHref(project.id),
      project
    });
  }

  return items.sort((a, b) => {
    if (a.daysOut !== b.daysOut) return a.daysOut - b.daysOut;
    const sourceRank = { task: 0, excursion: 1, project: 2 };
    return sourceRank[a.source] - sourceRank[b.source];
  });
}

export function dashboardHeatDays(
  tasks: Task[],
  projects: Project[],
  now: Date = new Date(),
  days = 14
): DashboardHeatDay[] {
  const start = startOfDay(now);
  const timeline = dashboardTimeline(tasks, projects, now);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index);
    const date_key = toDateKey(date);
    const items = timeline.filter((item) => {
      if (index === 0) return item.daysOut <= 0;
      return item.due_date === date_key;
    });
    const count = items.length;
    const heat = (count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3) as 0 | 1 | 2 | 3;
    return {
      date_key,
      weekday: WEEKDAYS[date.getDay()] ?? '',
      day: date.getDate(),
      isToday: index === 0,
      count,
      heat,
      items
    };
  });
}

function completionStamp(task: Task): Date | null {
  return parseDue(task.completed_at) ?? (task.status === 'done' ? parseDue(task.updated_at) : null);
}

function weekStart(date: Date): Date {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  return addDays(start, -mondayOffset);
}

export function weeklyCompletionTrend(tasks: Task[], now: Date = new Date()): CompletionTrend {
  const thisStart = weekStart(now);
  const lastStart = addDays(thisStart, -7);
  const nextStart = addDays(thisStart, 7);
  const heatStart = addDays(startOfDay(now), -13);

  let thisWeek = 0;
  let lastWeek = 0;
  const daily = Array.from({ length: 14 }, () => 0);

  for (const task of tasks) {
    if (task.status !== 'done') continue;
    const stamp = completionStamp(task);
    if (!stamp) continue;
    const day = startOfDay(stamp);
    if (day >= thisStart && day < nextStart) thisWeek += 1;
    else if (day >= lastStart && day < thisStart) lastWeek += 1;
    const offset = Math.round((day.getTime() - heatStart.getTime()) / 86_400_000);
    if (offset >= 0 && offset < 14) daily[offset] += 1;
  }

  return {
    thisWeek,
    lastWeek,
    delta: thisWeek - lastWeek,
    daily
  };
}

export function dashboardNextAction(
  tasks: Task[],
  projects: Project[],
  now: Date = new Date()
): DashboardNextAction | null {
  const overdue = overdueTasks(tasks, now);
  const firstOverdue = overdue[0];
  if (firstOverdue) {
    return {
      kind: firstOverdue.status === 'in_progress' ? 'complete' : 'start',
      title: firstOverdue.title,
      source: 'task',
      href: taskHref(firstOverdue.id),
      task: firstOverdue
    };
  }

  const today = adaptiveTodayTasks(tasks, now)[0];
  if (today) {
    return {
      kind: today.status === 'in_progress' ? 'complete' : 'start',
      title: today.title,
      source: 'task',
      href: taskHref(today.id),
      task: today
    };
  }

  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const hot = liveProjects(projects).find(
    (project) => classifyProjectLifecycle(project, tasks, stallIds, now) === 'needs_attention'
  );
  if (hot) {
    const child = tasks.find(
      (task) =>
        task.parent_project_id === hot.id &&
        task.status !== 'done' &&
        task.status !== 'dead' &&
        isBoardTask(task)
    );
    if (child) {
      return {
        kind: child.status === 'in_progress' ? 'complete' : 'start',
        title: child.title,
        source: 'task',
        href: taskHref(child.id),
        task: child
      };
    }
    return {
      kind: 'start',
      title: hot.title,
      source: hot.type === 'excursion' ? 'excursion' : 'project',
      href: projectHref(hot.id),
      project: hot
    };
  }

  return null;
}

export function trendLabel(trend: CompletionTrend): string {
  if (trend.lastWeek === 0 && trend.thisWeek === 0) return 'No completions yet';
  if (trend.delta > 0) return `${trend.thisWeek} this week · up ${trend.delta} vs last`;
  if (trend.delta < 0) return `${trend.thisWeek} this week · down ${Math.abs(trend.delta)} vs last`;
  return `${trend.thisWeek} this week · same as last`;
}
