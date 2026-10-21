/**
 * GET /api/published/voice-audio/:key — a Voice submission's audio, by its
 * unguessable key, with byte ranges (Safari needs them to play and seek).
 * 404 once the 28 days are up and the audio is gone.
 */
import { errorResponse, methodNotAllowed, withCors } from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { readVoiceAudio } from './_shared/voice-submissions.mjs';
import { parseByteRange } from './media-file.mjs';

export const config = { path: '/api/published/voice-audio/:key' };

export function createPublishedVoiceAudioHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const key = new URL(request.url).pathname.split('/').pop();
    const file = await readVoiceAudio(store, key);
    if (!file?.data) return withCors(errorResponse(404, 'not_found', 'This recording is no longer available.', false), request, env);
    const size = file.data.byteLength;
    const headers = {
      'content-type': typeof file.metadata?.contentType === 'string' ? file.metadata.contentType : 'audio/webm',
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600'
    };
    const range = parseByteRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') {
      return withCors(new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } }), request, env);
    }
    if (range) {
      return withCors(
        new Response(file.data.slice(range.start, range.end + 1), {
          status: 206,
          headers: { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}`, 'content-length': String(range.end - range.start + 1) }
        }),
        request,
        env
      );
    }
    return withCors(new Response(file.data, { status: 200, headers: { ...headers, 'content-length': String(size) } }), request, env);
  }, deps);
}

export default createPublishedVoiceAudioHandler();
