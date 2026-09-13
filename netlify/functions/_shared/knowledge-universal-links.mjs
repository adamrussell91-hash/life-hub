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
  projectKey,
  programKey
} from './tasks-blobs.mjs';
import {
  defaultGetContentStore as defaultGetTeachingStore,
  getJSON as getTeachingJSON,
  unitKey,
  draftLessonKey,
  classKey
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


export async function resolveTasksProgram(
  id,
  accessContext,
  { getStore = defaultGetTasksStore } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTasksJSON(store, programKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const hubRef = { hub: 'tasks', kind: 'program', id };
  return projection({
    namespace: 'tasks',
    kind: 'program',
    id,
    displayLabel: typeof record.name === 'string' && record.name ? record.name : id,
    supportingLabel: typeof record.organiser === 'string' && record.organiser ? record.organiser : null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: 'active'
  });
}

export async function resolveTeachingLesson(
  id,
  accessContext,
  { getStore = defaultGetTeachingStore } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTeachingJSON(store, draftLessonKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  // Operator-safe projection only: never return blocks, student material, or homepage content.
  const status = typeof record.status === 'string' ? record.status : 'active';
  if (status === 'trashed' || status === 'deleted') throw endpointNotFoundError();
  const hubRef = { hub: 'teaching', kind: 'lesson', id };
  return projection({
    namespace: 'teaching',
    kind: 'lesson',
    id,
    displayLabel: typeof record.title === 'string' && record.title ? record.title : id,
    supportingLabel: typeof record.unit_id === 'string' ? record.unit_id : null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: status
  });
}

export async function resolveTeachingClass(
  id,
  accessContext,
  { getStore = defaultGetTeachingStore } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTeachingJSON(store, classKey(id));
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const status = typeof record.status === 'string' ? record.status : 'active';
  if (status === 'trashed' || status === 'deleted') throw endpointNotFoundError();
  const hubRef = { hub: 'teaching', kind: 'class', id };
  const label =
    typeof record.display_name === 'string' && record.display_name
      ? record.display_name
      : typeof record.title === 'string' && record.title
        ? record.title
        : typeof record.code === 'string' && record.code
          ? record.code
          : id;
  return projection({
    namespace: 'teaching',
    kind: 'class',
    id,
    displayLabel: label,
    supportingLabel: typeof record.code === 'string' ? record.code : null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: status
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
/**
 * Dual-read projection that preserves canonical link direction and ownership.
 *
 * Chip kinds:
 * - outgoing_owned — this page is source_ref (editable / replace payload)
 * - incoming_readonly — this page is target_ref (display only; never in replace)
 * - legacy_pending — legacy connected only; owned by this page per migration rule
 *
 * Never rewrite an incoming B→A link as if A owned A→B.
 */
export function combineConnectedRelationships({
  sourcePageId,
  legacyConnected = [],
  universalLinks = []
}) {
  const sourceRef = formatEntityRef({ namespace: 'knowledge', kind: 'page', id: sourcePageId });
  /** @type {Map<string, any>} */
  const byOther = new Map();
  const report = {
    legacy_count: 0,
    canonical_count: 0,
    equivalent_count: 0,
    malformed: [],
    unsupported: []
  };

  function projectRow(row) {
    const sources = [...row.sources].sort();
    const otherRef = row.direction === 'incoming' ? row.source_ref : row.target_ref;
    return {
      source_ref: row.source_ref,
      target_ref: row.target_ref,
      relationship_type: 'related_to',
      legacy_hub_ref: row.legacy_hub_ref ?? formatHubRefFromEntityRef(otherRef),
      other_ref: otherRef,
      direction: row.direction,
      ownership: row.ownership,
      sources,
      link_id: row.link_id
    };
  }

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
    const existing = byOther.get(row.target_ref);
    if (existing) {
      report.equivalent_count += 1;
      existing.sources.add('legacy');
      continue;
    }
    byOther.set(row.target_ref, {
      source_ref: sourceRef,
      target_ref: row.target_ref,
      relationship_type: 'related_to',
      legacy_hub_ref: row.legacy_hub_ref,
      sources: new Set(['legacy']),
      link_id: null,
      direction: 'outgoing',
      ownership: 'legacy_pending'
    });
  }

  for (const entry of Array.isArray(universalLinks) ? universalLinks : []) {
    const link = entry?.link ?? entry;
    if (!link || link.relationship_type !== 'related_to') continue;
    if (link.status && link.status !== 'current') continue;
    report.canonical_count += 1;

    let direction = null;
    let otherRef = null;
    if (link.source_ref === sourceRef) {
      direction = 'outgoing';
      otherRef = link.target_ref;
    } else if (link.target_ref === sourceRef) {
      direction = 'incoming';
      otherRef = link.source_ref;
    }
    if (!direction || !otherRef) continue;

    const ownership = direction === 'outgoing' ? 'outgoing_owned' : 'incoming_readonly';
    const existing = byOther.get(otherRef);
    if (existing) {
      report.equivalent_count += 1;
      existing.sources.add('canonical');
      existing.link_id = link.id ?? existing.link_id;
      // Canonical direction wins over a legacy-only placeholder for the same peer.
      existing.source_ref = link.source_ref;
      existing.target_ref = link.target_ref;
      existing.direction = direction;
      existing.ownership = ownership;
      existing.legacy_hub_ref =
        existing.legacy_hub_ref ?? formatHubRefFromEntityRef(otherRef);
      continue;
    }
    byOther.set(otherRef, {
      source_ref: link.source_ref,
      target_ref: link.target_ref,
      relationship_type: 'related_to',
      legacy_hub_ref: formatHubRefFromEntityRef(otherRef),
      sources: new Set(['canonical']),
      link_id: link.id ?? null,
      direction,
      ownership
    });
  }

  const relationships = [...byOther.values()].map(projectRow);
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
