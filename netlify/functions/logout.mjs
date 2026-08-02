import { serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import { guardRequestOrigin, methodNotAllowed, preflightResponse, withCors } from './_shared/http.mjs';

export const config = { path: '/api/logout' };

export function createLogoutHandler({
  env = process.env,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie
} = {}) {
  return async function logoutHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    return withCors(new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store',
        'set-cookie': clearCookie()
      }
    }), request, env);
  };
}

export default createLogoutHandler();
