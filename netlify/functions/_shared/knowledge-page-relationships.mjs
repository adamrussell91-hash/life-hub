/**
 * Knowledge page dual-read relationships and write-cutover helpers.
 */
import { formatEntityRef } from './entity-ref.mjs';
import { formatEntityRefFromHubRef } from './hub-ref-entity-adapter.mjs';
import {
  combineConnectedRelationships,
  knowledgeRelationshipWriteMode
} from './knowledge-universal-links.mjs';
import { createKnowledgeRelationshipOperationRepository } from './knowledge-relationship-operation-repository.mjs';
import { bindKnowledgeUniversalLinks } from './knowledge-ul-runtime.mjs';

/**
 * Load dual-read relationship rows for a Knowledge page via indexed listForEntity.
 * @returns {Promise<{ relationships: object[], status: 'ready'|'unavailable', report?: object }>}
 */
export async function loadKnowledgePageRelationships({
  page,
  env,
  listForEntity = null,
  accessContext = null,
  dualRead = knowledgeRelationshipWriteMode(env).dual_read,
  writeCutover = knowledgeRelationshipWriteMode(env).write_cutover,
  bindUniversalLinks = bindKnowledgeUniversalLinks
} = {}) {
  if (!page?.id) {
    return { relationships: [], status: 'ready', report: null };
  }

  let listFn = listForEntity;
  let access = accessContext;
  if (typeof listFn !== 'function') {
    const bound = await bindUniversalLinks({ env });
    if (!bound.ok || typeof bound.listForEntity !== 'function') {
      if (writeCutover) {
        return { relationships: [], status: 'unavailable', report: null };
      }
      if (!dualRead) {
        const legacyOnly = combineConnectedRelationships({
          sourcePageId: page.id,
          legacyConnected: page.connected || [],
          universalLinks: []
        });
        return { relationships: legacyOnly.relationships, status: 'ready', report: legacyOnly.report };
      }
      return { relationships: [], status: 'unavailable', report: null };
    }
    listFn = bound.listForEntity;
    access = bound.accessContext;
  }

  const sourceRef = formatEntityRef({ namespace: 'knowledge', kind: 'page', id: page.id });
  let universalLinks = [];
  try {
    universalLinks = await listFn(sourceRef, access);
  } catch {
    if (writeCutover) {
      return { relationships: [], status: 'unavailable', report: null };
    }
    const legacyOnly = combineConnectedRelationships({
      sourcePageId: page.id,
      legacyConnected: dualRead ? page.connected || [] : page.connected || [],
      universalLinks: []
    });
    return {
      relationships: dualRead ? legacyOnly.relationships : legacyOnly.relationships,
      status: dualRead ? 'unavailable' : 'ready',
      report: legacyOnly.report
    };
  }

  if (writeCutover) {
    const canonicalOnly = combineConnectedRelationships({
      sourcePageId: page.id,
      legacyConnected: [],
      universalLinks
    });
    return {
      relationships: canonicalOnly.relationships,
      status: 'ready',
      report: canonicalOnly.report
    };
  }

  if (!dualRead) {
    const legacyOnly = combineConnectedRelationships({
      sourcePageId: page.id,
      legacyConnected: page.connected || [],
      universalLinks: []
    });
    return { relationships: legacyOnly.relationships, status: 'ready', report: legacyOnly.report };
  }

  const combined = combineConnectedRelationships({
    sourcePageId: page.id,
    legacyConnected: page.connected || [],
    universalLinks
  });
  return { relationships: combined.relationships, status: 'ready', report: combined.report };
}

/**
 * Map submitted legacy connected HubRefs into EntityRef target strings.
 * Malformed / unsupported values are reported — never silently dropped after cutover.
 */
export function intendedTargetsFromConnected(connectedValues) {
  const targets = [];
  const rejected = [];
  for (const value of Array.isArray(connectedValues) ? connectedValues : []) {
    if (typeof value !== 'string' || !value.trim()) {
      rejected.push({ value, reason: 'malformed' });
      continue;
    }
    const ref = formatEntityRefFromHubRef(value);
    if (!ref) {
      rejected.push({ value, reason: 'unsupported' });
      continue;
    }
    targets.push(ref);
  }
  return { targets: [...new Set(targets)].sort(), rejected };
}

/**
 * After page JSON is stored, apply related_to create/suppress through the journal.
 * Preserves legacy connected on the stored page; only Universal Links change.
 */
export async function applyKnowledgeRelationshipCutover({
  pageId,
  submittedConnected,
  env,
  bindUniversalLinks = bindKnowledgeUniversalLinks,
  createRelationshipRepository = createKnowledgeRelationshipOperationRepository
}) {
  const bound = await bindUniversalLinks({ env });
  if (!bound.ok || typeof bound.createLink !== 'function' || typeof bound.listForEntity !== 'function') {
    const err = new Error('Universal Link store unavailable for Knowledge relationship cutover');
    err.code = 'knowledge_ul_unavailable';
    err.status = 503;
    err.data = { code: 'knowledge_ul_unavailable', retryable: true };
    throw err;
  }

  const { targets, rejected } = intendedTargetsFromConnected(submittedConnected);
  if (rejected.length) {
    const err = new Error(
      `Knowledge relationship cutover rejected ${rejected.length} connected value(s).`
    );
    err.code = 'knowledge_relationship_validation_failed';
    err.status = 400;
    err.data = { code: 'knowledge_relationship_validation_failed', rejected, retryable: false };
    throw err;
  }

  const sourceRef = formatEntityRef({ namespace: 'knowledge', kind: 'page', id: pageId });
  const existing = await bound.listForEntity(sourceRef, bound.accessContext);
  const existingRelated = (Array.isArray(existing) ? existing : []).filter((entry) => {
    const link = entry?.link ?? entry;
    return link && link.relationship_type === 'related_to';
  });

  const journal = createRelationshipRepository({ store: bound.store });
  return journal.applyRelatedToCutover({
    pageId,
    intendedTargetRefs: targets,
    existingRelatedLinks: existingRelated,
    createLink: bound.createLink,
    suppressLink: bound.suppressLink,
    accessContext: bound.accessContext,
    administrationAccessContext: bound.administrationAccessContext
  });
}
