import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';
import type { Task } from '@/schemas/task';
import {
  applyShrinkPatch,
  buildShrinkSuggestions,
  detectPinchPoints,
  dueSoonTasks
} from '@/domain/pinch';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'due_date' | 'priority'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 60,
    actual_duration: null,
    created_at: '2026-08-14T00:00:00.000Z',
    updated_at: '2026-08-14T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
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

describe('pinch points', () => {
  it('flags the seeded Aug 17 cluster as a watch pinch', () => {
    const from = new Date('2026-08-16T12:00:00');
    const pinches = detectPinchPoints(seed.tasks, from, { days: 3 });
    const hit = pinches.find((p) => p.date_key === '2026-08-17');
    expect(hit).toBeTruthy();
    expect(hit!.task_count).toBeGreaterThanOrEqual(3);
    expect(hit!.shrink.length).toBeGreaterThan(0);
    expect(hit!.shrink.some((s) => s.kind === 'defer' || s.kind === 'delegate')).toBe(true);
    expect(hit!.summary).toContain('17/08/26');
    expect(hit!.summary).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('marks denser days overloaded', () => {
    const day = '2026-09-01';
    const tasks = Array.from({ length: 5 }, (_, i) =>
      task({
        id: `t${i}`,
        title: `Task ${i}`,
        due_date: day,
        priority: i === 0 ? 'urgent' : 'low',
        estimated_duration: 90
      })
    );
    const pinches = detectPinchPoints(tasks, new Date('2026-09-01T12:00:00'), { days: 1 });
    expect(pinches[0]?.severity).toBe('overloaded');
    expect(pinches[0]?.estimated_minutes).toBe(450);
  });

  it('builds shrink patches that defer due dates', () => {
    const t = task({
      id: 't_low',
      title: 'Optional filing',
      due_date: '2026-08-17',
      priority: 'low',
      estimated_duration: 40
    });
    const suggestions = buildShrinkSuggestions([t], '2026-08-17');
    const defer = suggestions.find((s) => s.kind === 'defer');
    expect(defer).toBeTruthy();
    const plan = applyShrinkPatch(t, defer!, '2026-08-17');
    expect(plan.mode).toBe('update');
    if (plan.mode === 'update') {
      expect(plan.patch.due_date).toBe('2026-08-19');
      expect(plan.patch.status).toBe('deferred');
    }
  });
});

describe('due soon', () => {
  it('lists today and tomorrow', () => {
    const from = new Date('2026-08-16T12:00:00');
    const soon = dueSoonTasks(seed.tasks, from, 1);
    expect(soon.some((s) => s.task.id === 'task_demo_wedding_vendor' && s.days_until === 0)).toBe(
      true
    );
    expect(soon.some((s) => s.days_until === 1)).toBe(true);
  });
});
