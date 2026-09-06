import { UNIT_TEMPLATE_PREFIX } from './_shared/teaching-blobs.mjs';
import { createTeachingCollectionHandler } from './_shared/teaching-create.mjs';
import {
  createUnitTemplateRecord,
  listActiveTemplateSummaries
} from './_shared/teaching-templates.mjs';

export const config = { path: '/api/unit-templates' };

export function createUnitTemplatesHandler(deps = {}) {
  return createTeachingCollectionHandler({
    create: createUnitTemplateRecord,
    list: async store => ({
      templates: await listActiveTemplateSummaries(store, UNIT_TEMPLATE_PREFIX)
    })
  }, deps);
}

export default createUnitTemplatesHandler();
