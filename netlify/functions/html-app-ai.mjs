import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import {
  completeWithProvider as defaultCompleteWithProvider,
  ProviderConfigError,
  ProviderUpstreamError
} from './_shared/html-app-providers.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { getJSON, publishedLessonKey } from './_shared/teaching-blobs.mjs';
import {
  clampHtmlAppAiRequest,
  findBlockById,
  resolveHtmlAppAiLane
} from './_shared/teaching-student.mjs';

export const config = { path: '/api/html-app-ai' };

export function createHtmlAppAiHandler(deps = {}) {
  const complete = deps.completeWithProvider ?? defaultCompleteWithProvider;
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return withCors(errorResponse(400, 'bad_request', 'Invalid JSON body', false), request, env);
    }

    const lessonId = typeof body.lesson_id === 'string' ? body.lesson_id.trim() : '';
    const blockId = typeof body.block_id === 'string' ? body.block_id.trim() : '';
    if (!lessonId || !blockId || !Array.isArray(body.messages)) {
      return withCors(
        errorResponse(400, 'bad_request', 'lesson_id, block_id, and messages are required', false),
        request,
        env
      );
    }

    const snapshot = await getJSON(store, publishedLessonKey(lessonId));
    if (!snapshot || typeof snapshot !== 'object') {
      return withCors(errorResponse(404, 'not_found', 'Lesson is not published', false), request, env);
    }

    const block = findBlockById(snapshot.blocks, blockId);
    if (!block) {
      return withCors(errorResponse(404, 'not_found', 'Block not found', false), request, env);
    }

    const lane = resolveHtmlAppAiLane(block);
    if (!lane) {
      return withCors(
        errorResponse(403, 'forbidden', 'AI lane is not enabled for this block', false),
        request,
        env
      );
    }

    const messages = clampHtmlAppAiRequest(body.messages);
    try {
      const text = await complete(lane, messages, env);
      return withCors(okResponse(200, { text }), request, env);
    } catch (error) {
      if (error instanceof ProviderConfigError) {
        return withCors(
          errorResponse(503, 'misconfigured', 'AI provider is not configured', true),
          request,
          env
        );
      }
      if (error instanceof ProviderUpstreamError) {
        return withCors(errorResponse(502, 'upstream_error', error.message, true), request, env);
      }
      throw error;
    }
  }, deps);
}

export default createHtmlAppAiHandler();
