import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { checkRateLimit } from './_shared/travel-rate-limit.mjs';

export const config = { path: '/api/travel-places' };

export function createTravelPlacesHandler(deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.', false, PRIVATE_CACHE);
    }
    const sessionKey = ctx.session?.token || ctx.session?.id || 'anon';
    checkRateLimit(`places:${sessionKey}`, { now: ctx.now() });

    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    if (!q.trim()) return okResponse(200, { places: [] }, PRIVATE_CACHE);

    const params = new URLSearchParams({ q, limit: '6', lang: 'en' });
    if (lat) params.set('lat', lat);
    if (lon) params.set('lon', lon);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(`https://photon.komoot.io/api/?${params}`, {
        headers: { 'User-Agent': 'LifeHubTravel/1 (+https://life-hub.adam-russell.com)' },
        signal: controller.signal
      });
      if (!response.ok) {
        return errorResponse(
          503,
          'upstream_unavailable',
          'Search is unavailable right now. Pick it on the map instead.',
          true,
          PRIVATE_CACHE
        );
      }
      const body = await response.json();
      const places = (body.features || []).slice(0, 6).map((f) => {
        const p = f.properties || {};
        const [lng, la] = f.geometry?.coordinates || [0, 0];
        const name = [p.name, p.street, p.city, p.country].filter(Boolean).join(', ') || p.name || 'Place';
        return {
          name,
          lat: la,
          lon: lng,
          address: [p.street, p.housenumber, p.postcode, p.city].filter(Boolean).join(' ')
        };
      });
      return okResponse(200, { places }, PRIVATE_CACHE);
    } catch {
      return errorResponse(
        503,
        'upstream_unavailable',
        'Search is unavailable right now. Pick it on the map instead.',
        true,
        PRIVATE_CACHE
      );
    } finally {
      clearTimeout(timer);
    }
  }, deps);
}

export default createTravelPlacesHandler();
