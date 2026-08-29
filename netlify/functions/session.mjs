import {
  createSessionToken,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
  shouldRefreshSession,
  verifySessionToken
} from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readCookie,
  withCors
} from './_shared/http.mjs';

export const config = { path: '/api/session' };

export function createSessionHandler({
  env = process.env,
  verifySessionToken: verify = verifySessionToken,
  createSessionToken: createToken = createSessionToken,
  serializeSessionCookie: serializeCookie = serializeSessionCookie,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  now = Date.now
} = {}) {
  return async function sessionHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

    let session;
    try {
      session = verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, now());
    } catch {
      return withCors(misconfiguredResponse(), request, env);
    }
    if (!session.valid) {
      return withCors(errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        'set-cookie': clearCookie()
      }), request, env);
    }

    const currentTime = now();
    const headers = {};
    let expiresAt = new Date(session.payload.exp).toISOString();
    if (shouldRefreshSession(session.payload, currentTime)) {
      try {
        const refreshed = createToken({ now: currentTime }, env.SESSION_SECRET);
        headers['set-cookie'] = serializeCookie(refreshed.token);
        expiresAt = refreshed.expiresAt;
      } catch {
        return withCors(misconfiguredResponse(), request, env);
      }
    }

    return withCors(jsonResponse(200, {
      ok: true,
      data: {
        authenticated: true,
        expiresAt
      }
    }, headers), request, env);
  };
}

export default createSessionHandler();
