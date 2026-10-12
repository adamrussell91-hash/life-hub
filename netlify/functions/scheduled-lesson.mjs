import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { scheduledLessonKey } from './_shared/teaching-blobs.mjs';
import { prepareScheduledLessonPatch } from '../../apps/teaching/src/schedule/scheduled-time.js';

export const config = { path: '/api/scheduled-lessons/:id' };

export function createScheduledLessonHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: scheduledLessonKey,
    notFound: 'Scheduled lesson not found',
    preparePatch: prepareScheduledLessonPatch
  }, deps);
}

export default createScheduledLessonHandler();
