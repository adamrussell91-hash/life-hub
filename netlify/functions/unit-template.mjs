import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { unitTemplateKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/unit-templates/:id' };

export function createUnitTemplateHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: unitTemplateKey,
    notFound: 'Unit template not found',
    versionKind: 'unit_template'
  }, deps);
}

export default createUnitTemplateHandler();
