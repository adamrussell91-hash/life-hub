/**
 * Background run: transcribe a Voice block's waiting submissions.
 * The inbox kicks this when it sees rows still waiting; the daily tick is the backstop.
 */
import { methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { processVoiceTranscriptions } from './_shared/voice-submissions.mjs';
import { isSafeId } from './_shared/class-examples.mjs';

export const config = { path: '/api/voice-transcribe/run', background: true };

export function createVoiceTranscribeRunHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const body = await request.json().catch(() => ({}));
    const lesson = isSafeId(body?.lesson) ? body.lesson : undefined;
    const block = lesson && isSafeId(body?.block) ? body.block : undefined;
    const result = await processVoiceTranscriptions({ store, env, lesson, block, ...deps });
    return withCors(okResponse(200, result), request, env);
  }, deps);
}

export default createVoiceTranscribeRunHandler();
