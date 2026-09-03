import {
  draftLessonKey,
  getJSON,
  newId,
  setJSON,
  slugify,
  unitKey
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/lessons' };

export async function createLessonRecord(store, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const unit_id = typeof body.unit_id === 'string' ? body.unit_id : '';
  const pedagogical_mode = typeof body.pedagogical_mode === 'string'
    ? body.pedagogical_mode
    : 'direct';

  if (!title || !unit_id) {
    throw teachingWriteError(400, 'validation_error', 'title and unit_id are required');
  }

  const unit = await getJSON(store, unitKey(unit_id));
  if (!unit) throw teachingWriteError(404, 'not_found', 'Unit not found');

  const lessonIds = Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [];
  let maxSequence = 0;
  for (const lessonId of lessonIds) {
    const lesson = await getJSON(store, draftLessonKey(lessonId));
    if (typeof lesson?.sequence === 'number' && lesson.sequence > maxSequence) {
      maxSequence = lesson.sequence;
    }
  }

  const timestamp = new Date().toISOString();
  const id = newId('lesson');
  const record = {
    id,
    type: 'lesson',
    title,
    slug: slugify(title),
    unit_id,
    sequence: maxSequence + 1,
    blocks: [],
    pedagogical_mode,
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };

  await setJSON(store, draftLessonKey(id), record);
  await setJSON(store, unitKey(unit_id), {
    ...unit,
    lesson_ids: [...lessonIds, id],
    updated_at: timestamp
  });
  return record;
}

export function createLessonsHandler(deps = {}) {
  return createTeachingCollectionHandler({ create: createLessonRecord }, deps);
}

export default createLessonsHandler();
