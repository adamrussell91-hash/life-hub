import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './http.mjs';
import { createOperatorHandler } from './operator-gate.mjs';
import { readJsonObject } from './teaching-record-get.mjs';

export function createTeachingCollectionHandler({ create }, deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    try {
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
