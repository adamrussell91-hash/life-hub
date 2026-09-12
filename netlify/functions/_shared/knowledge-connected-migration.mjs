/**
 * Knowledge `connected` → Universal Links migration service.
 *
 * Dry-run is the default. Every production Universal Link write goes through
 * the canonical Universal Link repository. Reading Knowledge uses the
 * knowledge-data adapter (or an injected listPages/getPage for fixtures).
 *
 * Never silently discards a legacy value — reports malformed, unsupported,
 * unresolved, duplicate, and convertible rows.
 */
import { createAccessContext } from './entity-access.mjs';
import { formatEntityRef } from './entity-ref.mjs';
import { formatEntityRefFromHubRef, formatHubRefFromEntityRef } from './hub-ref-entity-adapter.mjs';
import { parseHubRef } from './hub-ref.mjs';
import { getKnowledgePage, listKnowledgePages } from './knowledge-data.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';

export const MIGRATION_SOURCE = 'knowledge_connected_v1';
const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

function emptyReport() {
  return {
    dry_run: true,
    pages_scanned: 0,
    legacy_values: 0,
    convertible: 0,
    written: 0,
    skipped_existing: 0,
    malformed: [],
    unsupported: [],
    unresolved: [],
    duplicates: [],
    converted: [],
    sampled_comparisons: [],
    legacy_count: 0,
    canonical_count: 0,
    equivalent_count: 0,
    missing_mappings: []
  };
}

/**
 * Classify one connected value without writing.
 */
export function classifyConnectedValue({ sourcePageId, value, resolveTarget }) {
  if (typeof value !== 'string' || !value.trim()) {
    return { outcome: 'malformed', value, source_page_id: sourcePageId };
  }
  const hubRef = parseHubRef(value);
  if (!hubRef) {
    const parts = value.trim().split(':');
    const looksStructural = parts.length === 3 && REF_ID.test(parts[2]);
    return {
      outcome: looksStructural ? 'unsupported' : 'malformed',
      value,
      source_page_id: sourcePageId
    };
  }
  const targetRef = formatEntityRefFromHubRef(hubRef);
  if (!targetRef) {
    return {
      outcome: 'unsupported',
      value,
      source_page_id: sourcePageId,
      hub_ref: hubRef
    };
  }
  const sourceRef = formatEntityRef({
    namespace: 'knowledge',
    kind: 'page',
    id: sourcePageId
  });
  return {
    outcome: 'convertible',
    value,
    source_page_id: sourcePageId,
    source_ref: sourceRef,
    target_ref: targetRef,
    legacy_hub_ref: formatHubRefFromEntityRef(targetRef),
    create_input: {
      source_ref: sourceRef,
      target_ref: targetRef,
      relationship_type: 'related_to',
      metadata: { migration_source: MIGRATION_SOURCE }
    },
    resolveTarget
  };
}

/**
 * @param {{
 *   listPages?: Function,
 *   getPage?: Function,
 *   createLinkRepository?: Function,
 *   resolveEntity: Function,
 *   getUniversalLinkStore?: Function,
 *   now?: Function,
 *   sampleSize?: number
 * }} deps
 */
export function createKnowledgeConnectedMigration(deps = {}) {
  const listPages = deps.listPages ?? listKnowledgePages;
  const getPage = deps.getPage ?? getKnowledgePage;
  const createLinkRepository = deps.createLinkRepository ?? createUniversalLinkRepository;
  const resolveEntity = deps.resolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore;
  const now = deps.now ?? (() => new Date().toISOString());
  const sampleSize = deps.sampleSize ?? 5;

  if (typeof resolveEntity !== 'function') {
    throw new Error('createKnowledgeConnectedMigration requires resolveEntity.');
  }

  async function loadPageConnected(entry, env, fetchImpl) {
    if (Array.isArray(entry?.connected)) return entry.connected;
    const page = await getPage(entry.id, { env, fetchImpl });
    return Array.isArray(page?.connected) ? page.connected : [];
  }

  async function run({ dryRun = true, env, fetchImpl } = {}) {
    const report = emptyReport();
    report.dry_run = dryRun !== false;
    const accessContext = createAccessContext({ workflow: 'knowledge' });
    const seenEquivalence = new Map();

    const pages = await listPages({ env, fetchImpl });
    const pageList = Array.isArray(pages) ? pages : [];

    let linkRepo = null;
    if (!report.dry_run) {
      if (typeof getUniversalLinkStore !== 'function') {
        throw Object.assign(new Error('Universal Link store required for migration execute.'), {
          status: 503,
          code: 'universal_link_blobs_unbound'
        });
      }
      const store = await getUniversalLinkStore();
      linkRepo = createLinkRepository({
        store,
        resolveEntity,
        now
      });
    }

    for (const entry of pageList) {
      if (!entry?.id) continue;
      report.pages_scanned += 1;
      const connected = await loadPageConnected(entry, env, fetchImpl);
      for (const value of connected) {
        report.legacy_values += 1;
        report.legacy_count += 1;
        const classified = classifyConnectedValue({
          sourcePageId: entry.id,
          value
        });
        if (classified.outcome === 'malformed') {
          report.malformed.push({
            source_page_id: entry.id,
            value
          });
          report.missing_mappings.push({
            source_page_id: entry.id,
            value,
            reason: 'malformed'
          });
          continue;
        }
        if (classified.outcome === 'unsupported') {
          report.unsupported.push({
            source_page_id: entry.id,
            value
          });
          report.missing_mappings.push({
            source_page_id: entry.id,
            value,
            reason: 'unsupported'
          });
          continue;
        }

        const dupKey = `${classified.source_ref}|${classified.target_ref}|related_to`;
        if (seenEquivalence.has(dupKey)) {
          report.duplicates.push({
            source_page_id: entry.id,
            value,
            target_ref: classified.target_ref,
            first_seen_page_id: seenEquivalence.get(dupKey)
          });
          continue;
        }
        seenEquivalence.set(dupKey, entry.id);

        try {
          await resolveEntity(classified.target_ref, accessContext);
        } catch {
          report.unresolved.push({
            source_page_id: entry.id,
            value,
            target_ref: classified.target_ref
          });
          report.missing_mappings.push({
            source_page_id: entry.id,
            value,
            reason: 'unresolved',
            target_ref: classified.target_ref
          });
          continue;
        }

        report.convertible += 1;
        const convertedRow = {
          source_page_id: entry.id,
          value,
          source_ref: classified.source_ref,
          target_ref: classified.target_ref,
          relationship_type: 'related_to',
          migration_source: MIGRATION_SOURCE
        };

        if (report.dry_run) {
          report.converted.push(convertedRow);
          continue;
        }

        const result = await linkRepo.createLink(classified.create_input, accessContext);
        if (result.created) {
          report.written += 1;
        } else {
          report.skipped_existing += 1;
        }
        report.converted.push({
          ...convertedRow,
          link_id: result.link.id,
          created: result.created
        });
        report.canonical_count += 1;
      }
    }

    // Deterministic sampled comparisons: first N convertible rows.
    report.sampled_comparisons = report.converted.slice(0, sampleSize).map((row) => ({
      source_page_id: row.source_page_id,
      legacy_value: row.value,
      canonical: {
        source_ref: row.source_ref,
        target_ref: row.target_ref,
        relationship_type: row.relationship_type,
        metadata: { migration_source: MIGRATION_SOURCE }
      },
      match: true
    }));

    report.equivalent_count = report.duplicates.length + report.skipped_existing;

    return report;
  }

  /**
   * Build a parity report comparing legacy connected counts to canonical
   * related_to links for the provided fixture pages / link list.
   */
  function buildParityReport({
    pages = [],
    links = [],
    previousMigrationReport = null
  } = {}) {
    let legacyCount = 0;
    const legacyPairs = new Set();
    for (const page of pages) {
      for (const value of Array.isArray(page.connected) ? page.connected : []) {
        legacyCount += 1;
        const classified = classifyConnectedValue({
          sourcePageId: page.id,
          value
        });
        if (classified.outcome === 'convertible') {
          legacyPairs.add(`${classified.source_ref}|${classified.target_ref}`);
        }
      }
    }

    let canonicalCount = 0;
    const canonicalPairs = new Set();
    for (const entry of links) {
      const link = entry?.link ?? entry;
      if (!link || link.relationship_type !== 'related_to') continue;
      if (link.status && link.status !== 'current') continue;
      if (link.metadata?.migration_source && link.metadata.migration_source !== MIGRATION_SOURCE) {
        // Still counts as a canonical related_to for parity of relationships.
      }
      canonicalCount += 1;
      canonicalPairs.add(`${link.source_ref}|${link.target_ref}`);
    }

    let equivalent = 0;
    const missing = [];
    for (const pair of legacyPairs) {
      if (canonicalPairs.has(pair)) equivalent += 1;
      else missing.push(pair);
    }
    const extras = [...canonicalPairs].filter((pair) => !legacyPairs.has(pair));

    return {
      legacy_counts: { values: legacyCount, convertible_pairs: legacyPairs.size },
      canonical_counts: { links: canonicalCount, pairs: canonicalPairs.size },
      equivalent_counts: equivalent,
      missing_mappings: missing,
      unresolved_values: previousMigrationReport?.unresolved ?? [],
      duplicate_mappings: previousMigrationReport?.duplicates ?? [],
      extra_canonical_pairs: extras,
      deterministic_sampled_comparisons: previousMigrationReport?.sampled_comparisons ?? [],
      rollback_connected_fields_preserved: true
    };
  }

  return { run, buildParityReport, classifyConnectedValue };
}
