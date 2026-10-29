import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';

export const config = { path: '/api/embed/resolve' };

const MAX_HOPS = 5;

/** Google Maps Share links (maps.app.goo.gl, goo.gl/maps) are the only short links followed. */
export function isMapsShortLink(url) {
  return url.protocol === 'https:' && (url.hostname === 'maps.app.goo.gl' || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps')));
}

/** Every hop must stay on Google, over https, so this never fetches anything else. */
function isGoogleHop(url) {
  if (url.protocol !== 'https:') return false;
  const host = url.hostname;
  return host === 'goo.gl' || host.endsWith('.goo.gl') || host === 'google.com' || host.endsWith('.google.com');
}

/** Follow a Maps Share link's redirects to the full google.com/maps address. */
export async function resolveMapsShortLink(raw, fetchImpl = fetch) {
  let current;
  try {
    current = new URL(raw);
  } catch {
    return null;
  }
  if (!isMapsShortLink(current)) return null;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const res = await fetchImpl(current.toString(), { method: 'GET', redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) {
      return isMapsShortLink(current) ? null : current.toString();
    }
    const next = new URL(location, current);
    if (!isGoogleHop(next)) return null;
    current = next;
    if (!isMapsShortLink(current) && current.pathname.startsWith('/maps')) return current.toString();
  }
  return null;
}

export function createEmbedResolveHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const raw = new URL(request.url).searchParams.get('url') ?? '';
    let resolved = null;
    try {
      resolved = await resolveMapsShortLink(raw, deps.fetchImpl);
    } catch {
      resolved = null;
    }
    if (!resolved) {
      return withCors(errorResponse(422, 'unresolved', 'That Share link could not be opened. Paste the link from the address bar instead.', false), request, env);
    }
    return withCors(okResponse(200, { url: resolved }, { 'cache-control': 'no-store' }), request, env);
  }, deps);
}

export default createEmbedResolveHandler();
