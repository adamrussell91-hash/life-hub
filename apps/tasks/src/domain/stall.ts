import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { addDays, parseDue, startOfDay } from '@/domain/queries';

/** Spec §5.11 default — six weeks without movement. */
export const DEFAULT_STALL_WEEKS = 6;

export type StallCandidate = {
  project: Project;
  last_activity_at: string;
  idle_days: number;
  open_task_count: number;
  already_flagged: boolean;
};

export function stallThresholdDate(from: Date = new Date(), weeks = DEFAULT_STALL_WEEKS): Date {
  return addDays(startOfDay(from), -(weeks * 7));
}

/** Latest activity across the project record and its child tasks. */
export function lastProjectActivityAt(project: Project, tasks: Task[]): Date {
  let latest = parseDue(project.updated_at) ?? parseDue(project.created_at) ?? new Date(0);
  for (const task of tasks) {
    if (task.parent_project_id !== project.id) continue;
    const stamp = parseDue(task.updated_at) ?? parseDue(task.created_at);
    if (stamp && stamp.getTime() > latest.getTime()) latest = stamp;
  }
  return latest;
}

export function isStallEligible(project: Project): boolean {
  return project.status === 'active' || project.status === 'revived' || project.status === 'stalled';
}

/**
 * Find projects with no movement inside the stall window.
 * Already-stalled projects are included so the UI can still offer outcomes.
 */
export function findStallCandidates(
  projects: Project[],
  tasks: Task[],
  from: Date = new Date(),
  weeks = DEFAULT_STALL_WEEKS
): StallCandidate[] {
  const threshold = stallThresholdDate(from, weeks).getTime();
  const out: StallCandidate[] = [];

  for (const project of projects) {
    if (project.status === 'archived_dead') continue;
    if (!isStallEligible(project) && project.status !== 'stalled') continue;

    const last = lastProjectActivityAt(project, tasks);
    const idle_days = Math.floor((startOfDay(from).getTime() - startOfDay(last).getTime()) / (24 * 60 * 60 * 1000));
    const open_task_count = tasks.filter(
      (t) =>
        t.parent_project_id === project.id &&
        t.status !== 'done' &&
        t.status !== 'dead'
    ).length;

    const quiet = last.getTime() <= threshold;
    if (!quiet && project.status !== 'stalled') continue;

    out.push({
      project,
      last_activity_at: last.toISOString(),
      idle_days: Math.max(0, idle_days),
      open_task_count,
      already_flagged: project.status === 'stalled' || Boolean(project.stall_flagged_at)
    });
  }

  return out.sort((a, b) => b.idle_days - a.idle_days);
}

export type StallOutcome = 'revived' | 'frankensteined' | 'buried';

export function outcomeProjectStatus(outcome: StallOutcome): Project['status'] {
  if (outcome === 'revived') return 'revived';
  return 'archived_dead';
}
