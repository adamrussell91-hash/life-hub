import { describe, expect, it } from 'vitest';
import type { LessonLibraryRow } from '@/teacher/lessons-library/types';
import { findNearDuplicates } from '@/teacher/lessons-library/duplicates';

function row(id: string, title: string, excerpt: string, unit_id = 'u1'): LessonLibraryRow {
  return {
    id,
    title,
    slug: id,
    unit_id,
    sequence: 1,
    status: 'active',
    published: false,
    updated_at: '2026-01-01T00:00:00.000Z',
    excerpt
  };
}

describe('near-duplicate lessons', () => {
  it('pairs lessons with highly overlapping titles and excerpts', () => {
    const pairs = findNearDuplicates([
      row('a', 'Introduction to Hale', 'Guilt and memory in an the lantern keeper'),
      row('b', 'Intro to Hale', 'Guilt and memory in an the lantern keeper'),
      row('c', 'Hamlet essay', 'Revenge tragedy and delay in Elsinore')
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.ids.sort()).toEqual(['a', 'b']);
  });
});
