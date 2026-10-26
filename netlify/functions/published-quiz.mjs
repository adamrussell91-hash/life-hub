import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { quizAction, QuizError } from './_shared/quiz.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/quiz/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 900, windowSize: 60 } };
const MAX_BODY = 64000;
/** One line per action so a missing hand-in can be traced in the function log. */
function logQuizAction(lesson, body, status, code) {
  const action = typeof body?.action === 'string' ? body.action.slice(0, 20) : 'status';
  console.log(`quiz ${lesson} ${action} ${status} ${code}${body?.class_id ? ` class=${String(body.class_id).slice(0, 40)}` : ''}`);
}
export function createPublishedQuizHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'Your answers are too long to send.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/quiz\/([^/]+)$/);
    let body = null;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new QuizError(413, 'too_large', 'Your answers are too long to send.');
      body = JSON.parse(text);
      const result = await quizAction(store, match?.[1], body);
      logQuizAction(match?.[1], body, 200, 'ok');
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      logQuizAction(match?.[1], body, e.status ?? 500, e.code ?? 'error');
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedQuizHandler();
