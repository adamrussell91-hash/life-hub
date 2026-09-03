import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import { layoutFocusPipe, layoutHubPipes, layoutPipe } from '@/domain/pipe-layout';

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

describe('pipe layout', () => {
  it('returns hub layout when no focus id is provided', () => {
    const gate = baseTask({ id: 'gate', title: 'Ready gate' });
    const blocked = baseTask({ id: 'blocked', title: 'Blocked', depends_on: ['gate'] });
    const layout = layoutPipe(null, [gate, blocked]);

    expect(layout.mode).toBe('hub');
    if (layout.mode === 'hub') {
      expect(layout.components.length).toBeGreaterThan(0);
      expect(layout.summary).toMatch(/bottleneck gate/i);
    }
  });

  it('returns focus layout with ranked nodes for a blocked task', () => {
    const gate = baseTask({ id: 'gate', title: 'Ready gate' });
    const blocked = baseTask({
      id: 'blocked',
      title: 'Blocked',
      depends_on: ['gate'],
      blocked_since: '2026-08-10T00:00:00.000Z'
    });
    const layout = layoutFocusPipe('blocked', [gate, blocked]);

    expect(layout.mode).toBe('focus');
    expect(layout.nodes.some((node) => node.id === 'gate')).toBe(true);
    expect(layout.nodes.some((node) => node.id === 'blocked')).toBe(true);
    expect(layout.nodes.find((node) => node.id === 'gate')?.gateState).toBe('ready');
    expect(layout.nodes.find((node) => node.id === 'blocked')?.gateState).toBe('queued');
    expect(layout.srRows.length).toBe(layout.nodes.length);
  });

  it('lays out hub pipes vertically with metadata rows', () => {
    const gate = baseTask({ id: 'gate', title: 'Ready gate' });
    const blocked = baseTask({ id: 'blocked', title: 'Blocked', depends_on: ['gate'] });
    const layout = layoutHubPipes([gate, blocked]);

    expect(layout.components.length).toBe(1);
    expect(layout.components[0]?.y).toBeLessThan(layout.height);
    expect(layout.srRows[0]?.role).toMatch(/clears/);
  });
});
