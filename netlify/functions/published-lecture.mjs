// netlify/functions/published-lecture.mjs
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { lectureAction, LectureError } from './_shared/lecture.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/lecture/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 } };
const MAX_BODY = 16000;
export function createPublishedLectureHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'Invalid request.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/lecture\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new LectureError(413, 'too_large', 'Invalid request.');
      const result = await lectureAction(store, match?.[1], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof LectureError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedLectureHandler();
