import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetCheckInStore } from './_shared/check-in-store.mjs';
import { loadCheckInText, refreshCheckInText } from './_shared/check-in-text.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';

export const config = { path: '/api/check-in-text' };

/** Teacher only: the Check-in guide wording (GET), or a fresh copy from the private repo (POST { action: 'refresh' }). */
export function createCheckInTextHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const io = { env, fetchImpl: deps.fetchImpl ?? fetch };
    const ok = (text) => withCors(okResponse(200, { text }, { 'cache-control': 'no-store' }), request, env);
    try {
      if (request.method === 'GET') return ok(await loadCheckInText(store, io));
      if (request.method === 'POST') {
        const body = await request.json();
        if (body?.action !== 'refresh') throw new QuizError(400, 'bad_request', 'Unknown action.');
        return ok(await refreshCheckInText(store, io));
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) {
        return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      }
      throw e;
    }
  }, {
    ...deps,
    unboundMessage: deps.unboundMessage ?? 'Check-in store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetCheckInStore
  });
}

export default createCheckInTextHandler();
