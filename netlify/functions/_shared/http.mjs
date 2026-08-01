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

export function guardRequestOrigin(request) {
  return requireSameOrigin(request)
    ? null
    : errorResponse(403, 'forbidden', 'This request origin is not allowed.', false);
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

export function methodNotAllowed(allow) {
  return errorResponse(405, 'method_not_allowed', 'This method is not allowed.', false, { allow });
}

export function isConfigured(env) {
  return typeof env?.LIFE_HUB_PASSPHRASE_HASH === 'string' && env.LIFE_HUB_PASSPHRASE_HASH.length > 0 &&
    typeof env?.SESSION_SECRET === 'string' && Buffer.byteLength(env.SESSION_SECRET, 'utf8') >= 32;
}

export function misconfiguredResponse() {
  return errorResponse(503, 'misconfigured', 'This service is not configured.', false);
}
