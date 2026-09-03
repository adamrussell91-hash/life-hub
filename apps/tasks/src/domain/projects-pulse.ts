import type { Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { computeProjectVariance } from '@/domain/closure';
import { projectChildTasks, projectProgress } from '@/domain/cards';
import { lastProjectActivityAt } from '@/domain/stall';
import { addDays, parseDue, startOfDay } from '@/domain/queries';

export const SUSTAINABLE_RUNNING_LOAD = 3;

export type ProjectLifecycle =
  | 'completed'
  | 'on_the_go'
  | 'planning'
  | 'not_started'
  | 'needs_attention'
  | 'stalled';

export type ProjectEnergy = 'deep_focus' | 'admin_heavy';

export type ProjectsGroupBy = 'status' | 'energy' | 'goal' | 'deadline';

export type RoadmapZoom = 'week' | 'month' | 'term';

export type DeadlineBucket = 'this_week' | 'this_month' | 'this_term' | 'later' | 'no_date';

export const LIFECYCLE_ORDER: ProjectLifecycle[] = [
  'on_the_go',
  'planning',
  'not_started',
  'needs_attention',
  'stalled',
  'completed'
];

export const LIFECYCLE_LABEL: Record<ProjectLifecycle, string> = {
  completed: 'Completed',
  on_the_go: 'On the go',
  planning: 'Planning',
  not_started: 'Not started',
  needs_attention: 'Needs attention',
  stalled: 'Stalled'
};

/** Kit tokens only — fills for the portfolio mix ring. */
export const LIFECYCLE_COLOR: Record<ProjectLifecycle, string> = {
  completed: 'var(--success)',
  on_the_go: 'var(--wave)',
  planning: 'var(--pastel-gold-ink)',
  not_started: 'var(--shallow)',
  needs_attention: 'var(--pastel-peach-ink)',
  stalled: 'var(--high-sea)'
};

export type LifecycleMixSlice = {
  id: ProjectLifecycle;
  label: string;
  count: number;
  color: string;
};

export type ProjectPulseCard = {
  project: Project;
  lifecycle: ProjectLifecycle;
  energy: ProjectEnergy;
  energyLabel: string;
  impactLabel: string;
  impactQuad: { tl: boolean; tr: boolean; bl: boolean; br: boolean };
  aging: boolean[];
  driftLabel: string;
  driftKind: 'good' | 'warn' | 'neutral';
  linkedLabel: string;
  readyToClose: boolean;
  slipDays: number | null;
  openTaskCount: number;
  doneTaskCount: number;
};

export type PulseGroup = {
  id: string;
  title: string;
  cards: ProjectPulseCard[];
};

export type HeatmapRow = {
  projectId: string;
  title: string;
  cells: boolean[];
};

export type RoadmapBar = {
  left: number;
  width: number;
  color: string;
};

export type RoadmapRow = {
  projectId: string;
  label: string;
  bar: RoadmapBar | null;
  ghost: RoadmapBar | null;
};

export type RoadmapModel = {
  zoom: RoadmapZoom;
  axis: string[];
  rows: RoadmapRow[];
};

export type PortfolioTension = {
  message: string;
  projectIds: string[];
};

export type RetroCandidate = {
  project: Project;
  eyebrow: string;
  title: string;
  daysOut: number | null;
};

const ROADMAP_COLORS = [
  'var(--wave)',
  'var(--marine)',
  'var(--pastel-sage-ink)',
  'var(--high-sea-ink)',
  'var(--navy-2)'
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weekStart(date: Date): Date {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  return addDays(start, -mondayOffset);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shortDayLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function classifyProjectLifecycle(
  project: Project,
  tasks: Task[],
  stallIds: ReadonlySet<string>,
  now: Date = new Date()
): ProjectLifecycle {
  if (project.status === 'archived_dead') return 'completed';
  if (project.status === 'stalled' || stallIds.has(project.id)) return 'stalled';

  const variance = computeProjectVariance(project, tasks, now);
  if (variance.ready_to_close || (variance.slip_days != null && variance.slip_days > 0)) {
    return 'needs_attention';
  }

  const children = projectChildTasks(project, tasks);
  if (children.length === 0) return 'not_started';

  const inFlight = children.some((task) => task.status === 'in_progress');
  if (inFlight || (variance.done_task_count > 0 && variance.open_task_count > 0)) {
    return 'on_the_go';
  }
  return 'planning';
}

export function projectLifecycleMix(
  projects: Project[],
  tasks: Task[],
  stallIds: ReadonlySet<string>,
  now: Date = new Date()
): LifecycleMixSlice[] {
  const counts = new Map<ProjectLifecycle, number>();
  for (const id of LIFECYCLE_ORDER) counts.set(id, 0);
  for (const project of projects) {
    const id = classifyProjectLifecycle(project, tasks, stallIds, now);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return LIFECYCLE_ORDER.map((id) => ({
    id,
    label: LIFECYCLE_LABEL[id],
    count: counts.get(id) ?? 0,
    color: LIFECYCLE_COLOR[id]
  }));
}

export function runningProjectCount(mix: LifecycleMixSlice[]): number {
  return mix
    .filter((slice) => slice.id === 'on_the_go' || slice.id === 'planning' || slice.id === 'needs_attention')
    .reduce((sum, slice) => sum + slice.count, 0);
}

export function projectEnergy(project: Project, tasks: Task[]): ProjectEnergy {
  if (project.type === 'excursion' || (project.generated_admin_tasks?.length ?? 0) > 0) {
    return 'admin_heavy';
  }
  if ((project.tags ?? []).some((tag) => /admin/i.test(tag))) return 'admin_heavy';
  const children = projectChildTasks(project, tasks);
  if (children.length) {
    const minutes = children.reduce((sum, task) => sum + (task.estimated_duration ?? 0), 0);
    const average = minutes / children.length;
    if (average > 0 && average < 40) return 'admin_heavy';
  }
  return 'deep_focus';
}

export function projectImpact(project: Project, tasks: Task[]): {
  highImpact: boolean;
  highEffort: boolean;
  label: string;
  quad: { tl: boolean; tr: boolean; bl: boolean; br: boolean };
} {
  const children = projectChildTasks(project, tasks);
  const minutes = children.reduce((sum, task) => sum + (task.estimated_duration ?? 45), 0);
  const open = children.filter((task) => task.status !== 'done').length;
  const highImpact =
    Boolean(project.parent_goal_id) ||
    project.type === 'academic_program' ||
    project.type === 'excursion';
  const highEffort = open >= 3 || minutes >= 180 || project.type === 'excursion';
  const impactWord = highImpact ? 'High' : 'Low';
  const effortWord = highEffort ? 'High' : 'Low';
  return {
    highImpact,
    highEffort,
    label: `${impactWord} impact · ${effortWord} effort`,
    quad: {
      tl: highImpact && !highEffort,
      tr: highImpact && highEffort,
      bl: !highImpact && !highEffort,
      br: !highImpact && highEffort
    }
  };
}

export function projectAgingWeeks(
  project: Project,
  tasks: Task[],
  now: Date = new Date(),
  weeks = 5
): boolean[] {
  const start = weekStart(now);
  return Array.from({ length: weeks }, (_, index) => {
    const from = addDays(start, -7 * (weeks - 1 - index));
    const to = addDays(from, 7);
    return projectChildTasks(project, tasks).some((task) => {
      const stamp = parseDue(task.completed_at) ?? parseDue(task.updated_at) ?? parseDue(task.created_at);
      if (!stamp) return false;
      return stamp >= from && stamp < to;
    });
  });
}

function driftCopy(slipDays: number | null): { label: string; kind: 'good' | 'warn' | 'neutral' } {
  if (slipDays == null) return { label: 'No baseline to compare', kind: 'neutral' };
  if (slipDays === 0) return { label: 'On track vs plan', kind: 'good' };
  if (slipDays > 0) return { label: `+${slipDays}d vs plan`, kind: 'warn' };
  return { label: `${slipDays}d vs plan`, kind: 'good' };
}

export function buildProjectPulseCard(
  project: Project,
  tasks: Task[],
  stallIds: ReadonlySet<string>,
  now: Date = new Date()
): ProjectPulseCard {
  const lifecycle = classifyProjectLifecycle(project, tasks, stallIds, now);
  const energy = projectEnergy(project, tasks);
  const impact = projectImpact(project, tasks);
  const variance = computeProjectVariance(project, tasks, now);
  const drift = driftCopy(variance.slip_days);
  const children = projectChildTasks(project, tasks);
  const pageBlocks = project.page_blocks?.length ?? 0;
  return {
    project,
    lifecycle,
    energy,
    energyLabel: energy === 'deep_focus' ? 'Deep focus' : 'Admin-heavy',
    impactLabel: impact.label,
    impactQuad: impact.quad,
    aging: projectAgingWeeks(project, tasks, now),
    driftLabel: drift.label,
    driftKind: drift.kind,
    linkedLabel:
      pageBlocks > 0
        ? `${pageBlocks} linked docs · ${children.length} related tasks`
        : `${children.length} related tasks · ${project.milestones.length} milestones`,
    readyToClose: variance.ready_to_close,
    slipDays: variance.slip_days,
    openTaskCount: variance.open_task_count,
    doneTaskCount: variance.done_task_count
  };
}

export function deadlineBucket(project: Project, now: Date = new Date()): DeadlineBucket {
  const end = parseDue(project.current_end_date) ?? parseDue(project.baseline_end_date);
  if (!end) return 'no_date';
  const today = startOfDay(now);
  const days = Math.round((startOfDay(end).getTime() - today.getTime()) / 86_400_000);
  if (days <= 7) return 'this_week';
  if (end.getFullYear() === now.getFullYear() && end.getMonth() === now.getMonth()) return 'this_month';
  if (days <= 70) return 'this_term';
  return 'later';
}

const DEADLINE_LABEL: Record<DeadlineBucket, string> = {
  this_week: 'This week',
  this_month: 'This month',
  this_term: 'This term',
  later: 'Later',
  no_date: 'No date'
};

const DEADLINE_ORDER: DeadlineBucket[] = ['this_week', 'this_month', 'this_term', 'later', 'no_date'];

export function groupPulseCards(
  cards: ProjectPulseCard[],
  groupBy: ProjectsGroupBy,
  goals: Goal[] = [],
  now: Date = new Date()
): PulseGroup[] {
  if (groupBy === 'status') {
    return LIFECYCLE_ORDER.map((id) => ({
      id,
      title: LIFECYCLE_LABEL[id],
      cards: cards.filter((card) => card.lifecycle === id)
    })).filter((group) => group.cards.length);
  }

  if (groupBy === 'energy') {
    return (
      [
        { id: 'deep_focus', title: 'Deep focus' },
        { id: 'admin_heavy', title: 'Admin-heavy' }
      ] as const
    )
      .map((group) => ({
        ...group,
        cards: cards.filter((card) => card.energy === group.id)
      }))
      .filter((group) => group.cards.length);
  }

  if (groupBy === 'deadline') {
    return DEADLINE_ORDER.map((id) => ({
      id,
      title: DEADLINE_LABEL[id],
      cards: cards.filter((card) => deadlineBucket(card.project, now) === id)
    })).filter((group) => group.cards.length);
  }

  const byGoal = new Map<string, PulseGroup>();
  for (const card of cards) {
    const goal = goals.find((item) => item.id === card.project.parent_goal_id);
    const id = goal?.id ?? 'ungrouped';
    const title = goal?.title ?? 'No goal';
    const existing = byGoal.get(id);
    if (existing) existing.cards.push(card);
    else byGoal.set(id, { id, title, cards: [card] });
  }
  return [...byGoal.values()];
}

export function projectActivityHeatmap(
  projects: Project[],
  tasks: Task[],
  now: Date = new Date(),
  weeks = 12
): { rows: HeatmapRow[]; axis: string[] } {
  const start = weekStart(now);
  const first = addDays(start, -7 * (weeks - 1));
  const live = projects.filter((project) => project.status !== 'archived_dead');
  const rows = live.map((project) => ({
    projectId: project.id,
    title: project.title,
    cells: Array.from({ length: weeks }, (_, index) => {
      const from = addDays(first, 7 * index);
      const to = addDays(from, 7);
      return projectChildTasks(project, tasks).some((task) => {
        const stamp = parseDue(task.completed_at) ?? parseDue(task.updated_at) ?? parseDue(task.created_at);
        return Boolean(stamp && stamp >= from && stamp < to);
      });
    })
  }));
  const axis = [0, 4, 8, weeks - 1].map((offset) => shortDayLabel(addDays(first, 7 * offset)));
  return { rows, axis };
}

function windowForZoom(zoom: RoadmapZoom, now: Date): { start: Date; end: Date; axis: string[] } {
  if (zoom === 'week') {
    const start = weekStart(now);
    const end = addDays(start, 21);
    return {
      start,
      end,
      axis: [0, 7, 14].map((offset) => shortDayLabel(addDays(start, offset)))
    };
  }
  if (zoom === 'month') {
    const start = monthStart(now);
    return {
      start,
      end: new Date(start.getFullYear(), start.getMonth() + 4, 1),
      axis: [0, 1, 2, 3].map((offset) => MONTHS[(start.getMonth() + offset) % 12] ?? '')
    };
  }
  const start = monthStart(now);
  return {
    start,
    end: new Date(start.getFullYear(), start.getMonth() + 6, 1),
    axis: ['This term', 'Next term']
  };
}

function rangeToBar(
  from: Date | null,
  to: Date | null,
  windowStart: number,
  windowEnd: number,
  color: string
): RoadmapBar | null {
  if (!from || !to) return null;
  const span = windowEnd - windowStart;
  if (span <= 0) return null;
  const leftMs = clamp(from.getTime(), windowStart, windowEnd);
  const rightMs = clamp(to.getTime(), windowStart, windowEnd);
  if (rightMs <= leftMs) return null;
  return {
    left: ((leftMs - windowStart) / span) * 100,
    width: ((rightMs - leftMs) / span) * 100,
    color
  };
}

export function projectRoadmap(
  projects: Project[],
  tasks: Task[],
  zoom: RoadmapZoom,
  now: Date = new Date()
): RoadmapModel {
  const { start, end, axis } = windowForZoom(zoom, now);
  const windowStart = start.getTime();
  const windowEnd = end.getTime();
  const live = projects.filter((project) => project.status !== 'archived_dead');
  const rows = live.map((project, index) => {
    const created = parseDue(project.created_at);
    const current = parseDue(project.current_end_date) ?? parseDue(project.baseline_end_date);
    const baseline = parseDue(project.baseline_end_date);
    const derived = parseDue(
      projectChildTasks(project, tasks)
        .map((task) => task.due_date)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null
    );
    const barEnd = current ?? derived;
    const color = ROADMAP_COLORS[index % ROADMAP_COLORS.length]!;
    const bar = rangeToBar(created, barEnd, windowStart, windowEnd, color);
    const ghost =
      baseline && current && baseline.getTime() !== current.getTime()
        ? rangeToBar(created, baseline, windowStart, windowEnd, 'transparent')
        : null;
    return {
      projectId: project.id,
      label: project.title,
      bar,
      ghost
    };
  });
  return { zoom, axis, rows };
}

export function findPortfolioTension(
  cards: ProjectPulseCard[],
  tasks: Task[],
  now: Date = new Date()
): PortfolioTension | null {
  const live = cards.filter((card) => card.lifecycle !== 'completed' && card.lifecycle !== 'stalled');
  const deep = live.filter((card) => card.energy === 'deep_focus');
  const pool = deep.length >= 2 ? deep : live;
  const horizon = addDays(startOfDay(now), 21);
  type Hit = { card: ProjectPulseCard; when: Date };
  const hits: Hit[] = [];
  for (const card of pool) {
    const end = parseDue(card.project.current_end_date) ?? parseDue(card.project.baseline_end_date);
    if (end && end >= startOfDay(now) && end <= horizon) {
      hits.push({ card, when: end });
      continue;
    }
    const soon = projectChildTasks(card.project, tasks)
      .map((task) => parseDue(task.due_date))
      .filter((due): due is Date => Boolean(due && due >= startOfDay(now) && due <= horizon))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (soon) hits.push({ card, when: soon });
  }
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const left = hits[i]!;
      const right = hits[j]!;
      if (Math.abs(left.when.getTime() - right.when.getTime()) > 14 * 86_400_000) continue;
      return {
        projectIds: [left.card.project.id, right.card.project.id],
        message: `${left.card.project.title} and ${right.card.project.title} both need deep-focus time the week of ${shortDayLabel(left.when < right.when ? left.when : right.when)}. Consider shifting one.`
      };
    }
  }
  return null;
}

export function findRetroCandidate(
  cards: ProjectPulseCard[],
  now: Date = new Date()
): RetroCandidate | null {
  const ready = cards.find((card) => card.readyToClose && card.lifecycle !== 'completed');
  if (ready) {
    return {
      project: ready.project,
      eyebrow: `Due for review · ${ready.project.title}`,
      title: 'Close-out retro',
      daysOut: 0
    };
  }
  let nearest: RetroCandidate | null = null;
  for (const card of cards) {
    if (card.lifecycle === 'completed' || card.lifecycle === 'stalled') continue;
    for (const milestone of card.project.milestones) {
      const due = parseDue(milestone.due_date);
      if (!due) continue;
      const daysOut = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
      if (daysOut < 0 || daysOut > 21) continue;
      if (!nearest || (nearest.daysOut != null && daysOut < nearest.daysOut)) {
        nearest = {
          project: card.project,
          eyebrow: `Due for review · ${card.project.title}`,
          title: `${milestone.title} — ${daysOut} day${daysOut === 1 ? '' : 's'} out`,
          daysOut
        };
      }
    }
  }
  return nearest;
}

export function matchesProjectQuery(project: Project, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    project.title.toLowerCase().includes(q) ||
    project.description.toLowerCase().includes(q) ||
    project.arc_summary.toLowerCase().includes(q)
  );
}

export function lastActivityLabel(project: Project, tasks: Task[], now: Date = new Date()): string {
  const last = lastProjectActivityAt(project, tasks);
  const days = Math.max(
    0,
    Math.round((startOfDay(now).getTime() - startOfDay(last).getTime()) / 86_400_000)
  );
  if (days === 0) return 'Moved today';
  if (days === 1) return 'Quiet since yesterday';
  return `Quiet for ${days}d`;
}

export function projectProgressLabel(project: Project, tasks: Task[]): string {
  const progress = projectProgress(project, tasks);
  if (!progress.total) return 'No tasks yet';
  return `${progress.done} of ${progress.total} tasks`;
}
