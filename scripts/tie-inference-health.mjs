#!/usr/bin/env node
/**
 * Phase 0 — read-only tie inference health report.
 *
 * Usage:
 *   GITHUB_TOKEN=… node scripts/tie-inference-health.mjs
 *   node scripts/tie-inference-health.mjs --data-dir <life-hub-data/data/professional>
 *   node scripts/tie-inference-health.mjs --report /path/out.json
 *
 * Never writes to professional stores or life-hub-data.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { formatEntityRef } from '../netlify/functions/_shared/entity-ref.mjs';
import {
  deriveOrganisationId,
  derivePersonId,
  getGithubActiveSelfPerson,
  isImportedStudentPerson,
  listGithubPersonCandidates,
  listGithubRelationshipEntries,
  STUDENT_ORIGINAL_CATEGORY
} from '../netlify/functions/_shared/github-professional-data.mjs';
import { resolvePerson } from '../netlify/functions/_shared/entity-resolvers.mjs';
import { createAccessContext } from '../netlify/functions/_shared/entity-access.mjs';
import { buildTieInferenceHealthReport } from '../netlify/functions/_shared/tie-inference/health.mjs';

function parseArgs(argv) {
  const args = { dataDir: null, report: null, sources: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--data-dir') {
      args.dataDir = argv[++i] ?? null;
    } else if (argv[i] === '--report') {
      args.report = argv[++i] ?? null;
    } else if (argv[i] === '--sources') {
      args.sources = String(argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return args;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function peopleFromDataDir(dataDir) {
  const people = loadJson(join(dataDir, 'people.json'));
  const organisations = loadJson(join(dataDir, 'organisations.json'));
  const relationships = loadJson(join(dataDir, 'relationships.json'));
  const orgByLegacy = new Map(
    (organisations ?? []).filter((o) => o?.legacy_id).map((o) => [o.legacy_id, o])
  );

  const adults = (people ?? []).filter((p) => !isImportedStudentPerson(p));
  const students = (people ?? []).filter((p) => isImportedStudentPerson(p));

  const peopleWithRelationships = adults.map((row) => {
    const id = derivePersonId(row.legacy_id);
    const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });
    const rels = (relationships ?? []).filter((r) => r.person_legacy_id === row.legacy_id);
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
      if (r.relationship_type === 'professional_relationship' && r.other_person_legacy_id) {
        const otherId = derivePersonId(r.other_person_legacy_id);
        relationshipsOut.push({
          link: {
            relationship_type: 'professional_relationship',
            source_ref: ref,
            target_ref: formatEntityRef({ namespace: 'shared', kind: 'person', id: otherId }),
            role: r.role ?? null,
            status: 'current',
            valid_from: r.valid_from ?? null,
            valid_to: r.valid_to ?? null
          },
          endpoint: {
            kind: 'person',
            ref: formatEntityRef({ namespace: 'shared', kind: 'person', id: otherId })
          }
        });
      }
    }
    return {
      person: {
        id,
        ref,
        display_name: row.display_name,
        aliases: row.aliases ?? [],
        is_self: row.is_self === true,
        legacy_id: row.legacy_id,
        original_category: row.original_category,
        professional_profile: row.professional_profile ?? null,
        body_markdown: row.body_markdown ?? row.professional_profile?.body_markdown ?? ''
      },
      relationships: relationshipsOut
    };
  });

  const self = peopleWithRelationships.find((p) => p.person.is_self);
  return {
    peopleWithRelationships,
    selfRef: self?.person.ref ?? null,
    excludedPeople: students.map((row) => ({
      display_name: row.display_name,
      aliases: row.aliases ?? []
    })),
    source: `data-dir:${dataDir}`
  };
}

async function peopleFromGithub(env) {
  const tokenEnv = { ...env, GITHUB_TOKEN: env.GITHUB_TOKEN || env.GITHUB_PERSONAL_ACCESS_TOKEN };
  const candidates = await listGithubPersonCandidates({ env: tokenEnv, fetchImpl: fetch });
  const self = await getGithubActiveSelfPerson({ env: tokenEnv, fetchImpl: fetch });
  const peopleWithRelationships = [];
  for (const person of candidates) {
    const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id: person.id });
    let relEntries = [];
    try {
      relEntries = await listGithubRelationshipEntries('person', person.id, {
        env: tokenEnv,
        fetchImpl: fetch
      });
    } catch {
      relEntries = [];
    }
    peopleWithRelationships.push({
      person: { ...person, ref },
      relationships: relEntries
    });
  }
  const selfRef = self
    ? formatEntityRef({ namespace: 'shared', kind: 'person', id: self.id })
    : null;
  return {
    peopleWithRelationships,
    selfRef,
    excludedPeople: [],
    source: 'github-api'
  };
}

const args = parseArgs(process.argv.slice(2));
const env = process.env;

let loaded;
if (args.dataDir) {
  loaded = peopleFromDataDir(resolve(args.dataDir));
} else {
  try {
    loaded = await peopleFromGithub(env);
  } catch (error) {
    const fallback = resolve(
      new URL('../../life-hub-data/data/professional', import.meta.url).pathname
    );
    // Prefer sibling checkout if present
    const local = '/agent/repos/life-hub-data/data/professional';
    try {
      loaded = peopleFromDataDir(local);
      loaded.github_error = error?.message ?? String(error);
    } catch {
      console.error('Unable to load people from GitHub or local life-hub-data.', error);
      process.exit(1);
    }
  }
}

// Prefer local data-dir when both available and user didn't specify — already handled.
// Ensure GITHUB_TOKEN for resolvePerson check
if (!env.GITHUB_TOKEN && env.GITHUB_PERSONAL_ACCESS_TOKEN) {
  env.GITHUB_TOKEN = env.GITHUB_PERSONAL_ACCESS_TOKEN;
}

const accessContext = createAccessContext({ workflow: 'professional', allowedEntityKinds: [] });

// Prefer exercising getGithubPerson (resolvePerson's fallback) when Blobs are
// unbound in this environment — still pass resolvePerson for completeness.
const report = await buildTieInferenceHealthReport({
  peopleWithRelationships: loaded.peopleWithRelationships,
  selfRef: loaded.selfRef,
  excludedPeople: loaded.excludedPeople,
  sources: args.sources,
  // Blob-backed adapters deliberately unbound in Phase 0 unless injected
  env,
  fetchImpl: fetch,
  resolvePerson,
  accessContext
});
report.adults_including_self = loaded.peopleWithRelationships.length;
report.self_present = Boolean(loaded.selfRef);

report.data_source = loaded.source;
report.student_category = STUDENT_ORIGINAL_CATEGORY;
if (loaded.github_error) report.github_error = loaded.github_error;

const outPath =
  args.report ??
  join(tmpdir(), `tie-inference-health-${Date.now()}.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stderr.write(`Wrote report to ${outPath}\n`);

if (report.stop) {
  process.stderr.write(
    `STOP: github_person_proposal_resolution failed: ${report.github_person_proposal_resolution?.reason}\n`
  );
  process.exit(2);
}
