/**
 * Phase 0 — read-only tie inference health report (never writes).
 */

import { formatEntityRef } from '../entity-ref.mjs';
import { derivePersonId, getGithubPerson } from '../github-professional-data.mjs';
import { buildCandidatePairs, pairKey } from './candidates.mjs';
import {
  existingProfessionalPairKeys,
  rosterFromPeople
} from './run.mjs';
import { collectEvidence } from './sources.mjs';
import { loadDeclinedPairs } from './state.mjs';

/**
 * Verify a GitHub-derived person id resolves the way person pages do after
 * Blobs miss: `resolvePerson` → `getGithubPerson`. When Blobs are unbound
 * locally we exercise `getGithubPerson` directly (same fallback), and still
 * try `resolvePerson` when provided.
 */
export async function checkGithubPersonProposalResolution({
  people,
  resolvePerson,
  getGithubPerson,
  accessContext,
  env,
  fetchImpl
}) {
  const adults = (people ?? []).filter((p) => !p.is_student && !p._is_student);
  const sample = adults.find((p) => p.id && !p.is_self) ?? adults[0];
  if (!sample) {
    return { ok: false, reason: 'no_people', sample: null };
  }
  const id = sample.id ?? (sample.legacy_id ? derivePersonId(sample.legacy_id) : null);
  if (!id) return { ok: false, reason: 'no_derived_id', sample: null };
  const ref = formatEntityRef({ namespace: 'shared', kind: 'person', id });

  let githubOk = false;
  let githubLabel = null;
  if (typeof getGithubPerson === 'function') {
    try {
      const gh = await getGithubPerson(id, { env, fetchImpl });
      githubOk = Boolean(gh?.id === id || gh?.display_name);
      githubLabel = gh?.display_name ?? null;
    } catch (error) {
      return {
        ok: false,
        sample: { id, ref, display_name: sample.display_name },
        reason: `getGithubPerson:${error?.code ?? error?.message ?? 'threw'}`
      };
    }
  }

  let resolvePath = null;
  if (typeof resolvePerson === 'function') {
    try {
      const resolved = await resolvePerson(id, accessContext, { env, fetchImpl });
      resolvePath = {
        ok: Boolean(resolved?.ref === ref || resolved?.display_label),
        label: resolved?.display_label ?? null
      };
    } catch (error) {
      resolvePath = {
        ok: false,
        error: error?.code ?? error?.message ?? 'resolve_threw',
        note: 'Blobs unbound locally is expected; production resolvePerson falls back to getGithubPerson after a miss'
      };
    }
  }

  // Contract that accepted proposals need: GitHub-derived ids must resolve.
  const ok = githubOk || resolvePath?.ok === true;
  return {
    ok,
    sample: {
      id,
      ref,
      display_name: sample.display_name,
      github_label: githubLabel,
      resolve_label: resolvePath?.label ?? null
    },
    github_fallback: githubOk,
    resolve_person_path: resolvePath,
    reason: ok ? null : 'github_person_unresolvable',
    note: 'Accepted ties use shared:person:<derivePersonId(legacy_id)>; overview resolves via Blobs then getGithubPerson'
  };
}

/**
 * Build the Phase 0 health report. Never writes.
 *
 * @param {object} deps — same injectable surface as runTieInference; stores optional
 */
export async function buildTieInferenceHealthReport(deps = {}) {
  const selfRef = deps.selfRef ?? null;
  const peopleWithRelationships = deps.peopleWithRelationships ?? [];
  const roster = deps.roster ?? rosterFromPeople(peopleWithRelationships, selfRef);
  const existingPairKeys =
    deps.existingPairKeys ?? existingProfessionalPairKeys(peopleWithRelationships);
  const declinedPairs = deps.declinedPairs ?? (await loadDeclinedPairs(deps.professionalStore ?? null));

  const collected = await collectEvidence({
    ...deps,
    roster,
    excludedPeople: deps.excludedPeople ?? [],
    sources: deps.sources
  });

  const built = buildCandidatePairs({
    evidence: collected.evidence,
    roster,
    selfRef,
    existingPairKeys,
    declinedPairs
  });

  // Ambiguous names across adapters (names only — never record text)
  const ambiguousNames = new Set();
  for (const src of Object.values(collected.perSource ?? {})) {
    for (const name of src.stats?.ambiguous_names ?? []) ambiguousNames.add(name);
  }

  let namedHits = 0;
  for (const src of Object.values(collected.perSource ?? {})) {
    namedHits += Number(src.stats?.named_hits) || 0;
  }

  const resolution = await checkGithubPersonProposalResolution({
    people: roster.map((p) => ({
      id: p.id,
      legacy_id: p.legacy_id,
      display_name: p.display_name,
      is_self: p.is_self
    })),
    resolvePerson: deps.resolvePerson,
    getGithubPerson: deps.getGithubPerson ?? getGithubPerson,
    accessContext: deps.accessContext,
    env: deps.env,
    fetchImpl: deps.fetchImpl
  });

  // Counts for comms/meetings/events specifically
  const recordCounts = {
    comms: collected.perSource.comms?.stats?.records ?? null,
    meetings: collected.perSource.meetings?.stats?.records ?? null,
    events: collected.perSource.events?.stats?.records ?? null,
    comms_multi_person: collected.perSource.comms?.stats?.multi_person ?? null,
    meetings_multi_person: collected.perSource.meetings?.stats?.multi_person ?? null,
    events_multi_person: collected.perSource.events?.stats?.multi_person ?? null
  };

  return {
    generated_at: new Date().toISOString(),
    read_only: true,
    self_ref: selfRef,
    roster_size: roster.length,
    record_counts: recordCounts,
    named_hits: namedHits,
    ambiguous_names: [...ambiguousNames].sort(),
    ambiguous_name_count: ambiguousNames.size,
    evidence_items_total: collected.evidence.length,
    evidence_per_source: Object.fromEntries(
      Object.entries(collected.perSource ?? {}).map(([k, v]) => [k, v.evidence_count])
    ),
    adapters_skipped: collected.skipped,
    candidates: {
      total: built.candidates.length,
      by_rule: built.by_rule,
      source_spread: built.source_spread
    },
    would_skip: built.skipped,
    github_person_proposal_resolution: resolution,
    stop: resolution.ok ? false : true,
    // Sample candidate names only (no record text) — invented/redacted for PR paste
    sample_candidate_names: built.candidates.slice(0, 15).map((c) => {
      const [a, b] = c.pair;
      const pa = roster.find((p) => p.ref === a);
      const pb = roster.find((p) => p.ref === b);
      return {
        names: [pa?.display_name ?? a, pb?.display_name ?? b],
        count: c.count,
        hows: c.hows,
        rules: c.rules
      };
    })
  };
}

export { pairKey };
