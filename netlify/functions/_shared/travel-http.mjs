import { serializeExpiredSessionCookie, verifySessionToken } from './auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors,
  okResponse
} from './http.mjs';
import { createTravelRepository } from './travel-repository.mjs';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };

export function createTravelOperatorHandler(handle, deps = {}) {
  const env = deps.env ?? process.env;
  const verify = deps.verifySessionToken ?? verifySessionToken;
  const now = deps.now ?? Date.now;
  const clearCookie = deps.serializeExpiredSessionCookie ?? serializeExpiredSessionCookie;
  const createRepo = deps.createTravelRepository ?? createTravelRepository;

  return async function travelOperatorHandler(request, context = {}) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await run(request, context), request, env);
  };

  async function run(request, context) {
    const originError = guardRequestOrigin(request, env);
    if (originError) return withPrivate(originError);
    if (!isConfigured(env)) return withPrivate(misconfiguredResponse());

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withPrivate(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    let repo;
    try {
      repo = createRepo({ env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github });
    } catch {
      return withPrivate(misconfiguredResponse());
    }

    try {
      return await handle(request, { ...context, env, session, repo, now });
    } catch (error) {
      return mapTravelError(error);
    }
  }
}

export function withPrivate(response) {
  if (response instanceof Response) {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
  }
  return response;
}

export function mapTravelError(error) {
  if (error?.code === 'conflict' || error?.status === 409) {
    return errorResponse(409, 'conflict', error.message || 'Conflict.', false, PRIVATE_CACHE);
  }
  if (error?.code === 'not_found' || error?.status === 404) {
    return errorResponse(404, 'not_found', error.message || 'Not found.', false, PRIVATE_CACHE);
  }
  if (error?.code === 'validation_error') {
    return errorResponse(
      400,
      'validation_error',
      error.message || 'Validation failed.',
      false,
      PRIVATE_CACHE,
      { path: error.path }
    );
  }
  if (error?.code === 'rate_limited' || error?.status === 429) {
    return errorResponse(429, 'rate_limited', error.message, true, PRIVATE_CACHE);
  }
  if (error?.code === 'upstream_unavailable') {
    return errorResponse(503, 'upstream_unavailable', error.message, true, PRIVATE_CACHE);
  }
  console.error('travel handler error', error);
  return errorResponse(500, 'internal_error', 'Something went wrong.', true, PRIVATE_CACHE);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export { okResponse, errorResponse, PRIVATE_CACHE };
