import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { lessonSplitAction, SplitError } from './_shared/lesson-split.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/split' };
/** Teacher only: preview, split, undo and the status of a lesson split (_shared/lesson-split.mjs). */
export function createLessonSplitHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/split$/);
    const id = context.params?.id ?? (match?.[1] ? decodeURIComponent(match[1]) : '');
    try {
      const result = await lessonSplitAction(store, id, await request.json(), { env, deps, now: deps.now });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof SplitError || e instanceof SyntaxError || (typeof e?.status === 'number' && typeof e?.code === 'string')) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createLessonSplitHandler();
