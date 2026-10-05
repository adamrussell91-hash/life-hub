import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import {
  deleteKey,
  draftLessonKey,
  getJSON,
  listJSON,
  publishedLessonKey,
  SCHEDULED_LESSON_PREFIX,
  scheduledLessonKey,
  setJSON,
  unitKey
} from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/lessons/:id' };

/**
 * Permanent delete removes everything students or schedules could still reach:
 * the published snapshot, every scheduled slot, and its place in the unit order.
 */
export async function purgeLessonArtifacts(store, id, record) {
  await deleteKey(store, publishedLessonKey(id));
  const unitId = typeof record?.unit_id === 'string' ? record.unit_id : '';
  const unit = unitId ? await getJSON(store, unitKey(unitId)) : null;
  if (unit && Array.isArray(unit.lesson_ids) && unit.lesson_ids.includes(id)) {
    await setJSON(store, unitKey(unitId), {
      ...unit,
      lesson_ids: unit.lesson_ids.filter(lessonId => lessonId !== id),
      updated_at: new Date().toISOString()
    });
  }
  const rows = await listJSON(store, SCHEDULED_LESSON_PREFIX);
  for (const row of rows) {
    if (row?.lesson_id === id && typeof row.id === 'string') {
      await deleteKey(store, scheduledLessonKey(row.id));
    }
  }
}

export function createLessonHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: draftLessonKey,
    notFound: 'Lesson not found',
    versionKind: 'lesson',
    onDelete: purgeLessonArtifacts
  }, deps);
}

export default createLessonHandler();
