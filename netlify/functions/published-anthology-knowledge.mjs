import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { knowledgeAction, KnowledgeError } from './_shared/anthology-knowledge.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/anthology-knowledge/:unit', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 } };
export function createPublishedAnthologyKnowledgeHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET' && request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    if (request.method === 'POST') {
      const originError = guardRequestOrigin(request, env);
      if (originError) return withCors(originError, request, env);
      if (Number(request.headers.get('content-length')) > 6000) return withCors(errorResponse(413, 'too_large', 'Keep it shorter.', false), request, env);
    }
    const unit = new URL(request.url).pathname.match(/\/anthology-knowledge\/([^/]+)$/)?.[1];
    try {
      const text = request.method === 'POST' ? await request.text() : '';
      if (text.length > 6000) throw new KnowledgeError(413, 'too_large', 'Keep it shorter.');
      const result = await knowledgeAction(store, unit, request.method, text ? JSON.parse(text) : {});
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof KnowledgeError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedAnthologyKnowledgeHandler();
