import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import {
  analyzeFocus,
  chamberHeightUnits,
  gateVisualState,
  hubComponents,
  isReadyGate,
  openAncestors,
  rankToReadyGate
} from '@/domain/gates';

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

describe('gate algorithm', () => {
  it('treats open tasks with satisfied deps as ready gates', () => {
    const blocker = baseTask({ id: 'a', title: 'Blocker', status: 'done' });
    const waiting = baseTask({ id: 'b', title: 'Waiting', depends_on: ['a'] });
    const byId = new Map([blocker, waiting].map((task) => [task.id, task]));

    expect(isReadyGate(waiting, byId)).toBe(true);
    expect(gateVisualState(waiting, byId)).toBe('ready');
  });

  it('queues tasks whose blockers are still open', () => {
    const blocker = baseTask({ id: 'a', title: 'Blocker', status: 'open' });
    const waiting = baseTask({ id: 'b', title: 'Waiting', depends_on: ['a'] });
    const byId = new Map([blocker, waiting].map((task) => [task.id, task]));

    expect(isReadyGate(blocker, byId)).toBe(true);
    expect(isReadyGate(waiting, byId)).toBe(false);
    expect(gateVisualState(waiting, byId)).toBe('queued');
    expect(rankToReadyGate('b', byId)).toBe(1);
  });

  it('excludes in-progress tasks from ancestor closure', () => {
    const root = baseTask({ id: 'root', title: 'Root' });
    const middle = baseTask({ id: 'mid', title: 'Middle', depends_on: ['root'], status: 'in_progress' });
    const leaf = baseTask({ id: 'leaf', title: 'Leaf', depends_on: ['mid'] });
    const byId = new Map([root, middle, leaf].map((task) => [task.id, task]));

    expect(openAncestors('leaf', byId).has('mid')).toBe(false);
    expect(analyzeFocus('mid', [root, middle, leaf]).shouldRender).toBe(false);
  });

  it('builds hub components from ready gates with fan-out', () => {
    const gate = baseTask({ id: 'gate', title: 'Ready gate' });
    const blockedA = baseTask({ id: 'a', title: 'Blocked A', depends_on: ['gate'] });
    const blockedB = baseTask({ id: 'b', title: 'Blocked B', depends_on: ['gate'] });
    const tasks = [gate, blockedA, blockedB];

    const components = hubComponents(tasks);
    expect(components.some((item) => item.readyGateId === 'gate')).toBe(true);
    expect(components.find((item) => item.readyGateId === 'gate')?.fanOut).toBeGreaterThan(0);
  });

  it('scales chamber height with blocked_since age', () => {
    const fresh = chamberHeightUnits('2026-08-23T00:00:00.000Z', Date.parse('2026-08-24T00:00:00.000Z'));
    const older = chamberHeightUnits('2026-08-01T00:00:00.000Z', Date.parse('2026-08-24T00:00:00.000Z'));
    expect(older).toBeGreaterThan(fresh);
  });
});
