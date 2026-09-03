import { createTeachingRecordGetHandler } from './_shared/teaching-record-get.mjs';
import { scheduledLessonKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/scheduled-lessons/:id' };

export function createScheduledLessonHandler(deps = {}) {
  return createTeachingRecordGetHandler({
    keyFor: scheduledLessonKey,
    notFound: 'Scheduled lesson not found'
  }, deps);
}

export default createScheduledLessonHandler();
