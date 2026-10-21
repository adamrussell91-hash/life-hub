// netlify/functions/problem-solver.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProblemStore } from './_shared/problem-solver/store.mjs';
import { createProblemSolverService } from './_shared/problem-solver/service.mjs';
import { anthropicModel, createModelCoach } from './_shared/problem-solver/coach.mjs';

export const config = { path: '/api/problem-solver' };

export function owner(env) {
  return env.COGNITIVE_OWNER_ID || 'operator';
}

export async function problemSolverServiceFor(env, deps = {}) {
  const store = deps.getStore ? await deps.getStore(env) : await defaultGetProblemStore(env);
  if (!store) throw Object.assign(new Error('Problem Solver storage is not configured.'), { status: 503, code: 'store_unbound' });
  const coach = deps.coach ?? createModelCoach(anthropicModel(env, deps.fetchImpl ?? fetch));
  return createProblemSolverService({ store, coach });
}

export async function defaultInvokeRun(request, id, env, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/problem-solver/run', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ id })
  });
  return response.status === 202 || response.ok;
}

const fail = (error, request, env) => {
  const status = error.status ?? (error.code === 'illegal_slot' ? 409 : 502);
  return withCors(errorResponse(status, error.code ?? 'problem_solver_failed', error.message ?? 'Problem Solver request failed.', status >= 500), request, env);
};

export function createProblemSolverHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    try {
      const service = await problemSolverServiceFor(env, deps);
      if (request.method === 'GET') {
        const url = new URL(request.url);
        if (url.searchParams.has('linked')) return withCors(okResponse(200, { sessions: await service.linked(owner(env), url.searchParams.get('linked')) }), request, env);
        if (url.searchParams.has('list')) return withCors(okResponse(200, { sessions: await service.list(owner(env)) }), request, env);
        return withCors(okResponse(200, { session: await service.get(owner(env), url.searchParams.get('id')) }), request, env);
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value ?? {};
      const session = body.create ? await service.create(owner(env), body.create) : await service.action(owner(env), body);
      const runId = body.action === 'escalate' ? session.lightning?.escalatedTo ?? null : session.runner.status === 'queued' ? session.id : null;
      if (!runId) return withCors(okResponse(200, { session }), request, env);
      let kicked = false;
      try { kicked = await (deps.invokeRun ?? defaultInvokeRun)(request, runId, env, deps.fetchImpl ?? fetch); } catch { kicked = false; }
      if (kicked) return withCors(okResponse(202, { session }), request, env);
      if (runId !== session.id) {
        await service.run(owner(env), runId);
        return withCors(okResponse(200, { session }), request, env);
      }
      return withCors(okResponse(200, { session: await service.run(owner(env), session.id) }), request, env);
    } catch (error) {
      return fail(error, request, env);
    }
  }, deps);
}

export default createProblemSolverHandler();
