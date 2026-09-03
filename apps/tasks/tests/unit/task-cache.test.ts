import { describe, expect, it, beforeEach } from 'vitest';
import type { Task } from '@/schemas/task';
import {
  filterCachedTasks,
  mergeListedTasks,
  rememberCreatedTask,
  rememberDeletedTask,
  resetTaskCache,
  restoreDeletedTask
} from '@/services/task-cache';

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
  };
}

describe('task cache', () => {
  beforeEach(() => {
    resetTaskCache();
  });

  it('keeps a just-created task when the next list is stale', () => {
    const existing = task({ id: 'task_old', title: 'Old' });
    const created = task({
      id: 'task_new',
      title: 'New',
      updated_at: '2026-08-25T12:00:00.000Z'
    });
    rememberCreatedTask(created);
    const merged = mergeListedTasks([existing]);
    expect(merged.map((item) => item.id).sort()).toEqual(['task_new', 'task_old']);
  });

  it('hides a deleted task even when the list still returns it', () => {
    const doomed = task({ id: 'task_gone', title: 'Gone' });
    rememberDeletedTask(doomed.id, doomed);
    expect(mergeListedTasks([doomed])).toEqual([]);
    expect(filterCachedTasks([doomed])).toEqual([]);
  });

  it('restores a deleted task if the write fails', () => {
    const doomed = task({ id: 'task_gone', title: 'Gone' });
    rememberCreatedTask(doomed);
    rememberDeletedTask(doomed.id);
    expect(mergeListedTasks([])).toEqual([]);
    expect(restoreDeletedTask(doomed.id)?.title).toBe('Gone');
    expect(mergeListedTasks([]).map((item) => item.id)).toEqual(['task_gone']);
  });
});
