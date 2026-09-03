import { DEFAULT_PEDAGOGICAL_MODE } from '@/curriculum/pedagogical-mode';
import type { CurriculumResponse } from '@/teacher/nav';
import { postLesson } from '@/teacher/create/api';
import { openCreateModal } from '@/teacher/create/modal';
import type { EntityCreatedHandler } from '@/teacher/create/types';

export function openBlankLesson(options: {
  curriculum: CurriculumResponse;
  onCreated: EntityCreatedHandler;
  unitId?: string;
}): void {
  const unitId = options.unitId?.trim();
  if (unitId) {
    void createBlankLessonWithUnit({ ...options, unitId });
    return;
  }

  openCreateModal({
    kind: 'lesson',
    curriculum: options.curriculum,
    onCreated: options.onCreated
  });
}

async function createBlankLessonWithUnit(options: {
  curriculum: CurriculumResponse;
  onCreated: EntityCreatedHandler;
  unitId: string;
}): Promise<void> {
  try {
    const created = await postLesson({
      title: 'Untitled lesson',
      unit_id: options.unitId,
      pedagogical_mode: DEFAULT_PEDAGOGICAL_MODE
    });
    void options.onCreated('lesson', created.id, created);
  } catch {
    openCreateModal({
      kind: 'lesson',
      curriculum: options.curriculum,
      onCreated: options.onCreated
    });
  }
}
