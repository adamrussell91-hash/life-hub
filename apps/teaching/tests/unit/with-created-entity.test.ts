import { describe, expect, it } from 'vitest';
import { withCreatedEntity } from '@/curriculum/with-created-entity';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Class, Subject, Unit } from '@/schemas';

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

const createdClass: Class = {
  id: 'class_msx1i8y1_nquvxt',
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

const createdUnit: Unit = {
  id: 'unit_msx1j01o_b4ojmq',
  type: 'unit',
  title: 'Cognitive Load',
  slug: 'cognitive-load',
  year_id: 'year_12',
  subject_id: 'subject_psych',
  lesson_ids: [],
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const createdSubject: Subject = {
  id: 'subject_psych',
  type: 'subject',
  title: 'Usability Psychology',
  display_title: 'Usability Psychology',
  slug: 'usability-psychology',
  unit_ids: [],
  outcome_ids: [],
  class_ids: [],
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

describe('withCreatedEntity', () => {
  it('inserts a class that curriculum GET omitted', () => {
    const curriculum = emptyCurriculum();
    expect(curriculum.classes.find((row) => row.id === createdClass.id)).toBeUndefined();

    const next = withCreatedEntity(curriculum, 'class', createdClass);
    expect(next.classes.find((row) => row.id === createdClass.id)?.title).toBe('11 Psych A');
  });

  it('inserts a unit that curriculum GET omitted', () => {
    const next = withCreatedEntity(emptyCurriculum(), 'unit', createdUnit);
    expect(next.units.find((row) => row.id === createdUnit.id)?.title).toBe('Cognitive Load');
  });

  it('does not duplicate an entity that is already listed', () => {
    const curriculum = emptyCurriculum({ classes: [createdClass] });
    const next = withCreatedEntity(curriculum, 'class', createdClass);
    expect(next.classes).toHaveLength(1);
  });

  it('inserts a subject into the catalogue', () => {
    const next = withCreatedEntity(emptyCurriculum(), 'subject', createdSubject);
    expect(next.subjects.map((row) => row.id)).toEqual(['subject_psych']);
  });
});
