import { serializeExpiredSessionCookie, verifySessionToken } from './_shared/auth-security.mjs';
import { bumpSessionEpoch } from './_shared/auth-state.mjs';
import {
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';

export const config = { path: '/api/logout' };

/**
 * Sign out everywhere. A request holding a valid session bumps the server-side
 * session epoch, which revokes every session token issued so far (this browser's and
 * any other device's or copied cookie). A request without a valid session only clears
 * its own cookie, so an anonymous caller cannot sign the owner out.
 */
export function createLogoutHandler({
  env = process.env,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  verifySessionToken: verify = verifySessionToken,
  bumpSessionEpoch: bump = bumpSessionEpoch,
  now = Date.now
} = {}) {
  return async function logoutHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    let revoked = false;
    const cookie = readUmbrellaSessionCookie(request);
    if (cookie && isConfigured(env)) {
      try {
        const session = await verify(cookie, umbrellaSessionSecret(env), now());
        if (session?.valid) {
          await bump({ now: now() });
          revoked = true;
        }
      } catch (error) {
        // Still clear this browser's cookie; say so in the log so a failed revoke is visible.
        console.warn(`logout: session epoch not bumped (${error?.name ?? 'error'})`);
      }
    }
    return withCors(new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store',
        'set-cookie': clearCookie(),
        'x-sessions-revoked': revoked ? 'all' : 'none'
      }
    }), request, env);
  };
}

export default createLogoutHandler();
