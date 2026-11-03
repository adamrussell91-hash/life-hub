import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { lessonWhyAction, LessonWhyError } from './_shared/lesson-why.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/why/:block' };
export function createLessonWhyHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/why\/([^/]+)$/);
    try {
      const result = await lessonWhyAction(store, match?.[1], match?.[2], await request.json(), { teacher: true, env, fetchImpl: deps.fetchImpl });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof LessonWhyError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createLessonWhyHandler();
