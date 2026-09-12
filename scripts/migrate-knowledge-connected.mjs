#!/usr/bin/env node
/**
 * Knowledge connected → Universal Links migration CLI.
 *
 * Dry-run is the default. Writes require --execute. Live Knowledge reads
 * require an explicit --source=live. Production execution requires BOTH
 * --source=live and --confirm-execute. Fixture mode is for local verification.
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
import { createAccessContext } from '../netlify/functions/_shared/entity-access.mjs';
import { createKnowledgeConnectedMigration } from '../netlify/functions/_shared/knowledge-connected-migration.mjs';
import { resolveEntity as defaultResolveEntity } from '../netlify/functions/_shared/entity-resolvers.mjs';
import { resolveKnowledgePage, resolveLifeDecision, resolveTasksProject, resolveTeachingUnit } from '../netlify/functions/_shared/knowledge-universal-links.mjs';
import { parseEntityRef } from '../netlify/functions/_shared/entity-ref.mjs';
import { createUniversalLinkRepository } from '../netlify/functions/_shared/universal-link-repository.mjs';
import {
  getKnowledgePage as defaultGetKnowledgePage,
  listKnowledgePages as defaultListKnowledgePages
} from '../netlify/functions/_shared/knowledge-data.mjs';

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
  let ulStore = inject.universalLinkStore ?? memoryStore();
  let listPages;
  let getPage;

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
  } else {
    // Live source reads through knowledge-data.mjs (injectable for tests).
    const listKnowledgePages = inject.listKnowledgePages ?? defaultListKnowledgePages;
    const getKnowledgePage = inject.getKnowledgePage ?? defaultGetKnowledgePage;
    const env = inject.env ?? process.env;
    const fetchImpl = inject.fetchImpl ?? fetch;
    listPages = async () => listKnowledgePages({ env, fetchImpl });
    getPage = async (id) => getKnowledgePage(id, { env, fetchImpl });
    pages = await listPages();
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
        getStore: async () => ({
          async get(key, { type } = {}) {
            const id = key.replace(/^units\//, '');
            const record = units.get(id);
            if (!record) return null;
            return type === 'json' ? record : JSON.stringify(record);
          }
        })
      });
    }
    if (ref?.namespace === 'tasks' && ref.kind === 'project') {
      return resolveTasksProject(ref.id, accessContext, {
        getStore: async () => ({
          async get(key, { type } = {}) {
            const id = key.replace(/^projects\//, '');
            const record = projects.get(id);
            if (!record) return null;
            return type === 'json' ? record : JSON.stringify(record);
          }
        })
      });
    }
    if (ref?.namespace === 'life' && ref.kind === 'decision') {
      return resolveLifeDecision(ref.id, accessContext, {
        getDecision: async (id) => decisions.get(id) ?? null
      });
    }
    return defaultResolveEntity(refInput, accessContext, options);
  };

  const migration = createKnowledgeConnectedMigration({
    listPages,
    getPage,
    resolveEntity,
    getUniversalLinkStore: async () => ulStore,
    createLinkRepository: createUniversalLinkRepository
  });

  const report = await migration.run({ dryRun });
  const writtenLinks = [];
  if (!dryRun) {
    // Collect written links for parity from the in-memory store.
    for (const [key, value] of ulStore._map.entries()) {
      if (key.startsWith('universal-links/links/')) {
        writtenLinks.push(typeof value === 'string' ? JSON.parse(value) : value);
      }
    }
  }
  const parityPages = source === 'live' ? await listPages() : pages;
  const parity = migration.buildParityReport({
    pages: parityPages,
    links: writtenLinks,
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

export { main, parseArgs };
