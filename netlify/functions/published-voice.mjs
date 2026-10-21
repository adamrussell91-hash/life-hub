/**
 * Student side of the Voice block (no accounts; see _shared/voice-submissions.mjs).
 *
 *   POST /api/published/voice/:lesson/:block        JSON { action: 'mine' | 'submit', token, … }
 *   POST /api/published/voice/:lesson/:block/part   multipart { token, upload_id, index, file }
 */
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { readMine, storeVoicePart, submitVoice, VoiceError, MAX_PART_BYTES } from './_shared/voice-submissions.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';

export const config = {
  path: ['/api/published/voice/:lesson/:block', '/api/published/voice/:lesson/:block/part'],
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 }
};

export function createPublishedVoiceHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/published\/voice\/([^/]+)\/([^/]+)(\/part)?$/);
    if (!match) return withCors(errorResponse(404, 'not_found', 'Not found.', false), request, env);
    const [, lesson, block, isPart] = match;
    try {
      if (isPart) {
        if (Number(request.headers.get('content-length')) > MAX_PART_BYTES + 64 * 1024) throw new VoiceError(413, 'too_large', 'This recording is too large.');
        const form = await request.formData().catch(() => null);
        const file = form?.get('file');
        if (!form || !(file instanceof Blob)) throw new VoiceError(400, 'bad_request', 'Send the recording as a file.');
        const result = await storeVoicePart(store, lesson, block, {
          token: form.get('token'),
          upload_id: form.get('upload_id'),
          index: form.get('index'),
          bytes: await file.arrayBuffer()
        });
        return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
      }
      const text = await request.text();
      if (text.length > 16000) throw new VoiceError(413, 'too_large', 'Request is too large.');
      const body = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VoiceError(400, 'bad_request', 'Invalid request.');
      const result =
        body.action === 'submit'
          ? await submitVoice(store, lesson, block, body, deps)
          : body.action === 'mine'
            ? await readMine(store, lesson, block, body.token)
            : (() => {
                throw new VoiceError(400, 'bad_action', 'Unknown action.');
              })();
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof VoiceError || e instanceof SyntaxError) {
        return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      }
      throw e;
    }
  }, deps);
}

export default createPublishedVoiceHandler();
