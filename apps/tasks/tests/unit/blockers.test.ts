import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import { blockerRows, buildBlockerLinks, layoutBlockerGraph } from '@/domain/blockers';

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

describe('blocker graph model', () => {
  it('builds active links only when the blocker is not done', () => {
    const blocker = baseTask({ id: 'a', title: 'Blocker', status: 'open' });
    const done = baseTask({ id: 'b', title: 'Done blocker', status: 'done' });
    const waiting = baseTask({ id: 'c', title: 'Waiting', depends_on: ['a', 'b'] });
    const links = buildBlockerLinks([blocker, done, waiting]);

    expect(links).toHaveLength(2);
    expect(links.find((link) => link.blockerId === 'a')?.active).toBe(true);
    expect(links.find((link) => link.blockerId === 'b')?.active).toBe(false);
  });

  it('layers blocked tasks to the right of their blockers', () => {
    const root = baseTask({ id: 'root', title: 'Root' });
    const middle = baseTask({ id: 'mid', title: 'Middle', depends_on: ['root'] });
    const leaf = baseTask({ id: 'leaf', title: 'Leaf', depends_on: ['mid'] });
    const layout = layoutBlockerGraph([root, middle, leaf]);

    const rootNode = layout.nodes.find((node) => node.id === 'root');
    const leafNode = layout.nodes.find((node) => node.id === 'leaf');
    expect(rootNode?.depth).toBe(0);
    expect(leafNode?.depth).toBe(2);
    expect((leafNode?.x ?? 0) > (rootNode?.x ?? 0)).toBe(true);
  });

  it('returns active-only rows for the readable table', () => {
    const blocker = baseTask({ id: 'a', title: 'Blocker', status: 'open' });
    const done = baseTask({ id: 'b', title: 'Done blocker', status: 'done' });
    const waiting = baseTask({ id: 'c', title: 'Waiting', depends_on: ['a', 'b'] });

    expect(blockerRows([blocker, done, waiting], true)).toHaveLength(1);
    expect(blockerRows([blocker, done, waiting], false)).toHaveLength(2);
  });
});
