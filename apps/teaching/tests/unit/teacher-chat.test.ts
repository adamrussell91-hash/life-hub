import { describe, expect, it } from 'vitest';
import { chatLessonOptions, pickChatLessonId } from '@/teacher/chat';
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

describe('chatLessonOptions', () => {
  const lesson = (id: string, title: string, status = 'active') =>
    ({ id, title, status, slug: id, unit_id: 'u', sequence: 1, published: false, updated_at: '' });

  it('lists live lessons by title so any lesson can be chosen', () => {
    const options = chatLessonOptions(
      curriculum({
        lessons: [
          lesson('b', 'The Remedy of Butterflies'),
          lesson('a', 'Untitled lesson'),
          lesson('t', 'Old', 'trashed')
        ]
      }),
      'a'
    );
    expect(options.map((o) => o.id)).toEqual(['b', 'a']);
  });
});
