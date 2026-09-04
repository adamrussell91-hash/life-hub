import { compositionKey } from './_shared/teaching-blobs.mjs';
import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/compositions/:id' };

export function createCompositionHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: compositionKey,
    notFound: 'Composition not found'
  }, deps);
}

export default createCompositionHandler();
