import { describe, expect, it } from 'vitest';
import type { LessonLibraryRow } from '@/teacher/lessons-library/types';
import { lessonHealthFlags, lessonsNeedingAttention } from '@/teacher/lessons-library/health';

const NOW = new Date('2026-08-15T00:00:00.000Z');

const base: LessonLibraryRow = {
  id: 'l1',
  title: 'Draft intro',
  slug: 'draft',
  unit_id: 'u1',
  sequence: 1,
  status: 'active',
  published: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  attachment_count: 0
};

describe('lesson health', () => {
  it('flags stale drafts, missing resources, and long-untouched lessons', () => {
    const flags = lessonHealthFlags(base, NOW, new Set());
    expect(flags).toEqual(expect.arrayContaining(['draft_stale', 'missing_resources', 'stale']));
  });

  it('does not flag a recently edited published lesson with resources', () => {
    const flags = lessonHealthFlags(
      {
        ...base,
        published: true,
        updated_at: '2026-08-10T00:00:00.000Z',
        attachment_count: 2
      },
      NOW,
      new Set(['l1'])
    );
    expect(flags).toEqual([]);
  });

  it('collects lessons that need attention', () => {
    const ids = lessonsNeedingAttention([base], NOW, new Set());
    expect([...ids]).toEqual(['l1']);
  });
});
