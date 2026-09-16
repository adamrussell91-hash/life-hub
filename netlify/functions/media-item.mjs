import { createTeachingRecordHandler } from './_shared/teaching-record-get.mjs';
import { mediaKey } from './_shared/teaching-blobs.mjs';
import { createMediaUploadHandler } from './media-upload.mjs';

export const config = { path: '/api/media/:id' };

export function createMediaItemHandler(deps = {}) {
  const recordHandler = createTeachingRecordHandler({
    keyFor: mediaKey,
    notFound: 'Media not found'
  }, deps);
  const uploadHandler = createMediaUploadHandler(deps);

  return (request, context = {}) => {
    const pathname = new URL(request.url).pathname;

    // Netlify may match the dynamic route before the static upload route,
    // treating "upload" as a media ID. Forward the reserved path so POST
    // requests reach the multipart upload handler in production.
    if (context.params?.id === 'upload' || pathname === '/api/media/upload') {
      return uploadHandler(request, context);
    }

    return recordHandler(request, context);
  };
}

export default createMediaItemHandler();
