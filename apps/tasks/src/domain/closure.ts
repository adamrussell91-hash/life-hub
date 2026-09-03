import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { parseDue, toDateKey } from '@/domain/queries';

export type ProjectVariance = {
  project_id: string;
  baseline_end_date: string | null;
  current_end_date: string | null;
  derived_end_date: string | null;
  /** Days: positive = slipped past baseline; negative = early. */
  slip_days: number | null;
  open_task_count: number;
  done_task_count: number;
  all_tasks_done: boolean;
  ready_to_close: boolean;
};

/** Latest due date among project tasks (open or done) — drives current_end_date. */
export function deriveProjectEndDate(project: Project, tasks: Task[]): string | null {
  let latest: Date | null = null;
  for (const task of tasks) {
    if (task.parent_project_id !== project.id) continue;
    if (task.status === 'dead') continue;
    const due = parseDue(task.due_date);
    if (!due) continue;
    if (!latest || due.getTime() > latest.getTime()) latest = due;
  }
  if (latest) return toDateKey(latest);
  return project.current_end_date ?? project.baseline_end_date;
}

export function computeProjectVariance(
  project: Project,
  tasks: Task[],
  from: Date = new Date()
): ProjectVariance {
  const child = tasks.filter((t) => t.parent_project_id === project.id);
  const open_task_count = child.filter((t) => t.status !== 'done' && t.status !== 'dead').length;
  const done_task_count = child.filter((t) => t.status === 'done').length;
  const derived_end_date = deriveProjectEndDate(project, tasks);
  const baseline = parseDue(project.baseline_end_date);
  const current = parseDue(derived_end_date);
  let slip_days: number | null = null;
  if (baseline && current) {
    slip_days = Math.round(
      (current.getTime() - baseline.getTime()) / (24 * 60 * 60 * 1000)
    );
  }

  const endPassed =
    Boolean(current) && current!.getTime() <= from.getTime() + 24 * 60 * 60 * 1000;
  const all_tasks_done = child.length > 0 && open_task_count === 0;
  const ready_to_close =
    project.status !== 'archived_dead' && (all_tasks_done || endPassed);

  return {
    project_id: project.id,
    baseline_end_date: project.baseline_end_date,
    current_end_date: project.current_end_date,
    derived_end_date,
    slip_days,
    open_task_count,
    done_task_count,
    all_tasks_done,
    ready_to_close
  };
}

export function formatSlip(slipDays: number | null): string {
  if (slipDays === null) return 'No baseline to compare';
  if (slipDays === 0) return 'On baseline';
  if (slipDays > 0) return `${slipDays} day${slipDays === 1 ? '' : 's'} past baseline`;
  return `${Math.abs(slipDays)} day${slipDays === -1 ? '' : 's'} ahead of baseline`;
}
