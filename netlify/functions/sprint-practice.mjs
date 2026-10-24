// netlify/functions/sprint-practice.mjs: the teacher's practice run of a design sprint (pretend group of two, practice clock).
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { SprintError } from './_shared/sprint.mjs';
import { sprintPracticeAction } from './_shared/sprint-practice.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/sprint-practice' };
export function createSprintPracticeHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/sprint-practice$/);
    try {
      const result = await sprintPracticeAction(store, match?.[1], await request.json());
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof SprintError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createSprintPracticeHandler();
