import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { layoutOrbit, separateCloseAngles, taskUrgency, type OrbitBody } from '@/domain/orbit';
import { layoutProjectBranch } from '@/domain/branch';
import { buildConstellation } from '@/domain/constellation';

const baseTask = (partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  schema_version: 1,
  description: '',
  kind: 'task',
  bucket: 'active',
  step_order: 0,
  domain: 'teaching',
  framework_used: null,
  estimated_duration: 30,
  actual_duration: null,
  due_date: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  completed_at: null,
  status: 'open',
  blocked_since: null,
  priority: 'medium',
  parent_project_id: null,
  parent_task_id: null,
  depends_on: [],
  tags: [],
  recurrence_rule: null,
  due_time: null,
  remind_at: null,
  remind_dismissed_at: null,
  attachments: [],
  source: 'manual',
  ...partial
});

const project: Project = {
  schema_version: 1,
  id: 'proj_mw',
  title: 'MindWorks',
  description: '',
  parent_goal_id: null,
  tags: [],
  arc_summary: '',
  type: 'academic_program',
  milestones: [],
  status: 'active',
  baseline_end_date: null,
  current_end_date: null,
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null
};

describe('orbit layout', () => {
  it('places more urgent tasks closer to centre', () => {
    const from = new Date('2026-08-16T12:00:00.000Z');
    const hot = baseTask({
      id: 't_hot',
      title: 'Hot',
      priority: 'urgent',
      due_date: '2026-08-16'
    });
    const cold = baseTask({
      id: 't_cold',
      title: 'Cold',
      priority: 'low',
      due_date: '2026-09-30'
    });
    expect(taskUrgency(hot, from)).toBeLessThan(taskUrgency(cold, from));

    const bodies = layoutOrbit([hot, cold], [], from, { minRadius: 50, maxRadius: 200 });
    const hotBody = bodies.find((b) => b.id === 't_hot')!;
    const coldBody = bodies.find((b) => b.id === 't_cold')!;
    expect(hotBody.radius).toBeLessThan(coldBody.radius);
  });

  it('includes active projects as larger bodies', () => {
    const tasks = [
      baseTask({
        id: 't1',
        title: 'Child',
        parent_project_id: 'proj_mw',
        priority: 'high',
        due_date: '2026-08-17'
      })
    ];
    const bodies = layoutOrbit(tasks, [project], new Date('2026-08-16T12:00:00.000Z'));
    const projBody = bodies.find((b) => b.id === 'proj_mw');
    expect(projBody?.kind).toBe('project');
    expect(projBody!.size).toBeGreaterThanOrEqual(18);
  });

  it('separates bodies that share a ring', () => {
    const packed: OrbitBody[] = [
      {
        id: 'a',
        kind: 'task',
        label: 'A',
        domain: 'teaching',
        urgency: 0.2,
        radius: 80,
        angle: 0,
        size: 12,
        priority: 'high',
        due_date: null,
        estimated_minutes: 30
      },
      {
        id: 'b',
        kind: 'task',
        label: 'B',
        domain: 'life',
        urgency: 0.2,
        radius: 82,
        angle: 0.05,
        size: 12,
        priority: 'high',
        due_date: null,
        estimated_minutes: 30
      }
    ];
    separateCloseAngles(packed);
    let delta = packed[0]!.angle - packed[1]!.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    expect(Math.abs(delta)).toBeGreaterThan(0.3);
  });
});

describe('branch layout', () => {
  it('lays out parent tree and depends_on edges for one project', () => {
    const tasks = [
      baseTask({ id: 't_root', title: 'Pack', parent_project_id: 'proj_mw' }),
      baseTask({
        id: 't_child',
        title: 'Outline',
        parent_project_id: 'proj_mw',
        parent_task_id: 't_root'
      }),
      baseTask({
        id: 't_blocked',
        title: 'Publish',
        parent_project_id: 'proj_mw',
        depends_on: ['t_root']
      })
    ];
    const layout = layoutProjectBranch(project, tasks);
    expect(layout.nodes.some((n) => n.id === 'proj_mw' && n.kind === 'project')).toBe(true);
    expect(layout.edges.some((e) => e.from === 't_root' && e.to === 't_child' && e.kind === 'parent')).toBe(
      true
    );
    expect(
      layout.edges.some((e) => e.from === 't_root' && e.to === 't_blocked' && e.kind === 'depends_on')
    ).toBe(true);
    expect(layout.nodes.find((n) => n.id === 't_child')!.depth).toBe(2);
  });
});

describe('constellation', () => {
  it('lights completed stars and dims fill when overdue', () => {
    const from = new Date('2026-08-16T12:00:00.000Z');
    const tasks = [
      baseTask({
        id: 'done1',
        title: 'Done A',
        status: 'done',
        completed_at: '2026-08-15T00:00:00.000Z'
      }),
      baseTask({
        id: 'done2',
        title: 'Done B',
        status: 'done',
        completed_at: '2026-08-14T00:00:00.000Z'
      }),
      baseTask({
        id: 'open1',
        title: 'Open',
        status: 'open',
        due_date: '2026-08-10'
      }),
      baseTask({
        id: 'open2',
        title: 'Also open',
        status: 'open',
        due_date: '2026-08-12'
      })
    ];
    const model = buildConstellation(tasks, from);
    expect(model.completed_count).toBe(2);
    expect(model.overdue_count).toBe(2);
    expect(model.stars.filter((s) => s.lit).length).toBe(2);
    expect(model.fill_ratio).toBeLessThan(0.5);
    expect(model.headline.length).toBeGreaterThan(0);
  });
});
