import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { knowledgeAction, KnowledgeError } from './_shared/anthology-knowledge.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/units/:unit/anthology-knowledge' };
export function createAnthologyKnowledgeHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET' && request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    if (request.method === 'POST') {
      const originError = guardRequestOrigin(request, env);
      if (originError) return withCors(originError, request, env);
    }
    const unit = new URL(request.url).pathname.match(/\/units\/([^/]+)\/anthology-knowledge$/)?.[1];
    try {
      const body = request.method === 'POST' ? await request.json() : {};
      const result = await knowledgeAction(store, unit, request.method, body, { teacher: true });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof KnowledgeError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createAnthologyKnowledgeHandler();
