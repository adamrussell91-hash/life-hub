import { createAccessContext } from './entity-access.mjs';
import { mapBounded } from './blobs-list.mjs';
import { assertRegisteredEntityRef, formatEntityRef } from './entity-ref.mjs';
import { getRelationshipDeclaration } from './relationship-registry.mjs';
import { redactIdentityRecord, parseOrganisationRecord, parsePersonRecord } from './identity-schema.mjs';
import { resolveEntity as defaultResolveEntity } from './entity-resolvers.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  organisationKey,
  personKey
} from './universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';

const SUPPORTED_KINDS = new Set(['person', 'organisation']);

// Stable cursor pagination for the timeline only (implementation programme,
// "Performance boundaries": "Timeline endpoints support a default limit and
// cursor before production data grows"). `current_relationships`,
// `historical_relationships`, and `linked_records` stay complete and
// unbounded — those are deliberately-full views a caller expects to see in
// their entirety; only the timeline, which can grow without bound as more
// interactions accumulate, is paginated. The cursor encodes the last
// returned entry's own sort key (`date` descending, `id` ascending for
// ties — the same deterministic order the timeline is already sorted by),
// so paging is stable even if new entries are added between pages.
const DEFAULT_TIMELINE_LIMIT = 100;
const MAX_TIMELINE_LIMIT = 200;

function encodeTimelineCursor(entry) {
  return Buffer.from(JSON.stringify([entry.date ?? '', entry.id])).toString('base64url');
}

function decodeTimelineCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [date, id] = parsed;
    if (typeof date !== 'string' || typeof id !== 'string') return null;
    return { date, id };
  } catch {
    return null;
  }
}

function paginateTimeline(timeline, { limit, cursor } = {}) {
  const boundedLimit = Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MAX_TIMELINE_LIMIT)
    : DEFAULT_TIMELINE_LIMIT;

  let startIndex = 0;
  if (cursor !== undefined && cursor !== null && cursor !== '') {
    const decoded = decodeTimelineCursor(cursor);
    if (!decoded) {
      throw Object.assign(new Error('Invalid timeline cursor.'), { status: 400, code: 'invalid_cursor' });
    }
    const foundIndex = timeline.findIndex((entry) => (entry.date ?? '') === decoded.date && entry.id === decoded.id);
    // A cursor naming an entry no longer present (deleted, or moved outside
    // ordinary visibility since the previous page) yields no further
    // results rather than silently restarting from the top.
    startIndex = foundIndex === -1 ? timeline.length : foundIndex + 1;
  }

  const page = timeline.slice(startIndex, startIndex + boundedLimit);
  const hasMore = startIndex + boundedLimit < timeline.length;
  return {
    items: page,
    next_cursor: hasMore && page.length ? encodeTimelineCursor(page[page.length - 1]) : null
  };
}

function notFound() {
  return Object.assign(new Error('Entity not found.'), { status: 404, code: 'entity_not_found' });
}

async function loadEntity(store, ref) {
  if (ref.kind === 'person') {
    const record = parsePersonRecord(await getJSON(store, personKey(ref.id)));
    if (!record) throw notFound();
    return record;
  }
  const record = parseOrganisationRecord(await getJSON(store, organisationKey(ref.id)));
  if (!record) throw notFound();
  return record;
}

function effectiveDate(link) {
  return link.occurred_at ?? link.valid_from ?? link.created_at;
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

// `context_ref` (when present) is the authoritative source record which
// established the relationship — a Task, Communication, Meeting, or Event
// the @ picker was used from (proposal ยง3.3: "source links back to the
// task, meeting, event, note, program, or project which established the
// relationship"). This is distinct from `endpoint.href`, which links to the
// *other side* of the relationship (the Person/Organisation). Resolution
// reuses the same non-disclosure rule as every other endpoint lookup: a
// hidden or missing context record yields `context_href: null`, never a
// distinct error, and never invents a browser href of its own.
async function resolveContextHref(link, accessContext, resolveEntity) {
  if (typeof link.context_ref !== 'string' || !link.context_ref) return null;
  try {
    const context = await resolveEntity(link.context_ref, accessContext);
    return context.href ?? null;
  } catch (error) {
    if (error?.code === 'endpoint_not_found') return null;
    throw error;
  }
}

async function toTimelineEntry({ link, endpoint, direction }, accessContext, resolveEntity) {
  return {
    id: link.id,
    kind: timelineKind(link),
    date: effectiveDate(link),
    end_date: link.valid_to,
    label: timelineLabel({ link, endpoint, direction }),
    context_key: link.context_key,
    source_ref: link.source_ref,
    // Never invent a browser href — only surface one the resolver provided.
    href: endpoint.href ?? null,
    context_href: await resolveContextHref(link, accessContext, resolveEntity)
  };
}

function bucketFor(linkedRecords, kind) {
  if (kind === 'task') return linkedRecords.tasks;
  if (kind === 'communication') return linkedRecords.communications;
  if (kind === 'meeting') return linkedRecords.meetings;
  if (kind === 'event') return linkedRecords.events;
  if (kind === 'application') return linkedRecords.applications;
  if (kind === 'organisation') return linkedRecords.organisations;
  if (kind === 'person') return linkedRecords.people;
  return null;
}

/**
 * Assembles an authorised Person or Organisation overview. Shared by the
 * `/api/entities/overview` handler so timeline ordering and linked-record
 * bucketing stay in one place.
 */
export async function assembleEntityOverview(refInput, deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('assembleEntityOverview requires a store.');
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;

  const ref = assertRegisteredEntityRef(refInput);
  if (!SUPPORTED_KINDS.has(ref.kind)) {
    throw Object.assign(new Error(`Overview does not support kind "${ref.kind}".`), {
      status: 400,
      code: 'unsupported_entity_kind'
    });
  }

  const canonicalRef = formatEntityRef(ref);
  const record = await loadEntity(store, ref);
  const accessContext = createAccessContext({ workflow: 'life' });
  const repo = createRepository({ store, resolveEntity });
  const { outgoing, incoming } = await repo.listForEntity(canonicalRef, accessContext, {
    includeArchived: true
  });

  const entries = [
    ...outgoing.map((entry) => ({ ...entry, direction: 'outgoing' })),
    ...incoming.map((entry) => ({ ...entry, direction: 'incoming' }))
  ];

  const current_relationships = entries.filter((entry) => entry.link.status === 'current');
  const historical_relationships = entries.filter((entry) => entry.link.status === 'ended');

  const fullTimeline = (await mapBounded(entries, 10, (entry) => toTimelineEntry(entry, accessContext, resolveEntity)))
    .sort((a, b) => {
      if (!a.date && !b.date) return a.id.localeCompare(b.id);
      if (!a.date) return 1;
      if (!b.date) return -1;
      const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
      // Deterministic tiebreak for a stable cursor: two entries with the
      // exact same date must always sort the same way relative to each
      // other, or a page boundary landing between them could skip or repeat
      // one depending on incidental array order.
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });

  const { items: timeline, next_cursor: timeline_next_cursor } = paginateTimeline(fullTimeline, {
    limit: deps.timelineLimit,
    cursor: deps.timelineCursor
  });

  const linked_records = {
    tasks: [],
    communications: [],
    meetings: [],
    events: [],
    applications: [],
    organisations: [],
    people: []
  };
  const seen = new Set();
  for (const entry of entries) {
    const bucket = bucketFor(linked_records, entry.endpoint.kind);
    if (!bucket) continue;
    if (seen.has(entry.endpoint.ref)) continue;
    seen.add(entry.endpoint.ref);
    bucket.push(entry.endpoint);
  }

  return {
    entity: { ref: canonicalRef, ...redactIdentityRecord(record) },
    current_relationships,
    historical_relationships,
    timeline,
    timeline_next_cursor,
    linked_records
  };
}

export { defaultGetUniversalLinkStore };
