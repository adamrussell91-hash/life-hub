import { verifySessionToken } from './auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './http.mjs';
import { isPublicStudentApi } from './public-student-routes.mjs';
import { defaultGetContentStore } from './teaching-blobs.mjs';

export function createOperatorHandler(handle, deps = {}) {
  const env = deps.env ?? process.env;
  const verify = deps.verifySessionToken ?? verifySessionToken;
  const now = deps.now ?? Date.now;
  const loadStore = deps.getContentStore ?? defaultGetContentStore;

  return async function operatorHandler(request, context = {}) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const pathname = new URL(request.url).pathname;
    if (isPublicStudentApi(request.method, pathname)) {
      return withCors(errorResponse(404, 'not_found', 'Not found.', false), request, env);
    }

    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withCors(misconfiguredResponse(), request, env);
    }
    if (!session.valid) {
      return withCors(
        errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false),
        request,
        env
      );
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

    return handle(request, { ...context, env, store, session });
  };
}
