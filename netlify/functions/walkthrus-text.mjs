import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { loadWalkthrus, refreshWalkthrus } from './_shared/walkthrus-text.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/walkthrus-text' };
/** Teacher only: the WalkThrus step text (GET), or a fresh copy from the private repo (POST { action: 'refresh' }). */
export function createWalkthrusTextHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const io = { env, fetchImpl: deps.fetchImpl ?? fetch };
    try {
      if (request.method === 'GET') return withCors(okResponse(200, { text: await loadWalkthrus(store, io) }, { 'cache-control': 'no-store' }), request, env);
      if (request.method === 'POST') {
        const body = await request.json();
        if (body?.action !== 'refresh') return withCors(errorResponse(400, 'bad_request', 'Unknown action.', false), request, env);
        return withCors(okResponse(200, { text: await refreshWalkthrus(store, io) }, { 'cache-control': 'no-store' }), request, env);
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createWalkthrusTextHandler();
