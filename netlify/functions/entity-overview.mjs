import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { assertRegisteredEntityRef, formatEntityRef } from './_shared/entity-ref.mjs';
import { getRelationshipDeclaration } from './_shared/relationship-registry.mjs';
import { redactIdentityRecord, parseOrganisationRecord, parsePersonRecord } from './_shared/identity-schema.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON,
  organisationKey,
  personKey
} from './_shared/universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';

export const config = { path: '/api/entities/overview' };

// The API, not the browser, assembles and authorises the overview
// (implementation programme, "Entity overview and timeline"). This
// handler is self-contained for Slice 3: the repository-map's Slice 5
// file table names a *separate* shared assembler,
// `_shared/entity-overview.mjs`, as that slice's own deliverable, distinct
// from this route handler — Slice 3 does not create that shared module,
// since the fuller timeline/rendering contract it will serve (Relationship
// timeline section) belongs to Slice 5's UI work. This handler assembles
// enough of the same response shape to satisfy Slice 3's own acceptance
// path (current + historical role periods, in an ordered timeline) without
// it.
//
// Only Person and Organisation overviews are supported in this slice — the
// two kinds this slice supplies a store for.
const SUPPORTED_KINDS = new Set(['person', 'organisation']);

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

function toTimelineEntry({ link, endpoint, direction }) {
  return {
    id: link.id,
    kind: timelineKind(link),
    date: effectiveDate(link),
    end_date: link.valid_to,
    label: timelineLabel({ link, endpoint, direction }),
    context_key: link.context_key,
    source_ref: link.source_ref,
    href: endpoint.href ?? null
  };
}

function bucketFor(linkedRecords, kind) {
  if (kind === 'task') return linkedRecords.tasks;
  if (kind === 'communication') return linkedRecords.communications;
  if (kind === 'organisation') return linkedRecords.organisations;
  if (kind === 'person') return linkedRecords.people;
  return null;
}

export function createEntityOverviewHandler(deps = {}) {
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    }

    const url = new URL(request.url);
    const raw = url.searchParams.get('ref');
    if (!raw) {
      return withCors(errorResponse(400, 'missing_ref', 'ref query param required.', false), request, env);
    }

    try {
      const ref = assertRegisteredEntityRef(raw);
      if (!SUPPORTED_KINDS.has(ref.kind)) {
        return withCors(errorResponse(400, 'unsupported_entity_kind', `Overview does not support kind "${ref.kind}".`, false), request, env);
      }
      const canonicalRef = formatEntityRef(ref);
      const record = await loadEntity(store, ref);

      const accessContext = createAccessContext({ workflow: 'life' });
      const repo = createRepository({ store, resolveEntity });
      // Overview is a deliberate archive-aware workflow (implementation
      // programme, resolver rule 4) — `loadEntity` above already loads the
      // requested Person/Organisation directly regardless of lifecycle
      // status. `listForEntity` must be told the same thing explicitly:
      // without `includeArchived`, its internal authorisation check on the
      // *requested* ref would 404 an archived entity exactly like an
      // ordinary suggestion does, and both directions would silently come
      // back empty even though the record itself loaded fine (correction
      // B5). This option reaches only the resolution of `canonicalRef`
      // itself — every *other* endpoint a returned link resolves to (the
      // Organisations, Tasks, People, etc. this entity is linked to) still
      // goes through ordinary, non-archived resolution, so an archived
      // entity's relationships stay invisible everywhere except its own
      // overview.
      const { outgoing, incoming } = await repo.listForEntity(canonicalRef, accessContext, { includeArchived: true });

      const entries = [
        ...outgoing.map(entry => ({ ...entry, direction: 'outgoing' })),
        ...incoming.map(entry => ({ ...entry, direction: 'incoming' }))
      ];

      const current_relationships = entries.filter(entry => entry.link.status === 'current');
      const historical_relationships = entries.filter(entry => entry.link.status === 'ended');

      const timeline = entries
        .map(toTimelineEntry)
        .sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

      const linked_records = { tasks: [], communications: [], organisations: [], people: [] };
      for (const entry of entries) {
        const bucket = bucketFor(linked_records, entry.endpoint.kind);
        if (bucket) bucket.push(entry.endpoint);
      }

      return withCors(okResponse(200, {
        entity: { ref: canonicalRef, ...redactIdentityRecord(record) },
        current_relationships,
        historical_relationships,
        timeline,
        linked_records
      }), request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      const code = typeof error?.code === 'string' ? error.code : 'internal_error';
      const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
      return withCors(errorResponse(status, code, message, status === 503), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
  });
}

export default createEntityOverviewHandler();
