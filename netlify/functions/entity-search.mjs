import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { displayLabelFor, parseIdentityIndexRecord, parseOrganisationRecord, parsePersonRecord } from './_shared/identity-schema.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';
import { mapBounded } from './_shared/blobs-list.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  listOrganisationIndexKeys,
  listPersonIndexKeys,
  organisationKey,
  personKey
} from './_shared/universal-link-blobs.mjs';
import { defaultGetTasksStore, getJSON as getTasksJSON, readTaskIndex, taskKey } from './_shared/tasks-blobs.mjs';

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
const SUPPORTED_KINDS = new Set(['person', 'organisation', 'task']);
const DEFAULT_KINDS = ['person', 'organisation', 'task'];

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
// B4). The identity index (`entities/index/<kind>/<id>`) is used only to
// find candidate ids cheaply — every candidate that matches is then
// hydrated and re-validated against its authoritative Person/Organisation
// record, and the *authoritative* record's own current lifecycle status
// and label decide visibility and ranking. This protects privacy if a
// stale index survives a partial identity-write failure: a former active
// name can never resurface through search just because an old index entry
// was never repaired, and a record already redacted (deidentified/deleted)
// can never appear even if its index entry is stale.
async function searchIdentityKind(store, kind, listKeys, loadKey, parseAuthoritative, query, includeArchived) {
  const indexKeys = await listKeys(store);
  const indexRecords = await mapBounded(indexKeys, READ_BATCH_SIZE, key => getJSON(store, key));

  const candidateIds = [];
  const seen = new Set();
  for (const raw of indexRecords) {
    const entry = parseIdentityIndexRecord(raw);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
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
      href: null,
      lifecycle_status: record.lifecycle_status,
      visibility: 'operator'
    };
  });

  return hydrated.filter(Boolean);
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
      href: null,
      lifecycle_status: typeof record.status === 'string' ? record.status : null,
      visibility: 'operator'
    });
  }
  return out;
}

export function createEntitySearchHandler(deps = {}) {
  const getTasksStore = deps.getTasksStore ?? defaultGetTasksStore;

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

    const perKind = await Promise.all([
      requestedKinds.has('person')
        ? searchIdentityKind(store, 'person', listPersonIndexKeys, personKey, parsePersonRecord, query, includeArchived)
        : [],
      requestedKinds.has('organisation')
        ? searchIdentityKind(store, 'organisation', listOrganisationIndexKeys, organisationKey, parseOrganisationRecord, query, includeArchived)
        : [],
      requestedKinds.has('task') ? searchTaskKind(getTasksStore, query) : []
    ]);

    // Exact prefix matches rank before token matches across every group
    // together, then the combined maximum of 20 is applied — both before
    // splitting back out into per-kind groups.
    const ranked = perKind
      .flat()
      .sort((a, b) => (a.rank - b.rank) || a.display_label.localeCompare(b.display_label))
      .slice(0, MAX_RESULTS)
      .map(({ rank, ...result }) => result); // eslint-disable-line no-unused-vars

    const groups = { person: [], organisation: [], task: [] };
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
