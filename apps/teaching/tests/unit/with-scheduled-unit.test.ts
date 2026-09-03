import { describe, expect, it } from 'vitest';
import { withScheduledUnit } from '@/curriculum/with-scheduled-unit';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Class, ScheduledLesson } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

function emptyCurriculum(overrides: Partial<CurriculumResponse> = {}): CurriculumResponse {
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
    ...overrides
  };
}

const classRow: Class = {
  id: 'class_msx33so9_jypoua',
  type: 'class',
  title: '11 Retrieve A',
  slug: '11-retrieve-a',
  code: '11RETA',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_retrieval',
  active_unit_ids: [],
  homepage: { announcements: [], resources: [], custom: [] },
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const scheduled: ScheduledLesson = {
  id: 'scheduled_new',
  type: 'scheduled_lesson',
  class_id: classRow.id,
  unit_id: 'unit_testing_effect',
  lesson_id: 'lesson_retrieval',
  date: '2026-08-17',
  schedule_order: 1,
  delivery_status: 'planned',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

describe('withScheduledUnit', () => {
  it('inserts scheduled lessons that curriculum GET omitted', () => {
    const curriculum = emptyCurriculum({
      classes: [{ ...classRow, active_unit_ids: [] }]
    });
    const updatedClass = { ...classRow, active_unit_ids: ['unit_testing_effect'] };

    const next = withScheduledUnit(curriculum, {
      class: updatedClass,
      scheduled_lessons: [scheduled]
    });

    expect(next.scheduled_lessons.find((row) => row.id === scheduled.id)?.date).toBe(
      '2026-08-17'
    );
    expect(next.classes[0]?.active_unit_ids).toEqual(['unit_testing_effect']);
  });

  it('does not duplicate a scheduled lesson that is already listed', () => {
    const curriculum = emptyCurriculum({
      classes: [classRow],
      scheduled_lessons: [scheduled]
    });
    const next = withScheduledUnit(curriculum, {
      class: classRow,
      scheduled_lessons: [scheduled]
    });
    expect(next.scheduled_lessons).toHaveLength(1);
  });
});
