import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { clientIpOf, withClaimRequest } from './_shared/class-claims.mjs';
import { cjStudentAction } from './_shared/comparative-judgement.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/comparative-judgement/:id/:block', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
const MAX_BODY = 16000;
/** A student judging pairs of anonymous answers. The device's class claim says who. */
export function createPublishedComparativeJudgementHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'Keep your response shorter.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/comparative-judgement\/([^/]+)\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new QuizError(413, 'too_large', 'Keep your response shorter.');
      const body = JSON.parse(text);
      const result = await withClaimRequest({ ip: clientIpOf(request, context) }, () => cjStudentAction(store, match?.[1], match?.[2], body));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedComparativeJudgementHandler();
