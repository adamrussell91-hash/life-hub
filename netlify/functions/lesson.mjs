import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { draftLessonKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/lessons/:id' };

export function createLessonHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: draftLessonKey,
    notFound: 'Lesson not found'
  }, deps);
}

export default createLessonHandler();
