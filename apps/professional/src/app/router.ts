import { isValidOrganisationId, isValidPersonId } from '@/domain/ids';

export type RailViewId = 'people' | 'organisations' | 'relationships' | 'communications';

export type Route =
  | { name: 'people' }
  | { name: 'person'; id: string }
  | { name: 'organisations' }
  | { name: 'organisation'; id: string }
  | { name: 'relationships' }
  | { name: 'communications' }
  | { name: 'not-found'; path: string };

/**
 * Parses the hash into a route, validating any decoded identifier against
 * the same shape the server contracts require *before* it is ever used to
 * build a request URL. A route segment containing a path separator or an
 * encoded traversal sequence never produces a valid `person`/`organisation`
 * route — it falls through to `not-found` instead, exactly like any other
 * unrecognised path.
 */
export function parseRoute(hash: string = location.hash): Route {
  const raw = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const path = raw.replace(/\/+$/, '');
  if (path === '' || path === '/') return { name: 'people' };

  const segments = path.split('/').filter(Boolean);

  if (segments.length === 1 && segments[0] === 'people') return { name: 'people' };
  if (segments.length === 1 && segments[0] === 'organisations') return { name: 'organisations' };
  if (segments.length === 1 && segments[0] === 'relationships') return { name: 'relationships' };
  if (segments.length === 1 && segments[0] === 'communications') return { name: 'communications' };

  if (segments.length === 2 && segments[0] === 'person') {
    const id = safeDecode(segments[1]!);
    if (id && isValidPersonId(id)) return { name: 'person', id };
    return { name: 'not-found', path };
  }

  if (segments.length === 2 && segments[0] === 'organisation') {
    const id = safeDecode(segments[1]!);
    if (id && isValidOrganisationId(id)) return { name: 'organisation', id };
    return { name: 'not-found', path };
  }

  return { name: 'not-found', path };
}

function safeDecode(segment: string): string | null {
  // A raw, un-decoded path separator (encoded or not) never survives to
  // look like a valid id — reject before decoding, and again after, since
  // decoding itself can introduce one (`%2F` -> `/`, `%2E%2E` -> `..`).
  if (segment.includes('/') || segment.includes('\\')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) return null;
  return decoded;
}

export function railHighlightFor(route: Route): RailViewId | null {
  if (route.name === 'people' || route.name === 'person') return 'people';
  if (route.name === 'organisations' || route.name === 'organisation') return 'organisations';
  if (route.name === 'relationships') return 'relationships';
  if (route.name === 'communications') return 'communications';
  return null;
}

export function personRoute(id: string): string {
  return `#/person/${encodeURIComponent(id)}`;
}

export function organisationRoute(id: string): string {
  return `#/organisation/${encodeURIComponent(id)}`;
}
