import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { listReps, planRep, tapRep, unplanRep } from './_shared/walkthru-reps.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';

export const config = { path: '/api/walkthru-reps' };

/**
 * Teacher only.
 * GET  /api/walkthru-reps[?technique=<id>]                          → { reps }
 * POST /api/walkthru-reps { action: 'plan' | 'tap' | 'unplan', technique_id, lesson_id, class_id?, ... }
 */
export function createWalkthruRepsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const headers = { 'cache-control': 'no-store' };
    try {
      if (request.method === 'GET') {
        const technique = new URL(request.url).searchParams.get('technique');
        return withCors(okResponse(200, { reps: await listReps(store, technique || null) }, headers), request, env);
      }
      if (request.method === 'POST') {
        const body = await request.json();
        const now = deps.nowIso ? deps.nowIso() : undefined;
        if (body?.action === 'plan') return withCors(okResponse(200, { rep: await planRep(store, body, now) }, headers), request, env);
        if (body?.action === 'tap') return withCors(okResponse(200, { rep: await tapRep(store, body, now) }, headers), request, env);
        if (body?.action === 'unplan') return withCors(okResponse(200, await unplanRep(store, body), headers), request, env);
        return withCors(errorResponse(400, 'bad_request', 'Unknown action.', false), request, env);
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}

export default createWalkthruRepsHandler();
