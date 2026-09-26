// apps/tasks/src/domain/hammond-horizons.ts
import type { Goal, GoalSphere } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { PlanningDirection } from '@/schemas/planning-direction';
import { inspectProjectHealth } from '@/domain/project-health';
import { SPHERE_LABEL } from '@/domain/goal-hosting';

export type HorizonsChain = {
  purpose: string;
  principles: string[];
  vision: string;
  /** Sphere replaces Areas of Focus in traces (G-29). */
  sphere: { id: GoalSphere; title: string } | null;
  goal: { id: string; title: string } | null;
  project: {
    id: string;
    title: string;
    purpose: string;
    quality_bar: string | null;
    health: string;
  } | null;
  next_actions: Array<{ id: string; title: string }>;
  /** @deprecated G-29 — kept as alias of sphere for older callers. */
  area: { id: string; title: string } | null;
};

export function buildHorizonsChain(input: {
  direction: PlanningDirection;
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  /** Ignored — Areas retired from traces (G-29). Kept so callers compile. */
  areas?: unknown[];
  focus?:
    | { type: 'sphere'; id: GoalSphere }
    | { type: 'area'; id: string }
    | { type: 'goal'; id: string }
    | { type: 'project'; id: string }
    | null;
}): HorizonsChain {
  const { direction, goals, projects, tasks, focus } = input;
  let sphere: GoalSphere | null = null;
  let goal: Goal | null = null;
  let project: Project | null = null;

  if (focus?.type === 'project') {
    project = projects.find((p) => p.id === focus.id) ?? null;
    goal = project?.parent_goal_id
      ? goals.find((g) => g.id === project!.parent_goal_id) ?? null
      : null;
    sphere = goal?.sphere ?? null;
  } else if (focus?.type === 'goal') {
    goal = goals.find((g) => g.id === focus.id) ?? null;
    sphere = goal?.sphere ?? null;
  } else if (focus?.type === 'sphere') {
    sphere = focus.id;
  } else if (focus?.type === 'area') {
    // Legacy focus: Areas no longer resolve; leave sphere null.
    sphere = null;
  }

  const projectTasks = project
    ? tasks.filter((t) => t.parent_project_id === project!.id)
    : [];
  const health = project ? inspectProjectHealth(project, tasks).health : 'healthy';
  const next_actions = projectTasks
    .filter((t) => t.status === 'open' || t.status === 'in_progress')
    .filter((t) => !t.waiting_on && t.bucket !== 'someday')
    .slice(0, 8)
    .map((t) => ({ id: t.id, title: t.title }));

  const sphereNode = sphere ? { id: sphere, title: SPHERE_LABEL[sphere] } : null;

  return {
    purpose: direction.purpose,
    principles: direction.principles,
    vision: direction.vision,
    sphere: sphereNode,
    area: sphereNode,
    goal: goal ? { id: goal.id, title: goal.title } : null,
    project: project
      ? {
          id: project.id,
          title: project.title,
          purpose: project.purpose || project.arc_summary || '',
          quality_bar: project.quality_bar,
          health
        }
      : null,
    next_actions
  };
}
