/**
 * Durable journal for Knowledge page related_to Universal Link cutover writes.
 * Keyed by page + operation identity so retries resume the same relationship set.
 */

import { createHash } from 'node:crypto';
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { getJSON, setJSON } from './universal-link-blobs.mjs';

export const RELATIONSHIP_INCOMPLETE_CODE = 'knowledge_relationship_operation_incomplete';
export const RELATIONSHIP_JOURNAL_PREFIX = 'knowledge/relationship-operations';

/**
 * @param {string} pageId
 * @param {string} fingerprint — stable hash of intended related_to set
 */
export function deriveRelationshipOperationId(pageId, fingerprint) {
  const raw = `knowledge_related_to:${String(pageId || '').trim()}:${fingerprint}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Stable fingerprint of intended related_to target refs (sorted unique).
 * @param {string[]} targetRefs
 */
export function fingerprintRelatedTargets(targetRefs) {
  const uniq = [...new Set((targetRefs || []).map((r) => String(r || '').trim()).filter(Boolean))].sort();
  return createHash('sha256').update(uniq.join('\n')).digest('hex').slice(0, 16);
}

function journalKey(operationId) {
  return `${RELATIONSHIP_JOURNAL_PREFIX}/${operationId}.json`;
}

function byPageKey(pageId) {
  return `${RELATIONSHIP_JOURNAL_PREFIX}/by-page/${encodeURIComponent(String(pageId))}.json`;
}

function pageSourceRef(pageId) {
  return formatEntityRef({ namespace: 'knowledge', kind: 'page', id: pageId });
}

function linkTargetRef(link, sourceRef) {
  if (!link) return '';
  if (link.source_ref === sourceRef) return String(link.target_ref || '').trim();
  if (link.target_ref === sourceRef) return String(link.source_ref || '').trim();
  return String(link.target_ref || '').trim();
}

/**
 * @param {{
 *   store: object,
 *   getJSON?: typeof getJSON,
 *   setJSON?: typeof setJSON,
 *   now?: () => string,
 * }} deps
 */
export function createKnowledgeRelationshipOperationRepository(deps) {
  const store = deps?.store;
  if (!store) {
    throw new Error('createKnowledgeRelationshipOperationRepository requires store');
  }
  const readJson = deps.getJSON ?? getJSON;
  const writeJson = deps.setJSON ?? setJSON;
  const now = deps.now ?? (() => new Date().toISOString());

  async function loadOperation(operationId) {
    if (!operationId) return null;
    try {
      return await readJson(store, journalKey(operationId));
    } catch {
      return null;
    }
  }

  async function loadLatestForPage(pageId) {
    try {
      const ptr = await readJson(store, byPageKey(pageId));
      if (!ptr?.operation_id) return null;
      return loadOperation(ptr.operation_id);
    } catch {
      return null;
    }
  }

  async function saveOperation(op) {
    const next = { ...op, updated_at: now() };
    await writeJson(store, journalKey(op.operation_id), next);
    await writeJson(store, byPageKey(op.page_id), {
      operation_id: op.operation_id,
      updated_at: next.updated_at,
      status: next.status
    });
    return next;
  }

  /**
   * Diff intended related_to targets against existing current related_to links.
   */
  function planDiff({ pageId, intendedTargetRefs, existingRelatedLinks }) {
    const sourceRef = pageSourceRef(pageId);
    const intended = new Set(
      (intendedTargetRefs || []).map((r) => String(r || '').trim()).filter(Boolean)
    );
    /** @type {Map<string, { id: string, target_ref: string }>} */
    const existingByTarget = new Map();
    for (const entry of existingRelatedLinks || []) {
      const link = entry?.link ?? entry;
      if (!link) continue;
      if (String(link.relationship_type || '') !== 'related_to') continue;
      if (link.status && link.status !== 'current') continue;
      const target = linkTargetRef(link, sourceRef);
      if (!target || target === sourceRef) continue;
      existingByTarget.set(target, { id: String(link.id || ''), target_ref: target });
    }

    const toCreate = [];
    for (const target of intended) {
      if (!existingByTarget.has(target)) {
        toCreate.push({
          source_ref: sourceRef,
          target_ref: target,
          relationship_type: 'related_to'
        });
      }
    }

    const toSuppress = [];
    for (const [target, link] of existingByTarget) {
      if (!intended.has(target) && link.id) {
        toSuppress.push({ link_id: link.id, target_ref: target });
      }
    }

    return { sourceRef, toCreate, toSuppress, intended: [...intended].sort() };
  }

  /**
   * Apply create + suppress plan with durable journal. Idempotent on operation_id.
   * suppressLink requires the administration workflow (approved timeless removal path).
   */
  async function applyRelatedToCutover(args) {
    const {
      pageId,
      intendedTargetRefs,
      existingRelatedLinks,
      createLink,
      suppressLink,
      accessContext,
      administrationAccessContext = createAccessContext({ workflow: 'administration' })
    } = args;

    if (typeof createLink !== 'function' || typeof suppressLink !== 'function') {
      const err = new Error('Universal Links repository required for Knowledge relationship cutover');
      err.code = 'knowledge_ul_unavailable';
      err.status = 503;
      throw err;
    }

    const fingerprint = fingerprintRelatedTargets(intendedTargetRefs);
    const operationId = deriveRelationshipOperationId(pageId, fingerprint);
    const plan = planDiff({ pageId, intendedTargetRefs, existingRelatedLinks });

    let op = await loadOperation(operationId);
    if (!op) {
      op = {
        schema_version: 1,
        operation_id: operationId,
        page_id: pageId,
        fingerprint,
        status: 'in_progress',
        intended_targets: plan.intended,
        created_link_ids: [],
        created_targets: [],
        suppressed_link_ids: [],
        failed: [],
        created_at: now(),
        updated_at: now()
      };
      await saveOperation(op);
    }

    if (op.status === 'committed' || op.status === 'noop') {
      return {
        ok: true,
        operation: op,
        created: op.created_link_ids || [],
        suppressed: op.suppressed_link_ids || []
      };
    }

    const createdTargets = new Set((op.created_targets || []).map(String));
    const suppressedDone = new Set((op.suppressed_link_ids || []).map(String));
    const sourceRef = plan.sourceRef;
    const existingCurrentTargets = new Set();
    for (const entry of existingRelatedLinks || []) {
      const link = entry?.link ?? entry;
      if (!link || String(link.relationship_type || '') !== 'related_to') continue;
      if (link.status && link.status !== 'current') continue;
      const target = linkTargetRef(link, sourceRef);
      if (target) existingCurrentTargets.add(target);
    }

    const failed = [];

    for (const intent of plan.toCreate) {
      if (createdTargets.has(intent.target_ref)) continue;
      if (existingCurrentTargets.has(intent.target_ref)) {
        createdTargets.add(intent.target_ref);
        op.created_targets = [...createdTargets];
        await saveOperation(op);
        continue;
      }
      try {
        const result = await createLink(
          {
            source_ref: intent.source_ref,
            target_ref: intent.target_ref,
            relationship_type: 'related_to'
          },
          accessContext
        );
        const linkId = String(result?.link?.id ?? result?.id ?? '');
        if (linkId && !(op.created_link_ids || []).includes(linkId)) {
          op.created_link_ids = [...(op.created_link_ids || []), linkId];
        }
        createdTargets.add(intent.target_ref);
        existingCurrentTargets.add(intent.target_ref);
        op.created_targets = [...createdTargets];
        await saveOperation(op);
      } catch (e) {
        failed.push({
          action: 'create',
          target_ref: intent.target_ref,
          error: e instanceof Error ? e.message : String(e),
          code: e?.code || null
        });
      }
    }

    for (const item of plan.toSuppress) {
      if (suppressedDone.has(item.link_id)) continue;
      try {
        await suppressLink(item.link_id, 'knowledge_page_connected_removed', administrationAccessContext);
        op.suppressed_link_ids = [...(op.suppressed_link_ids || []), item.link_id];
        suppressedDone.add(item.link_id);
        await saveOperation(op);
      } catch (e) {
        failed.push({
          action: 'suppress',
          link_id: item.link_id,
          target_ref: item.target_ref,
          error: e instanceof Error ? e.message : String(e),
          code: e?.code || null
        });
      }
    }

    op.failed = failed;
    if (failed.length) {
      op.status = 'incomplete';
      await saveOperation(op);
      const err = new Error(
        `Knowledge relationship cutover incomplete (${failed.length} failure(s)). Retry the same page save.`
      );
      err.code = RELATIONSHIP_INCOMPLETE_CODE;
      err.status = 409;
      err.data = {
        code: RELATIONSHIP_INCOMPLETE_CODE,
        operation_id: op.operation_id,
        page_id: pageId,
        failed,
        created_link_ids: op.created_link_ids,
        suppressed_link_ids: op.suppressed_link_ids,
        retryable: true
      };
      throw err;
    }

    const noWork =
      plan.toCreate.length === 0 &&
      plan.toSuppress.length === 0 &&
      !(op.created_link_ids || []).length &&
      !(op.suppressed_link_ids || []).length;
    op.status = noWork ? 'noop' : 'committed';
    op.failed = [];
    await saveOperation(op);
    return {
      ok: true,
      operation: op,
      created: op.created_link_ids || [],
      suppressed: op.suppressed_link_ids || []
    };
  }

  return {
    loadOperation,
    loadLatestForPage,
    saveOperation,
    planDiff,
    applyRelatedToCutover,
    deriveRelationshipOperationId,
    fingerprintRelatedTargets
  };
}
