import {
  classKey,
  draftLessonKey,
  getJSON,
  listJSON,
  newId,
  SCHEDULED_LESSON_PREFIX,
  scheduledLessonKey,
  setJSON
} from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler, teachingWriteError } from './_shared/teaching-create.mjs';

export const config = { path: '/api/scheduled-lessons' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createScheduledLessonRecord(store, body) {
  const class_id = typeof body.class_id === 'string' ? body.class_id.trim() : '';
  const lesson_id = typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';

  if (!class_id || !lesson_id || !DATE_RE.test(date)) {
    throw teachingWriteError(400, 'validation_error', 'class_id, lesson_id, and date (YYYY-MM-DD) are required');
  }

  const cls = await getJSON(store, classKey(class_id));
  if (!cls) throw teachingWriteError(404, 'not_found', 'Class not found');

  const lesson = await getJSON(store, draftLessonKey(lesson_id));
  if (!lesson) throw teachingWriteError(404, 'not_found', 'Lesson not found');

  const unit_id = typeof body.unit_id === 'string' && body.unit_id.trim()
    ? body.unit_id.trim()
    : typeof lesson.unit_id === 'string' ? lesson.unit_id : '';
  if (!unit_id) {
    throw teachingWriteError(400, 'validation_error', 'unit_id is required');
  }

  const existing = (await listJSON(store, SCHEDULED_LESSON_PREFIX))
    .filter(item => item.class_id === class_id);
  let maxOrder = 0;
  for (const item of existing) {
    if (typeof item.schedule_order === 'number' && item.schedule_order > maxOrder) {
      maxOrder = item.schedule_order;
    }
  }

  const startTime = typeof body.start_time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.start_time)
    ? body.start_time
    : undefined;

  const timestamp = new Date().toISOString();
  const id = newId('sched');
  const record = {
    id,
    type: 'scheduled_lesson',
    class_id,
    lesson_id,
    unit_id,
    date,
    ...(startTime ? { start_time: startTime } : {}),
    schedule_order: maxOrder + 1,
    delivery_status: 'planned',
    created_at: timestamp,
    updated_at: timestamp,
    schema_version: 1
  };
  await setJSON(store, scheduledLessonKey(id), record);
  return record;
}

export function createScheduledLessonsHandler(deps = {}) {
  return createTeachingCollectionHandler({
    create: createScheduledLessonRecord,
    listPrefix: SCHEDULED_LESSON_PREFIX,
    listKey: 'scheduled_lessons'
  }, deps);
}

export default createScheduledLessonsHandler();
