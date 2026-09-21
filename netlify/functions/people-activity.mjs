import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { getRelationshipDeclaration } from './_shared/relationship-registry.mjs';
import {
  compareTimelineOrder,
  decodeTimelineCursor,
  encodeTimelineCursor
} from './_shared/entity-overview.mjs';
import { loadAllPeopleWithRelationships } from './_shared/people-collection.mjs';

// Recent Activity strip data layer (Phase 2, Feature 2.3 support / People
// Home section 4's "Recent Activity strip"). GET-only.
//
// A union of every person's own timeline entries — reusing
// `loadAllPeopleWithRelationships`'s already-hydrated relationship arrays
// (every Universal Link touching any Person, of any relationship type, not
// just professional_relationship) rather than re-deriving them, and
// building a LIGHTER parallel timeline-entry path here rather than calling
// `assembleEntityOverview` once per person: that function resolves a
// `context_href` per entry (an extra I/O hop) and re-lists membership from
// storage per person — both already paid for by `loadAllPeopleWithRelationships`
// — so reusing it here would mean either a second full storage scan (one
// call per person) or threading enough overrides through it to skip most of
// what it does, at which point it is no longer meaningfully "reuse."
// `label`/`kind`/date-priority mirror `entity-overview.mjs`'s own (private)
// `timelineLabel`/`timelineKind`/`effectiveDate` exactly, so an activity
// entry reads the same way a Person Profile timeline entry does.
//
// Sorting reuses the exact same `compareTimelineOrder`, and pagination
// reuses the exact same `encodeTimelineCursor`/`decodeTimelineCursor`
// entity-overview.mjs already exports — this endpoint's cursor is
// interchangeable with that one's, per the plan's explicit instruction not
// to invent a new cursor shape.
export const config = { path: '/api/people/activity' };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function effectiveDate(link) {
  return link.occurred_at ?? link.valid_from ?? link.created_at ?? null;
}

function timelineKind(link) {
  if (link.temporal_mode === 'point') return 'point';
  if (link.temporal_mode === 'period') return 'period';
  return 'change';
}

function timelineLabel({ link, endpoint, direction }) {
  if (direction === 'outgoing') return `${link.relationship_type} ${endpoint.display_label}`.trim();
  const declaration = getRelationshipDeclaration(link.relationship_type);
  const inverse = declaration?.inverse_label ?? link.relationship_type;
  return `${inverse} ${endpoint.display_label}`.trim();
}

function buildActivityEntries(peopleWithRelationships) {
  const byId = new Map();
  for (const { relationships } of peopleWithRelationships) {
    for (const entry of relationships) {
      if (byId.has(entry.link.id)) continue;
      byId.set(entry.link.id, {
        id: entry.link.id,
        kind: timelineKind(entry.link),
        date: effectiveDate(entry.link),
        end_date: entry.link.valid_to ?? null,
        relationship_type: entry.link.relationship_type,
        status: entry.link.status,
        label: timelineLabel(entry),
        source_ref: entry.link.source_ref,
        target_ref: entry.link.target_ref,
        href: entry.endpoint.href ?? null
      });
    }
  }
  return [...byId.values()].sort(compareTimelineOrder);
}

// Mirrors entity-overview.mjs's own (private) `paginateTimeline`, reusing
// its exported cursor encode/decode and ordering comparator so the two
// endpoints' pagination semantics never drift apart.
function paginateActivity(timeline, { limit, cursor } = {}) {
  const boundedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT;

  let startIndex = 0;
  if (cursor !== undefined && cursor !== null && cursor !== '') {
    const decoded = decodeTimelineCursor(cursor);
    if (!decoded) {
      throw Object.assign(new Error('Invalid activity cursor.'), { status: 400, code: 'invalid_cursor' });
    }
    const foundIndex = timeline.findIndex((entry) => compareTimelineOrder(entry, decoded) > 0);
    startIndex = foundIndex === -1 ? timeline.length : foundIndex;
  }

  const page = timeline.slice(startIndex, startIndex + boundedLimit);
  const hasMore = startIndex + boundedLimit < timeline.length;
  return {
    items: page,
    next_cursor: hasMore && page.length ? encodeTimelineCursor(page[page.length - 1]) : null
  };
}

export function createPeopleActivityHandler(deps = {}) {
  const loadPeople = deps.loadAllPeopleWithRelationships ?? loadAllPeopleWithRelationships;
  const resolveEntity = deps.resolveEntity;
  const createRepository = deps.createRepository;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      try {
        const url = new URL(request.url);
        const limitParam = url.searchParams.get('limit');
        const parsedLimit = limitParam !== null ? Number.parseInt(limitParam, 10) : undefined;

        const peopleWithRelationships = await loadPeople({ store, now: now(), resolveEntity, createRepository, env });
        const timeline = buildActivityEntries(peopleWithRelationships);
        const { items, next_cursor } = paginateActivity(timeline, {
          limit: Number.isInteger(parsedLimit) ? parsedLimit : undefined,
          cursor: url.searchParams.get('since') ?? undefined
        });

        return withCors(okResponse(200, { items, next_cursor }), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(errorResponse(status, code, message, status === 503), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
    }
  );
}

export default createPeopleActivityHandler();
