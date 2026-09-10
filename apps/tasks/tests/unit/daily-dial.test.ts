import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import {
  assignLanes,
  closestOccupiedHour,
  dialLegendForDomains,
  dialTintForDomain,
  eventsFromTasks,
  eventsInHour,
  fisheyeBoundaries,
  fisheyeTargetWidths,
  formatDialTime,
  hourCaption,
  hourOccupancy,
  parseDueTimeHours
} from '@/domain/daily-dial';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
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
    due_date: '2026-08-30',
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

describe('daily dial mapping', () => {
  it('parses HH:MM due times as decimal hours', () => {
    expect(parseDueTimeHours('09:00')).toBe(9);
    expect(parseDueTimeHours('13:30')).toBe(13.5);
    expect(parseDueTimeHours('24:00')).toBeNull();
    expect(parseDueTimeHours(null)).toBeNull();
  });

  it('places timed tasks at due_time and packs untimed work from 9 AM', () => {
    const events = eventsFromTasks(
      [
        task({ id: 't1', title: 'Standup', due_time: '09:00', estimated_duration: 30 }),
        task({ id: 't2', title: 'Notes', estimated_duration: 45 }),
        task({ id: 't3', title: 'Run', domain: 'health', due_time: '18:30', estimated_duration: 45 })
      ],
      '2026-08-30'
    );
    expect(events).toHaveLength(3);
    const standup = events.find((event) => event.id === 'task:t1')!;
    const notes = events.find((event) => event.id === 'task:t2')!;
    const run = events.find((event) => event.id === 'task:t3')!;
    expect(standup.start).toBe(9);
    expect(standup.end).toBe(9.5);
    expect(standup.timed).toBe(true);
    expect(notes.timed).toBe(false);
    expect(notes.start).toBe(9.5);
    expect(notes.end).toBe(10.25);
    expect(run.start).toBe(18.5);
    expect(run.cat).toBe('lilac');
  });

  it('maps domains to the same tints as the calendar chips', () => {
    expect(dialTintForDomain('teaching')).toBe('blue');
    expect(dialTintForDomain('life')).toBe('gold');
    expect(dialTintForDomain('wedding')).toBe('peach');
    expect(dialTintForDomain('health')).toBe('lilac');
    expect(dialTintForDomain('other')).toBe('sage');
  });

  it('builds the dial legend from the live Properties domains only', () => {
    const legend = dialLegendForDomains([
      { id: 'teaching', label: 'teaching' },
      { id: 'life', label: 'life' },
      { id: 'health', label: 'health' },
      { id: 'other', label: 'other' }
    ]);
    expect(legend.map((item) => item.label)).toEqual(['Teaching', 'Life', 'Health', 'Other']);
    expect(legend.some((item) => item.label === 'Wedding')).toBe(false);
  });

  it('keeps fisheye widths summing to 360', () => {
    const even = fisheyeTargetWidths(24, null);
    expect(even.reduce((sum, width) => sum + width, 0)).toBeCloseTo(360);
    const focused = fisheyeTargetWidths(24, 9);
    expect(focused[9]).toBe(150);
    expect(focused.reduce((sum, width) => sum + width, 0)).toBeCloseTo(360);
    const bounds = fisheyeBoundaries(focused);
    expect(bounds).toHaveLength(25);
    expect(bounds[0]).toBe(-90);
    expect(bounds[24]).toBeCloseTo(270);
  });

  it('assigns overlapping clips to concentric lanes', () => {
    const { items, laneCount } = assignLanes([
      { start: 0, end: 0.5, id: 'a' },
      { start: 0.25, end: 0.75, id: 'b' },
      { start: 0.8, end: 1, id: 'c' }
    ]);
    expect(laneCount).toBe(2);
    expect(items.find((item) => item.id === 'a')?.lane).toBe(0);
    expect(items.find((item) => item.id === 'b')?.lane).toBe(1);
    expect(items.find((item) => item.id === 'c')?.lane).toBe(0);
  });

  it('finds the closest occupied hour and occupancy colour', () => {
    const events = eventsFromTasks(
      [task({ id: 't1', title: 'Deep work', due_time: '10:00', estimated_duration: 120 })],
      '2026-08-30'
    );
    expect(closestOccupiedHour(events, 8)).toBe(10);
    expect(closestOccupiedHour(events, 11)).toBe(11);
    expect(closestOccupiedHour(events, 13)).toBe(11);
    const occ = hourOccupancy(events);
    expect(occ[10]?.occ).toBe(1);
    expect(occ[10]?.cat).toBe('blue');
    expect(eventsInHour(events, 10)).toHaveLength(1);
    expect(eventsInHour(events, 9)).toHaveLength(0);
  });

  it('formats hour captions for the rim', () => {
    expect(hourCaption(0)).toBe('12 AM');
    expect(hourCaption(12)).toBe('12 PM');
    expect(hourCaption(15)).toBe('3 PM');
    expect(formatDialTime(9.5)).toBe('9:30 AM');
  });
});
