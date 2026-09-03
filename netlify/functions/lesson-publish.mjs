import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  draftLessonKey,
  getJSON,
  publishedLessonKey,
  setJSON
} from './_shared/teaching-blobs.mjs';
import { attachedOutcomeIds, filterBlocksForStudent, sanitizeBlocksDeep } from './_shared/teaching-student.mjs';

export const config = { path: '/api/lessons/:id/publish' };

function readLessonId(request, context = {}) {
  if (typeof context.params?.id === 'string' && context.params.id) return context.params.id;
  const match = new URL(request.url).pathname.match(/\/api\/lessons\/([^/]+)\/publish$/);
  return match?.[1] ?? '';
}

export function createLessonPublishHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const id = readLessonId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }

    const draft = await getJSON(store, draftLessonKey(id));
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }

    const title = typeof draft.title === 'string' ? draft.title.trim() : '';
    const unit_id = typeof draft.unit_id === 'string' ? draft.unit_id : '';
    if (!title || !unit_id) {
      return withCors(
        errorResponse(400, 'validation_error', 'Lesson needs a title and unit_id to publish', false),
        request,
        env
      );
    }

    const publishedAt = new Date().toISOString();
    const outcomeIds = attachedOutcomeIds(draft);
    const snapshot = {
      lesson_id: id,
      title,
      unit_id,
      blocks: sanitizeBlocksDeep(filterBlocksForStudent(draft.blocks)),
      published_at: publishedAt,
      schema_version: 1,
      ...(draft.cover ? { cover: draft.cover } : {}),
      ...(outcomeIds.length > 0 ? { outcome_ids: outcomeIds } : {})
    };

    await setJSON(store, publishedLessonKey(id), snapshot);
    await setJSON(store, draftLessonKey(id), {
      ...draft,
      published_at: publishedAt,
      updated_at: publishedAt
    });
    return withCors(okResponse(200, { student_path: `/s/lessons/${id}` }), request, env);
  }, deps);
}

export default createLessonPublishHandler();
