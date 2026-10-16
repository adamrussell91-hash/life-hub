/**
 * Teacher side of block pulse (student feedback dots).
 * GET  /api/lessons/:id/pulse                         → counts per block
 * POST /api/lessons/:id/pulse  { action: 'reset', block_id }
 *
 * Both answer with the same payload so the editor repaints from one source.
 */
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import { draftLessonKey, getJSON } from './_shared/teaching-blobs.mjs';
import {
  isSafePulseId,
  PulseError,
  readLessonPulse,
  resetBlockPulse
} from './_shared/block-pulse.mjs';

export const config = { path: '/api/lessons/:id/pulse' };

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/lessons\/([^/]+)\/pulse$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function createLessonPulseHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const lessonId = readLessonId(request, context);
    const draft = isSafePulseId(lessonId) ? await getJSON(store, draftLessonKey(lessonId)) : null;
    if (!draft || isDeletedRecord(draft)) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }

    if (request.method === 'GET') {
      return withCors(okResponse(200, await readLessonPulse(store, lessonId)), request, env);
    }
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }

    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'reset') {
      return withCors(errorResponse(400, 'invalid_action', 'Unknown action.', false), request, env);
    }
    try {
      await resetBlockPulse(store, lessonId, body.block_id, deps);
    } catch (error) {
      if (error instanceof PulseError) {
        return withCors(errorResponse(error.status, error.code, error.message, false), request, env);
      }
      throw error;
    }
    return withCors(okResponse(200, await readLessonPulse(store, lessonId)), request, env);
  }, deps);
}

export default createLessonPulseHandler();
