import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import {
  applyDueDatePriorityFloor,
  assessOpenTaskPriorities,
  assessTaskPriority,
  daysUntilDue,
  priorityBandFromDays
} from '@/domain/priority-assess';

function task(
  partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'priority'>
): Task {
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
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
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

const from = new Date('2026-09-21T12:00:00+10:00');

describe('priority assess', () => {
  it('maps due-date distance onto the closed urgency bands', () => {
    expect(priorityBandFromDays(-2).priority).toBe('urgent');
    expect(priorityBandFromDays(0).priority).toBe('urgent');
    expect(priorityBandFromDays(1).priority).toBe('high');
    expect(priorityBandFromDays(3).priority).toBe('high');
    expect(priorityBandFromDays(6).priority).toBe('medium');
    expect(priorityBandFromDays(21).priority).toBe('low');
  });

  it('counts days from Adam’s Sydney calendar, not UTC midnight', () => {
    const overdue = task({
      id: 't1',
      title: 'Mark essays',
      priority: 'medium',
      due_date: '2026-09-20'
    });
    expect(daysUntilDue(overdue, from)).toBe(-1);
    expect(assessTaskPriority(overdue, from, 'full')).toMatchObject({
      suggested: 'urgent',
      changed: true,
      reason: 'Overdue 1 day'
    });
  });

  it('floor mode only raises — never drops a hotter tag', () => {
    const urgentLater = task({
      id: 't2',
      title: 'Keep urgent',
      priority: 'urgent',
      due_date: '2026-10-12'
    });
    expect(assessTaskPriority(urgentLater, from, 'floor').changed).toBe(false);
    expect(assessTaskPriority(urgentLater, from, 'full')).toMatchObject({
      suggested: 'low',
      changed: true
    });
  });

  it('leaves closed, parked, waiting, and undated tasks alone', () => {
    const done = task({ id: 'd', title: 'Done', priority: 'low', status: 'done', due_date: '2026-09-20' });
    const someday = task({ id: 's', title: 'Someday', priority: 'medium', bucket: 'someday', due_date: '2026-09-21' });
    const waiting = task({
      id: 'w',
      title: 'Waiting',
      priority: 'low',
      due_date: '2026-09-21',
      waiting_status: 'waiting'
    });
    const undated = task({ id: 'u', title: 'No date', priority: 'low' });
    expect(assessTaskPriority(done, from).changed).toBe(false);
    expect(assessTaskPriority(someday, from).changed).toBe(false);
    expect(assessTaskPriority(waiting, from).changed).toBe(false);
    expect(assessTaskPriority(undated, from).changed).toBe(false);
  });

  it('raises on a due-date patch unless priority was set in the same write', () => {
    const open = task({ id: 't3', title: 'Call Kate', priority: 'low', due_date: '2026-09-21' });
    const floored = applyDueDatePriorityFloor(open, { due_date: '2026-09-21' }, from);
    expect(floored.priority).toBe('urgent');
    const explicit = applyDueDatePriorityFloor(open, { due_date: '2026-09-21', priority: 'low' }, from);
    expect(explicit.priority).toBe('low');
  });

  it('collects only rows that would change', () => {
    const rows = assessOpenTaskPriorities(
      [
        task({ id: 'a', title: 'Today', priority: 'medium', due_date: '2026-09-21' }),
        task({ id: 'b', title: 'Already urgent', priority: 'urgent', due_date: '2026-09-21' }),
        task({ id: 'c', title: 'Later', priority: 'low', due_date: '2026-11-01' })
      ],
      from,
      'floor'
    );
    expect(rows.changes.map((row) => row.id)).toEqual(['a']);
    expect(rows.skipped).toBe(2);
  });
});
