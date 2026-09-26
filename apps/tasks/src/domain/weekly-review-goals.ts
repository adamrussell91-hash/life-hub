// apps/tasks/src/domain/weekly-review-goals.ts
/** G-38 / G-39 helpers for the weekly review Goals stage. */
import type { Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { mondayOf } from '@/domain/school-time';
import { addDaysKey } from '@/domain/school-time';
import { hostedTasks } from '@/domain/goal-hosting';
import { sydneyDateKey, weekCount } from '@/domain/goal-runway';

export function goalsStageRows(
  goals: Goal[],
  projects: Project[],
  tasks: Task[],
  today: string,
  verdicts: Record<string, string> = {}
): Array<{ goal_id: string; title: string; count: number; per_week: number | null; verdict: string }> {
  const monday = mondayOf(today);
  return goals
    .filter((g) => g.status === 'active')
    .map((g) => {
      const hosted = hostedTasks(g, tasks, projects);
      return {
        goal_id: g.id,
        title: g.title,
        count: weekCount(g, hosted, monday),
        per_week: g.lead_measure?.per_week ?? null,
        verdict: verdicts[g.id] ?? ''
      };
    });
}

/** Completed this week, no parent_goal_id, not under a hosted project of any active goal. */
export function orphanCompletionsThisWeek(
  goals: Goal[],
  projects: Project[],
  tasks: Task[],
  today: string
): Array<{ task_id: string; title: string }> {
  const monday = mondayOf(today);
  const sunday = addDaysKey(monday, 6);
  const hostedProjectIds = new Set(
    projects.filter((p) => goals.some((g) => g.id === p.parent_goal_id && g.status === 'active')).map((p) => p.id)
  );
  return tasks
    .filter((t) => {
      if (!t.completed_at) return false;
      const key = sydneyDateKey(t.completed_at);
      if (key < monday || key > sunday) return false;
      if (t.parent_goal_id) return false;
      if (t.parent_project_id && hostedProjectIds.has(t.parent_project_id)) return false;
      return true;
    })
    .map((t) => ({ task_id: t.id, title: t.title }));
}
