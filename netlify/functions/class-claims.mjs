import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { classClaimsAction } from './_shared/class-claims.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/classes/:id/claims' };
/** Teacher only: who has claimed their quiz initials in a class, and releasing a claim. */
export function createClassClaimsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/classes\/([^/]+)\/claims$/);
    try {
      const result = await classClaimsAction(store, match?.[1], await request.json());
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createClassClaimsHandler();
