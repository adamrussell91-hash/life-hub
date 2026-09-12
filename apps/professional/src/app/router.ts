import {
  isValidCommunicationId,
  isValidEventId,
  isValidMeetingId,
  isValidOrganisationId,
  isValidPersonId
} from '@/domain/ids';

export type RailViewId =
  | 'people'
  | 'organisations'
  | 'relationships'
  | 'communications'
  | 'meetings'
  | 'events';

export type Route =
  | { name: 'people' }
  | { name: 'person'; id: string }
  | { name: 'organisations' }
  | { name: 'organisation'; id: string }
  | { name: 'relationships' }
  | { name: 'communications' }
  | { name: 'communication-new' }
  | { name: 'communication'; id: string }
  | { name: 'meetings' }
  | { name: 'meeting-new' }
  | { name: 'meeting'; id: string }
  | { name: 'events' }
  | { name: 'event-new' }
  | { name: 'event'; id: string }
  | { name: 'not-found'; path: string };

/**
 * Parses the hash into a route, validating any decoded identifier against
 * the same shape the server contracts require *before* it is ever used to
 * build a request URL. A route segment containing a path separator or an
 * encoded traversal sequence never produces a valid detail route.
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
  if (segments.length === 1 && segments[0] === 'meetings') return { name: 'meetings' };
  if (segments.length === 1 && segments[0] === 'events') return { name: 'events' };

  if (segments.length === 2 && segments[0] === 'communication' && segments[1] === 'new') {
    return { name: 'communication-new' };
  }
  if (segments.length === 2 && segments[0] === 'meeting' && segments[1] === 'new') {
    return { name: 'meeting-new' };
  }
  if (segments.length === 2 && segments[0] === 'event' && segments[1] === 'new') {
    return { name: 'event-new' };
  }

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

  if (segments.length === 2 && segments[0] === 'communication') {
    const id = safeDecode(segments[1]!);
    if (id && isValidCommunicationId(id)) return { name: 'communication', id };
    return { name: 'not-found', path };
  }

  if (segments.length === 2 && segments[0] === 'meeting') {
    const id = safeDecode(segments[1]!);
    if (id && isValidMeetingId(id)) return { name: 'meeting', id };
    return { name: 'not-found', path };
  }

  if (segments.length === 2 && segments[0] === 'event') {
    const id = safeDecode(segments[1]!);
    if (id && isValidEventId(id)) return { name: 'event', id };
    return { name: 'not-found', path };
  }

  return { name: 'not-found', path };
}

function safeDecode(segment: string): string | null {
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
  if (
    route.name === 'communications' ||
    route.name === 'communication' ||
    route.name === 'communication-new'
  ) {
    return 'communications';
  }
  if (route.name === 'meetings' || route.name === 'meeting' || route.name === 'meeting-new') {
    return 'meetings';
  }
  if (route.name === 'events' || route.name === 'event' || route.name === 'event-new') {
    return 'events';
  }
  return null;
}

export function personRoute(id: string): string {
  return `#/person/${encodeURIComponent(id)}`;
}

export function organisationRoute(id: string): string {
  return `#/organisation/${encodeURIComponent(id)}`;
}

export function communicationRoute(id: string): string {
  return `#/communication/${encodeURIComponent(id)}`;
}

export function meetingRoute(id: string): string {
  return `#/meeting/${encodeURIComponent(id)}`;
}

export function eventRoute(id: string): string {
  return `#/event/${encodeURIComponent(id)}`;
}
