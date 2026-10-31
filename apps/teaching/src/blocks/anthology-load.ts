/**
 * The unit's Anthology map for a block that sits in a lesson: the unit's tagged notes and its
 * class additions. A unit page already has these; a lesson fetches them once it is open.
 */
import { apiGet } from '@/api/client';
import { getCurriculum } from '@/app/curriculum-state';
import { collectAnthology, type AnthologyData, type AnthologySnapshot } from '@/blocks/anthology-collect';
import {
  studentKnowledgeApi,
  teacherKnowledgeApi,
  type KnowledgeApi
} from '@/blocks/anthology-knowledge';
import { filterBlocksForStudent } from '@/blocks/visibility';
import type { Lesson } from '@/schemas';
import type { PublishedUnit } from '@/schemas/published-unit';

export type UnitAnthology = { data: AnthologyData; knowledge?: KnowledgeApi };

/** Each of the unit's lessons as the anthology reads it: student-visible blocks, published or not. */
export async function gatherTeacherAnthology(
  lessonIds: readonly string[],
  summaries: ReadonlyArray<{ id: string; published?: boolean }>
): Promise<AnthologySnapshot[]> {
  const snapshots: AnthologySnapshot[] = [];
  await Promise.all(
    lessonIds.map(async (lessonId) => {
      try {
        const lesson = await apiGet<Lesson>(`/api/lessons/${lessonId}`);
        snapshots.push({
          lesson_id: lessonId,
          lesson_title: lesson.title,
          published: summaries.find((row) => row.id === lessonId)?.published === true,
          blocks: filterBlocksForStudent(lesson.blocks ?? [])
        });
      } catch {
        // A lesson that fails to load leaves its notes off the map.
      }
    })
  );
  return snapshots;
}

const studentCache = new Map<string, Promise<UnitAnthology>>();

/** What a student sees: the published unit's notes and the shown class additions. */
export function studentUnitAnthology(unitId: string): Promise<UnitAnthology> {
  let found = studentCache.get(unitId);
  if (!found) {
    found = apiGet<PublishedUnit>(`/api/published/units/${encodeURIComponent(unitId)}`).then((unit) => ({
      data: unit.anthology ?? { items: [], texts: [] },
      knowledge: studentKnowledgeApi(unitId)
    }));
    found.catch(() => studentCache.delete(unitId));
    studentCache.set(unitId, found);
  }
  return found;
}

/** What the teacher sees in the lesson editor: every lesson's notes, as on the unit page. */
export async function teacherUnitAnthology(unitId: string): Promise<UnitAnthology> {
  const curriculum = await getCurriculum();
  const unit = curriculum.units.find((row) => row.id === unitId);
  const lessonIds = unit?.lesson_ids ?? [];
  const snapshots = await gatherTeacherAnthology(lessonIds, curriculum.lessons);
  return {
    data: collectAnthology(snapshots, { includeUnpublished: true, lessonOrder: lessonIds }),
    knowledge: teacherKnowledgeApi(unitId)
  };
}
