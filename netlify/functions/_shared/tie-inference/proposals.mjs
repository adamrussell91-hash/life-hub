/**
 * Stage 3 — write / refresh link proposals with proposer `ties`.
 */

import { pairKey } from './candidates.mjs';
import { TIE_PROPOSER } from './constants.mjs';

/**
 * Choose person_ref = the pair member with fewer existing links.
 */
export function pickPersonRef(pair, rosterByRef) {
  const [a, b] = pair;
  const countA = Number(rosterByRef.get(a)?.link_count) || 0;
  const countB = Number(rosterByRef.get(b)?.link_count) || 0;
  return countA <= countB ? a : b;
}

/**
 * Build createProposal input from a tie:true classification.
 */
export function buildProposalInput(candidate, classification, rosterByRef) {
  const [refA, refB] = candidate.pair;
  let source_ref = refA;
  let target_ref = refB;
  let role = classification.role;

  if (role === 'mentor' || role === 'mentee') {
    if (classification.direction === 'B_mentor') {
      source_ref = refB;
      target_ref = refA;
      role = 'mentor';
    } else if (classification.direction === 'A_mentor') {
      source_ref = refA;
      target_ref = refB;
      role = 'mentor';
    }
  }

  const sources = (classification.quotes ?? []).map((q) => ({
    ref: q.record_ref,
    excerpt: q.text
  }));

  return {
    proposer: TIE_PROPOSER,
    person_ref: pickPersonRef(candidate.pair, rosterByRef),
    reason: classification.reason,
    sources,
    proposed_link: {
      source_ref,
      target_ref,
      relationship_type: 'professional_relationship',
      role,
      valid_from: classification.valid_from,
      occurred_at: null,
      context_key: null,
      context_ref: null,
      metadata: {
        tie_pair_key: pairKey(refA, refB),
        evidence_count: candidate.count,
        pair_names: [
          rosterByRef.get(refA)?.display_name ?? refA,
          rosterByRef.get(refB)?.display_name ?? refB
        ]
      }
    }
  };
}

/**
 * Write or refresh a pending ties proposal.
 * Requires proposalRepo with createProposal + optional updatePendingByHash/updateProposal.
 */
export async function writeTieProposal(proposalRepo, input) {
  const result = await proposalRepo.createProposal(input);
  if (result.created) return { ...result, action: 'created' };
  if (result.skipped === 'pending' && typeof proposalRepo.updatePendingProposal === 'function') {
    const updated = await proposalRepo.updatePendingProposal(result.proposal.id, {
      reason: input.reason,
      sources: input.sources,
      proposed_link: input.proposed_link
    });
    return { proposal: updated, created: false, action: 'updated' };
  }
  return { ...result, action: 'skipped' };
}
