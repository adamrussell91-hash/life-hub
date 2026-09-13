/**
 * Knowledge Page / Teaching Unit / Tasks Project / Life Decision resolvers
 * and related_to dual-read / indexed backlink helpers for Slice 7.
 */
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';
import { endpointNotFoundError, isVisibilityAllowed } from './entity-access.mjs';
import {
  formatEntityRefFromHubRef,
  formatHubRefFromEntityRef,
  hubRefFromEntityRef
} from './hub-ref-entity-adapter.mjs';
import { hrefForHubRef, labelForHubRef, parseHubRef } from './hub-ref.mjs';
import { getKnowledgePage as defaultGetKnowledgePage } from './knowledge-data.mjs';
import { isKnowledgeDualReadEnabled, isKnowledgeWriteCutoverEnabled } from './knowledge-ul-config.mjs';
import {
  defaultGetTasksStore,
  getJSON as getTasksJSON,
  projectKey
} from './tasks-blobs.mjs';
import {
  defaultGetContentStore as defaultGetTeachingStore,
  getJSON as getTeachingJSON,
  unitKey
} from './teaching-blobs.mjs';
import { createAccessContext } from './entity-access.mjs';

const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

function projection({ namespace, kind, id, displayLabel, supportingLabel = null, href = null, lifecycleStatus = 'active' }) {
  const ref = formatEntityRef({ namespace, kind, id });
  if (!ref) throw endpointNotFoundError();
  return {
    ref,
    kind,
    display_label: displayLabel,
    supporting_label: supportingLabel,
    href,
    lifecycle_status: lifecycleStatus,
    visibility: 'operator'
  };
}

export async function resolveKnowledgePage(
  id,
  accessContext,
  { getPage = defaultGetKnowledgePage, env, fetchImpl } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const page = await getPage(id, { env, fetchImpl });
  if (!page || typeof page !== 'object') throw endpointNotFoundError();
  const hubRef = { hub: 'knowledge', kind: 'page', id };
  return projection({
    namespace: 'knowledge',
    kind: 'page',
    id,
    displayLabel: typeof page.title === 'string' && page.title ? page.title : id,
    supportingLabel: typeof page.area === 'string' ? page.area : null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: 'active'
  });
}

export async function resolveTeachingUnit(
  id,
  accessContext,
  { getStore = defaultGetTeachingStore } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTeachingJSON(store, unitKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const hubRef = { hub: 'teaching', kind: 'unit', id };
  return projection({
    namespace: 'teaching',
    kind: 'unit',
    id,
    displayLabel: typeof record.title === 'string' && record.title ? record.title : id,
    supportingLabel: typeof record.code === 'string' ? record.code : null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: typeof record.status === 'string' ? record.status : 'active'
  });
}

export async function resolveTasksProject(
  id,
  accessContext,
  { getStore = defaultGetTasksStore } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTasksJSON(store, projectKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const hubRef = { hub: 'tasks', kind: 'project', id };
  return projection({
    namespace: 'tasks',
    kind: 'project',
    id,
    displayLabel: typeof record.title === 'string' && record.title ? record.title : id,
    supportingLabel: typeof record.status === 'string' ? record.status : null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: typeof record.status === 'string' ? record.status : 'active'
  });
}

/**
 * Life decisions are not Blob-backed in Slice 7. Callers inject `getDecision`
 * (fixture map or Life store adapter). Without it, the endpoint is absent.
 */
export async function resolveLifeDecision(
  id,
  accessContext,
  { getDecision = null } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  if (typeof getDecision !== 'function') throw endpointNotFoundError();
  const record = await getDecision(id);
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const hubRef = { hub: 'life', kind: 'decision', id };
  return projection({
    namespace: 'life',
    kind: 'decision',
    id,
    displayLabel:
      typeof record.title === 'string' && record.title
        ? record.title
        : labelForHubRef(hubRef),
    supportingLabel: null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: typeof record.status === 'string' ? record.status : 'active'
  });
}

/**
 * Convert a legacy connected HubRef string into a dual-read relationship row.
 */
export function legacyConnectedToRelationshipRow(sourcePageId, connectedValue) {
  const hubRef = parseHubRef(connectedValue);
  if (!hubRef) {
    return { status: 'malformed', value: connectedValue };
  }
  const targetEntityRef = formatEntityRefFromHubRef(hubRef);
  if (!targetEntityRef) {
    return { status: 'unsupported', value: connectedValue, hub_ref: hubRef };
  }
  return {
    status: 'ok',
    value: connectedValue,
    source_ref: formatEntityRef({ namespace: 'knowledge', kind: 'page', id: sourcePageId }),
    target_ref: targetEntityRef,
    relationship_type: 'related_to',
    legacy_hub_ref: formatHubRefFromEntityRef(targetEntityRef)
  };
}

/**
 * Dual-read: combine legacy connected values with canonical related_to links.
 * Deduplicates by target EntityRef (and equivalent HubRef storage form).
 */
export function combineConnectedRelationships({
  sourcePageId,
  legacyConnected = [],
  universalLinks = []
}) {
  const sourceRef = formatEntityRef({ namespace: 'knowledge', kind: 'page', id: sourcePageId });
  const byTarget = new Map();
  const report = {
    legacy_count: 0,
    canonical_count: 0,
    equivalent_count: 0,
    malformed: [],
    unsupported: []
  };

  for (const value of Array.isArray(legacyConnected) ? legacyConnected : []) {
    report.legacy_count += 1;
    const row = legacyConnectedToRelationshipRow(sourcePageId, value);
    if (row.status === 'malformed') {
      report.malformed.push(value);
      continue;
    }
    if (row.status === 'unsupported') {
      report.unsupported.push(value);
      continue;
    }
    const existing = byTarget.get(row.target_ref);
    if (existing) {
      report.equivalent_count += 1;
      existing.sources.add('legacy');
      continue;
    }
    byTarget.set(row.target_ref, {
      source_ref: sourceRef,
      target_ref: row.target_ref,
      relationship_type: 'related_to',
      legacy_hub_ref: row.legacy_hub_ref,
      sources: new Set(['legacy']),
      link_id: null
    });
  }

  for (const entry of Array.isArray(universalLinks) ? universalLinks : []) {
    const link = entry?.link ?? entry;
    if (!link || link.relationship_type !== 'related_to') continue;
    if (link.status && link.status !== 'current') continue;
    report.canonical_count += 1;
    const targetRef =
      link.source_ref === sourceRef
        ? link.target_ref
        : link.target_ref === sourceRef
          ? link.source_ref
          : null;
    if (!targetRef) continue;
    const existing = byTarget.get(targetRef);
    if (existing) {
      report.equivalent_count += 1;
      existing.sources.add('canonical');
      existing.link_id = link.id ?? existing.link_id;
      continue;
    }
    byTarget.set(targetRef, {
      source_ref: sourceRef,
      target_ref: targetRef,
      relationship_type: 'related_to',
      legacy_hub_ref: formatHubRefFromEntityRef(targetRef),
      sources: new Set(['canonical']),
      link_id: link.id ?? null
    });
  }

  const relationships = [...byTarget.values()].map((row) => ({
    source_ref: row.source_ref,
    target_ref: row.target_ref,
    relationship_type: row.relationship_type,
    legacy_hub_ref: row.legacy_hub_ref,
    sources: [...row.sources].sort(),
    link_id: row.link_id
  }));

  return { relationships, report };
}

/**
 * Indexed backlinks for a Knowledge page via Universal Links membership.
 * Never scans every Knowledge page.
 */
export async function listIndexedKnowledgeBacklinks({
  pageId,
  listIncoming,
  accessContext = createAccessContext({ workflow: 'knowledge' })
}) {
  const targetRef = formatEntityRef({ namespace: 'knowledge', kind: 'page', id: pageId });
  if (!targetRef) return { links: [], status: 'ready' };
  if (typeof listIncoming !== 'function') {
    return { links: [], status: 'unavailable' };
  }
  const incoming = await listIncoming(targetRef, accessContext);
  const links = [];
  const seen = new Set();
  for (const entry of Array.isArray(incoming) ? incoming : []) {
    const link = entry?.link ?? entry;
    if (!link || link.relationship_type !== 'related_to') continue;
    if (link.status && link.status !== 'current') continue;
    const source = parseEntityRef(link.source_ref);
    if (!source || source.namespace !== 'knowledge' || source.kind !== 'page') continue;
    if (source.id === pageId || seen.has(source.id)) continue;
    seen.add(source.id);
    const endpoint = entry?.endpoint ?? entry?.source ?? null;
    links.push({
      id: source.id,
      title:
        typeof endpoint?.display_label === 'string' && endpoint.display_label
          ? endpoint.display_label
          : source.id
    });
  }
  return { links, status: 'ready' };
}

/**
 * Dual-read backlinks: indexed Universal Links plus legacy scan results,
 * deduplicated by page id. After cutover + parity, callers may pass
 * `legacyLinks: []` so ordinary requests never scan.
 */
export function combineBacklinks({ indexedLinks = [], legacyLinks = [] }) {
  const byId = new Map();
  for (const row of [...indexedLinks, ...legacyLinks]) {
    if (!row || typeof row.id !== 'string') continue;
    if (byId.has(row.id)) continue;
    byId.set(row.id, {
      id: row.id,
      title: typeof row.title === 'string' && row.title ? row.title : row.id
    });
  }
  return [...byId.values()];
}

export function knowledgeRelationshipWriteMode(env = process.env) {
  return {
    dual_read: isKnowledgeDualReadEnabled(env),
    write_cutover: isKnowledgeWriteCutoverEnabled(env),
    // After cutover, relationship edits must not mutate connected; the field
    // remains stored for rollback comparison only.
    preserve_connected_on_save: isKnowledgeWriteCutoverEnabled(env)
  };
}

export { hubRefFromEntityRef, formatHubRefFromEntityRef, formatEntityRefFromHubRef };
