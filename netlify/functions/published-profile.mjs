import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { clientIpOf, loadRoster, withClaimRequest } from './_shared/class-claims.mjs';
import { profileAction } from './_shared/profile.mjs';
import { lessonRouteAction } from './_shared/lesson-route.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/profile/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
const MAX_BODY = 4000;
/** A student's own progress map. The device's class claim says whose; nothing else does. */
export function createPublishedProfileHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That request is too large.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/profile\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new QuizError(413, 'too_large', 'That request is too large.');
      const parsedBody = JSON.parse(text);
      const result = await withClaimRequest({ ip: clientIpOf(request, context) }, () => (parsedBody?.action === 'lesson_route' ? routeAction(store, match?.[1], parsedBody) : profileAction(store, match?.[1], parsedBody)));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
/** "Why this matters" on a lesson page: the lesson's place on the unit route and its reason. */
async function routeAction(store, classId, body) {
  const roster = await loadRoster(store, classId);
  if (!roster) throw new QuizError(404, 'not_found', 'Class not found.');
  return lessonRouteAction(store, roster, body);
}
export default createPublishedProfileHandler();
