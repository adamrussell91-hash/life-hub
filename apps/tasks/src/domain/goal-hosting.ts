// apps/tasks/src/domain/goal-hosting.ts
import type { Goal, GoalSphere } from '@/schemas/goal';
import { isProjectArchived, type Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

export const SPHERES: readonly GoalSphere[] = ['life', 'work', 'professional'];
export const SPHERE_LABEL: Record<GoalSphere, string> = { life: 'Life', work: 'Work', professional: 'Professional' };
/** `tasks.mjs` accepts teaching | life | wedding | health | other. */
export const SPHERE_DOMAIN: Record<GoalSphere, string> = { life: 'life', work: 'teaching', professional: 'other' };
/** Soft cap: active goals per lane. */
export const LANE_CAP = 3;

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function isOpenTask(task: Task): boolean {
  return task.status !== 'done' && task.status !== 'dead';
}

export function hostedProjects(goal: Goal, projects: Project[]): Project[] {
  return projects.filter((p) => p.parent_goal_id === goal.id && !isProjectArchived(p.status));
}

/** Direct tasks plus tasks of hosted projects. Steps included; Someday never. */
export function hostedTasks(goal: Goal, tasks: Task[], projects: Project[]): Task[] {
  const projectIds = new Set(hostedProjects(goal, projects).map((p) => p.id));
  return tasks.filter(
    (t) =>
      t.bucket !== 'someday' &&
      ((t.parent_goal_id ?? null) === goal.id || (t.parent_project_id !== null && projectIds.has(t.parent_project_id)))
  );
}

/** Tasks the goal hosts directly (not via a project), without steps. */
export function directTasks(goal: Goal, tasks: Task[]): Task[] {
  return tasks.filter((t) => (t.parent_goal_id ?? null) === goal.id && t.kind !== 'step' && t.bucket !== 'someday');
}

export function lastMovementAt(goal: Goal, hosted: Task[]): string {
  const stamps = [goal.updated_at, ...hosted.flatMap((t) => [t.completed_at, t.updated_at])].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
  return stamps.sort().at(-1) ?? goal.created_at;
}

export function oneMove(goal: Goal, hosted: Task[]): { title: string; taskId: string | null } | null {
  const open = hosted
    .filter((t) => t.kind !== 'step' && isOpenTask(t))
    .sort(
      (a, b) =>
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
        (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
        a.title.localeCompare(b.title)
    );
  if (open[0]) return { title: open[0].title, taskId: open[0].id };
  if (goal.next_start) return { title: goal.next_start, taskId: null };
  return null;
}

export function projectProgress(project: Project, tasks: Task[]): { done: number; total: number } {
  const own = tasks.filter((t) => t.parent_project_id === project.id && t.kind !== 'step');
  return { done: own.filter((t) => !isOpenTask(t)).length, total: own.length };
}
