import { createAccessContext } from './entity-access.mjs';
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
    // Never invent a browser href — only surface one the resolver provided.
    href: endpoint.href ?? null
  };
}

function bucketFor(linkedRecords, kind) {
  if (kind === 'task') return linkedRecords.tasks;
  if (kind === 'communication') return linkedRecords.communications;
  if (kind === 'meeting') return linkedRecords.meetings;
  if (kind === 'event') return linkedRecords.events;
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

  const timeline = entries
    .map(toTimelineEntry)
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const linked_records = {
    tasks: [],
    communications: [],
    meetings: [],
    events: [],
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
    linked_records
  };
}

export { defaultGetUniversalLinkStore };
