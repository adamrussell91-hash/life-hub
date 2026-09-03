import { describe, expect, it } from 'vitest';
import { coverageGaps } from '@/teacher/lessons-library/syllabus';
import type { LessonLibraryRow } from '@/teacher/lessons-library/types';

describe('syllabus gap analysis', () => {
  it('reports outcomes with no tagged lessons', () => {
    const lessons: LessonLibraryRow[] = [
      {
        id: 'l1',
        title: 'Common module',
        slug: 'cm',
        unit_id: 'u1',
        sequence: 1,
        status: 'active',
        published: true,
        updated_at: '2026-01-01T00:00:00.000Z',
        syllabus_outcomes: ['EA12-1']
      }
    ];
    const gaps = coverageGaps(lessons);
    expect(gaps.some((gap) => gap.id === 'EA12-1')).toBe(false);
    expect(gaps.length).toBeGreaterThan(0);
  });
});
