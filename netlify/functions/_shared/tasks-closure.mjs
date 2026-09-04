import { parseDue, toDateKey } from './clare-dates.mjs';

export function deriveProjectEndDate(project, tasks) {
  let latest = null;
  for (const task of tasks) {
    if (task.parent_project_id !== project.id) continue;
    if (task.status === 'dead') continue;
    const due = parseDue(task.due_date);
    if (!due) continue;
    if (!latest || due.getTime() > latest.getTime()) latest = due;
  }
  if (latest) return toDateKey(latest);
  return project.current_end_date ?? project.baseline_end_date ?? null;
}

export function computeProjectVariance(project, tasks, from = new Date()) {
  const child = tasks.filter(task => task.parent_project_id === project.id);
  const open_task_count = child.filter(task => task.status !== 'done' && task.status !== 'dead').length;
  const done_task_count = child.filter(task => task.status === 'done').length;
  const derived_end_date = deriveProjectEndDate(project, tasks);
  const baseline = parseDue(project.baseline_end_date);
  const current = parseDue(derived_end_date);
  let slip_days = null;
  if (baseline && current) {
    slip_days = Math.round((current.getTime() - baseline.getTime()) / (24 * 60 * 60 * 1000));
  }

  const endPassed = Boolean(current) && current.getTime() <= from.getTime() + 24 * 60 * 60 * 1000;
  const all_tasks_done = child.length > 0 && open_task_count === 0;
  const ready_to_close = project.status !== 'archived_dead' && (all_tasks_done || endPassed);

  return {
    project_id: project.id,
    baseline_end_date: project.baseline_end_date ?? null,
    current_end_date: project.current_end_date ?? null,
    derived_end_date,
    slip_days,
    open_task_count,
    done_task_count,
    all_tasks_done,
    ready_to_close
  };
}
