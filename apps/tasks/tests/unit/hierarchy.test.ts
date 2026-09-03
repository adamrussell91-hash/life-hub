import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import {
  boardTasks,
  isBoardTask,
  isSomeday,
  isStep,
  parseTagsInput,
  somedayTasks,
  stepsForTask
} from '@/domain/hierarchy';

const task = (partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  schema_version: 1,
  description: '',
  kind: 'task',
  bucket: 'active',
  step_order: 0,
  domain: 'teaching',
  framework_used: null,
  estimated_duration: null,
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

describe('hierarchy helpers', () => {
  it('detects steps and someday items', () => {
    expect(isStep(task({ id: 'a', title: 'A', kind: 'step' }))).toBe(true);
    expect(isStep(task({ id: 'b', title: 'B', parent_task_id: 'parent', kind: 'task' }))).toBe(
      false
    );
    expect(isSomeday(task({ id: 'c', title: 'C', bucket: 'someday' }))).toBe(true);
  });

  it('excludes steps and someday from board tasks', () => {
    const tasks = [
      task({ id: 'board', title: 'Board' }),
      task({ id: 'step', title: 'Step', kind: 'step', parent_task_id: 'board' }),
      task({ id: 'parked', title: 'Parked', bucket: 'someday' })
    ];
    expect(boardTasks(tasks).map((t) => t.id)).toEqual(['board']);
    expect(somedayTasks(tasks).map((t) => t.id)).toEqual(['parked']);
    expect(isBoardTask(tasks[0])).toBe(true);
    expect(isBoardTask(tasks[1])).toBe(false);
    expect(isBoardTask(tasks[2])).toBe(false);
  });

  it('orders steps by step_order then title', () => {
    const parent = 'task_parent';
    const tasks = [
      task({ id: 's2', title: 'Beta', kind: 'step', parent_task_id: parent, step_order: 2 }),
      task({ id: 's1', title: 'Alpha', kind: 'step', parent_task_id: parent, step_order: 1 }),
      task({ id: 'other', title: 'Other', parent_task_id: 'elsewhere', kind: 'step' })
    ];
    expect(stepsForTask(tasks, parent).map((t) => t.id)).toEqual(['s1', 's2']);
  });

  it('parses comma-separated tags', () => {
    expect(parseTagsInput(' urgent, waiting ,')).toEqual(['urgent', 'waiting']);
  });
});
