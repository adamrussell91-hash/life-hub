import { describe, it, expect } from 'vitest';
import { applyScheduleUnit } from '@/schedule/schedule-unit';
import { reorderScheduledLesson } from '@/schedule/reorder';
import type { Class, ScheduledLesson, Unit } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';
const NOW = '2026-08-08T12:00:00.000Z';
const MEETING_DAYS = [1, 2, 3, 4, 5];
const START = '2026-08-10';
const idFactory = (lessonId: string) => `scheduled_${lessonId}`;

function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class_1',
    type: 'class',
    code: '12ENG1',
    title: 'English',
    slug: '12eng1',
    academic_year: 2026,
    year_id: 'year_12',
    subject_id: 'subject_eng',
    active_unit_ids: [],
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...overrides
  };
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unit_1',
    type: 'unit',
    title: 'Unit 1',
    slug: 'unit-1',
    year_id: 'year_12',
    subject_id: 'subject_eng',
    lesson_ids: ['l1', 'l2', 'l3'],
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...overrides
  };
}

function makeScheduled(
  overrides: Partial<ScheduledLesson> &
    Pick<ScheduledLesson, 'id' | 'lesson_id' | 'schedule_order' | 'date'>
): ScheduledLesson {
  return {
    type: 'scheduled_lesson',
    class_id: 'class_1',
    unit_id: 'unit_1',
    delivery_status: 'planned',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...overrides
  };
}

describe('applyScheduleUnit', () => {
  it('schedules all missing lessons from empty with orders 1-3 and Mon-Wed dates', () => {
    const result = applyScheduleUnit({
      cls: makeClass(),
      unit: makeUnit(),
      existing: [],
      startDate: START,
      meetingDays: MEETING_DAYS,
      nowIso: NOW,
      idFactory
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.created).toHaveLength(3);
    expect(result.created.map((r) => r.lesson_id)).toEqual(['l1', 'l2', 'l3']);
    expect(result.created.map((r) => r.schedule_order)).toEqual([1, 2, 3]);
    expect(result.created.map((r) => r.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12'
    ]);
    expect(result.created.every((r) => r.delivery_status === 'planned')).toBe(true);
    expect(result.class.meeting_days).toEqual(MEETING_DAYS);
    expect(result.class.active_unit_ids).toEqual(['unit_1']);
    expect(result.class.current_unit_id).toBe('unit_1');
    expect(result.class.current_scheduled_lesson_id).toBe('scheduled_l1');
    expect(result.class.updated_at).toBe(NOW);
  });

  it('appends only missing lessons after the current max schedule_order', () => {
    const existing = [
      makeScheduled({
        id: 'scheduled_l1',
        lesson_id: 'l1',
        schedule_order: 5,
        date: '2026-08-01'
      })
    ];

    const result = applyScheduleUnit({
      cls: makeClass({ active_unit_ids: ['unit_1'] }),
      unit: makeUnit(),
      existing,
      startDate: START,
      meetingDays: MEETING_DAYS,
      nowIso: NOW,
      idFactory
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.created).toHaveLength(2);
    expect(result.created.map((r) => r.lesson_id)).toEqual(['l2', 'l3']);
    expect(result.created.map((r) => r.schedule_order)).toEqual([6, 7]);
  });

  it('returns already_scheduled when every unit lesson is scheduled', () => {
    const existing = ['l1', 'l2', 'l3'].map((lessonId, i) =>
      makeScheduled({
        id: `scheduled_${lessonId}`,
        lesson_id: lessonId,
        schedule_order: i + 1,
        date: '2026-08-10'
      })
    );

    const result = applyScheduleUnit({
      cls: makeClass({ active_unit_ids: ['unit_1'] }),
      unit: makeUnit(),
      existing,
      startDate: START,
      meetingDays: MEETING_DAYS,
      nowIso: NOW,
      idFactory
    });

    expect(result).toEqual({
      ok: false,
      code: 'already_scheduled',
      message: 'Already scheduled'
    });
  });
});

describe('reorderScheduledLesson', () => {
  const rows = [
    makeScheduled({ id: 's1', lesson_id: 'l1', schedule_order: 1, date: '2026-08-10' }),
    makeScheduled({ id: 's2', lesson_id: 'l2', schedule_order: 2, date: '2026-08-11' }),
    makeScheduled({ id: 's3', lesson_id: 'l3', schedule_order: 3, date: '2026-08-12' })
  ];

  it('swaps schedule_order with the neighbor when moving up', () => {
    const reordered = reorderScheduledLesson(rows, 's2', 'up');
    expect(reordered.map((r) => [r.id, r.schedule_order])).toEqual([
      ['s1', 2],
      ['s2', 1],
      ['s3', 3]
    ]);
    expect(reordered).not.toBe(rows);
    expect(rows[1].schedule_order).toBe(2);
  });

  it('swaps schedule_order with the neighbor when moving down', () => {
    const reordered = reorderScheduledLesson(rows, 's2', 'down');
    expect(reordered.map((r) => [r.id, r.schedule_order])).toEqual([
      ['s1', 1],
      ['s2', 3],
      ['s3', 2]
    ]);
  });

  it('no-ops at the ends of the schedule', () => {
    expect(reorderScheduledLesson(rows, 's1', 'up')).toBe(rows);
    expect(reorderScheduledLesson(rows, 's3', 'down')).toBe(rows);
  });
});
