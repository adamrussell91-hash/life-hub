/**
 * A student sends their response to a thinking block (Diamond 9, Two-text Venn, choice board).
 * POST /api/published/thinking/:id  { block_id, device_id, initials, data }
 *
 * The device id is a random string the browser keeps so a resent
 * response replaces the same record. Only the typed initials are stored.
 */
import {
  errorResponse,
  guardRequestOrigin,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { isDeletedRecord } from './_shared/record-liveness.mjs';
import { draftLessonKey, getJSON, publishedLessonKey } from './_shared/teaching-blobs.mjs';
import { ThinkingError, isSafeThinkingId, recordThinkingResponse } from './_shared/thinking-responses.mjs';

export const config = {
  path: '/api/published/thinking/:id',
  // A whole class shares one school IP; responses are idempotent per device anyway.
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 240, windowSize: 60 }
};

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/published\/thinking\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export function createPublishedThinkingHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);

    const lessonId = readLessonId(request, context);
    const [snapshot, draft] = isSafeThinkingId(lessonId)
      ? await Promise.all([
          getJSON(store, publishedLessonKey(lessonId)),
          getJSON(store, draftLessonKey(lessonId))
        ])
      : [null, null];
    if (!snapshot || typeof snapshot !== 'object' || !draft || isDeletedRecord(draft)) {
      return withCors(errorResponse(404, 'not_found', 'Lesson is not published', false), request, env);
    }

    const body = await request.json().catch(() => ({}));
    try {
      const result = await recordThinkingResponse(store, { ...snapshot, lesson_id: lessonId }, body, deps);
      return withCors(okResponse(200, result), request, env);
    } catch (error) {
      if (error instanceof ThinkingError) {
        return withCors(errorResponse(error.status, error.code, error.message, false), request, env);
      }
      throw error;
    }
  }, deps);
}

export default createPublishedThinkingHandler();
