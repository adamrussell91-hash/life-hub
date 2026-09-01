import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import {
  classKey,
  draftLessonKey,
  getJSON,
  PUBLISHED_LESSON_PREFIX,
  readPublishedId,
  SCHEDULED_LESSON_PREFIX,
  unitKey
} from './_shared/teaching-blobs.mjs';
import { buildPublishedClass } from './_shared/teaching-student.mjs';

export const config = { path: '/api/published/classes/:id' };

export function createPublishedClassHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Class not found', false), request, env);
    }

    const rawClass = await getJSON(store, classKey(id));
    if (!rawClass || rawClass.status !== 'active') {
      return withCors(errorResponse(404, 'not_found', 'Class not found', false), request, env);
    }

    const { blobs: scheduledBlobs } = await store.list({ prefix: SCHEDULED_LESSON_PREFIX });
    const scheduledRows = await Promise.all(scheduledBlobs.map(blob => getJSON(store, blob.key)));
    const scheduled = scheduledRows.filter(row => row && row.class_id === id);

    const unitIds = new Set(rawClass.active_unit_ids ?? []);
    for (const row of scheduled) unitIds.add(row.unit_id);
    if (rawClass.current_unit_id) unitIds.add(rawClass.current_unit_id);

    const units = [];
    for (const unitId of unitIds) {
      const rawUnit = await getJSON(store, unitKey(unitId));
      if (rawUnit?.id && rawUnit.title) units.push(rawUnit);
    }

    const lessonIds = new Set();
    for (const row of scheduled) lessonIds.add(row.lesson_id);
    if (rawClass.current_unit_id) {
      const currentUnit = units.find(unit => unit.id === rawClass.current_unit_id);
      for (const lessonId of currentUnit?.lesson_ids ?? []) lessonIds.add(lessonId);
    }

    const lessons = [];
    for (const lessonId of lessonIds) {
      const rawLesson = await getJSON(store, draftLessonKey(lessonId));
      if (rawLesson && typeof rawLesson.title === 'string' && rawLesson.title) {
        lessons.push({ id: lessonId, title: rawLesson.title });
      }
    }

    const { blobs: publishedBlobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
    const publishedLessonIds = new Set();
    for (const blob of publishedBlobs) {
      const lessonId = blob.key.slice(PUBLISHED_LESSON_PREFIX.length);
      if (lessonId) publishedLessonIds.add(lessonId);
    }

    return withCors(okResponse(200, buildPublishedClass({
      cls: rawClass,
      units,
      lessons,
      scheduled,
      publishedLessonIds
    })), request, env);
  }, deps);
}

export default createPublishedClassHandler();
