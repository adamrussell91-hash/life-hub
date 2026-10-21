/**
 * Teacher side of the Voice block: the submissions inbox and marking.
 *
 *   GET    /api/voice/:lesson/:block                    inbox rows (and kicks transcription)
 *   GET    /api/voice/:lesson/:block/:id                one submission, transcript and tags
 *   PUT    /api/voice/:lesson/:block/:id                save tags, comment, initials
 *   DELETE /api/voice/:lesson/:block/:id                remove it; the student may submit again
 *   POST   /api/voice/:lesson/:block/:id/return         send the feedback to the student
 *   POST   /api/voice/:lesson/:block/:id/retranscribe   try Whisper again
 */
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  deleteVoiceSubmission,
  getVoiceSubmission,
  listVoiceSubmissions,
  requeueTranscription,
  returnVoiceSubmission,
  saveVoiceMarking,
  VoiceError
} from './_shared/voice-submissions.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = {
  path: ['/api/voice/:lesson/:block', '/api/voice/:lesson/:block/:id', '/api/voice/:lesson/:block/:id/:action']
};

export function voiceRunUrl(request) {
  return new URL('/api/voice-transcribe/run', request.url);
}

/** Fire the background transcription run with the teacher's session; a 202 means it started. */
export async function defaultInvokeVoiceRun(request, lesson, block, fetchImpl = fetch) {
  const response = await fetchImpl(voiceRunUrl(request), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ lesson, block }),
    signal: AbortSignal.timeout(5_000)
  });
  return response.status === 202 || response.ok;
}

export function createVoiceSubmissionsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const parts = new URL(request.url).pathname.replace(/^\/api\/voice\//, '').split('/').map(decodeURIComponent);
    const [lesson, block, id, action] = parts;
    const respond = (status, data) => withCors(okResponse(status, data, { 'cache-control': 'no-store' }), request, env);
    try {
      if (request.method !== 'GET') {
        const originError = guardRequestOrigin(request, env);
        if (originError) return withCors(originError, request, env);
      }
      if (!id) {
        if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
        const submissions = await listVoiceSubmissions(store, lesson, block);
        let transcribing = false;
        if (submissions.some((s) => s.transcript_status === 'pending')) {
          transcribing = await (deps.invokeRun ?? defaultInvokeVoiceRun)(request, lesson, block).catch(() => false);
        }
        return respond(200, { submissions, transcribing });
      }
      if (action === 'return' && request.method === 'POST') return respond(200, await returnVoiceSubmission(store, lesson, block, id, deps));
      if (action === 'retranscribe' && request.method === 'POST') {
        const record = await requeueTranscription(store, lesson, block, id);
        await (deps.invokeRun ?? defaultInvokeVoiceRun)(request, lesson, block).catch(() => false);
        return respond(200, record);
      }
      if (action) return withCors(errorResponse(404, 'not_found', 'Not found.', false), request, env);
      if (request.method === 'GET') return respond(200, await getVoiceSubmission(store, lesson, block, id));
      if (request.method === 'DELETE') return respond(200, await deleteVoiceSubmission(store, lesson, block, id));
      if (request.method === 'PUT') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        return respond(200, await saveVoiceMarking(store, lesson, block, id, parsed.value, deps));
      }
      return withCors(methodNotAllowed('GET, PUT, DELETE, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof VoiceError) return withCors(errorResponse(e.status, e.code, e.message, false), request, env);
      throw e;
    }
  }, deps);
}

export default createVoiceSubmissionsHandler();
