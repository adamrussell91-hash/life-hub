import {
  errorResponse,
  methodNotAllowed,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { mediaFileKey, mediaKey, readPublishedId } from './_shared/teaching-blobs.mjs';

export const config = { path: '/api/media/:id/file' };

/**
 * Parse a single `bytes=` range against a file of `size` bytes.
 * Returns null for no/unsupported range, 'unsatisfiable' when it misses the file.
 */
export function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

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

    // Keep full video responses streaming; byte-range requests need sliceable bytes.
    const streamVideo = /^video\//.test(raw.mime_type ?? '') && !request.headers.has('range');
    const result = await store.getWithMetadata(mediaFileKey(id), { type: streamVideo ? 'stream' : 'arrayBuffer' });
    if (!result?.data) {
      return withCors(errorResponse(404, 'not_found', 'Media file not found', false), request, env);
    }

    const contentType = raw.mime_type
      || (typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : null)
      || 'application/octet-stream';

    // Safari will not play audio or video without byte ranges, and seeking needs them everywhere.
    // Private cache: the CDN must not hand one range's bytes to a request for another.
    const size = result.data.byteLength;
    const headers = {
      'content-type': contentType,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff'
    };
    if (streamVideo) {
      return withCors(new Response(result.data, { status: 200, headers }), request, env);
    }
    const range = parseByteRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') {
      return withCors(new Response(null, {
        status: 416,
        headers: { ...headers, 'content-range': `bytes */${size}` }
      }), request, env);
    }
    if (range) {
      return withCors(new Response(result.data.slice(range.start, range.end + 1), {
        status: 206,
        headers: {
          ...headers,
          'content-range': `bytes ${range.start}-${range.end}/${size}`,
          'content-length': String(range.end - range.start + 1)
        }
      }), request, env);
    }

    return withCors(new Response(result.data, {
      status: 200,
      headers: { ...headers, 'content-length': String(size) }
    }), request, env);
  }, deps);
}

export default createMediaFileHandler();
