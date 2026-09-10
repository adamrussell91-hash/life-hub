import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { projectChildTasks } from '@/domain/cards';
import { isBoardTask } from '@/domain/hierarchy';
import { projectEnergy } from '@/domain/projects-pulse';
import {
  addDays,
  parseDue,
  startOfDay,
  tasksForDay,
  toDateKey
} from '@/domain/queries';
import { detectStressPatterns } from '@/domain/stress';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export const INTUITIVE_DIGEST_HORIZON_DAYS = 21;
export const INTUITIVE_DIGEST_LOAD_DAYS = 14;
export const INTUITIVE_DIGEST_MAX_TASKS = 60;
export const INTUITIVE_DIGEST_MAX_PROJECTS = 24;

export type DigestTask = {
  id: string;
  title: string;
  due: string | null;
  due_display: string | null;
  minutes: number | null;
  priority: Task['priority'];
  domain: Task['domain'];
  project: string | null;
  status: Task['status'];
  overdue: boolean;
  note?: string;
};

export type DigestProject = {
  id: string;
  title: string;
  type: Project['type'];
  status: Project['status'];
  energy: 'deep_focus' | 'admin_heavy';
  target: string | null;
  open_tasks: number;
  estimated_minutes: number;
  note?: string;
};

export type DigestDayLoad = {
  date: string;
  display: string;
  tasks: number;
  minutes: number;
  titles: string[];
};

export type DigestFact = {
  kind: string;
  description: string;
};

export type IntuitiveDigest = {
  as_of: string;
  timezone: 'Australia/Sydney';
  horizon_days: number;
  week: { days: number; tasks: number; minutes: number };
  load: DigestDayLoad[];
  already_detected: DigestFact[];
  projects: DigestProject[];
  tasks: DigestTask[];
};

function clip(text: string, max = 140): string | undefined {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function isOpenWork(task: Task): boolean {
  return isBoardTask(task) && task.status !== 'done' && task.status !== 'dead';
}

function effort(task: Task): number {
  return task.estimated_duration ?? 45;
}

function includeTask(task: Task, start: Date, horizon: Date): boolean {
  if (!isOpenWork(task)) return false;
  const due = parseDue(task.due_date);
  if (due) {
    const day = startOfDay(due);
    if (day.getTime() < start.getTime()) return true;
    if (day.getTime() <= horizon.getTime()) return true;
    return task.priority === 'high' || task.priority === 'urgent';
  }
  if (task.priority === 'high' || task.priority === 'urgent') return true;
  return (task.estimated_duration ?? 0) >= 90;
}

function taskSortKey(task: Task, start: Date): number {
  const due = parseDue(task.due_date);
  if (!due) return 8_000_000_000 + (10_000 - (task.estimated_duration ?? 0));
  const day = startOfDay(due).getTime();
  if (day < start.getTime()) return day;
  return day;
}

/** Compact context pack for Clare’s judgment pass — not a full store dump. */
export function buildIntuitiveDigest(
  projects: Project[],
  tasks: Task[],
  from: Date = new Date()
): IntuitiveDigest {
  const start = startOfDay(from);
  const horizon = addDays(start, INTUITIVE_DIGEST_HORIZON_DAYS);
  const projectTitle = new Map(projects.map((project) => [project.id, project.title]));

  const selectedTasks = tasks
    .filter((task) => includeTask(task, start, horizon))
    .sort((a, b) => taskSortKey(a, start) - taskSortKey(b, start))
    .slice(0, INTUITIVE_DIGEST_MAX_TASKS)
    .map((task): DigestTask => {
      const due = parseDue(task.due_date);
      const overdue = Boolean(due && startOfDay(due).getTime() < start.getTime());
      return {
        id: task.id,
        title: task.title,
        due: task.due_date,
        due_display: due ? formatDisplayDate(due) : null,
        minutes: task.estimated_duration,
        priority: task.priority,
        domain: task.domain,
        project: task.parent_project_id ? (projectTitle.get(task.parent_project_id) ?? null) : null,
        status: task.status,
        overdue,
        note: clip(task.description)
      };
    });

  const liveProjects = projects
    .filter((project) => project.status !== 'archived_dead')
    .map((project): DigestProject & { score: number } => {
      const children = projectChildTasks(project, tasks).filter(
        (task) => task.status !== 'done' && task.status !== 'dead'
      );
      const estimated_minutes = children.reduce((sum, task) => sum + effort(task), 0);
      const target = project.current_end_date ?? project.baseline_end_date;
      return {
        id: project.id,
        title: project.title,
        type: project.type,
        status: project.status,
        energy: projectEnergy(project, tasks),
        target,
        open_tasks: children.length,
        estimated_minutes,
        note: clip(project.arc_summary || project.description),
        score: estimated_minutes + children.length * 30
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, INTUITIVE_DIGEST_MAX_PROJECTS)
    .map(({ score: _score, ...project }) => project);

  const load: DigestDayLoad[] = [];
  let weekTasks = 0;
  let weekMinutes = 0;
  for (let i = 0; i < INTUITIVE_DIGEST_LOAD_DAYS; i += 1) {
    const day = addDays(start, i);
    const dayTasks = tasksForDay(tasks, day);
    const minutes = dayTasks.reduce((sum, task) => sum + effort(task), 0);
    if (i < 7) {
      weekTasks += dayTasks.length;
      weekMinutes += minutes;
    }
    load.push({
      date: toDateKey(day),
      display: formatDisplayDate(day),
      tasks: dayTasks.length,
      minutes,
      titles: dayTasks.slice(0, 4).map((task) => task.title)
    });
  }

  const already_detected = detectStressPatterns(projects, tasks, from).map((pattern) => ({
    kind: pattern.pattern_kind,
    description: pattern.pattern_description
  }));

  return {
    as_of: from.toISOString(),
    timezone: 'Australia/Sydney',
    horizon_days: INTUITIVE_DIGEST_HORIZON_DAYS,
    week: { days: 7, tasks: weekTasks, minutes: weekMinutes },
    load,
    already_detected,
    projects: liveProjects,
    tasks: selectedTasks
  };
}
