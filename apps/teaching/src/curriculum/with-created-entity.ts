import type { CreateKind, CreatedRecord } from '@/teacher/create/types';
import type { Class, Lesson, ScopeSequence, Subject, Unit } from '@/schemas';
import { toCurriculumLessonSummary } from '@/curriculum/lesson-summary';
import type { CurriculumResponse } from '@/teacher/nav';

export type { CreatedRecord };

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  if (list.some((entry) => entry.id === row.id)) return list;
  return [...list, row];
}

export function withCreatedEntity(
  curriculum: CurriculumResponse,
  kind: CreateKind,
  entity: CreatedRecord
): CurriculumResponse {
  switch (kind) {
    case 'class':
      return {
        ...curriculum,
        classes: upsertById(curriculum.classes, entity as Class)
      };
    case 'unit':
      return {
        ...curriculum,
        units: upsertById(curriculum.units, entity as Unit)
      };
    case 'subject':
      return {
        ...curriculum,
        subjects: upsertById(curriculum.subjects, entity as Subject)
      };
    case 'lesson':
      return {
        ...curriculum,
        lessons: upsertById(
          curriculum.lessons,
          toCurriculumLessonSummary(entity as Lesson, false)
        )
      };
    case 'scope_sequence':
      return {
        ...curriculum,
        scope_sequences: upsertById(curriculum.scope_sequences, entity as ScopeSequence)
      };
  }
}
