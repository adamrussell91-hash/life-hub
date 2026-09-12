#!/usr/bin/env node
/**
 * Knowledge connected → Universal Links migration CLI.
 *
 * Dry-run is the default. Pass --execute to write through the canonical
 * Universal Link repository. Never touches production Knowledge data unless
 * Knowledge env credentials are provided by the operator — this script is
 * intended for local fixtures and mocked stores in Slice 7 verification.
 *
 * Usage:
 *   node scripts/migrate-knowledge-connected.mjs
 *   node scripts/migrate-knowledge-connected.mjs --execute
 *   node scripts/migrate-knowledge-connected.mjs --fixture tests/fixtures/knowledge-connected-migration.json
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

function parseArgs(argv) {
  const fixtureIndex = argv.indexOf('--fixture');
  return {
    execute: argv.includes('--execute'),
    fixture: fixtureIndex >= 0 ? argv[fixtureIndex + 1] : null,
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

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage: node scripts/migrate-knowledge-connected.mjs [--fixture path] [--execute]
Dry-run is the default. --execute writes Universal Links through the canonical repository.`);
    return 0;
  }

  const dryRun = !args.execute;
  let pages = [];
  let units = new Map();
  let projects = new Map();
  let decisions = new Map();
  let ulStore = memoryStore();

  if (args.fixture) {
    const fixture = await loadFixture(args.fixture);
    pages = Array.isArray(fixture.pages) ? fixture.pages : [];
    for (const unit of fixture.units ?? []) units.set(unit.id, unit);
    for (const project of fixture.projects ?? []) projects.set(project.id, project);
    for (const decision of fixture.decisions ?? []) decisions.set(decision.id, decision);
  } else {
    console.error(
      'No --fixture supplied. Refusing to read live Knowledge data from this CLI in Slice 7. Pass a local fixture JSON.'
    );
    return 2;
  }

  const resolveEntity = async (refInput, accessContext, options = {}) => {
    const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
    if (ref?.namespace === 'knowledge' && ref.kind === 'page') {
      return resolveKnowledgePage(ref.id, accessContext, {
        getPage: async (id) => pages.find((page) => page.id === id) ?? null
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
    listPages: async () => pages,
    getPage: async (id) => pages.find((page) => page.id === id) ?? null,
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
  const parity = migration.buildParityReport({
    pages,
    links: writtenLinks,
    previousMigrationReport: report
  });

  const output = {
    migration: report,
    parity,
    write_cutover_default: false,
    dual_write: false,
    note: dryRun
      ? 'Dry run — zero Universal Link writes.'
      : 'Execute mode — writes went through createUniversalLinkRepository only.'
  };
  console.log(JSON.stringify(output, null, 2));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}

export { main, parseArgs };
