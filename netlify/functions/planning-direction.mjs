import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/planning-direction' };

const PLANNING_DIRECTION_KEY = 'meta/planning_direction';

export const DEFAULT_PLANNING_DIRECTION = {
  schema_version: 1,
  id: 'default',
  purpose: '',
  principles: [],
  vision: '',
  updated_at: null
};

export function normalizePlanningDirection(raw) {
  const base = {
    ...DEFAULT_PLANNING_DIRECTION,
    ...(raw && typeof raw === 'object' ? raw : {}),
    id: 'default',
    schema_version: 1
  };
  return {
    ...base,
    purpose: typeof base.purpose === 'string' ? base.purpose : '',
    vision: typeof base.vision === 'string' ? base.vision : '',
    principles: Array.isArray(base.principles)
      ? base.principles.filter((item) => typeof item === 'string')
      : []
  };
}

export function createPlanningDirectionHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const raw = await getJSON(store, PLANNING_DIRECTION_KEY);
        return withCors(okResponse(200, normalizePlanningDirection(raw)), request, env);
      }

      if (request.method === 'PATCH' || request.method === 'PUT') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const existing = normalizePlanningDirection(
          await getJSON(store, PLANNING_DIRECTION_KEY)
        );
        const next = normalizePlanningDirection({
          ...existing,
          ...parsed.value,
          id: 'default',
          updated_at: new Date().toISOString()
        });
        await setJSON(store, PLANNING_DIRECTION_KEY, next);
        return withCors(okResponse(200, next), request, env);
      }

      return withCors(methodNotAllowed('GET, PATCH, PUT, OPTIONS'), request, env);
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

export default createPlanningDirectionHandler();
