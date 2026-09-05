import { describe, expect, it } from 'vitest';
import { chronologyBounds, collectChronologyItems, dayOffset } from '@/domain/chronology';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 480,
    actual_duration: null,
    due_date: '2026-09-10',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: 'p1',
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
  };
}

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    status: 'active',
    type: 'project',
    milestones: [],
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...partial
  } as Project;
}

describe('chronology', () => {
  it('builds ranges from due dates and skips undated / dead tasks', () => {
    const items = collectChronologyItems(
      [
        task({ id: 't1', title: 'Pack', due_date: '2026-09-10', estimated_duration: 960 }),
        task({ id: 't2', title: 'No date', due_date: null }),
        task({ id: 't3', title: 'Dead', due_date: '2026-09-11', status: 'dead' })
      ],
      [project({ id: 'p1', title: 'Camp' })]
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.taskId).toBe('t1');
    expect(items[0]?.endKey).toBe('2026-09-10');
    expect(items[0]?.startKey <= items[0]!.endKey).toBe(true);
    expect(items[0]?.projectTitle).toBe('Camp');
  });

  it('computes bounds and day offsets', () => {
    const items = collectChronologyItems(
      [task({ id: 't1', title: 'A', due_date: '2026-09-10', estimated_duration: 480 })],
      []
    );
    const bounds = chronologyBounds(items, new Date('2026-09-05T00:00:00'));
    expect(bounds.days).toBeGreaterThanOrEqual(14);
    expect(dayOffset(bounds.start, items[0]!.endKey)).toBeGreaterThanOrEqual(0);
  });
});
