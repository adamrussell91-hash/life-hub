#!/usr/bin/env node
/**
 * Copy Notion-imported Professional data from life-hub-data JSON into Netlify
 * Blobs under the ids the site already uses. Dry-run by default; pass --apply
 * to write. Reports go outside the repo (tmpdir). Never prints tokens or
 * personal data to stdout.
 *
 *   node scripts/migrate-professional-imports.mjs
 *   node scripts/migrate-professional-imports.mjs --apply
 *   node scripts/migrate-professional-imports.mjs --rollback <write-log.json>
 *
 * See docs/proposals/single-store-migration-cursor-brief.md.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getStore } from '@netlify/blobs';

import { createIdentityRepository, SELF_POINTER_KEY } from '../netlify/functions/_shared/identity-repository.mjs';
import { findActiveSelfPerson } from '../netlify/functions/_shared/career-overview.mjs';
import { createEventRepository } from '../netlify/functions/_shared/event-repository.mjs';
import { createUniversalLinkRepository } from '../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../netlify/functions/_shared/entity-access.mjs';
import { resolveEntity as defaultResolveEntity } from '../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../netlify/functions/_shared/entity-ref.mjs';
import { projectNotionPdEvent } from '../netlify/functions/_shared/notion-pd-events.mjs';
import { isDeletedRecord } from '../netlify/functions/_shared/record-liveness.mjs';
import {
  getGithubPerson,
  listGithubPersonCandidates,
  listGithubImportedStudentPeople,
  listGithubOrganisationCandidates,
  listGithubRelationshipEntries,
  listGithubPdEvents,
  isImportedStudentPerson
} from '../netlify/functions/_shared/github-professional-data.mjs';
import {
  defaultGetProfessionalStore,
  getJSON as getProfessionalJSON,
  eventKey
} from '../netlify/functions/_shared/professional-blobs.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON as getIdentityJSON,
  personKey,
  organisationKey,
  linkKey
} from '../netlify/functions/_shared/universal-link-blobs.mjs';
import { parseEventRecord } from '../netlify/functions/_shared/event-schema.mjs';
import { parsePersonRecord, parseOrganisationRecord } from '../netlify/functions/_shared/identity-schema.mjs';

const STRONG = { consistency: 'strong' };
const ACCESS = createAccessContext({ workflow: 'life' });

function emptyKindStats() {
  return {
    in_import: 0,
    would_copy: 0,
    copied: 0,
    already_in_blobs: 0,
    deleted_in_blobs: 0,
    skipped_self: 0,
    skipped_student: 0,
    failed: 0,
    failed_ids: []
  };
}

function parseArgs(argv) {
  const args = {
    apply: false,
    rollback: null,
    report: null,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--rollback') args.rollback = argv[++i] ?? null;
    else if (a === '--report') args.report = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function openStoreFromEnv(name, env) {
  const token = env.NETLIFY_BLOBS_TOKEN;
  const siteID = env.NETLIFY_SITE_ID || env.SITE_ID;
  if (token && siteID) return getStore({ name, siteID, token });
  return null;
}

async function tryIdentityStore(env) {
  try {
    return await defaultGetUniversalLinkStore(env);
  } catch {
    return openStoreFromEnv('universal-link-content', env);
  }
}

async function tryProfessionalStore(env) {
  try {
    return await defaultGetProfessionalStore(env);
  } catch {
    return openStoreFromEnv('professional-hub-content', env);
  }
}

function pairKey(sourceRef, targetRef, relationshipType) {
  const a = sourceRef < targetRef ? sourceRef : targetRef;
  const b = sourceRef < targetRef ? targetRef : sourceRef;
  return `${a}|${b}|${relationshipType}`;
}

function recordWrite(writeLog, entry) {
  writeLog.writes.push(entry);
}

async function deleteKey(store, key) {
  if (typeof store.delete === 'function') {
    await store.delete(key);
    return;
  }
  // Memory-store tests: drop the key.
  if (store._map instanceof Map) store._map.delete(key);
}

function reportPath(explicit) {
  if (explicit) return explicit;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(tmpdir(), `migrate-professional-imports-${stamp}.json`);
}

function writeReport(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2));
}

function publicSummary(report) {
  const kinds = {};
  for (const [name, stats] of Object.entries(report.kinds ?? {})) {
    kinds[name] = {
      in_import: stats.in_import,
      would_copy: stats.would_copy,
      copied: stats.copied,
      already_in_blobs: stats.already_in_blobs,
      deleted_in_blobs: stats.deleted_in_blobs,
      skipped_self: stats.skipped_self,
      skipped_student: stats.skipped_student,
      failed: stats.failed,
      failed_ids: stats.failed_ids
    };
  }
  return {
    apply: report.apply,
    report_path: report.report_path,
    write_log_path: report.write_log_path ?? null,
    self: report.self,
    kinds,
    exit_code: report.exit_code
  };
}

async function confirmSelfPerson(identityStore) {
  const self = await findActiveSelfPerson(identityStore, { env: {} });
  if (!self?.id) {
    return { found_in_blobs: false, person_id: null, pointer_matches: false };
  }
  const inBlobs = parsePersonRecord(await getIdentityJSON(identityStore, personKey(self.id), STRONG));
  const pointer = await getIdentityJSON(identityStore, SELF_POINTER_KEY, STRONG);
  return {
    found_in_blobs: Boolean(inBlobs),
    person_id: inBlobs ? self.id : null,
    pointer_matches: Boolean(inBlobs && pointer?.person_id === self.id)
  };
}

async function identityExists(identityStore, kind, id) {
  const key = kind === 'person' ? personKey(id) : organisationKey(id);
  const raw = await getIdentityJSON(identityStore, key, STRONG);
  if (!raw) return { exists: false, deleted: false, record: null, key };
  const record = kind === 'person' ? parsePersonRecord(raw) : parseOrganisationRecord(raw);
  if (!record) return { exists: Boolean(raw), deleted: false, record: null, key };
  return { exists: true, deleted: isDeletedRecord(record), record, key };
}

async function eventExists(professionalStore, id) {
  const key = eventKey(id);
  const raw = await getProfessionalJSON(professionalStore, key, STRONG);
  if (!raw) return { exists: false, deleted: false, record: null, key };
  const record = parseEventRecord(raw);
  if (!record) return { exists: Boolean(raw), deleted: false, record: null, key };
  return { exists: true, deleted: isDeletedRecord(record), record, key };
}

async function findNativeLink(linkRepo, sourceRef, targetRef, relationshipType) {
  const listed = await linkRepo.listForEntity(sourceRef, ACCESS);
  const rows = [...(listed.outgoing ?? []), ...(listed.incoming ?? [])];
  for (const row of rows) {
    const link = row.link ?? row;
    if (!link) continue;
    if (link.relationship_type !== relationshipType) continue;
    const matchForward = link.source_ref === sourceRef && link.target_ref === targetRef;
    const matchReverse = link.source_ref === targetRef && link.target_ref === sourceRef;
    if (matchForward || matchReverse) return link;
  }
  return null;
}

/**
 * Core migration. deps lets tests inject memory stores and GitHub loaders.
 * Returns a report object (counts/ids only — no personal content).
 */
export async function runMigrateProfessionalImports(options = {}) {
  const apply = options.apply === true;
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const github = { env, fetchImpl };
  const now = options.now ?? (() => new Date().toISOString());

  const identityStore = options.identityStore ?? (await tryIdentityStore(env));
  const professionalStore = options.professionalStore ?? (await tryProfessionalStore(env));
  if (!identityStore || !professionalStore) {
    throw new Error('Identity and professional Blob stores are required (NETLIFY_BLOBS_TOKEN / site id).');
  }

  const getIdentityStore = async () => identityStore;
  const getProfessionalStore = async () => professionalStore;
  const resolveEntity =
    options.resolveEntity ??
    ((ref, accessContext) =>
      defaultResolveEntity(ref, accessContext, {
        getStore: getIdentityStore,
        getProfessionalStore,
        env,
        fetchImpl
      }));

  const identityRepo =
    options.identityRepo ??
    createIdentityRepository({ store: identityStore, now });
  const eventRepo =
    options.eventRepo ??
    createEventRepository({
      store: professionalStore,
      env,
      now,
      resolveEntity,
      getUniversalLinkStore: getIdentityStore,
      listImportedEvents: options.listImportedEvents,
      loadImportedEvent: options.loadImportedEvent
    });
  const linkRepo =
    options.linkRepo ??
    createUniversalLinkRepository({
      store: identityStore,
      resolveEntity,
      now
    });

  const listPeople = options.listGithubPersonCandidates ?? listGithubPersonCandidates;
  const listStudents = options.listGithubImportedStudentPeople ?? listGithubImportedStudentPeople;
  const getPerson = options.getGithubPerson ?? getGithubPerson;
  const listOrgs = options.listGithubOrganisationCandidates ?? listGithubOrganisationCandidates;
  const listRels = options.listGithubRelationshipEntries ?? listGithubRelationshipEntries;
  const listEvents = options.listGithubPdEvents ?? listGithubPdEvents;

  const kinds = {
    people: emptyKindStats(),
    organisations: emptyKindStats(),
    relationships: emptyKindStats(),
    events: emptyKindStats()
  };
  const writeLog = { created_at: now(), apply, writes: [] };
  const seenRelationshipPairs = new Set();
  const personIdsForRels = new Set();

  const self = await confirmSelfPerson(identityStore);

  // --- People ---
  const adultPeople = await listPeople(github);
  const studentPeople = await listStudents(github);
  const peopleById = new Map();
  for (const row of [...adultPeople, ...studentPeople]) {
    if (row?.id) peopleById.set(row.id, row);
  }
  kinds.people.in_import = peopleById.size;

  for (const person of peopleById.values()) {
    if (person.is_self === true) {
      kinds.people.skipped_self += 1;
      continue;
    }
    try {
      const prior = await identityExists(identityStore, 'person', person.id);
      if (prior.exists) {
        kinds.people.already_in_blobs += 1;
        personIdsForRels.add(person.id);
        continue;
      }
      if (!apply) {
        kinds.people.would_copy += 1;
        personIdsForRels.add(person.id);
        continue;
      }
      // R4: re-check immediately before write.
      const again = await identityExists(identityStore, 'person', person.id);
      if (again.exists) {
        kinds.people.already_in_blobs += 1;
        personIdsForRels.add(person.id);
        continue;
      }
      const full = (await getPerson(person.id, github)) ?? person;
      const result = await identityRepo.adoptImportedIdentity({ kind: 'person', record: full });
      personIdsForRels.add(result.record.id);
      if (result.adopted) {
        kinds.people.copied += 1;
        recordWrite(writeLog, {
          store: 'identity',
          key: personKey(result.record.id),
          updated_at: result.record.updated_at,
          id: result.record.id,
          kind: 'person'
        });
      } else {
        kinds.people.already_in_blobs += 1;
      }
    } catch (error) {
      kinds.people.failed += 1;
      kinds.people.failed_ids.push({ id: person.id, code: error?.code ?? 'error' });
    }
  }

  // --- Organisations ---
  const organisations = await listOrgs(github);
  kinds.organisations.in_import = organisations.length;
  for (const org of organisations) {
    try {
      const prior = await identityExists(identityStore, 'organisation', org.id);
      if (prior.exists) {
        kinds.organisations.already_in_blobs += 1;
        continue;
      }
      if (!apply) {
        kinds.organisations.would_copy += 1;
        continue;
      }
      const again = await identityExists(identityStore, 'organisation', org.id);
      if (again.exists) {
        kinds.organisations.already_in_blobs += 1;
        continue;
      }
      const result = await identityRepo.adoptImportedIdentity({ kind: 'organisation', record: org });
      if (result.adopted) {
        kinds.organisations.copied += 1;
        recordWrite(writeLog, {
          store: 'identity',
          key: organisationKey(result.record.id),
          updated_at: result.record.updated_at,
          id: result.record.id,
          kind: 'organisation'
        });
      } else {
        kinds.organisations.already_in_blobs += 1;
      }
    } catch (error) {
      kinds.organisations.failed += 1;
      kinds.organisations.failed_ids.push({ id: org.id, code: error?.code ?? 'error' });
    }
  }

  // --- Relationships ---
  // Also include people already in Blobs that were not in the import loop above.
  for (const id of personIdsForRels) {
    const personRecord =
      peopleById.get(id) ??
      parsePersonRecord(await getIdentityJSON(identityStore, personKey(id), STRONG));
    const sourceIsStudent = isImportedStudentPerson(personRecord);

    let entries = [];
    try {
      entries = await listRels('person', id, github);
    } catch (error) {
      kinds.relationships.failed += 1;
      kinds.relationships.failed_ids.push({ id, code: error?.code ?? 'list_relationships_failed' });
      continue;
    }

    for (const entry of entries) {
      const link = entry.link;
      if (!link) continue;

      const sourceRef = link.source_ref;
      const targetRef = link.target_ref;
      const relationshipType = link.relationship_type;
      const dedupe = pairKey(sourceRef, targetRef, relationshipType);
      if (seenRelationshipPairs.has(dedupe)) continue;
      seenRelationshipPairs.add(dedupe);
      kinds.relationships.in_import += 1;

      const other = parseEntityRef(entry.otherRef ?? (entry.direction === 'outgoing' ? targetRef : sourceRef));
      const otherRecord =
        other?.kind === 'person'
          ? peopleById.get(other.id) ??
            parsePersonRecord(await getIdentityJSON(identityStore, personKey(other.id), STRONG))
          : null;
      if (sourceIsStudent || isImportedStudentPerson(otherRecord)) {
        kinds.relationships.skipped_student += 1;
        continue;
      }

      try {
        const existing = await findNativeLink(linkRepo, sourceRef, targetRef, relationshipType);
        if (existing) {
          kinds.relationships.already_in_blobs += 1;
          continue;
        }
        if (!apply) {
          kinds.relationships.would_copy += 1;
          continue;
        }
        const again = await findNativeLink(linkRepo, sourceRef, targetRef, relationshipType);
        if (again) {
          kinds.relationships.already_in_blobs += 1;
          continue;
        }
        const { link: created, created: didCreate } = await linkRepo.createLink(
          {
            source_ref: sourceRef,
            target_ref: targetRef,
            relationship_type: relationshipType,
            role: link.role ?? null,
            valid_from: link.valid_from ?? null
          },
          ACCESS
        );
        let finalLink = created;
        if (link.valid_to && created.status === 'current') {
          finalLink = await linkRepo.endLink(created.id, link.valid_to, ACCESS);
        }
        if (didCreate || link.valid_to) {
          kinds.relationships.copied += 1;
          recordWrite(writeLog, {
            store: 'identity',
            key: linkKey(finalLink.id),
            updated_at: finalLink.updated_at,
            id: finalLink.id,
            kind: 'relationship'
          });
        } else {
          kinds.relationships.already_in_blobs += 1;
        }
      } catch (error) {
        kinds.relationships.failed += 1;
        kinds.relationships.failed_ids.push({
          id: dedupe,
          code: error?.code ?? 'error'
        });
      }
    }
  }

  // --- PD events ---
  const pdRows = await listEvents(github);
  kinds.events.in_import = pdRows.length;
  for (const row of pdRows) {
    const projected = projectNotionPdEvent(row);
    if (!projected) {
      kinds.events.failed += 1;
      kinds.events.failed_ids.push({ id: row?.notion_id ?? 'unknown', code: 'invalid_pd_row' });
      continue;
    }
    try {
      const prior = await eventExists(professionalStore, projected.id);
      if (prior.deleted) {
        kinds.events.deleted_in_blobs += 1;
        continue;
      }
      if (prior.exists) {
        kinds.events.already_in_blobs += 1;
        continue;
      }
      if (!apply) {
        kinds.events.would_copy += 1;
        continue;
      }
      const again = await eventExists(professionalStore, projected.id);
      if (again.deleted) {
        kinds.events.deleted_in_blobs += 1;
        continue;
      }
      if (again.exists) {
        kinds.events.already_in_blobs += 1;
        continue;
      }
      try {
        const record = await eventRepo.loadEditableEvent(projected.id, projected);
        kinds.events.copied += 1;
        recordWrite(writeLog, {
          store: 'professional',
          key: eventKey(record.id),
          updated_at: record.updated_at,
          id: record.id,
          kind: 'event'
        });
      } catch (error) {
        if (error?.status === 404) {
          kinds.events.deleted_in_blobs += 1;
        } else {
          throw error;
        }
      }
    } catch (error) {
      kinds.events.failed += 1;
      kinds.events.failed_ids.push({
        id: projected.id,
        code: error?.code ?? (error instanceof Error ? error.message : 'error')
      });
    }
  }

  const failedTotal = Object.values(kinds).reduce((n, s) => n + s.failed, 0);
  const report = {
    apply,
    self,
    kinds,
    write_log: writeLog,
    exit_code: failedTotal > 0 ? 1 : 0
  };
  return report;
}

export async function rollbackMigrateProfessionalImports(logPath, options = {}) {
  const env = options.env ?? process.env;
  const identityStore = options.identityStore ?? (await tryIdentityStore(env));
  const professionalStore = options.professionalStore ?? (await tryProfessionalStore(env));
  if (!identityStore || !professionalStore) {
    throw new Error('Identity and professional Blob stores are required for rollback.');
  }
  const log = JSON.parse(readFileSync(logPath, 'utf8'));
  const writes = Array.isArray(log.writes) ? log.writes : Array.isArray(log.write_log?.writes) ? log.write_log.writes : [];
  const result = { deleted: 0, skipped_edited: 0, missing: 0, ids: [] };
  for (const entry of writes) {
    const store = entry.store === 'professional' ? professionalStore : identityStore;
    const getJSON = entry.store === 'professional' ? getProfessionalJSON : getIdentityJSON;
    const current = await getJSON(store, entry.key, STRONG);
    if (!current) {
      result.missing += 1;
      continue;
    }
    if (entry.updated_at && current.updated_at && current.updated_at !== entry.updated_at) {
      result.skipped_edited += 1;
      result.ids.push({ id: entry.id, code: 'edited_since_write' });
      continue;
    }
    await deleteKey(store, entry.key);
    result.deleted += 1;
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      'Usage: node scripts/migrate-professional-imports.mjs [--apply] [--rollback <log>] [--report <path>]'
    );
    return 0;
  }

  if (args.rollback) {
    const result = await rollbackMigrateProfessionalImports(args.rollback);
    const path = reportPath(args.report);
    writeReport(path, { rollback: true, ...result });
    console.log(JSON.stringify({ rollback: true, report_path: path, deleted: result.deleted, skipped_edited: result.skipped_edited, missing: result.missing }, null, 2));
    return 0;
  }

  const report = await runMigrateProfessionalImports({ apply: args.apply });
  const path = reportPath(args.report);
  const writeLogPath = args.apply
    ? path.replace(/\.json$/, '') + '-write-log.json'
    : null;
  report.report_path = path;
  report.write_log_path = writeLogPath;
  writeReport(path, {
    apply: report.apply,
    self: report.self,
    kinds: report.kinds,
    exit_code: report.exit_code
  });
  if (writeLogPath) {
    writeReport(writeLogPath, report.write_log);
  }
  console.log(JSON.stringify(publicSummary(report), null, 2));
  return report.exit_code;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().then(
    (code) => process.exit(code ?? 0),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}

export { parseArgs, main, publicSummary };
