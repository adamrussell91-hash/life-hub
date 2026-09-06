import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { lessonTemplateKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/lesson-templates/:id' };

export function createLessonTemplateHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: lessonTemplateKey,
    notFound: 'Lesson template not found',
    versionKind: 'lesson_template'
  }, deps);
}

export default createLessonTemplateHandler();
