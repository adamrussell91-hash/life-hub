import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { mediaKey } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/media/:id' };

export function createMediaItemHandler(deps = {}) {
  return createTeachingRecordHandler({
    keyFor: mediaKey,
    notFound: 'Media not found'
  }, deps);
}

export default createMediaItemHandler();
