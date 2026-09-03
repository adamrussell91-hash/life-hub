import { describe, expect, it } from 'vitest';
import { createBlock, LESSON_BLOCK_GROUPS } from '@/blocks/create-block';
import {
  dueChipKind,
  dueChipLabel,
  formatRelativeUpdated,
  projectPageHash,
  projectProgress,
  statusBadgeClass,
  taskPageHash
} from '@/domain/cards';
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
    estimated_duration: 30,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: 'proj_mw',
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
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null
};

describe('card domain helpers', () => {
  it('formats relative updated copy', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');
    expect(formatRelativeUpdated('2026-08-17T11:59:30.000Z', now)).toBe('Updated just now');
    expect(formatRelativeUpdated('2026-08-17T11:10:00.000Z', now)).toBe('Updated 50m ago');
    expect(formatRelativeUpdated('2026-08-17T08:00:00.000Z', now)).toBe('Updated 4h ago');
    expect(formatRelativeUpdated('2026-08-16T12:00:00.000Z', now)).toBe('Updated yesterday');
    expect(formatRelativeUpdated('2026-08-14T12:00:00.000Z', now)).toBe('Updated 3d ago');
  });

  it('maps due chips and project progress', () => {
    const now = new Date(2026, 7, 17);
    expect(dueChipKind('2026-08-17', now)).toBe('today');
    expect(dueChipLabel('2026-08-17', now)).toBe('Today');
    expect(dueChipKind('2026-08-16', now)).toBe('today');
    expect(dueChipLabel('2026-08-16', now)).toBe('Overdue');
    expect(dueChipKind('2026-08-19', now)).toBe('soon');
    expect(dueChipKind('2026-08-25', now)).toBe('later');
    expect(statusBadgeClass('in_progress')).toBe('status-badge status-badge--in_progress');

    const progress = projectProgress(project, [
      task({ id: 'a', title: 'A', status: 'done' }),
      task({ id: 'b', title: 'B', due_date: '2026-08-17' }),
      task({ id: 'c', title: 'C', parent_project_id: 'other' })
    ], now);
    expect(progress).toMatchObject({ done: 1, total: 2, pct: 50, dueToday: 1 });
  });

  it('builds page hashes and Teaching Hub lesson families', () => {
    expect(taskPageHash('task_1')).toBe('#/task/task_1');
    expect(projectPageHash('proj_mw')).toBe('#/project/proj_mw');
    expect(LESSON_BLOCK_GROUPS.map((group) => group.label)).toEqual([
      'Basic',
      'Media',
      'Teaching',
      'Learning',
      'Visualisation',
      'Layout'
    ]);
    const heading = createBlock('heading', 'block_h1');
    expect(heading).toMatchObject({
      type: 'block',
      block_type: 'heading',
      variant: 'section',
      visibility: 'student_teacher',
      schema_version: 1
    });
    expect(createBlock('rich_text', 'block_rt').content).toEqual({ html: '' });
    expect(createBlock('callout', 'block_c').content).toMatchObject({ style: 'information' });
    expect(createBlock('flashcards', 'block_f').block_type).toBe('flashcards');
    expect(createBlock('equation', 'block_eq').block_type).toBe('equation');
  });
});
