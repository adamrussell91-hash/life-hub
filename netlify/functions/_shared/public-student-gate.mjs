import {
  errorResponse,
  preflightResponse,
  withCors
} from './http.mjs';
import { isPublicStudentApi } from './public-student-routes.mjs';
import { defaultGetContentStore } from './teaching-blobs.mjs';

export function createPublicStudentHandler(handle, deps = {}) {
  const env = deps.env ?? process.env;
  const loadStore = deps.getContentStore ?? defaultGetContentStore;

  return async function publicStudentHandler(request, context = {}) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const pathname = new URL(request.url).pathname;
    if (!isPublicStudentApi(request.method, pathname)) {
      return withCors(errorResponse(404, 'not_found', 'Not found.', false), request, env);
    }

    let store = null;
    try {
      store = await loadStore();
    } catch {
      store = null;
    }
    if (!store) {
      return withCors(
        errorResponse(503, 'blobs_unbound', 'Teaching content store is not bound.', true),
        request,
        env
      );
    }

    return handle(request, { ...context, env, store });
  };
}
