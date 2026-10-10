import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { displayLabelFor, parseIdentityIndexRecord, parseOrganisationRecord, parsePersonRecord } from './_shared/identity-schema.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';
import { listBlobKeys, mapBounded } from './_shared/blobs-list.mjs';
import {
  organisationHref,
  personHref,
  resolveAchievement,
  resolveCommunication,
  resolveFuture,
  resolveSteppingStone,
  taskHref
} from './_shared/entity-resolvers.mjs';
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
  APPLICATION_INDEX_PREFIX,
  CAREER_ACHIEVEMENT_PREFIX,
  CAREER_FUTURE_PREFIX,
  CAREER_STONE_PREFIX,
  COMMUNICATION_PREFIX
} from './_shared/professional-blobs.mjs';
import { parseApplicationRecord } from './_shared/application-schema.mjs';
import { parseEventRecord } from './_shared/event-schema.mjs';
import { parseMeetingRecord, meetingDisplayLabel } from './_shared/meeting-schema.mjs';
import { defaultGetContentStore as defaultGetTeachingStore, listJSON as listTeachingJSON } from './_shared/teaching-blobs.mjs';
import { listKnowledgePages, rankKnowledgePages } from './_shared/knowledge-data.mjs';
import {
  listGithubImportedStudentPeople,
  listGithubOrganisationCandidates,
  listGithubPdEvents,
  listGithubPersonCandidates
} from './_shared/github-professional-data.mjs';
import { pdPlacementKey, projectNotionPdEvent } from './_shared/notion-pd-events.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';

import { isDeletedRecord } from './_shared/record-liveness.mjs';

export const config = { path: '/api/entities/search' };

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
// One busy kind (twenty people called "Sam") must not push every other kind
// off the list, so each kind gets its own allowance inside the overall cap.
// A search narrowed to a single kind gets the whole overall cap.
const MAX_RESULTS = 40;
const MAX_PER_KIND = 10;
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
  'goal',
  'project',
  'page',
  'unit',
  'lesson',
  'class',
  'event',
  'meeting',
  'communication',
  'achievement',
  'future',
  'stepping_stone'
]);
const DEFAULT_KINDS = ['person', 'organisation', 'task'];
// Every kind the generic tagger searches across at once.
export const ALL_SEARCHABLE_KINDS = [...SUPPORTED_KINDS];

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Words, not raw text: "PD — Samuel Wagan Watson (Felicity Plunkett)"
// tokenises to pd/samuel/wagan/watson/felicity/plunkett, so punctuation
// never blocks a match.
function tokenize(value) {
  return normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// True when `a` and `b` differ by at most one insert, delete or swap of a
// character ("waggan" vs "wagan").
function withinOneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// One query word against one title word: a prefix match, or (for words
// long enough that a slip is likely a typo, not a different word) a
// one-character typo of the title word or of its same-length prefix.
function wordMatches(queryWord, labelWord, allowTypo) {
  if (labelWord.startsWith(queryWord)) return 'exact';
  if (!allowTypo || queryWord.length < 5) return null;
  if (withinOneEdit(queryWord, labelWord)) return 'typo';
  for (const length of [queryWord.length - 1, queryWord.length, queryWord.length + 1]) {
    if (length < 3 || length >= labelWord.length) continue;
    if (withinOneEdit(queryWord, labelWord.slice(0, length))) return 'typo';
  }
  return null;
}

// Rank 0: the title starts with the whole query. Rank 1: every query word
// starts a word of the title, in any order ("wagan watson", "watson pd").
// Rank 2: the same, allowing a one-letter typo per word ("waggan").
// Ranks are applied across every group together via the flat sort below.
export function matchRank(query, label, sortName) {
  const q = normalize(query);
  if (!q) return null;
  const candidates = [label, sortName].filter(value => typeof value === 'string' && value);
  if (candidates.some(candidate => normalize(candidate).startsWith(q))) return 0;
  const queryWords = tokenize(q);
  if (!queryWords.length) return null;
  let best = null;
  for (const candidate of candidates) {
    const labelWords = tokenize(candidate);
    let typo = false;
    const allMatch = queryWords.every((word) => {
      let found = null;
      for (const labelWord of labelWords) {
        const result = wordMatches(word, labelWord, true);
        if (result === 'exact') return true;
        if (result === 'typo') found = 'typo';
      }
      if (found) typo = true;
      return Boolean(found);
    });
    if (!allMatch) continue;
    const rank = typo ? 2 : 1;
    if (best === null || rank < best) best = rank;
  }
  return best;
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
// An imported Person adopted into Blobs keeps its GitHub id, so the same ref
// can come back from both sources. The Blob record is authoritative.
export function mergeNativeFirst(native, githubMatches) {
  const seen = new Set(native.map(entry => entry.ref));
  return [...native, ...githubMatches.filter(entry => !seen.has(entry.ref))];
}

export async function searchGithubIdentityKind(kind, query, includeArchived, github) {
  // Imported students are searchable too: the meeting picker and global
  // search find people only through this route, and students have no
  // Blob record of their own once duplicate copies are merged away.
  const candidates = kind === 'person'
    ? [...await listGithubPersonCandidates(github), ...await listGithubImportedStudentPeople(github)]
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

async function searchTasksCollectionKind(getTasksStore, query, { indexKey, prefix, kind, supporting }) {
  const store = await getTasksStore();
  const ids = await readIndex(store, indexKey);
  const records = await mapBounded(ids, READ_BATCH_SIZE, id => getTasksJSON(store, `${prefix}${id}`));
  const out = [];
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') continue;
    if (record.status === 'archived') continue;
    const label = typeof record.title === 'string' ? record.title : '';
    const rank = matchRank(query, label, null);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'tasks', kind, id: record.id }),
      kind,
      display_label: label || record.id,
      supporting_label: supporting(record),
      href: hrefForHubRef({ hub: 'tasks', kind, id: record.id }),
      lifecycle_status: typeof record.status === 'string' ? record.status : 'active',
      visibility: 'operator'
    });
  }
  return out;
}

function eventResult(record, rank) {
  return {
    rank,
    ref: formatEntityRef({ namespace: 'professional', kind: 'event', id: record.id }),
    kind: 'event',
    display_label: record.title,
    supporting_label: record.occurrence_state,
    href: `/professional/#/event/${encodeURIComponent(record.id)}`,
    lifecycle_status: record.occurrence_state,
    visibility: 'operator'
  };
}

// Events come from two places: native Blob records, and the Notion PD rows
// in `pd-events.json` that the event list copies into Blobs the first time
// it loads. Until that copy has happened an imported event exists only in
// the file, so search reads both, the same way `listEvents` merges them.
// A Blob record (live or deleted) always wins over its source row.
async function searchEventKind(getProfessionalStore, query, loadImportedEvents) {
  const store = await getProfessionalStore();
  const [indexKeys, recordKeys] = await Promise.all([
    listEventIndexKeys(store),
    listBlobKeys(store, 'events/records/')
  ]);
  const ids = [...new Set([
    ...indexKeys.map((key) => key.slice(EVENT_INDEX_PREFIX.length)),
    ...recordKeys.map((key) => key.slice('events/records/'.length))
  ].filter(Boolean))];
  const records = (await mapBounded(ids, READ_BATCH_SIZE, async (id) =>
    parseEventRecord(await getProfessionalJSON(store, eventKey(id), { consistency: 'strong' }))
  )).filter(Boolean);

  const knownIds = new Set(records.map(record => record.id));
  const placements = new Set(records.map(record => pdPlacementKey(record.title, record.start)));
  const out = [];
  for (const record of records) {
    if (isDeletedRecord(record)) continue;
    const title = typeof record.title === 'string' ? record.title : '';
    const rank = matchRank(query, title, null);
    if (rank !== null) out.push(eventResult(record, rank));
  }
  for (const row of await loadImportedEvents()) {
    const imported = projectNotionPdEvent(row);
    if (!imported || knownIds.has(imported.id)) continue;
    const placement = pdPlacementKey(imported.title, imported.start);
    if (placements.has(placement)) continue;
    knownIds.add(imported.id);
    placements.add(placement);
    const rank = matchRank(query, imported.title, null);
    if (rank !== null) out.push(eventResult(imported, rank));
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
    if (isDeletedRecord(record)) continue;
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

// Kinds with no index of their own: list the record keys, then let the
// kind's resolver do what it already does for links (load, drop deleted
// or hidden records, build the safe projection). Search and linking can
// then never disagree about whether a record exists.
async function searchResolvedKind(getProfessionalStore, prefix, resolve, query) {
  const store = await getProfessionalStore();
  const ids = (await listBlobKeys(store, prefix)).map(key => key.slice(prefix.length)).filter(Boolean);
  const accessContext = createAccessContext({ workflow: 'professional' });
  const resolved = await mapBounded(ids, READ_BATCH_SIZE, id =>
    resolve(id, accessContext, { getStore: async () => store }).catch(() => null)
  );
  const out = [];
  for (const endpoint of resolved) {
    if (!endpoint) continue;
    const rank = matchRank(query, endpoint.display_label, null);
    if (rank === null) continue;
    out.push({ rank, ...endpoint });
  }
  return out;
}

export function createEntitySearchHandler(deps = {}) {
  const getTasksStore = deps.getTasksStore ?? defaultGetTasksStore;
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const getTeachingStore = deps.getTeachingStore ?? defaultGetTeachingStore;
  const listImportedEvents = deps.listGithubPdEvents ?? listGithubPdEvents;

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

    // One provider failing (GitHub, Knowledge, a store) must not blank every other
    // kind — the picker would show nothing at all. Failed kinds are reported instead.
    const unavailable = [];
    const settle = (kind, work) =>
      Promise.resolve()
        .then(() => work())
        .catch(() => {
          unavailable.push(kind);
          return [];
        });
    const perKind = await Promise.all([
      requestedKinds.has('person')
        ? settle('person', () => Promise.all([
          searchIdentityKind(store, 'person', listPersonIndexKeys, personKey, parsePersonRecord, query, includeArchived),
          searchGithubIdentityKind('person', query, includeArchived, github).catch(() => {
            unavailable.push('github');
            return [];
          })
        ]).then(([native, githubMatches]) => mergeNativeFirst(native, githubMatches)))
        : [],
      requestedKinds.has('organisation')
        ? settle('organisation', () => Promise.all([
          searchIdentityKind(store, 'organisation', listOrganisationIndexKeys, organisationKey, parseOrganisationRecord, query, includeArchived),
          searchGithubIdentityKind('organisation', query, includeArchived, github).catch(() => {
            unavailable.push('github');
            return [];
          })
        ]).then(([native, githubMatches]) => mergeNativeFirst(native, githubMatches)))
        : [],
      requestedKinds.has('task')
        ? settle('task', () => searchTaskKind(getTasksStore, query))
        : [],
      requestedKinds.has('application')
        ? settle('application', () => searchApplicationKind(getProfessionalStore, query))
        : [],
      requestedKinds.has('program')
        ? settle('program', () => searchProgramKind(getTasksStore, query))
        : [],
      requestedKinds.has('goal')
        ? settle('goal', () => searchTasksCollectionKind(getTasksStore, query, {
          indexKey: 'goals/_index', prefix: 'goals/', kind: 'goal',
          supporting: record => (typeof record.sphere === 'string' ? record.sphere : null)
        }))
        : [],
      requestedKinds.has('project')
        ? settle('project', () => searchTasksCollectionKind(getTasksStore, query, {
          indexKey: 'projects/_index', prefix: 'projects/', kind: 'project',
          supporting: record => (typeof record.status === 'string' ? record.status : null)
        }))
        : [],
      requestedKinds.has('event')
        ? settle('event', () => searchEventKind(getProfessionalStore, query, () => listImportedEvents({ env }).catch(() => [])))
        : [],
      requestedKinds.has('meeting')
        ? settle('meeting', () => searchMeetingKind(getProfessionalStore, query))
        : [],
      requestedKinds.has('page')
        ? settle('page', () => searchKnowledgePageKind(query, { env, fetchImpl: deps.fetchImpl, listPages: deps.listKnowledgePages }))
        : [],
      requestedKinds.has('unit')
        ? settle('unit', () => searchTeachingRecordsKind(getTeachingStore, 'units/', 'unit', query))
        : [],
      requestedKinds.has('lesson')
        ? settle('lesson', () => searchTeachingRecordsKind(getTeachingStore, 'lessons/', 'lesson', query))
        : [],
      requestedKinds.has('class')
        ? settle('class', () => searchTeachingRecordsKind(getTeachingStore, 'classes/', 'class', query))
        : [],
      requestedKinds.has('communication')
        ? settle('communication', () => searchResolvedKind(getProfessionalStore, COMMUNICATION_PREFIX, resolveCommunication, query))
        : [],
      requestedKinds.has('achievement')
        ? settle('achievement', () => searchResolvedKind(getProfessionalStore, CAREER_ACHIEVEMENT_PREFIX, resolveAchievement, query))
        : [],
      requestedKinds.has('future')
        ? settle('future', () => searchResolvedKind(getProfessionalStore, CAREER_FUTURE_PREFIX, resolveFuture, query))
        : [],
      requestedKinds.has('stepping_stone')
        ? settle('stepping_stone', () => searchResolvedKind(getProfessionalStore, CAREER_STONE_PREFIX, resolveSteppingStone, query))
        : []
    ]);

    // Best matches first across every group together; then each kind keeps
    // at most MAX_PER_KIND (unless it is the only kind asked for) and the
    // whole response at most MAX_RESULTS.
    const perKindCap = requestedKinds.size === 1 ? MAX_RESULTS : MAX_PER_KIND;
    const groups = Object.fromEntries([...SUPPORTED_KINDS].map(kind => [kind, []]));
    let total = 0;
    const sorted = perKind
      .flat()
      .sort((a, b) => (a.rank - b.rank) || a.display_label.localeCompare(b.display_label));
    for (const { rank, ...result } of sorted) { // eslint-disable-line no-unused-vars
      if (total >= MAX_RESULTS) break;
      const group = groups[result.kind];
      if (!group || group.length >= perKindCap) continue;
      group.push(result);
      total += 1;
    }

    return withCors(
      okResponse(200, unavailable.length ? { groups, unavailable: [...new Set(unavailable)].sort() } : { groups }),
      request,
      env
    );
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
  });
}

export default createEntitySearchHandler();
