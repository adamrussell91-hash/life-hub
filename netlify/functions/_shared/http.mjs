import {
  UMBRELLA_PASSPHRASE_HASH_ENV,
  UMBRELLA_SESSION_COOKIE,
  UMBRELLA_SESSION_SECRET_ENV
} from './umbrella-auth.mjs';
import { isAllowedRequestOrigin } from './umbrella-origins.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

export function okResponse(status, data, headers = {}) {
  return jsonResponse(status, { ok: true, data }, headers);
}

export function errorResponse(status, code, message, retryable, headers = {}) {
  return jsonResponse(status, {
    ok: false,
    error: { code, message, retryable }
  }, headers);
}

export function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (origin === null || origin === new URL(request.url).origin) &&
    (fetchSite === null || fetchSite.toLowerCase() === 'same-origin');
}

// The site (GitHub Pages) and this API (Netlify Functions) are different origins by
// design, so a request is allowed if it's same-origin (local dev, direct calls) OR
// from SITE_ORIGIN / the umbrella app origin list (Life + Teaching Pages).
export function requireAllowedOrigin(request, env) {
  if (requireSameOrigin(request)) return true;
  return isAllowedRequestOrigin(request.headers.get('origin'), env);
}

export function guardRequestOrigin(request, env) {
  return requireAllowedOrigin(request, env)
    ? null
    : errorResponse(403, 'forbidden', 'This request origin is not allowed.', false);
}

export function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!isAllowedRequestOrigin(origin, env)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin'
  };
}

export function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export function preflightResponse(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function readCookie(request, name) {
  const prefix = `${name}=`;
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;

  for (const part of cookies.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

export function readUmbrellaSessionCookie(request) {
  return readCookie(request, UMBRELLA_SESSION_COOKIE);
}

export function umbrellaSessionSecret(env) {
  return env?.[UMBRELLA_SESSION_SECRET_ENV];
}

export function methodNotAllowed(allow) {
  return errorResponse(405, 'method_not_allowed', 'This method is not allowed.', false, { allow });
}

export function isConfigured(env) {
  const passphrase = env?.[UMBRELLA_PASSPHRASE_HASH_ENV];
  const sessionSecret = env?.[UMBRELLA_SESSION_SECRET_ENV];
  return typeof passphrase === 'string' && passphrase.length > 0 &&
    typeof sessionSecret === 'string' && Buffer.byteLength(sessionSecret, 'utf8') >= 32;
}

export function misconfiguredResponse() {
  return errorResponse(503, 'misconfigured', 'This service is not configured.', false);
}
