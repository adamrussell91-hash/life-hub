import { afterEach, describe, expect, it } from 'vitest';
import { buildExcursionPlan } from '@/domain/excursion';
import {
  hubCalendarDate,
  hubClockParts,
  hubWeekdayLong,
  parseDue,
  tasksForDay,
  toDateKey,
  toHubDateKey,
  weekDays
} from '@/domain/queries';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';

const ethics: ExcursionTemplate = {
  schema_version: 1,
  id: 'ext_ethics_olympiad',
  name: 'Ethics Olympiad',
  default_lead_times: {
    permission_note_days: 21,
    staff_email_days: 21,
    risk_assessment_days: 42,
    payment_days: 28
  },
  checklist_items: ['Student list finalised']
};

function datedTask(id: string, due: string): Task {
  return {
    schema_version: 1,
    id,
    title: id,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: due,
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
    source: 'manual'
  };
}

describe('date-only calendar keys', () => {
  const previousTz = process.env.TZ;

  afterEach(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  it('round-trips YYYY-MM-DD in Australia/Sydney', () => {
    process.env.TZ = 'Australia/Sydney';
    const parsed = parseDue('2026-10-05');
    expect(parsed).not.toBeNull();
    expect(toDateKey(parsed!)).toBe('2026-10-05');
    expect(toDateKey(new Date(2026, 9, 5))).toBe('2026-10-05');
  });

  it('round-trips YYYY-MM-DD in America/Los_Angeles', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(toDateKey(parseDue('2026-08-21')!)).toBe('2026-08-21');
  });

  it('keeps excursion event_date on the picked calendar day', () => {
    process.env.TZ = 'Australia/Sydney';
    const plan = buildExcursionPlan(ethics, {
      title: 'Ethics heat',
      event_date: '2026-10-05'
    });
    expect(plan.event_date).toBe('2026-10-05');
    expect(plan.key_dates.permission_note_due).toBe('2026-09-14');
  });

  it('places a Friday due date in the Friday week column', () => {
    process.env.TZ = 'Australia/Sydney';
    const friday = parseDue('2026-08-21')!;
    const days = weekDays(friday);
    const keys = days.map(toDateKey);
    expect(keys).toContain('2026-08-21');
    const column = days.find((d) => toDateKey(d) === '2026-08-21')!;
    const matches = tasksForDay([datedTask('task_today', '2026-08-21')], column);
    expect(matches.map((t) => t.id)).toEqual(['task_today']);
  });

  it('still parses ISO timestamps as instants', () => {
    const stamp = parseDue('2026-06-01T00:00:00.000Z');
    expect(stamp?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('hub (Sydney) calendar day from an instant', () => {
  const previousTz = process.env.TZ;

  afterEach(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  it('uses Australia/Sydney even when the process is on UTC', () => {
    process.env.TZ = 'UTC';
    // Saturday 29 Aug 2026 22:05 UTC = Sunday 30 Aug 08:05 AEST
    const instant = new Date('2026-08-29T22:05:00.000Z');
    expect(toDateKey(instant)).toBe('2026-08-29');
    expect(toHubDateKey(instant)).toBe('2026-08-30');
    expect(hubWeekdayLong(instant)).toBe('Sunday');
    expect(toDateKey(hubCalendarDate(instant))).toBe('2026-08-30');
    const clock = hubClockParts(instant);
    expect(clock.dateKey).toBe('2026-08-30');
    expect(clock.weekday).toBe('Sunday');
    expect(clock.hour).toBe(8);
    expect(clock.minute).toBe(5);
  });

  it('stays on the same Sydney day when the process is already Sydney', () => {
    process.env.TZ = 'Australia/Sydney';
    const instant = new Date('2026-08-29T22:05:00.000Z');
    expect(toHubDateKey(instant)).toBe('2026-08-30');
    expect(hubWeekdayLong(instant)).toBe('Sunday');
  });
});
