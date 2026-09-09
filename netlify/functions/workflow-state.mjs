import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/workflow-state' };

function readId(request) {
  return new URL(request.url).searchParams.get('id') ?? '';
}

function workflowKey(id) {
  return `workflow_state/${id}`;
}

export function createWorkflowStateHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      const id = readId(request);
      if (!id || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/.test(id)) {
        return withCors(
          errorResponse(400, 'missing_id', 'id query param required', false),
          request,
          env
        );
      }

      if (request.method === 'GET') {
        const state = await getJSON(store, workflowKey(id));
        return withCors(okResponse(200, state ?? null), request, env);
      }

      if (request.method === 'PUT' || request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return withCors(
            errorResponse(400, 'invalid_body', 'JSON object required', false),
            request,
            env
          );
        }
        const next = {
          ...body,
          id,
          updated_at: new Date().toISOString()
        };
        await setJSON(store, workflowKey(id), next);
        return withCors(okResponse(200, next), request, env);
      }

      return withCors(methodNotAllowed('GET, PUT, POST, OPTIONS'), request, env);
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

export default createWorkflowStateHandler();
