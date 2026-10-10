#!/usr/bin/env node
/**
 * Copy Notion-imported Professional data from life-hub-data JSON into Netlify
 * Blobs under the ids the site already uses. Dry-run by default; pass --apply
 * to write. Reports go outside the repo (tmpdir). Never prints tokens or
 * personal data to stdout.
 *
 *   node scripts/migrate-professional-imports.mjs
 *   node scripts/migrate-professional-imports.mjs --apply
 *   node scripts/migrate-professional-imports.mjs --only=communications
 *   node scripts/migrate-professional-imports.mjs --only=communications --apply
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
import { createCommunicationRepository } from '../netlify/functions/_shared/communication-repository.mjs';
import { createMeetingRepository } from '../netlify/functions/_shared/meeting-repository.mjs';
import { createUniversalLinkRepository } from '../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../netlify/functions/_shared/entity-access.mjs';
import { resolveEntity as defaultResolveEntity } from '../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../netlify/functions/_shared/entity-ref.mjs';
import { projectNotionPdEvent } from '../netlify/functions/_shared/notion-pd-events.mjs';
import {
  isNotionMeetingMethod,
  notionCommunicationId,
  notionMeetingId,
  projectNotionCommunicationListRecord,
  projectNotionMeetingListRecord
} from '../netlify/functions/_shared/schedule-projection.mjs';
import { isDeletedRecord } from '../netlify/functions/_shared/record-liveness.mjs';
import {
  getGithubPerson,
  listGithubPersonCandidates,
  listGithubImportedStudentPeople,
  listGithubOrganisationCandidates,
  listGithubRelationshipEntries,
  listGithubPdEvents,
  listGithubCommunications,
  isImportedStudentPerson
} from '../netlify/functions/_shared/github-professional-data.mjs';
import {
  defaultGetProfessionalStore,
  getJSON as getProfessionalJSON,
  eventKey,
  communicationKey,
  meetingKey
} from '../netlify/functions/_shared/professional-blobs.mjs';
import {
  defaultGetUniversalLinkStore,
  getJSON as getIdentityJSON,
  personKey,
  organisationKey,
  linkKey
} from '../netlify/functions/_shared/universal-link-blobs.mjs';
import { parseEventRecord } from '../netlify/functions/_shared/event-schema.mjs';
import {
  isValidCommunicationId,
  parseCommunicationRecord
} from '../netlify/functions/_shared/communication-schema.mjs';
import { isValidMeetingId, parseMeetingRecord } from '../netlify/functions/_shared/meeting-schema.mjs';
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
    only: null,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--rollback') args.rollback = argv[++i] ?? null;
    else if (a === '--report') args.report = argv[++i] ?? null;
    else if (a === '--only') args.only = argv[++i] ?? null;
    else if (a.startsWith('--only=')) args.only = a.slice('--only='.length);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function notionIdFromProjected(projected) {
  if (typeof projected?.id === 'string' && projected.id.startsWith('notion_')) {
    return projected.id.slice('notion_'.length);
  }
  return null;
}

/**
 * Strip list-projection `source`, assign the deterministic hub id, and validate.
 * Shared by communications and meetings (Phase 2).
 */
function prepareImportedScheduleRecord({
  projected,
  notKindReason,
  toHubId,
  isValidId,
  invalidIdReason,
  parseRecord
}) {
  if (!projected) return { record: null, reason: notKindReason };
  const notionId = notionIdFromProjected(projected);
  if (!notionId) return { record: null, reason: 'invalid_notion_id' };
  const { source: _source, ...rest } = projected;
  const record = { ...rest, id: toHubId(notionId) };
  if (!isValidId(record.id)) return { record: null, reason: invalidIdReason };
  if (!parseRecord(record)) return { record: null, reason: 'schema_rejected', id: record.id };
  return { record, reason: null };
}

function communicationImportRecord(row) {
  return prepareImportedScheduleRecord({
    projected: projectNotionCommunicationListRecord(row),
    notKindReason: 'not_a_communication',
    toHubId: notionCommunicationId,
    isValidId: isValidCommunicationId,
    invalidIdReason: 'invalid_communication_id',
    parseRecord: parseCommunicationRecord
  });
}

function meetingImportRecord(row, nowMs) {
  return prepareImportedScheduleRecord({
    projected: projectNotionMeetingListRecord(row, { now: () => nowMs }),
    notKindReason: 'not_a_meeting',
    toHubId: notionMeetingId,
    isValidId: isValidMeetingId,
    invalidIdReason: 'invalid_meeting_id',
    parseRecord: parseMeetingRecord
  });
}

function errorCode(error, fallback = 'error') {
  return error?.code ?? (error instanceof Error ? error.message : fallback);
}

/** Which kind keys belong in the public CLI summary for the current --only mode. */
function kindVisibleInSummary(only, name) {
  if (only === 'communications') return name === 'communications' || name === 'meetings';
  if (only == null) return name !== 'communications' && name !== 'meetings';
  return true;
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
    if (!kindVisibleInSummary(report.only, name)) continue;
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
    only: report.only ?? null,
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
  const parseRecord = kind === 'person' ? parsePersonRecord : parseOrganisationRecord;
  const raw = await getIdentityJSON(identityStore, key, STRONG);
  if (!raw) return { exists: false, deleted: false, record: null, key };
  const record = parseRecord(raw);
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
 * R3 then R4: skip if anything is already at the identity key; on apply,
 * strong-recheck immediately before adopt. Never overwrites.
 */
async function adoptIdentityIfAbsent({
  apply,
  stats,
  writeLog,
  identityStore,
  identityRepo,
  kind,
  row,
  loadFull = null,
  onPresent = null
}) {
  try {
    const prior = await identityExists(identityStore, kind, row.id);
    if (prior.exists) {
      stats.already_in_blobs += 1;
      onPresent?.(row.id);
      return;
    }
    if (!apply) {
      stats.would_copy += 1;
      onPresent?.(row.id);
      return;
    }
    // R4: re-check immediately before write.
    const again = await identityExists(identityStore, kind, row.id);
    if (again.exists) {
      stats.already_in_blobs += 1;
      onPresent?.(row.id);
      return;
    }
    const full = loadFull ? ((await loadFull(row)) ?? row) : row;
    const result = await identityRepo.adoptImportedIdentity({ kind, record: full });
    onPresent?.(result.record.id);
    if (result.adopted) {
      stats.copied += 1;
      recordWrite(writeLog, {
        store: 'identity',
        key: kind === 'person' ? personKey(result.record.id) : organisationKey(result.record.id),
        updated_at: result.record.updated_at,
        id: result.record.id,
        kind
      });
    } else {
      stats.already_in_blobs += 1;
    }
  } catch (error) {
    stats.failed += 1;
    stats.failed_ids.push({ id: row.id, code: error?.code ?? 'error' });
  }
}

/**
 * R3 then R4 for a prepared communication/meeting record. Any existing key
 * (any state) counts as already_in_blobs — never overwrite.
 */
async function copyProfessionalImportIfAbsent({
  apply,
  stats,
  writeLog,
  professionalStore,
  blobKey,
  recordId,
  kind,
  importOnce
}) {
  try {
    const prior = await getProfessionalJSON(professionalStore, blobKey, STRONG);
    if (prior) {
      stats.already_in_blobs += 1;
      return;
    }
    if (!apply) {
      stats.would_copy += 1;
      return;
    }
    // R4: re-check immediately before write.
    const again = await getProfessionalJSON(professionalStore, blobKey, STRONG);
    if (again) {
      stats.already_in_blobs += 1;
      return;
    }
    const result = await importOnce();
    if (result.created) {
      stats.copied += 1;
      const entity = result[kind];
      recordWrite(writeLog, {
        store: 'professional',
        key: blobKey,
        updated_at: entity.updated_at,
        id: entity.id,
        kind
      });
    } else {
      stats.already_in_blobs += 1;
    }
  } catch (error) {
    stats.failed += 1;
    stats.failed_ids.push({ id: recordId, code: errorCode(error) });
  }
}

/**
 * Core migration. deps lets tests inject memory stores and GitHub loaders.
 * Returns a report object (counts/ids only — no personal content).
 */
export async function runMigrateProfessionalImports(options = {}) {
  const apply = options.apply === true;
  const only = options.only ?? null;
  if (only != null && only !== 'communications') {
    throw new Error(`Unsupported --only value: ${only}. Use communications or omit.`);
  }
  const runPhase1 = only == null;
  const runCommunications = only === 'communications';
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const github = { env, fetchImpl };
  const now = options.now ?? (() => new Date().toISOString());
  const nowMs = () => Date.parse(now()) || Date.now();

  const identityStore = options.identityStore ?? (await tryIdentityStore(env));
  const professionalStore = options.professionalStore ?? (await tryProfessionalStore(env));
  if (!identityStore || !professionalStore) {
    throw new Error('Identity and professional Blob stores are required (NETLIFY_BLOBS_TOKEN / site id).');
  }

  const getIdentityStore = async () => identityStore;
  const getProfessionalStoreBound = async () => professionalStore;
  const resolveEntity =
    options.resolveEntity ??
    ((ref, accessContext) =>
      defaultResolveEntity(ref, accessContext, {
        getStore: getIdentityStore,
        getProfessionalStore: getProfessionalStoreBound,
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
  const communicationRepo =
    options.communicationRepo ??
    createCommunicationRepository({
      store: professionalStore,
      env,
      now,
      resolveEntity,
      getUniversalLinkStore: getIdentityStore
    });
  const meetingRepo =
    options.meetingRepo ??
    createMeetingRepository({
      store: professionalStore,
      env,
      now,
      resolveEntity,
      getUniversalLinkStore: getIdentityStore
    });

  const listPeople = options.listGithubPersonCandidates ?? listGithubPersonCandidates;
  const listStudents = options.listGithubImportedStudentPeople ?? listGithubImportedStudentPeople;
  const getPerson = options.getGithubPerson ?? getGithubPerson;
  const listOrgs = options.listGithubOrganisationCandidates ?? listGithubOrganisationCandidates;
  const listRels = options.listGithubRelationshipEntries ?? listGithubRelationshipEntries;
  const listEvents = options.listGithubPdEvents ?? listGithubPdEvents;
  const listComms = options.listGithubCommunications ?? listGithubCommunications;

  const kinds = {
    people: emptyKindStats(),
    organisations: emptyKindStats(),
    relationships: emptyKindStats(),
    events: emptyKindStats(),
    communications: emptyKindStats(),
    meetings: emptyKindStats()
  };
  const writeLog = { created_at: now(), apply, only, writes: [] };
  const seenRelationshipPairs = new Set();
  const personIdsForRels = new Set();

  const self = runPhase1
    ? await confirmSelfPerson(identityStore)
    : { found_in_blobs: null, person_id: null, pointer_matches: null };

  if (runPhase1) {
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
      await adoptIdentityIfAbsent({
        apply,
        stats: kinds.people,
        writeLog,
        identityStore,
        identityRepo,
        kind: 'person',
        row: person,
        loadFull: (row) => getPerson(row.id, github),
        onPresent: (id) => personIdsForRels.add(id)
      });
    }

    // --- Organisations ---
    const organisations = await listOrgs(github);
    kinds.organisations.in_import = organisations.length;
    for (const org of organisations) {
      await adoptIdentityIfAbsent({
        apply,
        stats: kinds.organisations,
        writeLog,
        identityStore,
        identityRepo,
        kind: 'organisation',
        row: org
      });
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
        kinds.events.failed_ids.push({ id: projected.id, code: errorCode(error) });
      }
    }
  } // end runPhase1

  // --- Communications + Notion meetings (Phase 2) ---
  if (runCommunications) {
    const rows = await listComms(github);
    for (const row of rows) {
      const asMeeting = isNotionMeetingMethod(row?.method);
      const prepared = asMeeting
        ? meetingImportRecord(row, nowMs())
        : communicationImportRecord(row);
      const kind = asMeeting ? 'meetings' : 'communications';
      const skipReason = asMeeting ? 'not_a_meeting' : 'not_a_communication';
      const defaultFailCode = asMeeting ? 'invalid_meeting' : 'invalid_communication';

      if (!prepared.record) {
        if (prepared.reason === skipReason) continue;
        kinds[kind].failed += 1;
        kinds[kind].failed_ids.push({
          id: prepared.id ?? row?.notion_id ?? 'unknown',
          code: prepared.reason ?? defaultFailCode
        });
        continue;
      }

      kinds[kind].in_import += 1;
      const entityKind = asMeeting ? 'meeting' : 'communication';
      const blobKey = asMeeting
        ? meetingKey(prepared.record.id)
        : communicationKey(prepared.record.id);
      await copyProfessionalImportIfAbsent({
        apply,
        stats: kinds[kind],
        writeLog,
        professionalStore,
        blobKey,
        recordId: prepared.record.id,
        kind: entityKind,
        importOnce: () =>
          asMeeting
            ? meetingRepo.importMeetingWithId(prepared.record)
            : communicationRepo.importCommunicationWithId(prepared.record)
      });
    }
  }

  const failedTotal = Object.values(kinds).reduce((n, s) => n + s.failed, 0);
  const report = {
    apply,
    only,
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
      'Usage: node scripts/migrate-professional-imports.mjs [--apply] [--only=communications] [--rollback <log>] [--report <path>]'
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

  const report = await runMigrateProfessionalImports({ apply: args.apply, only: args.only });
  const path = reportPath(args.report);
  const writeLogPath = args.apply
    ? path.replace(/\.json$/, '') + '-write-log.json'
    : null;
  report.report_path = path;
  report.write_log_path = writeLogPath;
  writeReport(path, {
    apply: report.apply,
    only: report.only,
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
