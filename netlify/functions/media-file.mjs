import {
  errorResponse,
  methodNotAllowed,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { mediaFileKey, mediaKey, readPublishedId } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/media/:id/file' };

export function createMediaFileHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }

    const raw = await store.get(mediaKey(id), { type: 'json' });
    if (!raw || raw.status !== 'active') {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }

    const result = await store.getWithMetadata(mediaFileKey(id), { type: 'arrayBuffer' });
    if (!result?.data) {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }

    const contentType = raw.mime_type
      || (typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : null)
      || 'application/octet-stream';

    return withCors(new Response(result.data, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400'
      }
    }), request, env);
  }, deps);
}

export default createMediaFileHandler();
