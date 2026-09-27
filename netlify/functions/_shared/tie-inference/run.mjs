/**
 * Tie inference orchestrator — Stage 1 → 2 → 3 (TIE-INFERENCE-BRIEF).
 */

import { formatEntityRef } from '../entity-ref.mjs';
import { buildCandidatePairs, pairKey } from './candidates.mjs';
import { classifyCandidate } from './classify.mjs';
import {
  TIE_KICKOFF_CALL_CAP,
  TIE_NIGHTLY_CALL_CAP,
  TIE_PROPOSER
} from './constants.mjs';
import { buildProposalInput, writeTieProposal } from './proposals.mjs';
import { collectEvidence } from './sources.mjs';
import {
  loadDeclinedPairs,
  loadTieState,
  saveTieState,
  shouldReclassify
} from './state.mjs';

/**
 * Build roster from peopleWithRelationships (adults already filtered upstream).
 */
export function rosterFromPeople(peopleWithRelationships, selfRef) {
  const roster = [];
  for (const entry of peopleWithRelationships ?? []) {
    const person = entry.person;
    if (!person) continue;
    const ref =
      person.ref ??
      (person.id ? formatEntityRef({ namespace: 'shared', kind: 'person', id: person.id }) : null);
    if (!ref) continue;
    if (selfRef && ref === selfRef) continue;
    const org_refs = [];
    let link_count = 0;
    for (const rel of entry.relationships ?? []) {
      link_count += 1;
      const type = rel.link?.relationship_type;
      if (
        (type === 'employee_at' || type === 'member_of') &&
        rel.endpoint?.ref &&
        (rel.link.status === 'current' || !rel.link.valid_to)
      ) {
        org_refs.push(rel.endpoint.ref);
      }
    }
    roster.push({
      ref,
      id: person.id,
      display_name: person.display_name,
      aliases: person.aliases ?? [],
      is_self: Boolean(person.is_self),
      org_refs: [...new Set(org_refs)],
      org_names: (entry.relationships ?? [])
        .filter(
          (r) =>
            (r.link?.relationship_type === 'employee_at' ||
              r.link?.relationship_type === 'member_of') &&
            r.endpoint?.display_name
        )
        .map((r) => r.endpoint.display_name),
      role_line: person.role_line ?? person.professional_profile?.current_workplace ?? null,
      profile_summary: person.professional_profile?.summary ?? person.summary ?? '',
      body_markdown:
        person.professional_profile?.body_markdown ?? person.body_markdown ?? '',
      profile_body: person.professional_profile?.body ?? '',
      link_count
    });
  }
  return roster;
}

export function existingProfessionalPairKeys(peopleWithRelationships) {
  const keys = new Set();
  for (const entry of peopleWithRelationships ?? []) {
    const personRef =
      entry.person?.ref ??
      (entry.person?.id
        ? formatEntityRef({ namespace: 'shared', kind: 'person', id: entry.person.id })
        : null);
    for (const rel of entry.relationships ?? []) {
      if (rel.link?.relationship_type !== 'professional_relationship') continue;
      const other =
        rel.link.source_ref === personRef ? rel.link.target_ref : rel.link.source_ref;
      if (personRef && other?.startsWith('shared:person:')) {
        keys.add(pairKey(personRef, other));
      }
    }
  }
  return keys;
}

/**
 * @param {object} deps
 * @param {boolean} [deps.apply] — write proposals (default false = preview)
 * @param {number} [deps.limit] — Claude call cap
 * @param {boolean} [deps.nightly] — use nightly growth filter + 40 cap
 * @param {string[]} [deps.sources]
 */
export async function runTieInference(deps = {}) {
  const nowIso = (deps.now?.() ?? new Date()).toISOString?.() ?? new Date().toISOString();
  const apply = Boolean(deps.apply);
  const nightly = Boolean(deps.nightly);
  const limit = Number.isFinite(deps.limit)
    ? deps.limit
    : nightly
      ? TIE_NIGHTLY_CALL_CAP
      : TIE_KICKOFF_CALL_CAP;

  const selfRef = deps.selfRef ?? null;
  if (!selfRef) {
    return { error: 'no_self_person', candidates: 0, classified: 0, proposed: 0, updated: 0, skipped: 0 };
  }

  const peopleWithRelationships = deps.peopleWithRelationships ?? [];
  const roster = deps.roster ?? rosterFromPeople(peopleWithRelationships, selfRef);
  const rosterByRef = new Map(roster.map((p) => [p.ref, p]));
  const existingPairKeys =
    deps.existingPairKeys ?? existingProfessionalPairKeys(peopleWithRelationships);

  const professionalStore = deps.professionalStore ?? null;
  const declinedPairs = deps.declinedPairs ?? (await loadDeclinedPairs(professionalStore));
  const state = deps.state ?? (await loadTieState(professionalStore));

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

  let candidates = built.candidates;
  if (nightly) {
    candidates = candidates.filter((c) => shouldReclassify(c, state.pairs[c.pair_key]));
  } else if (!deps.forceAll) {
    // Kick-off: skip pairs already classified with no growth (safe re-run)
    candidates = candidates.filter((c) => {
      const prev = state.pairs[c.pair_key];
      if (!prev) return true;
      return shouldReclassify(c, prev);
    });
  }

  const toClassify = candidates.slice(0, Math.max(0, limit));
  const classifications = [];
  let proposed = 0;
  let updated = 0;
  let skipped = 0;
  let classified = 0;
  let noTie = 0;
  let errors = 0;

  for (const candidate of toClassify) {
    const [a, b] = candidate.pair;
    const personA = rosterByRef.get(a);
    const personB = rosterByRef.get(b);
    if (!personA || !personB) {
      skipped += 1;
      continue;
    }

    let result;
    try {
      result = await classifyCandidate(candidate, {
        personA,
        personB,
        deps: {
          complete: deps.complete,
          apiKey: deps.apiKey,
          env: deps.env,
          fetchImpl: deps.fetchImpl
        }
      });
    } catch (error) {
      errors += 1;
      state.pairs[candidate.pair_key] = {
        count: candidate.count,
        last_classified_count: candidate.count,
        last_result: 'error',
        classified_at: nowIso,
        error: error?.message ?? 'classify_failed'
      };
      continue;
    }

    classified += 1;

    if (!result.ok) {
      errors += 1;
      state.pairs[candidate.pair_key] = {
        count: candidate.count,
        last_classified_count: candidate.count,
        last_result: 'error',
        classified_at: nowIso,
        error: result.reason
      };
      continue;
    }

    const value = result.value;
    state.pairs[candidate.pair_key] = {
      count: candidate.count,
      last_classified_count: candidate.count,
      last_result: value.tie ? 'tie' : 'no_tie',
      classified_at: nowIso
    };

    if (!value.tie) {
      noTie += 1;
      classifications.push({
        pair_key: candidate.pair_key,
        names: [personA.display_name, personB.display_name],
        tie: false,
        reason: value.reason
      });
      continue;
    }

    const input = buildProposalInput(candidate, value, rosterByRef);
    classifications.push({
      pair_key: candidate.pair_key,
      names: [personA.display_name, personB.display_name],
      tie: true,
      role: value.role,
      reason: value.reason,
      evidence_count: candidate.count,
      person_ref: input.person_ref
    });

    if (!apply || !deps.proposalRepo) {
      skipped += 1;
      continue;
    }

    const write = await writeTieProposal(deps.proposalRepo, input);
    if (write.action === 'created') proposed += 1;
    else if (write.action === 'updated') updated += 1;
    else skipped += 1;
  }

  state.last_run_at = nowIso;
  if (apply && professionalStore) {
    await saveTieState(professionalStore, state);
  }

  return {
    proposer: TIE_PROPOSER,
    apply,
    nightly,
    self_ref: selfRef,
    roster_size: roster.length,
    evidence_items: collected.evidence.length,
    per_source: collected.perSource,
    adapters_skipped: collected.skipped,
    stage1: {
      candidates: built.candidates.length,
      to_classify: toClassify.length,
      by_rule: built.by_rule,
      source_spread: built.source_spread,
      skipped: built.skipped
    },
    candidates: built.candidates.length,
    classified,
    proposed,
    updated,
    skipped,
    no_tie: noTie,
    errors,
    classifications: classifications.slice(0, 50),
    // Never include record text in report
    report_safe: true
  };
}
