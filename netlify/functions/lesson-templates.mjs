import { LESSON_TEMPLATE_PREFIX } from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler } from './_shared/teaching-create.mjs';
import {
  createLessonTemplateRecord,
  listActiveTemplateSummaries
} from './_shared/teaching-templates.mjs';

export const config = { path: '/api/lesson-templates' };

export function createLessonTemplatesHandler(deps = {}) {
  return createTeachingCollectionHandler({
    create: createLessonTemplateRecord,
    list: async store => ({
      templates: await listActiveTemplateSummaries(store, LESSON_TEMPLATE_PREFIX)
    })
  }, deps);
}

export default createLessonTemplatesHandler();
