// netlify/functions/goals-plan-term.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, listJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { normalizeGoalRecord } from './_shared/goal-record.mjs';
import { applyPlanTerm } from './_shared/goal-plan-term.mjs';

export const config = { path: '/api/goals/plan-term' };

function records(list) {
  return list.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string');
}

export function createGoalsPlanTermHandler(deps = {}) {
  const now = deps.now ?? Date.now;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value;
      const goals = records(await listJSON(store, 'goals/')).map(normalizeGoalRecord);
      const at = new Date(now()).toISOString();
      const result = applyPlanTerm({
        goals,
        from: body.from,
        decisions: body.decisions,
        at
      });
      if (result.error) {
        const status = result.error.code === 'not_found' ? 404 : 400;
        return withCors(
          errorResponse(status, result.error.code, result.error.message, false),
          request,
          env
        );
      }
      await Promise.all(
        result.goals.map(goal => setJSON(store, `goals/${goal.id}`, goal))
      );
      return withCors(okResponse(200, { goals: result.goals }), request, env);
    } catch {
      return withCors(
        errorResponse(503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true),
        request,
        env
      );
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createGoalsPlanTermHandler();
