// netlify/functions/published-tutorial.mjs
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { tutorialAction, TutorialError } from './_shared/tutorial.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/tutorial/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 } };
const MAX_BODY = 16000;
export function createPublishedTutorialHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That’s too long to send. Shorten it and try again.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/tutorial\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new TutorialError(413, 'too_large', 'That’s too long to send. Shorten it and try again.');
      const result = await tutorialAction(store, match?.[1], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof TutorialError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedTutorialHandler();
