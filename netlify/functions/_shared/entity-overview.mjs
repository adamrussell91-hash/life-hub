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
import { getGithubOrganisation, getGithubPerson, listGithubRelationshipEntries } from './github-professional-data.mjs';

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

// The single ordering rule the timeline is sorted by: date descending,
// undated entries last, id ascending as a deterministic tiebreak. Used for
// BOTH the sort itself and cursor resumption below, so the two can never
// disagree with each other.
function compareTimelineOrder(a, b) {
  if (!a.date && !b.date) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (byDate !== 0) return byDate;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
    // Resume by ORDER, not by exact id match: if the cursor's own entry has
    // since been deleted or hidden, this still finds the first entry that
    // would have sorted after it, rather than treating "not found" as "end
    // of list" and silently truncating every later, still-valid page.
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

function notFound() {
  return Object.assign(new Error('Entity not found.'), { status: 404, code: 'entity_not_found' });
}

// A GitHub-canonical-import record (github-professional-data.mjs) falls
// back here exactly as it does in entity-resolvers.mjs, so a Person/
// Organisation page for one of those 351 imported people/18 organisations
// loads the same way a native one does.
async function loadEntity(store, ref, github) {
  if (ref.kind === 'person') {
    const record = parsePersonRecord(await getJSON(store, personKey(ref.id)))
      ?? await getGithubPerson(ref.id, github);
    if (!record) throw notFound();
    return record;
  }
  const record = parseOrganisationRecord(await getJSON(store, organisationKey(ref.id)))
    ?? await getGithubOrganisation(ref.id, github);
  if (!record) throw notFound();
  return record;
}

// Read-only merge of the GitHub-canonical import's `employee_at`/
// `member_of` relationships into this overview's timeline. Mirrors
// `toAccessibleEntry` in universal-link-read-repository.mjs: the *other*
// endpoint of each relationship is resolved and authorised through the same
// injected `resolveEntity`, and a hidden/absent endpoint is dropped rather
// than surfaced — never a distinct error. This never touches the native
// Universal Link repository or its Blob-backed membership index; it is a
// second, independent source of entries concatenated in before the rest of
// this module's (unmodified) timeline/current/historical logic runs.
async function loadGithubRelationshipEntries(ref, accessContext, resolveEntity, github) {
  const rows = await listGithubRelationshipEntries(ref.kind, ref.id, github);
  const entries = await mapBounded(rows, 10, async ({ link, otherRef, direction }) => {
    try {
      const endpoint = await resolveEntity(otherRef, accessContext);
      return { link, endpoint, direction };
    } catch (error) {
      if (error?.code === 'endpoint_not_found') return null;
      throw error;
    }
  });
  return entries.filter(Boolean);
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

// The authoritative source record that established this relationship — a
// Task, Communication, Meeting, Event, or similar. This is distinct from
// `endpoint.href`, which links to the *other side* of the relationship
// (the Person/Organisation this overview belongs to is never that side).
//
// Two sources, in priority order:
//  1. `link.context_ref`, when a caller explicitly recorded one.
//  2. Otherwise, for an INCOMING entry (this overview's entity is the
//     link's target), `link.source_ref` — the record that created the
//     link in the first place, e.g. the Task behind a `contact` link or
//     the Communication behind a `recipient` link — IS the endpoint
//     already resolved above, so its href is reused directly rather than
//     resolved a second time. An OUTGOING entry's source_ref is this
//     overview's own entity, which is never a meaningful "source link", so
//     it yields no fallback.
// Resolution reuses the same non-disclosure rule as every other endpoint
// lookup: a hidden or missing context record yields `context_href: null`,
// never a distinct error, and never invents a browser href of its own.
async function resolveContextHref({ link, endpoint, direction }, accessContext, resolveEntity) {
  if (typeof link.context_ref === 'string' && link.context_ref) {
    try {
      const context = await resolveEntity(link.context_ref, accessContext);
      return context.href ?? null;
    } catch (error) {
      if (error?.code === 'endpoint_not_found') return null;
      throw error;
    }
  }
  if (direction === 'incoming') return endpoint.href ?? null;
  return null;
}

// Cheap, synchronous half of a timeline entry — no I/O, safe to build for
// every entry so timeline ordering/pagination never needs to touch the
// network. `context_href` is added separately, only for the page actually
// being returned (see `assembleEntityOverview`), since it is the one field
// here that can require an extra resolve call.
function baseTimelineEntry({ link, endpoint, direction }) {
  return {
    id: link.id,
    kind: timelineKind(link),
    date: effectiveDate(link),
    end_date: link.valid_to,
    label: timelineLabel({ link, endpoint, direction }),
    context_key: link.context_key,
    source_ref: link.source_ref,
    // Never invent a browser href — only surface one the resolver provided.
    href: endpoint.href ?? null
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

  // Threaded into every GitHub-canonical Professional import lookup below
  // (loadEntity's fallback and the relationship merge) so tests can inject
  // a synthetic env/fetchImpl instead of relying on process.env/global
  // fetch — production leaves both undefined and gets the real defaults
  // (github-professional-data.mjs).
  const github = { env: deps.env, fetchImpl: deps.fetchImpl };

  const canonicalRef = formatEntityRef(ref);
  const record = await loadEntity(store, ref, github);
  const accessContext = createAccessContext({ workflow: 'life' });
  const repo = createRepository({ store, resolveEntity });
  const { outgoing, incoming } = await repo.listForEntity(canonicalRef, accessContext, {
    includeArchived: true
  });

  const githubEntries = await loadGithubRelationshipEntries(ref, accessContext, resolveEntity, github);

  const entries = [
    ...outgoing.map((entry) => ({ ...entry, direction: 'outgoing' })),
    ...incoming.map((entry) => ({ ...entry, direction: 'incoming' })),
    ...githubEntries
  ];

  const current_relationships = entries.filter((entry) => entry.link.status === 'current');
  const historical_relationships = entries.filter((entry) => entry.link.status === 'ended');

  // Building the base timeline entries and sorting them is synchronous —
  // no I/O — so it costs nothing extra to do for every entry. Only the
  // PAGE actually being returned goes on to the (potentially I/O-bound)
  // `context_href` resolution below: a request for page one of a long
  // timeline never resolves anything for the entries on page two onward.
  const sortedBaseEntries = entries
    .map((entry) => ({ ...baseTimelineEntry(entry), _entry: entry }))
    .sort(compareTimelineOrder);

  const { items: pageEntries, next_cursor: timeline_next_cursor } = paginateTimeline(sortedBaseEntries, {
    limit: deps.timelineLimit,
    cursor: deps.timelineCursor
  });

  const timeline = await mapBounded(pageEntries, 10, async ({ _entry, ...base }) => ({
    ...base,
    context_href: await resolveContextHref(_entry, accessContext, resolveEntity)
  }));

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

export { compareTimelineOrder, defaultGetUniversalLinkStore };
