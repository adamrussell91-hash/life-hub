import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './http.mjs';
import { createOperatorHandler } from './operator-gate.mjs';
import { getJSON, readPublishedId } from './teaching-blobs.mjs';

export function createTeachingRecordGetHandler({ keyFor, notFound }, deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }
    const id = readPublishedId(request, context);
    if (!id) {
      return withCors(errorResponse(404, 'not_found', notFound, false), request, env);
    }
    const record = await getJSON(store, keyFor(id));
    if (!record) {
      return withCors(errorResponse(404, 'not_found', notFound, false), request, env);
    }
    return withCors(okResponse(200, record), request, env);
  }, deps);
}
