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
  deleteKey,
  getJSON,
  listJSON,
  newTaskId,
  readTaskIndex,
  setJSON,
  TASK_PREFIX,
  taskKey,
  writeTaskIndex
} from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/tasks' };

const DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);

function readTaskId(request) {
  return new URL(request.url).searchParams.get('id') ?? '';
}

function mergeTask(existing, patch) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'schema_version' || key === 'created_at') continue;
    next[key] = value;
  }
  next.updated_at = new Date().toISOString();
  if (patch.status === 'done' && !existing.completed_at) {
    next.completed_at = next.updated_at;
  } else if (patch.status && patch.status !== 'done') {
    next.completed_at = null;
  }
  return next;
}

export function createTasksHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const id = readTaskId(request);
        if (id) {
          const task = await getJSON(store, taskKey(id));
          if (!task || typeof task !== 'object' || Array.isArray(task)) {
            return withCors(errorResponse(404, 'not_found', 'Task not found', false), request, env);
          }
          return withCors(okResponse(200, task), request, env);
        }
        const tasks = (await listJSON(store, TASK_PREFIX))
          .filter(item => typeof item.id === 'string' && typeof item.title === 'string');
        return withCors(okResponse(200, { tasks }), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const title = typeof parsed.value.title === 'string' ? parsed.value.title.trim() : '';
        const domain = typeof parsed.value.domain === 'string' ? parsed.value.domain : '';
        if (!title || !DOMAINS.has(domain)) {
          return withCors(
            errorResponse(400, 'validation_error', 'title and a valid domain are required', false),
            request,
            env
          );
        }
        const timestamp = new Date().toISOString();
        const id = newTaskId();
        const task = {
          schema_version: 1,
          id,
          title,
          description: typeof parsed.value.description === 'string' ? parsed.value.description : '',
          kind: 'task',
          bucket: 'active',
          domain,
          status: 'open',
          priority: typeof parsed.value.priority === 'string' ? parsed.value.priority : 'medium',
          parent_project_id: typeof parsed.value.parent_project_id === 'string'
            ? parsed.value.parent_project_id
            : null,
          created_at: timestamp,
          updated_at: timestamp,
          completed_at: null,
          source: 'manual'
        };
        await setJSON(store, taskKey(id), task);
        const ids = await readTaskIndex(store);
        await writeTaskIndex(store, [...ids, id]);
        return withCors(okResponse(201, task), request, env);
      }

      if (request.method === 'PATCH' || request.method === 'DELETE') {
        const id = readTaskId(request);
        if (!id) {
          return withCors(errorResponse(400, 'missing_id', 'id query param required', false), request, env);
        }
        const existing = await getJSON(store, taskKey(id));
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
          return withCors(errorResponse(404, 'not_found', 'Task not found', false), request, env);
        }
        if (request.method === 'DELETE') {
          await deleteKey(store, taskKey(id));
          const ids = (await readTaskIndex(store)).filter(item => item !== id);
          await writeTaskIndex(store, ids);
          return withCors(okResponse(200, { id, deleted: true }), request, env);
        }
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const next = mergeTask(existing, parsed.value);
        await setJSON(store, taskKey(id), next);
        return withCors(okResponse(200, next), request, env);
      }

      return withCors(methodNotAllowed('GET, POST, PATCH, DELETE, OPTIONS'), request, env);
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

export default createTasksHandler();
