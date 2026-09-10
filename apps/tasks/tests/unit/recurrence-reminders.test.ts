import { describe, expect, it } from 'vitest';
import {
  advanceRecurrence,
  defaultRecurrenceRule,
  formatRecurrenceLabel,
  hasMoreOccurrences,
  nextDueDate,
  parseRecurrenceRule,
  serializeRecurrenceRule
} from '@/domain/recurrence';
import {
  formatReminderLabel,
  inferRemindPreset,
  isReminderPending,
  pendingReminders,
  remindAtFromPreset
} from '@/domain/reminders';
import type { Task } from '@/schemas/task';

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
  due_date: '2026-08-18',
  due_time: '09:00',
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
  remind_at: null,
  remind_dismissed_at: null,
  attachments: [],
  source: 'manual',
  ...partial
});

describe('recurrence', () => {
  it('round-trips JSON rules', () => {
    const rule = defaultRecurrenceRule({ frequency: 'weekly', weekday: 1, count: 5 });
    const raw = serializeRecurrenceRule(rule)!;
    expect(parseRecurrenceRule(raw)?.frequency).toBe('weekly');
    expect(formatRecurrenceLabel(rule)).toContain('week');
  });

  it('advances weekly due dates', () => {
    const rule = defaultRecurrenceRule({ frequency: 'weekly', interval: 1, weekday: 1 });
    expect(nextDueDate('2026-08-18', rule)).toBe('2026-08-25');
  });

  it('respects occurrence limits', () => {
    const rule = defaultRecurrenceRule({ frequency: 'daily', count: 3, completed_count: 2 });
    expect(hasMoreOccurrences(rule)).toBe(false);
    const next = advanceRecurrence(defaultRecurrenceRule({ frequency: 'daily', count: 3 }));
    expect(hasMoreOccurrences(next)).toBe(true);
  });
});

describe('reminders', () => {
  it('computes preset remind times from due date', () => {
    const morning = remindAtFromPreset('morning_of', '2026-08-20', '14:00');
    expect(morning).toBeTruthy();
    expect(inferRemindPreset(morning, '2026-08-20', '14:00')).toBe('morning_of');
  });

  it('lists pending reminders and ignores dismissed ones', () => {
    const now = new Date('2026-08-20T10:00:00.000Z');
    const due = task({
      id: 'a',
      title: 'A',
      remind_at: '2026-08-20T09:00:00.000Z'
    });
    const dismissed = task({
      id: 'b',
      title: 'B',
      remind_at: '2026-08-20T09:00:00.000Z',
      remind_dismissed_at: '2026-08-20T09:30:00.000Z'
    });
    expect(isReminderPending(due, now)).toBe(true);
    expect(isReminderPending(dismissed, now)).toBe(false);
    expect(pendingReminders([due, dismissed], now).map((item) => item.task.id)).toEqual(['a']);
  });

  it('formats reminder labels with display dates', () => {
    const label = formatReminderLabel(task({ id: 'c', title: 'Pack', due_date: '2026-08-20' }));
    expect(label).toBe('Pack · due 20/08/26');
    expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
