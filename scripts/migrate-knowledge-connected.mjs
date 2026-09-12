#!/usr/bin/env node
/**
 * Knowledge connected → Universal Links migration CLI.
 *
 * Dry-run is the default. Writes require --execute. Live Knowledge reads
 * require an explicit --source=live. Production execution requires BOTH
 * --source=live and --confirm-execute. Fixture mode is for local verification
 * and keeps memory stores.
 *
 * Usage:
 *   node scripts/migrate-knowledge-connected.mjs --fixture tests/fixtures/knowledge-connected-migration.json
 *   node scripts/migrate-knowledge-connected.mjs --source=fixture --fixture path --execute
 *   node scripts/migrate-knowledge-connected.mjs --source=live
 *   node scripts/migrate-knowledge-connected.mjs --source=live --execute --confirm-execute
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKnowledgeConnectedMigration } from '../netlify/functions/_shared/knowledge-connected-migration.mjs';
import { resolveEntity as defaultResolveEntity } from '../netlify/functions/_shared/entity-resolvers.mjs';
import {
  resolveKnowledgePage,
  resolveLifeDecision,
  resolveTasksProject,
  resolveTeachingUnit
} from '../netlify/functions/_shared/knowledge-universal-links.mjs';
import { parseEntityRef } from '../netlify/functions/_shared/entity-ref.mjs';
import { createUniversalLinkRepository } from '../netlify/functions/_shared/universal-link-repository.mjs';
import {
  getKnowledgePage as defaultGetKnowledgePage,
  listKnowledgePages as defaultListKnowledgePages
} from '../netlify/functions/_shared/knowledge-data.mjs';
import {
  byTypePrefix,
  defaultGetUniversalLinkStore,
  getJSON,
  linkKey
} from '../netlify/functions/_shared/universal-link-blobs.mjs';
import { listBlobKeys, isIndexKey } from '../netlify/functions/_shared/blobs-list.mjs';
import { defaultGetContentStore as defaultGetTeachingStore } from '../netlify/functions/_shared/teaching-blobs.mjs';
import { defaultGetTasksStore } from '../netlify/functions/_shared/tasks-blobs.mjs';

function parseArgs(argv) {
  const fixtureIndex = argv.indexOf('--fixture');
  const sourceIndex = argv.indexOf('--source');
  let source = null;
  if (sourceIndex >= 0) {
    source = argv[sourceIndex + 1] || null;
  } else {
    const inline = argv.find((arg) => arg.startsWith('--source='));
    if (inline) source = inline.slice('--source='.length);
  }
  return {
    execute: argv.includes('--execute'),
    confirmExecute: argv.includes('--confirm-execute'),
    fixture: fixtureIndex >= 0 ? argv[fixtureIndex + 1] : null,
    source,
    help: argv.includes('--help') || argv.includes('-h')
  };
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    },
    _map: map
  };
}

async function loadFixture(fixturePath) {
  const absolute = path.isAbsolute(fixturePath)
    ? fixturePath
    : path.join(process.cwd(), fixturePath);
  const raw = JSON.parse(await readFile(absolute, 'utf8'));
  return raw;
}

/**
 * Build parity from the related_to type index — never scan universal-links/links/.
 */
export async function loadCanonicalRelatedToFromIndexes(store, { getJSONImpl = getJSON } = {}) {
  if (!store) return [];
  const prefix = byTypePrefix('related_to');
  let keys = [];
  try {
    keys = (await listBlobKeys(store, prefix)).filter((key) => !isIndexKey(key));
  } catch {
    return [];
  }
  const links = [];
  const seen = new Set();
  for (const key of keys) {
    const membership = await getJSONImpl(store, key);
    const linkId =
      (membership && typeof membership.link_id === 'string' && membership.link_id) ||
      String(key.split('/').pop() || '');
    if (!linkId || seen.has(linkId)) continue;
    seen.add(linkId);
    const link = await getJSONImpl(store, linkKey(linkId));
    if (link && typeof link === 'object') links.push(link);
  }
  return links;
}

async function main(argv = process.argv.slice(2), inject = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage: node scripts/migrate-knowledge-connected.mjs [--source=fixture|live] [--fixture path] [--execute] [--confirm-execute]
Dry-run is the default. Live production writes require --source=live --execute --confirm-execute.`);
    return 0;
  }

  const source = args.source || (args.fixture ? 'fixture' : null);
  if (!source) {
    console.error(
      'No --source supplied. Use --source=fixture with --fixture <path>, or --source=live (dry-run unless --execute --confirm-execute).'
    );
    return 2;
  }
  if (source !== 'fixture' && source !== 'live') {
    console.error(`Unknown --source=${source}. Expected fixture or live.`);
    return 2;
  }
  if (args.execute && source === 'live' && !args.confirmExecute) {
    console.error(
      'Refusing live execute without --confirm-execute. Production writes require --source=live --execute --confirm-execute.'
    );
    return 2;
  }
  if (args.confirmExecute && !args.execute) {
    console.error('--confirm-execute requires --execute.');
    return 2;
  }

  const dryRun = !args.execute;
  let pages = [];
  let units = new Map();
  let projects = new Map();
  let decisions = new Map();
  let listPages;
  let getPage;
  let ulStore = null;
  let getTeachingStore = inject.getTeachingStore ?? null;
  let getTasksStore = inject.getTasksStore ?? null;
  let getDecision = inject.getDecision ?? null;
  const loadCanonicalLinks =
    inject.loadCanonicalRelatedToFromIndexes ?? loadCanonicalRelatedToFromIndexes;

  if (source === 'fixture') {
    if (!args.fixture) {
      console.error('Fixture source requires --fixture <path>.');
      return 2;
    }
    const fixture = await loadFixture(args.fixture);
    pages = Array.isArray(fixture.pages) ? fixture.pages : [];
    for (const unit of fixture.units ?? []) units.set(unit.id, unit);
    for (const project of fixture.projects ?? []) projects.set(project.id, project);
    for (const decision of fixture.decisions ?? []) decisions.set(decision.id, decision);
    listPages = async () => pages;
    getPage = async (id) => pages.find((page) => page.id === id) ?? null;
    // Fixture mode always keeps memory stores (or an injected isolated store).
    ulStore = inject.universalLinkStore ?? memoryStore();
    getTeachingStore = async () => ({
      async get(key, { type } = {}) {
        const id = key.replace(/^units\//, '');
        const record = units.get(id);
        if (!record) return null;
        return type === 'json' ? record : JSON.stringify(record);
      }
    });
    getTasksStore = async () => ({
      async get(key, { type } = {}) {
        const id = key.replace(/^projects\//, '');
        const record = projects.get(id);
        if (!record) return null;
        return type === 'json' ? record : JSON.stringify(record);
      }
    });
    getDecision = async (id) => decisions.get(id) ?? null;
  } else {
    // Live source reads through knowledge-data.mjs (injectable for tests).
    const listKnowledgePages = inject.listKnowledgePages ?? defaultListKnowledgePages;
    const getKnowledgePage = inject.getKnowledgePage ?? defaultGetKnowledgePage;
    const env = inject.env ?? process.env;
    const fetchImpl = inject.fetchImpl ?? fetch;
    listPages = async () => listKnowledgePages({ env, fetchImpl });
    getPage = async (id) => getKnowledgePage(id, { env, fetchImpl });
    pages = await listPages();

    // Live dry-run and execute both bind a real Universal Link store adapter.
    // Memory fallback is fixture-only — never used for live execute.
    if (Object.prototype.hasOwnProperty.call(inject, 'universalLinkStore')) {
      ulStore = inject.universalLinkStore;
    } else {
      const getUl = inject.getUniversalLinkStore ?? defaultGetUniversalLinkStore;
      try {
        ulStore = await getUl(env);
      } catch (error) {
        console.error(
          `Universal Link store unavailable for live migration: ${error instanceof Error ? error.message : String(error)}`
        );
        return 2;
      }
    }
    if (!ulStore) {
      console.error('Universal Link store unbound for live migration. Refusing to continue.');
      return 2;
    }
    if (args.execute && ulStore && typeof ulStore._map !== 'undefined' && !inject.universalLinkStore) {
      // Guard: default live execute must not silently use an in-process memory map.
      console.error('Live execute refused an in-memory Universal Link store.');
      return 2;
    }

    getTeachingStore = inject.getTeachingStore ?? defaultGetTeachingStore;
    getTasksStore = inject.getTasksStore ?? defaultGetTasksStore;
    getDecision = inject.getDecision ?? null;
  }

  const resolveEntity = async (refInput, accessContext, options = {}) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (ref?.namespace === 'knowledge' && ref.kind === 'page') {
      return resolveKnowledgePage(ref.id, accessContext, {
        getPage: async (id) => getPage(id)
      });
    }
    if (ref?.namespace === 'teaching' && ref.kind === 'unit') {
      return resolveTeachingUnit(ref.id, accessContext, {
        getStore: getTeachingStore
      });
    }
    if (ref?.namespace === 'tasks' && ref.kind === 'project') {
      return resolveTasksProject(ref.id, accessContext, {
        getStore: getTasksStore
      });
    }
    if (ref?.namespace === 'life' && ref.kind === 'decision') {
      return resolveLifeDecision(ref.id, accessContext, {
        getDecision:
          getDecision ||
          (async () => null)
      });
    }
    return defaultResolveEntity(refInput, accessContext, options);
  };

  const migration = createKnowledgeConnectedMigration({
    listPages,
    getPage,
    resolveEntity,
    getUniversalLinkStore: async () => ulStore,
    createLinkRepository: inject.createLinkRepository ?? createUniversalLinkRepository
  });

  const report = await migration.run({ dryRun });

  // Parity reads pre-existing (and newly written) canonical related_to via indexes.
  const indexedLinks = await loadCanonicalLinks(ulStore);
  const parityPages = source === 'live' ? await listPages() : pages;
  const parity = migration.buildParityReport({
    pages: parityPages,
    links: indexedLinks,
    previousMigrationReport: report
  });

  const output = {
    migration: report,
    parity,
    source,
    execute: args.execute,
    confirm_execute: args.confirmExecute,
    write_cutover_default: false,
    dual_write: false,
    store_mode: source === 'fixture' ? 'memory' : 'live_adapter',
    parity_source: 'related_to_type_index',
    note: dryRun
      ? `Dry run (${source}) — zero Universal Link writes.`
      : `Execute mode (${source}) — writes went through createUniversalLinkRepository only.`
  };
  console.log(JSON.stringify(output, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}

export { main, parseArgs, memoryStore };
