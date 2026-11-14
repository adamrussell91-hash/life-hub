import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { checkRateLimit } from './_shared/travel-rate-limit.mjs';

export const config = { path: '/api/travel-places' };

const UPSTREAM_HEADERS = { 'User-Agent': 'LifeHubTravel/1 (+https://life-hub.adam-russell.com)' };

/**
 * A short name for where a photo was taken, from reverse-geocoder results.
 * Street first, then neighbourhood with its town, then the town. Never a
 * business or landmark: the nearest one to a photo is often the wrong one,
 * and its name is only used when the result itself is a street or an area.
 */
export function placeNameFromReverse(features) {
  const AREA_TYPES = new Set(['street', 'district', 'locality', 'city', 'county']);
  const rows = (Array.isArray(features) ? features : []).map((f) => f?.properties || {});
  const clean = (value) => (typeof value === 'string' ? value.trim() : '');
  for (const p of rows) {
    const street = clean(p.street) || (p.type === 'street' || p.osm_key === 'highway' ? clean(p.name) : '');
    if (street) return street;
  }
  for (const p of rows) {
    const area =
      clean(p.district) || clean(p.locality) || (AREA_TYPES.has(p.type) && p.type !== 'city' ? clean(p.name) : '');
    const town = clean(p.city) || (p.type === 'city' ? clean(p.name) : '');
    if (area && town && area !== town) return `${area}, ${town}`;
    if (area || town) return area || town;
  }
  return null;
}

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
    if (url.searchParams.get('reverse') === '1') {
      const la = Number(lat);
      const lo = Number(lon);
      if (!lat || !lon || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
        return errorResponse(400, 'bad_request', 'A latitude and longitude are needed.', false, PRIVATE_CACHE);
      }
      const params = new URLSearchParams({ lat: String(la), lon: String(lo), limit: '5', lang: 'en' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetchImpl(`https://photon.komoot.io/reverse?${params}`, {
          headers: UPSTREAM_HEADERS,
          signal: controller.signal
        });
        if (!response.ok) {
          return errorResponse(503, 'upstream_unavailable', 'Place names are unavailable right now.', true, PRIVATE_CACHE);
        }
        const body = await response.json();
        return okResponse(200, { name: placeNameFromReverse(body.features) }, PRIVATE_CACHE);
      } catch {
        return errorResponse(503, 'upstream_unavailable', 'Place names are unavailable right now.', true, PRIVATE_CACHE);
      } finally {
        clearTimeout(timer);
      }
    }
    if (!q.trim()) return okResponse(200, { places: [] }, PRIVATE_CACHE);

    const params = new URLSearchParams({ q, limit: '6', lang: 'en' });
    if (lat) params.set('lat', lat);
    if (lon) params.set('lon', lon);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(`https://photon.komoot.io/api/?${params}`, {
        headers: UPSTREAM_HEADERS,
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
