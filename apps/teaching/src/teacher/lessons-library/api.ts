import { apiGet, apiPatch, apiPut } from '@/api/client';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import type { Lesson } from '@/schemas/lesson';
import { postLesson } from '@/teacher/create/api';
import type { LessonLibraryPatch } from '@/lessons/library-patch';

export function getLesson(id: string): Promise<Lesson> {
  return apiGet(`/api/lessons/${id}`);
}

export function patchLessonLibrary(id: string, body: LessonLibraryPatch): Promise<Lesson> {
  return apiPatch(`/api/lessons/${id}`, body);
}

export async function duplicateLesson(id: string): Promise<Lesson> {
  const source = await getLesson(id);
  const created = await postLesson({
    title: `${source.title} (copy)`,
    unit_id: source.unit_id
  });
  const copy: Lesson = {
    ...created,
    blocks: cloneBlocksWithNewIds(source.blocks),
    tags: source.tags,
    review_status: source.review_status === 'needs_review' ? 'none' : source.review_status,
    syllabus_outcomes: source.syllabus_outcomes,
    outcome_ids: source.outcome_ids,
    pedagogical_mode: source.pedagogical_mode,
    updated_at: new Date().toISOString()
  };
  return apiPut(`/api/lessons/${created.id}`, copy);
}
