import type { Area } from '@/schemas/area';
import type { Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { PlanningDirection } from '@/schemas/planning-direction';
import { inspectProjectHealth } from '@/domain/project-health';

export type HorizonsChain = {
  purpose: string;
  principles: string[];
  vision: string;
  area: { id: string; title: string } | null;
  goal: { id: string; title: string } | null;
  project: {
    id: string;
    title: string;
    purpose: string;
    quality_bar: string | null;
    health: string;
  } | null;
  next_actions: Array<{ id: string; title: string }>;
};

export function buildHorizonsChain(input: {
  direction: PlanningDirection;
  areas: Area[];
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  focus?:
    | { type: 'area'; id: string }
    | { type: 'goal'; id: string }
    | { type: 'project'; id: string }
    | null;
}): HorizonsChain {
  const { direction, areas, goals, projects, tasks, focus } = input;
  let area: Area | null = null;
  let goal: Goal | null = null;
  let project: Project | null = null;

  if (focus?.type === 'project') {
    project = projects.find((p) => p.id === focus.id) ?? null;
    goal = project?.parent_goal_id
      ? goals.find((g) => g.id === project!.parent_goal_id) ?? null
      : null;
    area = goal?.parent_area_id
      ? areas.find((a) => a.id === goal!.parent_area_id) ?? null
      : null;
  } else if (focus?.type === 'goal') {
    goal = goals.find((g) => g.id === focus.id) ?? null;
    area = goal?.parent_area_id
      ? areas.find((a) => a.id === goal!.parent_area_id) ?? null
      : null;
  } else if (focus?.type === 'area') {
    area = areas.find((a) => a.id === focus.id) ?? null;
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

  return {
    purpose: direction.purpose,
    principles: direction.principles,
    vision: direction.vision,
    area: area ? { id: area.id, title: area.title } : null,
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
