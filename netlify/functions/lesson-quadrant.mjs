/**
 * Question Quadrant, teacher side (class map).
 * GET  /api/lessons/:id/quadrant?block_id=…   → every question for the block
 * POST /api/lessons/:id/quadrant  { action: move | unmove | choose | hide | open | reset, block_id, … }
 *
 * Both answer with the same payload so the map repaints from one source.
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
  QuadrantError,
  isSafeQuadrantId,
  readQuadrantBoard,
  updateQuadrantBoard
} from './_shared/quadrant-questions.mjs';

export const config = { path: '/api/lessons/:id/quadrant' };

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/lessons\/([^/]+)\/quadrant$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function createLessonQuadrantHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const lessonId = readLessonId(request, context);
    const draft = isSafeQuadrantId(lessonId) ? await getJSON(store, draftLessonKey(lessonId)) : null;
    if (!draft || isDeletedRecord(draft)) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }
    try {
      if (request.method === 'GET') {
        const blockId = new URL(request.url).searchParams.get('block_id') ?? '';
        return withCors(okResponse(200, await readQuadrantBoard(store, lessonId, blockId)), request, env);
      }
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }
      const body = await request.json().catch(() => ({}));
      return withCors(okResponse(200, await updateQuadrantBoard(store, lessonId, body)), request, env);
    } catch (error) {
      if (error instanceof QuadrantError) {
        return withCors(errorResponse(error.status, error.code, error.message, false), request, env);
      }
      throw error;
    }
  }, deps);
}

export default createLessonQuadrantHandler();
