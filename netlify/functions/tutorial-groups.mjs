// netlify/functions/tutorial-groups.mjs
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { askForGroups } from './_shared/tutorial-groups-model.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/tutorial-groups' };
export function createTutorialGroupsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    try {
      const body = await request.json();
      const { text } = await (deps.askForGroups ?? askForGroups)({ brief: body?.brief, apiKey: env?.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY });
      return withCors(okResponse(200, { text }, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createTutorialGroupsHandler();
