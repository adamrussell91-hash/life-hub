import {
  createSessionToken,
  serializeSessionCookie,
  verifyPassphrase
} from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  withCors
} from './_shared/http.mjs';

const MAX_BODY_BYTES = 1_024;
const BODY_TOO_LARGE = Symbol('body_too_large');

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
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (!isJsonRequest(request)) {
      return withCors(errorResponse(415, 'unsupported_media_type', 'This endpoint accepts JSON requests only.', false), request, env);
    }
    if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

    const parsed = await parseBody(request);
    if (parsed.error) return withCors(parsed.error, request, env);

    let accepted = false;
    try {
      accepted = await verify(parsed.passphrase, env.LIFE_HUB_PASSPHRASE_HASH);
    } catch {
      accepted = false;
    }
    if (!accepted) {
      return withCors(errorResponse(401, 'invalid_credentials', 'That passphrase was not accepted.', true), request, env);
    }

    try {
      const session = createToken({ now: now(), ...(randomBytes ? { randomBytes } : {}) }, env.SESSION_SECRET);
      return withCors(jsonResponse(200, {
        ok: true,
        data: { authenticated: true, expiresAt: session.expiresAt }
      }, { 'set-cookie': serializeCookie(session.token) }), request, env);
    } catch {
      return withCors(misconfiguredResponse(), request, env);
    }
  };
}

function isJsonRequest(request) {
  return request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

async function parseBody(request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) &&
      decimalExceeds(contentLength, MAX_BODY_BYTES)) {
    void request.body?.cancel().catch(() => undefined);
    return { error: requestTooLarge() };
  }

  let bytes;
  try {
    bytes = await readAtMost(request.body, MAX_BODY_BYTES);
  } catch (error) {
    if (error === BODY_TOO_LARGE) return { error: requestTooLarge() };
    return { error: errorResponse(400, 'invalid_request', 'The request body was not valid JSON.', false) };
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

async function readAtMost(stream, limit) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel().catch(() => undefined);
        throw BODY_TOO_LARGE;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error === BODY_TOO_LARGE) throw error;
    throw new Error('request_read_failed');
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requestTooLarge() {
  return errorResponse(413, 'request_too_large', 'The request body is too large.', false);
}

function decimalExceeds(value, limit) {
  const normalized = value.replace(/^0+/, '') || '0';
  const maximum = String(limit);
  return normalized.length > maximum.length ||
    (normalized.length === maximum.length && normalized > maximum);
}

export default createAuthHandler();
