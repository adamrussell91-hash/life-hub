import { serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import { errorResponse, methodNotAllowed, requireSameOrigin } from './_shared/http.mjs';

export const config = { path: '/api/logout' };

export function createLogoutHandler({
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie
} = {}) {
  return async function logoutHandler(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    if (!requireSameOrigin(request)) {
      return errorResponse(403, 'forbidden', 'This request origin is not allowed.', false);
    }
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
