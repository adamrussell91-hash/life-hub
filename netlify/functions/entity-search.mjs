import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { displayLabelFor, parseIdentityIndexRecord, parseOrganisationRecord, parsePersonRecord } from './_shared/identity-schema.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';
import { mapBounded } from './_shared/blobs-list.mjs';
import { personHref, organisationHref, taskHref } from './_shared/entity-resolvers.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  listOrganisationIndexKeys,
  listPersonIndexKeys,
  organisationKey,
  personKey
} from './_shared/universal-link-blobs.mjs';
import { defaultGetTasksStore, getJSON as getTasksJSON, programKey, readIndex, readTaskIndex, taskKey } from './_shared/tasks-blobs.mjs';
import { hrefForHubRef } from './_shared/hub-ref.mjs';
import {
  defaultGetProfessionalStore,
  getJSON as getProfessionalJSON,
  listApplicationIndexKeys,
  listEventIndexKeys,
  listMeetingIndexKeys,
  applicationKey,
  eventKey,
  meetingKey,
  EVENT_INDEX_PREFIX,
  MEETING_INDEX_PREFIX,
  APPLICATION_INDEX_PREFIX
} from './_shared/professional-blobs.mjs';
import { parseApplicationRecord } from './_shared/application-schema.mjs';
import { parseEventRecord } from './_shared/event-schema.mjs';
import { parseMeetingRecord, meetingDisplayLabel } from './_shared/meeting-schema.mjs';
import { defaultGetContentStore as defaultGetTeachingStore, listJSON as listTeachingJSON } from './_shared/teaching-blobs.mjs';
import { listKnowledgePages, rankKnowledgePages } from './_shared/knowledge-data.mjs';
import { listGithubOrganisationCandidates, listGithubPersonCandidates } from './_shared/github-professional-data.mjs';

export const config = { path: '/api/entities/search' };

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 20;
const READ_BATCH_SIZE = 10;

// Task search (correction B6) uses the existing Tasks storage
// (`tasks-hub-content`, via `_shared/tasks-blobs.mjs`) and a safe
// projection of a Task record — the same fields `entity-resolvers.mjs`'s
// `resolveTask` already exposes. Nothing here copies Task data into
// `universal-link-content`, and no new Task index is created: the
// existing `tasks/_index` (`readTaskIndex`) is reused as-is.
// Application search is opt-in via kinds=application (not in DEFAULT_KINDS).
// The remaining kinds (page, unit, lesson, class, event, meeting) back the
// generic `@`-tag-anything widget (`tagged_with` in relationship-registry.mjs)
// — a caller wiring up tagging for a new page never needs to add a new
// per-kind search route, only request the kind it needs here.
const SUPPORTED_KINDS = new Set([
  'person',
  'organisation',
  'task',
  'application',
  'program',
  'page',
  'unit',
  'lesson',
  'class',
  'event',
  'meeting'
]);
const DEFAULT_KINDS = ['person', 'organisation', 'task'];
// Every kind the generic tagger searches across at once.
export const ALL_SEARCHABLE_KINDS = [...SUPPORTED_KINDS];

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Exact prefix matches rank before token matches (implementation
// programme: "sort exact prefix matches before token matches") — applied
// across every group, not just within one kind, via the single flat sort
// below.
function matchRank(query, label, sortName) {
  const q = normalize(query);
  const candidates = [normalize(label), normalize(sortName)].filter(Boolean);
  if (candidates.some(candidate => candidate.startsWith(q))) return 0;
  if (candidates.some(candidate => candidate.split(/\s+/).some(token => token.startsWith(q)))) return 1;
  return null;
}

// Search must never trust an index display label as authority (correction
// B4). The identity index (`entities/index/<kind>/<id>`) already carries a
// `display_label`/`sort_name` cheaply, without loading the full
// authoritative record — so ranking runs against the index FIRST, and only
// candidates that already pass `matchRank` there go on to the expensive
// authoritative hydration. This is the bounded, indexed candidate
// selection: hydration work scales with how many candidates plausibly
// match the query, not with how many records the store holds overall, and
// — unlike a fixed hydration cap — it can never hide a valid match, since
// every candidate whose CURRENT index entry matches is still considered
// regardless of store size.
//
// The authoritative record is still the sole source of truth for
// disclosure: every candidate that passes the index-level rank is
// re-validated (and re-ranked) against its authoritative record below, so
// a stale index entry can only ever cause an extra hydration, never a
// privacy leak — a former active name can't resurface just because an old
// index entry was never repaired, and a redacted (deidentified/deleted)
// record can't appear even if its index entry is stale.
// Exported (Phase 5) so `_shared/relational-search-nl.mjs` can resolve a
// free-text organisation NAME (extracted by the NL query-planning LLM) to
// a real organisation ref, reusing the EXACT same indexed-candidate +
// authoritative-re-validation search this route already uses for the
// "Search by name" picker — rather than inventing a second, parallel
// name-resolution path. No `_shared` module owns this logic today (it has
// always lived here, at the route level), so this export is the smallest
// change that lets a `_shared` module genuinely reuse it instead of
// duplicating it.
export async function searchIdentityKind(store, kind, listKeys, loadKey, parseAuthoritative, query, includeArchived) {
  const indexKeys = await listKeys(store);
  const indexRecords = await mapBounded(indexKeys, READ_BATCH_SIZE, key => getJSON(store, key));

  const candidateIds = [];
  const seen = new Set();
  for (const raw of indexRecords) {
    const entry = parseIdentityIndexRecord(raw);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const indexRank = matchRank(query, entry.display_label, kind === 'person' ? entry.sort_name : null);
    if (indexRank === null) continue;
    candidateIds.push(entry.id);
  }

  const hydrated = await mapBounded(candidateIds, READ_BATCH_SIZE, async id => {
    const record = parseAuthoritative(await getJSON(store, loadKey(id)));
    if (!record) return null;
    const visible = record.lifecycle_status === 'active' || (includeArchived && record.lifecycle_status === 'archived');
    if (!visible) return null;
    const label = displayLabelFor(record);
    const rank = matchRank(query, label, kind === 'person' ? record.sort_name : null);
    if (rank === null) return null;
    return {
      rank,
      ref: formatEntityRef({ namespace: 'shared', kind, id: record.id }),
      kind,
      display_label: label,
      supporting_label: kind === 'person' && record.is_self ? 'self' : null,
      href: kind === 'person' ? personHref(record.id) : organisationHref(record.id),
      lifecycle_status: record.lifecycle_status,
      visibility: 'operator'
    };
  });

  return hydrated.filter(Boolean);
}

// Read-only supplement drawing candidates from the GitHub-canonical
// Professional import (github-professional-data.mjs) instead of Blobs —
// the same index-then-hydrate split isn't needed here since the whole
// import is small enough (351 people, 18 organisations) to rank directly,
// but the output shape and ranking rule are identical to
// `searchIdentityKind`'s, so results interleave with native ones exactly
// as if they were one list.
async function searchGithubIdentityKind(kind, query, includeArchived, github) {
  const candidates = kind === 'person'
    ? await listGithubPersonCandidates(github)
    : await listGithubOrganisationCandidates(github);

  const out = [];
  for (const record of candidates) {
    const visible = record.lifecycle_status === 'active' || (includeArchived && record.lifecycle_status === 'archived');
    if (!visible) continue;
    const label = displayLabelFor(record);
    const rank = matchRank(query, label, kind === 'person' ? record.sort_name : null);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'shared', kind, id: record.id }),
      kind,
      display_label: label,
      supporting_label: kind === 'person' && record.is_self ? 'self' : null,
      href: kind === 'person' ? personHref(record.id) : organisationHref(record.id),
      lifecycle_status: record.lifecycle_status,
      visibility: 'operator'
    });
  }
  return out;
}

async function searchTaskKind(getTasksStore, query) {
  const store = await getTasksStore();
  const ids = await readTaskIndex(store);
  const records = await mapBounded(ids, READ_BATCH_SIZE, id => getTasksJSON(store, taskKey(id)));

  const out = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const title = typeof record.title === 'string' ? record.title : '';
    const rank = matchRank(query, title, null);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'tasks', kind: 'task', id: record.id }),
      kind: 'task',
      display_label: title,
      supporting_label: typeof record.status === 'string' ? record.status : null,
      href: taskHref(record.id),
      lifecycle_status: typeof record.status === 'string' ? record.status : null,
      visibility: 'operator'
    });
  }
  return out;
}

async function searchApplicationKind(getProfessionalStore, query) {
  const store = await getProfessionalStore();
  const indexKeys = await listApplicationIndexKeys(store);
  const ids = [
    ...new Set(
      indexKeys
        .map((key) => key.slice(APPLICATION_INDEX_PREFIX.length))
        .filter(Boolean)
    )
  ];
  const records = await mapBounded(ids, READ_BATCH_SIZE, async (id) =>
    parseApplicationRecord(await getProfessionalJSON(store, applicationKey(id)))
  );

  const out = [];
  for (const record of records) {
    if (!record) continue;
    const title = typeof record.position_title === 'string' ? record.position_title : '';
    const rank = matchRank(query, title, null);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'professional', kind: 'application', id: record.id }),
      kind: 'application',
      display_label: title,
      supporting_label: record.pipeline_status,
      href: `/professional/#/application/${encodeURIComponent(record.id)}`,
      lifecycle_status: record.pipeline_status,
      visibility: 'operator'
    });
  }
  return out;
}


async function searchProgramKind(getTasksStore, query) {
  const store = await getTasksStore();
  const ids = await readIndex(store, 'programs/_index');
  const records = await mapBounded(ids, READ_BATCH_SIZE, id =>
    getTasksJSON(store, programKey(id))
  );
  const out = [];
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') continue;
    const label = typeof record.name === 'string' ? record.name : '';
    const rank = matchRank(query, label, null);
    if (rank === null) continue;
    const href = hrefForHubRef({ hub: 'tasks', kind: 'program', id: record.id });
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'tasks', kind: 'program', id: record.id }),
      kind: 'program',
      display_label: label || record.id,
      supporting_label: typeof record.organiser === 'string' ? record.organiser : null,
      href,
      lifecycle_status: 'active',
      visibility: 'operator'
    });
  }
  return out;
}

async function searchEventKind(getProfessionalStore, query) {
  const store = await getProfessionalStore();
  const indexKeys = await listEventIndexKeys(store);
  const ids = [...new Set(indexKeys.map((key) => key.slice(EVENT_INDEX_PREFIX.length)).filter(Boolean))];
  const records = await mapBounded(ids, READ_BATCH_SIZE, async (id) =>
    parseEventRecord(await getProfessionalJSON(store, eventKey(id)))
  );

  const out = [];
  for (const record of records) {
    if (!record) continue;
    const title = typeof record.title === 'string' ? record.title : '';
    const rank = matchRank(query, title, null);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'professional', kind: 'event', id: record.id }),
      kind: 'event',
      display_label: title,
      supporting_label: [record.event_type?.replace(/_/g, ' '), record.occurrence_state]
        .filter(Boolean)
        .join(' · '),
      href: `/professional/#/event/${encodeURIComponent(record.id)}`,
      lifecycle_status: record.occurrence_state,
      visibility: 'operator'
    });
  }
  return out;
}

async function searchMeetingKind(getProfessionalStore, query) {
  const store = await getProfessionalStore();
  const indexKeys = await listMeetingIndexKeys(store);
  const ids = [...new Set(indexKeys.map((key) => key.slice(MEETING_INDEX_PREFIX.length)).filter(Boolean))];
  const records = await mapBounded(ids, READ_BATCH_SIZE, async (id) =>
    parseMeetingRecord(await getProfessionalJSON(store, meetingKey(id)))
  );

  const out = [];
  for (const record of records) {
    if (!record) continue;
    const label = meetingDisplayLabel(record);
    const rank = matchRank(query, label, null);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'professional', kind: 'meeting', id: record.id }),
      kind: 'meeting',
      display_label: label,
      supporting_label: record.state,
      href: `/professional/#/meeting/${encodeURIComponent(record.id)}`,
      lifecycle_status: record.state,
      visibility: 'operator'
    });
  }
  return out;
}

async function searchKnowledgePageKind(query, { env, fetchImpl, listPages = listKnowledgePages }) {
  const pages = await listPages({ env, fetchImpl });
  return rankKnowledgePages(pages, query)
    // rankKnowledgePages orders by its own descending score already —
    // matchRank's 0/1 split just decides tie-break order against every
    // other kind in the same combined sort below.
    .map((page, index) => ({
      rank: index === 0 ? 0 : 1,
      ref: formatEntityRef({ namespace: 'knowledge', kind: 'page', id: page.id }),
      kind: 'page',
      display_label: typeof page.title === 'string' && page.title ? page.title : page.id,
      supporting_label: page.area ?? null,
      href: `/knowledge/#page/${encodeURIComponent(page.id)}`,
      lifecycle_status: null,
      visibility: 'operator'
    }));
}

async function searchTeachingRecordsKind(getTeachingStore, prefix, kind, query) {
  const store = await getTeachingStore();
  const records = await listTeachingJSON(store, prefix);
  const out = [];
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') continue;
    if (record.status === 'trashed' || record.status === 'deleted') continue;
    const title = typeof record.title === 'string' ? record.title : '';
    const rank = matchRank(query, title, null);
    if (rank === null) continue;
    const href = hrefForHubRef({ hub: 'teaching', kind, id: record.id });
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'teaching', kind, id: record.id }),
      kind,
      display_label: title || record.id,
      supporting_label: typeof record.status === 'string' ? record.status : null,
      href: href ?? (kind === 'class' ? `/teaching/classes/${encodeURIComponent(record.id)}` : null),
      lifecycle_status: typeof record.status === 'string' ? record.status : 'active',
      visibility: 'operator'
    });
  }
  return out;
}

export function createEntitySearchHandler(deps = {}) {
  const getTasksStore = deps.getTasksStore ?? defaultGetTasksStore;
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const getTeachingStore = deps.getTeachingStore ?? defaultGetTeachingStore;

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const url = new URL(request.url);
    const rawQuery = url.searchParams.get('q') ?? '';
    // Normalise (trim) BEFORE validating length, and validate BEFORE any
    // index listing or Blob read (correction B2). The previous order
    // checked `query.length` on the raw, untrimmed value, so a
    // whitespace-only query like two spaces passed the >= 2 check and went
    // on to list every index and scan every record before finding no
    // match — a caller error that should never have reached storage at
    // all, and a wasted full scan on every such request.
    const query = rawQuery.trim();
    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      return withCors(
        errorResponse(
          400,
          'invalid_query_length',
          `q must be between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters after trimming.`,
          false
        ),
        request,
        env
      );
    }

    const requestedKindsRaw = (url.searchParams.get('kinds') ?? DEFAULT_KINDS.join(','))
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    // An unsupported kind (including student_reference, which is never
    // registered here) is a caller error, not something to silently drop
    // (correction B6) — this also means StudentReference can never be
    // "successfully" requested, only rejected the same as any other
    // unregistered kind, rather than quietly contributing zero results
    // indistinguishably from a supported-but-empty kind.
    const unsupported = [...new Set(requestedKindsRaw)].filter(kind => !SUPPORTED_KINDS.has(kind));
    if (unsupported.length) {
      return withCors(
        errorResponse(400, 'invalid_kind', `Unsupported kind(s): ${unsupported.join(', ')}.`, false),
        request,
        env
      );
    }

    const requestedKinds = new Set(requestedKindsRaw);
    const includeArchived = url.searchParams.get('include_archived') === 'true';
    const github = { env };

    const perKind = await Promise.all([
      requestedKinds.has('person')
        ? Promise.all([
          searchIdentityKind(store, 'person', listPersonIndexKeys, personKey, parsePersonRecord, query, includeArchived),
          searchGithubIdentityKind('person', query, includeArchived, github)
        ]).then(([native, githubMatches]) => [...native, ...githubMatches])
        : [],
      requestedKinds.has('organisation')
        ? Promise.all([
          searchIdentityKind(store, 'organisation', listOrganisationIndexKeys, organisationKey, parseOrganisationRecord, query, includeArchived),
          searchGithubIdentityKind('organisation', query, includeArchived, github)
        ]).then(([native, githubMatches]) => [...native, ...githubMatches])
        : [],
      requestedKinds.has('task') ? searchTaskKind(getTasksStore, query) : [],
      requestedKinds.has('application') ? searchApplicationKind(getProfessionalStore, query) : [],
      requestedKinds.has('program') ? searchProgramKind(getTasksStore, query) : [],
      requestedKinds.has('event') ? searchEventKind(getProfessionalStore, query) : [],
      requestedKinds.has('meeting') ? searchMeetingKind(getProfessionalStore, query) : [],
      requestedKinds.has('page')
        ? searchKnowledgePageKind(query, { env, fetchImpl: deps.fetchImpl, listPages: deps.listKnowledgePages })
        : [],
      requestedKinds.has('unit')
        ? searchTeachingRecordsKind(getTeachingStore, 'units/', 'unit', query)
        : [],
      requestedKinds.has('lesson')
        ? searchTeachingRecordsKind(getTeachingStore, 'lessons/', 'lesson', query)
        : [],
      requestedKinds.has('class')
        ? searchTeachingRecordsKind(getTeachingStore, 'classes/', 'class', query)
        : []
    ]);

    // Exact prefix matches rank before token matches across every group
    // together, then the combined maximum of 20 is applied — both before
    // splitting back out into per-kind groups.
    const ranked = perKind
      .flat()
      .sort((a, b) => (a.rank - b.rank) || a.display_label.localeCompare(b.display_label))
      .slice(0, MAX_RESULTS)
      .map(({ rank, ...result }) => result); // eslint-disable-line no-unused-vars

    const groups = {
      person: [],
      organisation: [],
      task: [],
      application: [],
      program: [],
      event: [],
      meeting: [],
      page: [],
      unit: [],
      lesson: [],
      class: []
    };
    for (const result of ranked) groups[result.kind].push(result);

    return withCors(okResponse(200, { groups }), request, env);
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
  });
}

export default createEntitySearchHandler();
