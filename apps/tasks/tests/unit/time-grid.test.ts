import { describe, expect, it } from 'vitest';
import {
  hoursFromOffset,
  hoursToDueTime,
  layoutTimedBlocks,
  parseGoToDate,
  snapHours,
  splitDayItems
} from '@/domain/time-grid';
import type { CalendarItem } from '@/domain/calendar';
import type { Task } from '@/schemas/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
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
    due_date: '2026-08-17',
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

function item(partial: Partial<CalendarItem> & Pick<CalendarItem, 'id' | 'title'>): CalendarItem {
  return {
    kind: 'task',
    date_key: '2026-08-17',
    domain: 'teaching',
    priority: 'medium',
    status: 'open',
    project_id: null,
    project_title: null,
    subtitle: null,
    task: null,
    movable: true,
    ...partial
  };
}

describe('time grid', () => {
  it('snaps click offsets to quarter hours and writes HH:MM', () => {
    expect(hoursToDueTime(9)).toBe('09:00');
    expect(hoursToDueTime(13.5)).toBe('13:30');
    expect(snapHours(9.2)).toBe(9.25);
    expect(hoursFromOffset(52, 52, 6)).toBe(7);
  });

  it('keeps untimed work in the all-day row and lanes overlapping timed blocks', () => {
    const gym = item({
      id: 'task:gym',
      title: 'Gym',
      task: task({ id: 'gym', title: 'Gym', due_time: '12:00', estimated_duration: 120 })
    });
    const lunch = item({
      id: 'task:lunch',
      title: 'Lunch',
      task: task({ id: 'lunch', title: 'Lunch', due_time: '12:30', estimated_duration: 90 })
    });
    const note = item({
      id: 'task:note',
      title: 'Permission note',
      task: task({ id: 'note', title: 'Permission note' })
    });
    const split = splitDayItems([gym, lunch, note]);
    expect(split.allDay.map((entry) => entry.title)).toEqual(['Permission note']);
    const blocks = layoutTimedBlocks(split.timed);
    expect(blocks).toHaveLength(2);
    expect(blocks.some((block) => block.lane === 1)).toBe(true);
    expect(Math.max(...blocks.map((block) => block.lanes))).toBe(2);
  });

  it('parses go-to-date from ISO, dd/mm/yy, and today', () => {
    const today = new Date(2026, 7, 17);
    expect(parseGoToDate('2026-08-19', today)?.getDate()).toBe(19);
    expect(parseGoToDate('19/08/26', today)?.getMonth()).toBe(7);
    expect(parseGoToDate('today', today)?.getDate()).toBe(17);
    expect(parseGoToDate('tomorrow', today)?.getDate()).toBe(18);
    expect(parseGoToDate('nope', today)).toBeNull();
  });
});
