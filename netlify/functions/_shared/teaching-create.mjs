import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './http.mjs';
import { createOperatorHandler } from './operator-gate.mjs';
import { listJSON } from './teaching-blobs.mjs';
import { readJsonObject } from './teaching-record-get.mjs';

export function createTeachingCollectionHandler({ create, listPrefix, listKey }, deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET' && listPrefix && listKey) {
        const items = await listJSON(store, listPrefix);
        return withCors(okResponse(200, { [listKey]: items }), request, env);
      }
      if (request.method !== 'POST') {
        return withCors(
          methodNotAllowed(listPrefix ? 'GET, POST, OPTIONS' : 'POST, OPTIONS'),
          request,
          env
        );
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const record = await create(store, parsed.value);
      return withCors(okResponse(201, record), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      const code = typeof error?.code === 'string' ? error.code : 'blobs_unbound';
      const message = typeof error?.message === 'string' && error.status
        ? error.message
        : 'Teaching content store is not bound.';
      return withCors(errorResponse(status, code, message, status >= 500), request, env);
    }
  }, deps);
}

export function teachingWriteError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
