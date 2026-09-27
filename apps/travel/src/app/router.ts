export type Route =
  | { name: 'trips' }
  | { name: 'trip'; tripId: string; cityId?: string; date?: string }
  | { name: 'today' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeSegment(segment: string): string | null {
  if (!segment || segment.includes('/') || segment.includes('\\')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) return null;
  return decoded;
}

/** Hash routes (§2.1): `#/`, `#/trip/:tripId[/:cityId/:date]`, `#/today`.
 * Anything else falls back to the trips list. */
export function parseRoute(hash: string = location.hash): Route {
  const raw = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const path = raw.replace(/\/+$/, '');
  if (path === '' || path === '/') return { name: 'trips' };

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 1 && segments[0] === 'today') return { name: 'today' };

  if (segments[0] === 'trip' && segments.length >= 2) {
    const tripId = safeSegment(segments[1]!);
    if (!tripId) return { name: 'trips' };
    if (segments.length === 2) return { name: 'trip', tripId };
    if (segments.length === 4) {
      const cityId = safeSegment(segments[2]!);
      const date = segments[3]!;
      if (cityId && DATE_RE.test(date)) return { name: 'trip', tripId, cityId, date };
    }
    return { name: 'trips' };
  }

  return { name: 'trips' };
}

export function tripsRoute(): string {
  return '#/';
}

export function todayRoute(): string {
  return '#/today';
}

export function tripRoute(tripId: string, cityId?: string, date?: string): string {
  if (cityId && date) return `#/trip/${encodeURIComponent(tripId)}/${encodeURIComponent(cityId)}/${date}`;
  return `#/trip/${encodeURIComponent(tripId)}`;
}

export function navigate(hash: string): void {
  location.hash = hash;
}
