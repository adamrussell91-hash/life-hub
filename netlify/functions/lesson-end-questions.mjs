import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { endQuestionResults } from './_shared/end-questions.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/end-questions' };
/** Teacher only: the pooled end-of-lesson answers for a lesson, by class and together. */
export function createLessonEndQuestionsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/end-questions$/);
    try {
      const result = await endQuestionResults(store, match?.[1] ? decodeURIComponent(match[1]) : '');
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createLessonEndQuestionsHandler();
