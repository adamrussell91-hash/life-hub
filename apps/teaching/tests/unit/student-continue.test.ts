import { describe, it, expect } from 'vitest';
import { pickStudentContinue } from '@/student/continue';
import type { PublishedClassScheduleRow } from '@/student/published-class';

function row(
  overrides: Partial<PublishedClassScheduleRow> & Pick<PublishedClassScheduleRow, 'id'>
): PublishedClassScheduleRow {
  return {
    date: '2026-08-12',
    schedule_order: 1,
    lesson_id: 'lesson_a',
    unit_id: 'unit_a',
    title: 'Lesson A',
    published: true,
    ...overrides
  };
}

describe('pickStudentContinue', () => {
  it('prefers a published lesson dated today', () => {
    const schedule = [
      row({ id: 'past', date: '2026-08-11', lesson_id: 'lesson_past', title: 'Past' }),
      row({
        id: 'today',
        date: '2026-08-15',
        lesson_id: 'lesson_today',
        title: 'Today',
        schedule_order: 2
      }),
      row({
        id: 'later',
        date: '2026-08-18',
        lesson_id: 'lesson_later',
        title: 'Later',
        schedule_order: 3
      })
    ];
    expect(pickStudentContinue(schedule, '2026-08-15')?.lesson_id).toBe('lesson_today');
  });

  it('skips unpublished rows when choosing today', () => {
    const schedule = [
      row({
        id: 'today-draft',
        date: '2026-08-15',
        lesson_id: 'lesson_draft',
        title: 'Draft',
        published: false
      }),
      row({
        id: 'next',
        date: '2026-08-16',
        lesson_id: 'lesson_next',
        title: 'Next'
      })
    ];
    expect(pickStudentContinue(schedule, '2026-08-15')?.lesson_id).toBe('lesson_next');
  });

  it('falls forward to the next published lesson', () => {
    const schedule = [
      row({ id: 'later', date: '2026-08-20', lesson_id: 'lesson_later', title: 'Later' })
    ];
    expect(pickStudentContinue(schedule, '2026-08-15')?.lesson_id).toBe('lesson_later');
  });

  it('falls back to the most recent published lesson', () => {
    const schedule = [
      row({ id: 'old', date: '2026-08-01', lesson_id: 'lesson_old', title: 'Old' }),
      row({
        id: 'recent',
        date: '2026-08-10',
        lesson_id: 'lesson_recent',
        title: 'Recent',
        schedule_order: 2
      }),
      row({
        id: 'draft',
        date: '2026-08-14',
        lesson_id: 'lesson_draft',
        title: 'Draft',
        published: false,
        schedule_order: 3
      })
    ];
    expect(pickStudentContinue(schedule, '2026-08-15')?.lesson_id).toBe('lesson_recent');
  });

  it('returns null when nothing is published', () => {
    const schedule = [
      row({ id: 'draft', published: false, lesson_id: 'lesson_draft', title: 'Draft' })
    ];
    expect(pickStudentContinue(schedule, '2026-08-15')).toBeNull();
  });
});
