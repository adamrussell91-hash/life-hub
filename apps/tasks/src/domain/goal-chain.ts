// apps/tasks/src/domain/goal-chain.ts
import type { Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { PlanningDirection } from '@/schemas/planning-direction';
import { SPHERE_LABEL, hostedProjects, oneMove, hostedTasks } from '@/domain/goal-hosting';
import { goalPageHash, projectPageHash } from '@/domain/cards';

export type ChainSegment = {
  id: string;
  label: string;
  href: string | null;
  muted: boolean;
};

/** Purpose → Vision → Sphere → Goal → first hosted Project → Next action. */
export function buildGoalChain(input: {
  goal: Goal;
  projects: Project[];
  tasks: Task[];
  direction: PlanningDirection;
}): ChainSegment[] {
  const { goal, projects, tasks, direction } = input;
  const purpose = direction.purpose.trim();
  const vision = direction.vision.trim();
  const hosted = hostedProjects(goal, projects);
  const first = hosted[0] ?? null;
  const move = oneMove(goal, hostedTasks(goal, tasks, projects));

  return [
    {
      id: 'purpose',
      label: purpose ? truncate(purpose, 40) : 'Purpose not set',
      href: purpose ? '#/goals' : null,
      muted: !purpose
    },
    {
      id: 'vision',
      label: vision ? truncate(vision, 40) : 'Vision not set',
      href: vision ? '#/goals' : null,
      muted: !vision
    },
    {
      id: 'sphere',
      label: SPHERE_LABEL[goal.sphere],
      href: '#/goals',
      muted: false
    },
    {
      id: 'goal',
      label: goal.title,
      href: goalPageHash(goal.id),
      muted: false
    },
    {
      id: 'project',
      label: first ? first.title : 'No project yet',
      href: first ? projectPageHash(first.id) : null,
      muted: !first
    },
    {
      id: 'action',
      label: move?.title ?? 'Next action not set',
      href: move?.taskId ? `#/task/${move.taskId}` : null,
      muted: !move
    }
  ];
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
