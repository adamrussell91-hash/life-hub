import { createTeachingRecordGetHandler } from './_shared/teaching-record-get.mjs';
import { unitKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/units/:id' };

export function createUnitHandler(deps = {}) {
  return createTeachingRecordGetHandler({
    keyFor: unitKey,
    notFound: 'Unit not found'
  }, deps);
}

export default createUnitHandler();
