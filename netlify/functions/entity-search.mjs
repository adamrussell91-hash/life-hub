import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { parseIdentityIndexRecord } from './_shared/identity-schema.mjs';
import { formatEntityRef } from './_shared/entity-ref.mjs';
import { mapBounded } from './_shared/blobs-list.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  listOrganisationIndexKeys,
  listPersonIndexKeys
} from './_shared/universal-link-blobs.mjs';

export const config = { path: '/api/entities/search' };

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS = 20;
const READ_BATCH_SIZE = 10;

// This slice's identity search covers Person and Organisation only — the
// two kinds this slice supplies a store for. The API contract's example
// URL (`kinds=person,organisation,task`) suggests a wider future search
// across every registered entity kind; Task/Communication search is out of
// scope here (no owning file for it exists yet) and is a known limitation,
// documented in the PR body rather than silently promised. A `kinds` value
// naming an unsupported kind is simply not searched, the same way an
// unregistered resolver kind is treated as absent rather than erroring.
const SUPPORTED_KINDS = new Set(['person', 'organisation']);

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Exact prefix matches rank before token matches (implementation
// programme: "sort exact prefix matches before token matches").
function matchRank(query, label, sortName) {
  const q = normalize(query);
  const candidates = [normalize(label), normalize(sortName)].filter(Boolean);
  if (candidates.some(candidate => candidate.startsWith(q))) return 0;
  if (candidates.some(candidate => candidate.split(/\s+/).some(token => token.startsWith(q)))) return 1;
  return null;
}

async function searchKind(store, kind, listKeys, query, includeArchived) {
  const keys = await listKeys(store);
  const records = await mapBounded(keys, READ_BATCH_SIZE, key => getJSON(store, key));
  const out = [];
  for (const raw of records) {
    const entry = parseIdentityIndexRecord(raw);
    if (!entry) continue;
    const visible = entry.lifecycle_status === 'active' || (includeArchived && entry.lifecycle_status === 'archived');
    if (!visible) continue;
    const rank = matchRank(query, entry.display_label, entry.sort_name);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'shared', kind, id: entry.id }),
      kind,
      display_label: entry.display_label,
      supporting_label: entry.is_self ? 'self' : null,
      href: null,
      lifecycle_status: entry.lifecycle_status,
      visibility: 'operator'
    });
  }
  return out;
}

export function createEntitySearchHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      return withCors(
        errorResponse(400, 'invalid_query_length', `q must be between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters.`, false),
        request,
        env
      );
    }

    const requestedKinds = (url.searchParams.get('kinds') ?? 'person,organisation')
      .split(',')
      .map(k => k.trim())
      .filter(k => SUPPORTED_KINDS.has(k));
    const includeArchived = url.searchParams.get('include_archived') === 'true';

    const perKind = await Promise.all([
      requestedKinds.includes('person') ? searchKind(store, 'person', listPersonIndexKeys, query, includeArchived) : [],
      requestedKinds.includes('organisation') ? searchKind(store, 'organisation', listOrganisationIndexKeys, query, includeArchived) : []
    ]);

    const ranked = perKind
      .flat()
      .sort((a, b) => (a.rank - b.rank) || a.display_label.localeCompare(b.display_label))
      .slice(0, MAX_RESULTS)
      .map(({ rank, ...result }) => result); // eslint-disable-line no-unused-vars

    const groups = { person: [], organisation: [] };
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
