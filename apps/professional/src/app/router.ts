import {
  isValidApplicationId,
  isValidCommunicationId,
  isValidEventId,
  isValidMeetingId,
  isValidOrganisationId,
  isValidPdGroupId,
  isValidPersonId,
  isValidThreadId
} from '@/domain/ids';

export type RailViewId =
  | 'home'
  | 'calendar'
  | 'people'
  | 'organisations'
  | 'relationships'
  | 'communications'
  | 'meetings'
  | 'events'
  | 'applications'
  | 'career'
  | 'network-ecology';

export type Route =
  | { name: 'home' }
  | { name: 'calendar'; zoom: string; redirectedFrom?: string }
  | { name: 'people'; id: string | null }
  | { name: 'person'; id: string }
  | { name: 'person-brief'; id: string }
  | { name: 'organisations' }
  | { name: 'organisations-compare' }
  | { name: 'organisation'; id: string }
  | { name: 'relationships' }
  | { name: 'communications' }
  | { name: 'meetings' }
  | { name: 'events' }
  | { name: 'communication-new' }
  | { name: 'communication'; id: string }
  | { name: 'meeting-new' }
  | { name: 'meeting'; id: string }
  | { name: 'event-new' }
  | { name: 'event'; id: string }
  | { name: 'thread'; id: string }
  | { name: 'pd-group'; id: string }
  | { name: 'log' }
  | { name: 'applications' }
  | { name: 'application-new' }
  | { name: 'application'; id: string }
  | { name: 'career' }
  | { name: 'career-application-new' }
  | { name: 'career-application'; id: string }
  | { name: 'career-future'; id: string }
  | { name: 'career-card'; id: string }
  | { name: 'network-ecology' }
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
  if (path === '' || path === '/') return { name: 'home' };

  const segments = path.split('/').filter(Boolean);

  if (segments.length === 1 && segments[0] === 'home') return { name: 'home' };
  if (segments.length === 1 && segments[0] === 'calendar') return { name: 'calendar', zoom: 'week' };
  if (segments.length === 2 && segments[0] === 'calendar') {
    const zoom = segments[1] === 'month' ? 'week' : segments[1]!;
    return { name: 'calendar', zoom };
  }
  if (segments.length === 1 && segments[0] === 'people') return { name: 'people', id: null };
  if (segments.length === 2 && segments[0] === 'people') {
    const id = safeDecode(segments[1]!);
    if (id && isValidPersonId(id)) return { name: 'people', id };
    return { name: 'not-found', path };
  }
  if (segments.length === 1 && segments[0] === 'organisations') return { name: 'organisations' };
  if (segments.length === 2 && segments[0] === 'organisations' && segments[1] === 'compare') {
    return { name: 'organisations-compare' };
  }
  if (segments.length === 2 && segments[0] === 'organisations') {
    const id = safeDecode(segments[1]!);
    if (id && isValidOrganisationId(id)) return { name: 'organisation', id };
    return { name: 'not-found', path };
  }
  if (segments.length === 1 && segments[0] === 'relationships') return { name: 'relationships' };
  if (segments.length === 1 && segments[0] === 'communications') return { name: 'communications' };
  if (segments.length === 1 && segments[0] === 'meetings') return { name: 'meetings' };
  if (segments.length === 1 && segments[0] === 'events') return { name: 'events' };
  if (segments.length === 1 && segments[0] === 'applications') return { name: 'applications' };
  if (segments.length === 1 && segments[0] === 'career') return { name: 'career' };
  if (segments.length === 1 && segments[0] === 'network-ecology') return { name: 'network-ecology' };
  if (segments.length === 1 && segments[0] === 'log') return { name: 'log' };

  if (segments.length === 2 && segments[0] === 'career' && segments[1] === 'application') {
    return { name: 'not-found', path };
  }
  if (segments.length === 3 && segments[0] === 'career' && segments[1] === 'application' && segments[2] === 'new') {
    return { name: 'career-application-new' };
  }
  if (segments.length === 3 && segments[0] === 'career' && segments[1] === 'application') {
    const id = safeDecode(segments[2]!);
    if (id && isValidApplicationId(id)) return { name: 'career-application', id };
    return { name: 'not-found', path };
  }
  if (segments.length === 3 && segments[0] === 'career' && segments[1] === 'future') {
    const id = safeDecode(segments[2]!);
    if (id) return { name: 'career-future', id };
    return { name: 'not-found', path };
  }
  if (segments.length === 3 && segments[0] === 'career' && segments[1] === 'card') {
    const id = safeDecode(segments[2]!);
    if (id) return { name: 'career-card', id };
    return { name: 'not-found', path };
  }

  if (segments.length === 2 && segments[0] === 'communication' && segments[1] === 'new') {
    return { name: 'communication-new' };
  }
  if (segments.length === 2 && segments[0] === 'meeting' && segments[1] === 'new') {
    return { name: 'meeting-new' };
  }
  if (segments.length === 2 && segments[0] === 'event' && segments[1] === 'new') {
    return { name: 'event-new' };
  }
  if (segments.length === 2 && segments[0] === 'application' && segments[1] === 'new') {
    return { name: 'application-new' };
  }

  if (segments.length === 2 && segments[0] === 'person') {
    const id = safeDecode(segments[1]!);
    if (id && isValidPersonId(id)) return { name: 'person', id };
    return { name: 'not-found', path };
  }

  // Person Brief (Phase 3, Feature 3.1) — a 3-segment path, `#/person/<id>/
  // brief`. Every other detail route in this app is 2 segments
  // (`#/<kind>/<id>`); this is the first 3-segment route, so it gets its own
  // branch rather than trying to generalise `safeDecode`'s existing
  // strict-2-segment handling.
  if (segments.length === 3 && segments[0] === 'person' && segments[2] === 'brief') {
    const id = safeDecode(segments[1]!);
    if (id && isValidPersonId(id)) return { name: 'person-brief', id };
    return { name: 'not-found', path };
  }

  // Legacy singular path — keep resolving so old links still open.
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

  if (segments.length === 2 && segments[0] === 'application') {
    const id = safeDecode(segments[1]!);
    if (id && isValidApplicationId(id)) return { name: 'application', id };
    return { name: 'not-found', path };
  }

  if (segments.length === 2 && segments[0] === 'thread') {
    const id = safeDecode(segments[1]!);
    if (id && isValidThreadId(id)) return { name: 'thread', id };
    return { name: 'not-found', path };
  }

  if (segments.length === 2 && segments[0] === 'pd-group') {
    const id = safeDecode(segments[1]!);
    if (id && isValidPdGroupId(id)) return { name: 'pd-group', id };
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
  if (route.name === 'home') return 'home';
  if (route.name === 'calendar' || route.name === 'thread' || route.name === 'pd-group' || route.name === 'log') {
    return 'calendar';
  }
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
  if (route.name === 'people' || route.name === 'person' || route.name === 'person-brief') return 'people';
  if (route.name === 'organisations' || route.name === 'organisation') return 'organisations';
  if (route.name === 'relationships') return 'relationships';
  if (
    route.name === 'applications' ||
    route.name === 'application' ||
    route.name === 'application-new' ||
    route.name === 'career' ||
    route.name === 'career-application' ||
    route.name === 'career-application-new' ||
    route.name === 'career-future' ||
    route.name === 'career-card'
  ) {
    return 'career';
  }
  if (route.name === 'network-ecology') return 'network-ecology';
  return null;
}

/** Canonical People page with optional selected person (`#/people` or `#/people/<id>`). */
export function personRoute(id: string): string {
  return `#/people/${encodeURIComponent(id)}`;
}

/** @deprecated Brief is the profile pane — redirects to `#/people/<id>`. */
export function personBriefRoute(id: string): string {
  return `#/people/${encodeURIComponent(id)}`;
}

export function peopleRoute(id: string | null = null, query = ''): string {
  const base = id ? `#/people/${encodeURIComponent(id)}` : '#/people';
  return `${base}${query}`;
}

export function organisationRoute(id: string, query = ''): string {
  return `#/organisations/${encodeURIComponent(id)}${query}`;
}

/** Crest wall or organisation detail. Prefer plural path (BUILD-PLAN). */
export function organisationsRoute(id: string | null = null, query = ''): string {
  if (!id) return `#/organisations${query}`;
  return `#/organisations/${encodeURIComponent(id)}${query}`;
}

export function communicationRoute(id: string): string {
  return `#/communication/${encodeURIComponent(id)}`;
}

export function meetingRoute(id: string): string {
  return `#/meeting/${encodeURIComponent(id)}`;
}

export function threadRoute(id: string): string {
  return `#/thread/${encodeURIComponent(id)}`;
}

export function eventRoute(id: string): string {
  return `#/event/${encodeURIComponent(id)}`;
}

export function applicationRoute(id: string): string {
  return `#/career/application/${encodeURIComponent(id)}`;
}

export function careerApplicationNewRoute(): string {
  return '#/career/application/new';
}

export function careerFutureRoute(id: string): string {
  return `#/career/future/${encodeURIComponent(id)}`;
}

export function careerCardRoute(id: string): string {
  return `#/career/card/${encodeURIComponent(id)}`;
}

/** Redirect legacy Applications URLs. Returns true when a replace was issued. */
export function redirectLegacyCareerHash(hash: string = location.hash): boolean {
  const raw = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const path = raw.replace(/\/+$/, '');
  if (path === 'applications') {
    location.replace('#/career');
    try {
      sessionStorage.setItem('career-scroll-to', 'applications');
    } catch {
      /* ignore */
    }
    return true;
  }
  if (path === 'application/new') {
    location.replace('#/career/application/new');
    return true;
  }
  const match = /^application\/([^/]+)$/.exec(path);
  if (match?.[1] && isValidApplicationId(safeDecode(match[1]) ?? '')) {
    location.replace(`#/career/application/${encodeURIComponent(safeDecode(match[1])!)}`);
    return true;
  }
  return false;
}
