import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { unitKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/units/:id' };

export function createUnitHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: unitKey,
    notFound: 'Unit not found',
    versionKind: 'unit'
  }, deps);
}

export default createUnitHandler();
