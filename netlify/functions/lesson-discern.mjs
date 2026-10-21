/**
 * Teacher side of Discern (class spread).
 * GET  /api/lessons/:id/discern?block_id=…           → every tail for the block
 * POST /api/lessons/:id/discern  { action: 'reset', block_id }
 *
 * Both answer with the same payload so the spread repaints from one source.
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
  DiscernError,
  isSafeDiscernId,
  readDiscernTails,
  resetDiscernTails
} from './_shared/discern.mjs';

export const config = { path: '/api/lessons/:id/discern' };

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/lessons\/([^/]+)\/discern$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function createLessonDiscernHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const lessonId = readLessonId(request, context);
    const draft = isSafeDiscernId(lessonId) ? await getJSON(store, draftLessonKey(lessonId)) : null;
    if (!draft || isDeletedRecord(draft)) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }
    try {
      if (request.method === 'GET') {
        const blockId = new URL(request.url).searchParams.get('block_id') ?? '';
        return withCors(okResponse(200, await readDiscernTails(store, lessonId, blockId)), request, env);
      }
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }
      const body = await request.json().catch(() => ({}));
      if (body?.action !== 'reset') {
        return withCors(errorResponse(400, 'invalid_action', 'Unknown action.', false), request, env);
      }
      await resetDiscernTails(store, lessonId, body.block_id);
      return withCors(okResponse(200, await readDiscernTails(store, lessonId, body.block_id)), request, env);
    } catch (error) {
      if (error instanceof DiscernError) {
        return withCors(errorResponse(error.status, error.code, error.message, false), request, env);
      }
      throw error;
    }
  }, deps);
}

export default createLessonDiscernHandler();
