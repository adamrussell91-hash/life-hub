import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { classKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/classes/:id' };

export function createClassHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: classKey,
    notFound: 'Class not found'
  }, deps);
}

export default createClassHandler();
