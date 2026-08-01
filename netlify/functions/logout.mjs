import { serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import { guardRequestOrigin, methodNotAllowed } from './_shared/http.mjs';

export const config = { path: '/api/logout' };

export function createLogoutHandler({
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie
} = {}) {
  return async function logoutHandler(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const originError = guardRequestOrigin(request);
    if (originError) return originError;
    return new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store',
        'set-cookie': clearCookie()
      }
    });
  };
}

export default createLogoutHandler();
