import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  defaultGetTasksStore,
  listJSON,
  setJSON,
  TASK_PREFIX,
  taskKey
} from './_shared/tasks-blobs.mjs';
import { applyPriorityAssessments } from './_shared/task-priority-assess.mjs';

export const config = { path: '/api/priority-assess' };

const tasksGate = {
  unboundCode: 'tasks_blobs_unbound',
  unboundMessage: 'Tasks content store is not bound.',
  getContentStore: defaultGetTasksStore
};

export function createPriorityAssessHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value ?? {};
      const mode = body.mode === 'floor' ? 'floor' : 'full';
      const apply = body.apply === true;
      const result = await applyPriorityAssessments(
        store,
        { listJSON, setJSON, taskKey, TASK_PREFIX },
        { mode, apply }
      );
      return withCors(okResponse(200, result), request, env);
    } catch (error) {
      return withCors(
        errorResponse(400, 'bad_request', error.message, false),
        request,
        env
      );
    }
  }, {
    ...tasksGate,
    ...deps,
    getContentStore: deps.getContentStore ?? tasksGate.getContentStore
  });
}

export default createPriorityAssessHandler();
