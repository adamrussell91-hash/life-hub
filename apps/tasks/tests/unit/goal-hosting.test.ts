// apps/tasks/tests/unit/goal-hosting.test.ts
import { describe, expect, it } from 'vitest';
import {
  directTasks, hostedProjects, hostedTasks, lastMovementAt, oneMove, projectProgress, SPHERE_DOMAIN
} from '@/domain/goal-hosting';
import { goal, project, task } from './goal-fixtures';

const g = goal({ id: 'g1', title: 'HA evidence', next_start: 'Open the spreadsheet' });
const projects = [
  project({ id: 'p1', title: 'Portfolio', parent_goal_id: 'g1' }),
  // Deviation: ProjectStatus uses archived_dead, not archived.
  project({ id: 'p2', title: 'Old', parent_goal_id: 'g1', status: 'archived_dead' }),
  project({ id: 'p3', title: 'Other', parent_goal_id: 'g2' })
];
const tasks = [
  task({ id: 't1', title: 'Direct', parent_goal_id: 'g1', due_date: '2026-10-10' }),
  task({ id: 't2', title: 'In project', parent_project_id: 'p1', due_date: '2026-10-05', priority: 'high' }),
  task({ id: 't3', title: 'Step', parent_goal_id: 'g1', kind: 'step', parent_task_id: 't1' }),
  task({ id: 't4', title: 'Someday', parent_goal_id: 'g1', bucket: 'someday' }),
  task({ id: 't5', title: 'Elsewhere', parent_project_id: 'p3' }),
  task({ id: 't6', title: 'Done', parent_goal_id: 'g1', status: 'done', completed_at: '2026-09-20T02:00:00.000Z', updated_at: '2026-09-20T02:00:00.000Z' })
];

describe('goal hosting', () => {
  it('hosts non-archived projects and their tasks plus direct tasks, never someday', () => {
    expect(hostedProjects(g, projects).map((p) => p.id)).toEqual(['p1']);
    expect(hostedTasks(g, tasks, projects).map((t) => t.id).sort()).toEqual(['t1', 't2', 't3', 't6']);
    expect(directTasks(g, tasks).map((t) => t.id)).toEqual(['t1', 't6']);
  });

  it('last movement is the newest stamp across the goal and its tasks', () => {
    expect(lastMovementAt(g, hostedTasks(g, tasks, projects))).toBe('2026-09-20T02:00:00.000Z');
  });

  it('one move is the earliest-due open task, else next_start, else null', () => {
    expect(oneMove(g, hostedTasks(g, tasks, projects))).toEqual({ title: 'In project', taskId: 't2' });
    expect(oneMove(g, [])).toEqual({ title: 'Open the spreadsheet', taskId: null });
    expect(oneMove(goal({ id: 'g9', title: 'x' }), [])).toBeNull();
  });

  it('project progress counts non-step tasks', () => {
    expect(projectProgress(projects[0]!, [...tasks, task({ id: 't7', title: 'x', parent_project_id: 'p1', status: 'done' })]))
      .toEqual({ done: 1, total: 2 });
  });

  it('maps spheres to task domains the API accepts', () => {
    expect(SPHERE_DOMAIN).toEqual({ life: 'life', work: 'teaching', professional: 'other' });
  });
});
