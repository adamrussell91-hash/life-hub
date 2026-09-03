import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { scheduledLessonKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/scheduled-lessons/:id' };

export function createScheduledLessonHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: scheduledLessonKey,
    notFound: 'Scheduled lesson not found'
  }, deps);
}

export default createScheduledLessonHandler();
