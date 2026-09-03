import { describe, expect, it } from 'vitest';
import { withEntityStatus } from '@/curriculum/with-entity-status';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Class } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const classRow: Class = {
  id: 'class_1',
  type: 'class',
  title: '11 Psych A',
  slug: '11-psych-a',
  code: '11PSYCHA',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_psych',
  active_unit_ids: [],
  homepage: { announcements: [], resources: [], custom: [] },
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

function curriculum(overrides: Partial<CurriculumResponse> = {}): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes: [classRow],
    scheduled_lessons: [],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-12',
    ...overrides
  };
}

describe('withEntityStatus', () => {
  it('marks a class trashed so active lists drop it', () => {
    const next = withEntityStatus(curriculum(), 'class', 'class_1', 'trashed');
    expect(next.classes[0]?.status).toBe('trashed');
    expect(next.classes[0]?.previous_status).toBe('active');
    expect(next.classes[0]?.trashed_at).toBeTruthy();
  });

  it('marks a class archived', () => {
    const next = withEntityStatus(curriculum(), 'class', 'class_1', 'archived');
    expect(next.classes[0]?.status).toBe('archived');
  });

  it('leaves unknown ids unchanged', () => {
    const current = curriculum();
    const next = withEntityStatus(current, 'class', 'missing', 'trashed');
    expect(next.classes).toEqual(current.classes);
  });
});
