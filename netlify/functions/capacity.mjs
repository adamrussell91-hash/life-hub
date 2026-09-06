import {
  errorResponse,
  guardRequestOrigin,
  methodNotAllowed,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import {
  ensureCapacityShare,
  getCapacityShare,
  getCapacitySnapshot,
  getPublicCapacityByToken,
  rotateCapacityShare
} from './_shared/tasks-network.mjs';

export const config = { path: '/api/capacity' };

const tasksGate = {
  unboundCode: 'tasks_blobs_unbound',
  unboundMessage: 'Tasks content store is not bound.',
  getContentStore: defaultGetTasksStore
};

async function publicCapacity(request, env, token, loadStore) {
  const originError = guardRequestOrigin(request, env);
  if (originError) return withCors(originError, request, env);
  let store;
  try {
    store = await loadStore(env);
  } catch {
    store = null;
  }
  if (!store) {
    return withCors(
      errorResponse(503, tasksGate.unboundCode, tasksGate.unboundMessage, true),
      request,
      env
    );
  }
  const view = await getPublicCapacityByToken(store, token);
  if (!view) {
    return withCors(errorResponse(404, 'not_found', 'Unknown share', false), request, env);
  }
  return withCors(okResponse(200, view), request, env);
}

export function createCapacityHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const loadStore = deps.getContentStore ?? defaultGetTasksStore;
  const operator = createOperatorHandler(async (request, context) => {
    const { store } = context;
    try {
      if (request.method === 'GET') {
        return withCors(
          okResponse(200, {
            snapshot: await getCapacitySnapshot(store),
            share: await getCapacityShare(store)
          }),
          request,
          env
        );
      }
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      if (parsed.value.action === 'ensure_share') {
        return withCors(
          okResponse(200, { share: await ensureCapacityShare(store) }),
          request,
          env
        );
      }
      if (parsed.value.action === 'rotate_share') {
        return withCors(
          okResponse(200, { share: await rotateCapacityShare(store) }),
          request,
          env
        );
      }
      return withCors(
        errorResponse(400, 'unknown_action', 'Unknown capacity action', false),
        request,
        env
      );
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
    getContentStore: loadStore
  });

  return async function capacityHandler(request, context = {}) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    const token = new URL(request.url).searchParams.get('token');
    if (request.method === 'GET' && token) {
      return publicCapacity(request, env, token, loadStore);
    }
    return operator(request, context);
  };
}

export default createCapacityHandler();
