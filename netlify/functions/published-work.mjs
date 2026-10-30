import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { workAction } from './_shared/lesson-work.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/work/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
const MAX_BODY = 300_000;
/** A student's written work in a lesson, saved as they write. The device's class claim says whose. */
export function createPublishedWorkHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That request is too large.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/work\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new QuizError(413, 'too_large', 'That request is too large.');
      const result = await workAction(store, match?.[1], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedWorkHandler();
