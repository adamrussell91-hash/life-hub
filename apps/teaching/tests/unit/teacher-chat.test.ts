import { describe, expect, it } from 'vitest';
import { pickChatLessonId } from '@/teacher/chat';
import type { CurriculumResponse } from '@/teacher/nav';

function curriculum(partial: Partial<CurriculumResponse> = {}): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes: [],
    scheduled_lessons: [],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-12',
    ...partial
  };
}

describe('pickChatLessonId', () => {
  it('prefers today’s scheduled lesson', () => {
    const id = pickChatLessonId(
      curriculum({
        lessons: [{ id: 'old' }, { id: 'today' }] as CurriculumResponse['lessons'],
        scheduled_lessons: [
          { lesson_id: 'old', date: '2026-08-10' },
          { lesson_id: 'today', date: '2026-08-12' }
        ] as CurriculumResponse['scheduled_lessons']
      }),
      '2026-08-12'
    );
    expect(id).toBe('today');
  });

  it('falls back to the first lesson when nothing is scheduled', () => {
    const id = pickChatLessonId(
      curriculum({
        lessons: [{ id: 'only' }] as CurriculumResponse['lessons']
      }),
      '2026-08-12'
    );
    expect(id).toBe('only');
  });

  it('returns null when the hub has no lessons', () => {
    expect(pickChatLessonId(curriculum(), '2026-08-12')).toBeNull();
  });
});
