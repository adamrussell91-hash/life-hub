import {
  createSessionToken,
  serializeSessionCookie,
  verifyPassphrase
} from './_shared/auth-security.mjs';
import {
  errorResponse,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  requireSameOrigin
} from './_shared/http.mjs';

const MAX_BODY_BYTES = 1_024;

export const config = {
  path: '/api/auth',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 5, windowSize: 60 }
};

export function createAuthHandler({
  env = process.env,
  verifyPassphrase: verify = verifyPassphrase,
  createSessionToken: createToken = createSessionToken,
  serializeSessionCookie: serializeCookie = serializeSessionCookie,
  now = Date.now,
  randomBytes
} = {}) {
  return async function authHandler(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    if (!requireSameOrigin(request)) {
      return errorResponse(403, 'forbidden', 'This request origin is not allowed.', false);
    }
    if (!isJsonRequest(request)) {
      return errorResponse(415, 'unsupported_media_type', 'This endpoint accepts JSON requests only.', false);
    }
    if (!isConfigured(env)) return misconfiguredResponse();

    const parsed = await parseBody(request);
    if (parsed.error) return parsed.error;

    let accepted = false;
    try {
      accepted = await verify(parsed.passphrase, env.LIFE_HUB_PASSPHRASE_HASH);
    } catch {
      accepted = false;
    }
    if (!accepted) {
      return errorResponse(401, 'invalid_credentials', 'That passphrase was not accepted.', true);
    }

    try {
      const session = createToken({ now: now(), ...(randomBytes ? { randomBytes } : {}) }, env.SESSION_SECRET);
      return jsonResponse(200, {
        ok: true,
        data: { authenticated: true, expiresAt: session.expiresAt }
      }, { 'set-cookie': serializeCookie(session.token) });
    } catch {
      return misconfiguredResponse();
    }
  };
}

function isJsonRequest(request) {
  return request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

async function parseBody(request) {
  let bytes;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'The request body was not valid JSON.', false) };
  }
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false) };
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'The request body was not valid JSON.', false) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.passphrase !== 'string') {
    return { error: errorResponse(400, 'invalid_request', 'The request body was not valid JSON.', false) };
  }
  return { passphrase: body.passphrase };
}

export default createAuthHandler();
