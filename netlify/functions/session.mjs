import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import {
  errorResponse,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  readCookie
} from './_shared/http.mjs';

export const config = { path: '/api/session' };

export function createSessionHandler({
  env = process.env,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  now = Date.now
} = {}) {
  return async function sessionHandler(request) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    if (!isConfigured(env)) return misconfiguredResponse();

    let session;
    try {
      session = verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, now());
    } catch {
      return misconfiguredResponse();
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        'set-cookie': clearCookie()
      });
    }

    return jsonResponse(200, {
      ok: true,
      data: {
        authenticated: true,
        expiresAt: new Date(session.payload.exp).toISOString()
      }
    });
  };
}

export default createSessionHandler();
