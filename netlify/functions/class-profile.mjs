import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { teacherProfileAction } from './_shared/profile.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/classes/:id/profile' };
/** Teacher only: which lessons each student has marked done in a class, and removing a record. */
export function createClassProfileHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/classes\/([^/]+)\/profile$/);
    try {
      const result = await teacherProfileAction(store, match?.[1], await request.json());
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createClassProfileHandler();
