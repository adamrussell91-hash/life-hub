import { addDays, parseDue, startOfDay } from './clare-dates.mjs';

export const DEFAULT_STALL_WEEKS = 6;
export const STALL_OUTCOMES = new Set(['revived', 'frankensteined', 'buried']);

export function stallThresholdDate(from = new Date(), weeks = DEFAULT_STALL_WEEKS) {
  return addDays(startOfDay(from), -(weeks * 7));
}

export function lastProjectActivityAt(project, tasks) {
  let latest = parseDue(project.updated_at) ?? parseDue(project.created_at) ?? new Date(0);
  for (const task of tasks) {
    if (task.parent_project_id !== project.id) continue;
    const stamp = parseDue(task.updated_at) ?? parseDue(task.created_at);
    if (stamp && stamp.getTime() > latest.getTime()) latest = stamp;
  }
  return latest;
}

export function isStallEligible(project) {
  return project.status === 'active' || project.status === 'revived' || project.status === 'stalled';
}

export function findStallCandidates(projects, tasks, from = new Date(), weeks = DEFAULT_STALL_WEEKS) {
  const threshold = stallThresholdDate(from, weeks).getTime();
  const out = [];
  for (const project of projects) {
    if (project.status === 'archived_dead') continue;
    if (!isStallEligible(project) && project.status !== 'stalled') continue;
    const last = lastProjectActivityAt(project, tasks);
    const idle_days = Math.floor((startOfDay(from).getTime() - startOfDay(last).getTime()) / (24 * 60 * 60 * 1000));
    const open_task_count = tasks.filter(task =>
      task.parent_project_id === project.id && task.status !== 'done' && task.status !== 'dead'
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

export function outcomeProjectStatus(outcome) {
  return outcome === 'revived' ? 'revived' : 'archived_dead';
}
