import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { continuumAction, ContinuumError } from './_shared/continuum-line.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/continuum/:id/:block', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 600, windowSize: 60 } };
export function createPublishedContinuumHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > 4000) return withCors(errorResponse(413, 'too_large', 'Keep your reason shorter.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/continuum\/([^/]+)\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > 4000) throw new ContinuumError(413, 'too_large', 'Keep your reason shorter.');
      const result = await continuumAction(store, match?.[1], match?.[2], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof ContinuumError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedContinuumHandler();
