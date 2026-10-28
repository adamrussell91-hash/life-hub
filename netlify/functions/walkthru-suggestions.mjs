import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { dismiss, loadSuggestions, saveSettings } from './_shared/walkthru-monitor.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';

export const config = { path: '/api/walkthru-suggestions' };

/**
 * Teacher only.
 * GET  /api/walkthru-suggestions → { suggestions, settings }
 * POST { action: 'dismiss', key, kind: 'not_now' | 'not_this' | 'accepted' } → { ok }
 * POST { action: 'settings', settings: { quizzes, weeks, classes, oneOffDays } } → { settings }
 */
export function createWalkthruSuggestionsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const headers = { 'cache-control': 'no-store' };
    const now = deps.nowIso ? deps.nowIso() : undefined;
    try {
      if (request.method === 'GET') return withCors(okResponse(200, await loadSuggestions(store, now), headers), request, env);
      if (request.method === 'POST') {
        const body = await request.json();
        if (body?.action === 'dismiss') return withCors(okResponse(200, await dismiss(store, body, now), headers), request, env);
        if (body?.action === 'settings') return withCors(okResponse(200, { settings: await saveSettings(store, body.settings) }, headers), request, env);
        return withCors(errorResponse(400, 'bad_request', 'Unknown action.', false), request, env);
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}

export default createWalkthruSuggestionsHandler();
