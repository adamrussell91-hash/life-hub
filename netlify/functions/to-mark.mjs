import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { toMarkQueue } from './_shared/to-mark.mjs';
import { toMarkAction } from './_shared/to-mark-flow.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/to-mark' };
/** Teacher only: handed-in work waiting for feedback, across classes. */
export function createToMarkHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET' && request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    try {
      const result = request.method === 'POST' ? await toMarkAction(store, await request.json()) : await toMarkQueue(store);
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createToMarkHandler();
