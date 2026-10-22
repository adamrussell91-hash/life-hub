import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { loadAlignment, patchAlignment } from './_shared/syllabus-alignment.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/syllabus-alignment' };
/** Teacher only: the syllabus alignment (GET), or one dot point's new links (PATCH). */
export function createSyllabusAlignmentHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const alignment = await loadAlignment(store, undefined, { env, fetchImpl: deps.fetchImpl ?? fetch });
        return withCors(okResponse(200, { alignment }, { 'cache-control': 'no-store' }), request, env);
      }
      if (request.method === 'PATCH') {
        const alignment = await patchAlignment(store, await request.json());
        return withCors(okResponse(200, { alignment }, { 'cache-control': 'no-store' }), request, env);
      }
      return withCors(methodNotAllowed('GET, PATCH, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createSyllabusAlignmentHandler();
