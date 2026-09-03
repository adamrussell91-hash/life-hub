import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import { layoutFocusChain, layoutHubChain, layoutPipeIllustration } from '@/domain/pipe-chain-layout';
import { hubComponents } from '@/domain/gates';

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

describe('pipe chain layout', () => {
  it('builds a horizontal focus chain with valves and segments', () => {
    const gate = baseTask({ id: 'gate', title: 'Ready gate' });
    const blocked = baseTask({
      id: 'blocked',
      title: 'Blocked task',
      depends_on: ['gate'],
      blocked_since: '2026-08-10T00:00:00.000Z'
    });
    const chain = layoutFocusChain('blocked', [gate, blocked]);

    expect(chain.segments.some((segment) => segment.kind === 'valve')).toBe(true);
    expect(chain.segments.some((segment) => segment.kind === 'straight')).toBe(true);
    expect(chain.srSummary).toMatch(/bottleneck|ready gate/i);
  });

  it('collapses hub chains to head valve plus queued cap', () => {
    const gate = baseTask({ id: 'gate', title: 'Ready gate' });
    const blocked = baseTask({ id: 'blocked', title: 'Blocked', depends_on: ['gate'] });
    const component = hubComponents([gate, blocked])[0]!;
    const chain = layoutHubChain(component);

    expect(chain.segments.some((segment) => segment.kind === 'queued-cap' || segment.kind === 'end-cap')).toBe(
      true
    );
    expect(chain.segments.filter((segment) => segment.kind === 'valve')).toHaveLength(1);
  });

  it('generates prose sr summary for hub illustration', () => {
    const gate = baseTask({ id: 'gate', title: 'Ready gate' });
    const blocked = baseTask({
      id: 'blocked',
      title: 'Blocked task',
      depends_on: ['gate'],
      blocked_since: '2026-08-01T00:00:00.000Z'
    });
    const layout = layoutPipeIllustration(null, [gate, blocked]);

    expect(layout.srSummary.length).toBeGreaterThan(10);
    expect(layout.chains.length).toBeGreaterThan(0);
  });
});
