import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  readTaskProperties,
  TASK_PROPERTIES_KEY,
  validateTaskPropertyConfig
} from './_shared/task-properties.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/task-properties' };

export function createTaskPropertiesHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const config = await readTaskProperties(store, { getJSON, setJSON });
        return withCors(okResponse(200, config), request, env);
      }

      if (request.method !== 'PUT') {
        return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
      }

      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);

      let next;
      try {
        next = validateTaskPropertyConfig(parsed.value);
      } catch (error) {
        return withCors(
          errorResponse(400, 'validation_error', error.message, false),
          request,
          env
        );
      }

      await setJSON(store, TASK_PROPERTIES_KEY, next);
      return withCors(okResponse(200, next), request, env);
    } catch (error) {
      return withCors(errorResponse(400, 'bad_request', error.message, false), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createTaskPropertiesHandler();
