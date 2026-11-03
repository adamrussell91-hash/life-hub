import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { clientIpOf, withClaimRequest } from './_shared/class-claims.mjs';
import { organiserStudentAction, OrganiserError } from './_shared/organiser.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/organiser/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
const MAX_BODY = 8000;
/** A class's knowledge organiser sheet and one student's practice boxes. The device's class claim says whose. */
export function createPublishedOrganiserHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That request is too large.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/organiser\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new QuizError(413, 'too_large', 'That request is too large.');
      const parsedBody = JSON.parse(text);
      const result = await withClaimRequest({ ip: clientIpOf(request, context) }, () => organiserStudentAction(store, match?.[1], parsedBody, { now: deps.now?.() }));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof OrganiserError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedOrganiserHandler();
