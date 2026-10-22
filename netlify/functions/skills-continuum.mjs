import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { loadSkills, refreshSkills } from './_shared/skills-continuum.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/skills-continuum' };
/** Teacher only: the skills continuum (GET), or a fresh copy from the private repo (POST { action: 'refresh' }). */
export function createSkillsContinuumHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const io = { env, fetchImpl: deps.fetchImpl ?? fetch };
    try {
      if (request.method === 'GET') return withCors(okResponse(200, { continuum: await loadSkills(store, io) }, { 'cache-control': 'no-store' }), request, env);
      if (request.method === 'POST') {
        const body = await request.json();
        if (body?.action !== 'refresh') return withCors(errorResponse(400, 'bad_request', 'Unknown action.', false), request, env);
        return withCors(okResponse(200, { continuum: await refreshSkills(store, io) }, { 'cache-control': 'no-store' }), request, env);
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createSkillsContinuumHandler();
