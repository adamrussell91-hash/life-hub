#!/usr/bin/env node
/**
 * Kick-off / preview CLI for Network Ecology tie inference.
 *
 * Previews by default (stages 1–2). Pass --apply to write proposals (stage 3).
 *
 *   node scripts/infer-ties.mjs --data-dir <life-hub-data/data/professional>
 *   node scripts/infer-ties.mjs --apply --limit 40
 *   node scripts/infer-ties.mjs --sources profiles,organisations --limit 10
 *
 * Never prints tokens. Report path is outside the repo by default (tmpdir).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createCommunicationRepository } from '../netlify/functions/_shared/communication-repository.mjs';
import { createMeetingRepository } from '../netlify/functions/_shared/meeting-repository.mjs';
import { createEventRepository } from '../netlify/functions/_shared/event-repository.mjs';
import { createThreadRepository } from '../netlify/functions/_shared/thread-repository.mjs';
import { createLedgerItemRepository } from '../netlify/functions/_shared/ledger-repository.mjs';
import { createApplicationRepository } from '../netlify/functions/_shared/application-repository.mjs';
import { createLinkProposalRepository } from '../netlify/functions/_shared/link-proposal-repository.mjs';
import { createUniversalLinkRepository } from '../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../netlify/functions/_shared/entity-access.mjs';
import { findActiveSelfPerson } from '../netlify/functions/_shared/career-overview.mjs';
import { formatEntityRef } from '../netlify/functions/_shared/entity-ref.mjs';
import { loadAllPeopleWithRelationships } from '../netlify/functions/_shared/people-collection.mjs';
import {
  defaultGetTasksStore,
  listJSON as listTasksJSON,
  PROJECT_PREFIX,
  TASK_PREFIX
} from '../netlify/functions/_shared/tasks-blobs.mjs';
import { defaultGetProfessionalStore } from '../netlify/functions/_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from '../netlify/functions/_shared/universal-link-blobs.mjs';
import { runTieInference } from '../netlify/functions/_shared/tie-inference/run.mjs';
import { getStore } from '@netlify/blobs';

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: null,
    sources: null,
    since: null,
    report: null,
    dataDir: null,
    forceAll: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--force-all') args.forceAll = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--sources') {
      args.sources = String(argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--since') args.since = argv[++i] ?? null;
    else if (a === '--report') args.report = argv[++i] ?? null;
    else if (a === '--data-dir') args.dataDir = argv[++i] ?? null;
  }
  return args;
}

function openStoreFromEnv(name, env) {
  const token = env.NETLIFY_BLOBS_TOKEN;
  const siteID = env.NETLIFY_SITE_ID || env.SITE_ID;
  if (token && siteID) {
    return getStore({ name, siteID, token });
  }
  return null;
}

async function tryProfessionalStore(env) {
  try {
    return await defaultGetProfessionalStore(env);
  } catch {
    return openStoreFromEnv('professional-hub-content', env);
  }
}

async function tryUniversalStore(env) {
  try {
    return await defaultGetUniversalLinkStore(env);
  } catch {
    return openStoreFromEnv('universal-link-content', env);
  }
}

const args = parseArgs(process.argv.slice(2));
const env = { ...process.env };
if (!env.GITHUB_TOKEN && env.GITHUB_PERSONAL_ACCESS_TOKEN) {
  env.GITHUB_TOKEN = env.GITHUB_PERSONAL_ACCESS_TOKEN;
}

const professionalStore = await tryProfessionalStore(env);
const universalStore = await tryUniversalStore(env);

let peopleWithRelationships = [];
let selfRef = null;

if (universalStore) {
  peopleWithRelationships = await loadAllPeopleWithRelationships({
    store: universalStore,
    env,
    fetchImpl: fetch
  });
  const self = await findActiveSelfPerson(universalStore, { env, fetchImpl: fetch });
  selfRef = self
    ? formatEntityRef({ namespace: 'shared', kind: 'person', id: self.id })
    : null;
} else if (args.dataDir) {
  // Fall back to the Phase 0 local loader path via dynamic import of health script helpers
  const { spawnSync } = await import('node:child_process');
  // Prefer importing the same data-dir builder used by health — inline minimal load:
  const { readFileSync } = await import('node:fs');
  const {
    derivePersonId,
    deriveOrganisationId,
    isImportedStudentPerson
  } = await import('../netlify/functions/_shared/github-professional-data.mjs');
  const dir = resolve(args.dataDir);
  const people = JSON.parse(readFileSync(join(dir, 'people.json'), 'utf8'));
  const organisations = JSON.parse(readFileSync(join(dir, 'organisations.json'), 'utf8'));
  const relationships = JSON.parse(readFileSync(join(dir, 'relationships.json'), 'utf8'));
  const orgByLegacy = new Map(organisations.filter((o) => o?.legacy_id).map((o) => [o.legacy_id, o]));
  const adults = people.filter((p) => !isImportedStudentPerson(p));
  peopleWithRelationships = adults.map((row) => {
    const id = derivePersonId(row.legacy_id);
    const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });
    const rels = relationships.filter((r) => r.person_legacy_id === row.legacy_id);
    const relationshipsOut = [];
    for (const r of rels) {
      if (r.relationship_type === 'employee_at' || r.relationship_type === 'member_of') {
        const org = orgByLegacy.get(r.organisation_legacy_id);
        if (!org) continue;
        const orgId = deriveOrganisationId(org.legacy_id);
        relationshipsOut.push({
          link: {
            relationship_type: r.relationship_type,
            source_ref: ref,
            target_ref: formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId }),
            role: r.role ?? null,
            status: r.valid_to ? 'ended' : 'current',
            valid_from: r.valid_from ?? null,
            valid_to: r.valid_to ?? null
          },
          endpoint: {
            kind: 'organisation',
            ref: formatEntityRef({ namespace: 'shared', kind: 'organisation', id: orgId }),
            display_name: org.display_name
          }
        });
      }
    }
    if (row.is_self) selfRef = ref;
    return {
      person: {
        id,
        ref,
        display_name: row.display_name,
        aliases: row.aliases ?? [],
        is_self: row.is_self === true,
        professional_profile: row.professional_profile ?? null,
        body_markdown: row.professional_profile?.body_markdown ?? ''
      },
      relationships: relationshipsOut
    };
  });
  void spawnSync;
} else {
  console.error('Need Netlify Blobs binding or --data-dir <life-hub-data/data/professional>.');
  process.exit(1);
}

if (!selfRef) {
  console.error('No self person (is_self). Refusing to run.');
  process.exit(1);
}

const accessContext = createAccessContext({ workflow: 'professional', allowedEntityKinds: [] });
const linkRepo = universalStore
  ? createUniversalLinkRepository({ store: universalStore, env, fetchImpl: fetch })
  : null;

const deps = {
  apply: args.apply,
  limit: args.limit,
  sources: args.sources,
  forceAll: args.forceAll,
  selfRef,
  peopleWithRelationships,
  professionalStore,
  proposalRepo: professionalStore
    ? createLinkProposalRepository({ store: professionalStore })
    : null,
  linkRepo,
  accessContext,
  env,
  fetchImpl: fetch,
  communicationRepo: professionalStore
    ? createCommunicationRepository({ store: professionalStore, env, getUniversalLinkStore: async () => universalStore })
    : null,
  meetingRepo: professionalStore ? createMeetingRepository({ store: professionalStore, env }) : null,
  eventRepo: professionalStore ? createEventRepository({ store: professionalStore, env }) : null,
  threadRepo: professionalStore ? createThreadRepository({ store: professionalStore }) : null,
  ledgerRepo: professionalStore ? createLedgerItemRepository({ store: professionalStore }) : null,
  applicationRepo: professionalStore
    ? createApplicationRepository({ store: professionalStore, env })
    : null
};

if (universalStore) {
  try {
    const tasksStore = await defaultGetTasksStore(env);
    deps.tasks = (await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => [])).map((t) => ({
      id: t.id,
      ref: t.ref ?? (t.id ? `tasks:task:${t.id}` : null),
      title: t.title ?? t.name ?? '',
      body: t.notes ?? t.body ?? t.description ?? ''
    }));
    deps.projects = (await listTasksJSON(tasksStore, PROJECT_PREFIX).catch(() => [])).map((p) => ({
      id: p.id,
      ref: p.ref ?? (p.id ? `tasks:project:${p.id}` : null),
      title: p.title ?? p.name ?? '',
      body: p.notes ?? p.body ?? p.description ?? '',
      kind: 'project'
    }));
  } catch {
    deps.tasks = [];
    deps.projects = [];
  }
}

if (args.apply && !professionalStore) {
  console.error('--apply requires a bound professional-hub-content store.');
  process.exit(1);
}

const result = await runTieInference(deps);

// Strip any accidental text fields from classifications before writing
const safe = {
  ...result,
  classifications: (result.classifications ?? []).map((c) => ({
    pair_key: c.pair_key,
    names: c.names,
    tie: c.tie,
    role: c.role,
    reason: c.reason,
    evidence_count: c.evidence_count,
    person_ref: c.person_ref
  }))
};

const outPath = args.report ?? join(tmpdir(), `infer-ties-${Date.now()}.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
process.stderr.write(
  `Report: ${outPath}\napply=${args.apply} classified=${safe.classified} proposed=${safe.proposed} updated=${safe.updated}\n`
);
