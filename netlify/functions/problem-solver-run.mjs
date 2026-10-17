// netlify/functions/problem-solver-run.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { owner, problemSolverServiceFor } from './problem-solver.mjs';

export const config = { path: '/api/problem-solver/run', background: true };

export function createProblemSolverRunHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    try {
      const { id } = await request.json().catch(() => ({}));
      const service = await problemSolverServiceFor(env, deps);
      return withCors(okResponse(200, { session: await service.run(owner(env), id) }), request, env);
    } catch (error) {
      return withCors(errorResponse(error.status ?? 502, error.code ?? 'problem_solver_run_failed', error.message, (error.status ?? 502) >= 500), request, env);
    }
  }, deps);
}

export default createProblemSolverRunHandler();
