import { describe, expect, it } from 'vitest';
import { firstTaughtDates, lessonsByDate } from '@/teacher/unit-lesson-order';

const slot = (lesson_id: string, date: string, delivery_status: 'planned' | 'skipped' = 'planned') => ({
  lesson_id,
  date,
  delivery_status
});

describe('lessonsByDate', () => {
  it('puts dated lessons in date order ahead of undated ones', () => {
    const lessons = [
      { id: 'a', sequence: 1 },
      { id: 'b', sequence: 2 },
      { id: 'c', sequence: 3 },
      { id: 'd', sequence: 4 }
    ];
    const slots = [slot('c', '2026-10-20'), slot('a', '2026-10-28'), slot('a', '2026-10-21')];
    expect(lessonsByDate(lessons, slots).map((l) => l.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('uses the earliest class date and ignores skipped slots', () => {
    const slots = [slot('x', '2026-10-01', 'skipped'), slot('x', '2026-11-05'), slot('x', '2026-11-03')];
    expect(firstTaughtDates(slots).get('x')).toBe('2026-11-03');
  });

  it('keeps saved order for two lessons on the same day', () => {
    const lessons = [
      { id: 'late', sequence: 5 },
      { id: 'early', sequence: 2 }
    ];
    const slots = [slot('late', '2026-10-20'), slot('early', '2026-10-20')];
    expect(lessonsByDate(lessons, slots).map((l) => l.id)).toEqual(['early', 'late']);
  });
});
