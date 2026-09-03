import { createTeachingRecordGetHandler } from './_shared/teaching-record-get.mjs';
import { yearKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/years/:id' };

export function createYearHandler(deps = {}) {
  return createTeachingRecordGetHandler({
    keyFor: yearKey,
    notFound: 'Year not found'
  }, deps);
}

export default createYearHandler();
