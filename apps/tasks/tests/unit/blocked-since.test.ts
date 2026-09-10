import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import {
  descendantIds,
  reconcileBlockedSince,
  reconcileBlockedSinceBatch
} from '@/domain/blocked-since';

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

describe('blocked_since reconciliation', () => {
  it('sets blocked_since when a task becomes blocked', () => {
    const blocker = baseTask({ id: 'a', title: 'Blocker', status: 'open' });
    const waiting = baseTask({ id: 'b', title: 'Waiting', depends_on: ['a'] });
    const byId = new Map([blocker, waiting].map((task) => [task.id, task]));

    const next = reconcileBlockedSince(waiting, byId, '2026-08-24T09:00:00.000Z');
    expect(next.blocked_since).toBe('2026-08-24T09:00:00.000Z');
  });

  it('clears blocked_since when blockers are resolved', () => {
    const blocker = baseTask({ id: 'a', title: 'Blocker', status: 'done' });
    const waiting = baseTask({
      id: 'b',
      title: 'Waiting',
      depends_on: ['a'],
      blocked_since: '2026-08-20T00:00:00.000Z'
    });
    const byId = new Map([blocker, waiting].map((task) => [task.id, task]));

    const next = reconcileBlockedSince(waiting, byId);
    expect(next.blocked_since).toBeNull();
  });

  it('finds downstream tasks for batch reconciliation', async () => {
    const root = baseTask({ id: 'root', title: 'Root', status: 'open' });
    const middle = baseTask({ id: 'mid', title: 'Middle', depends_on: ['root'] });
    const leaf = baseTask({ id: 'leaf', title: 'Leaf', depends_on: ['mid'] });
    const tasks = [root, middle, leaf];

    expect([...descendantIds('root', tasks)]).toEqual(['mid', 'leaf']);

    const updates = await reconcileBlockedSinceBatch(tasks, new Set(['root', 'mid', 'leaf']));
    expect(updates.get('mid')?.blocked_since).toBeTruthy();
    expect(updates.get('leaf')?.blocked_since).toBeTruthy();
  });
});
