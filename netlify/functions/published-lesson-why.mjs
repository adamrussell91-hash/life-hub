import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { lessonWhyAction, LessonWhyError } from './_shared/lesson-why.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/why/:id/:block', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
export function createPublishedLessonWhyHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > 4000) return withCors(errorResponse(413, 'too_large', 'Keep your answer shorter.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/why\/([^/]+)\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > 4000) throw new LessonWhyError(413, 'too_large', 'Keep your answer shorter.');
      const result = await lessonWhyAction(store, match?.[1], match?.[2], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof LessonWhyError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedLessonWhyHandler();
