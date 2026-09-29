// Accept / decline pending Ties link proposals via Confirm.
// Paths: professional:tie:<proposal_id>

import { acceptLinkProposal, declineLinkProposal } from './link-proposal-service.mjs';
import { clean, makeProposal, parseWriteBody, writeError } from './agent-propose-helpers.mjs';

export const TIE_DECISION_AGENT_SLUGS = new Set(['clare', 'hammond', 'ann']);

const MAX_DECISIONS = 12;

export function proposeTieDecisionSchema() {
  return {
    name: 'propose_tie_decision',
    description:
      'Propose accepting or declining pending Ties link proposals. Nothing changes until Adam taps Confirm. Pass proposal_id values from the Ties inbox.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        decisions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              proposal_id: { type: 'string' },
              action: { type: 'string', enum: ['accept', 'decline'] },
              role: { type: 'string', description: 'Optional role override when accepting' }
            },
            required: ['proposal_id', 'action'],
            additionalProperties: false
          }
        }
      },
      required: ['summary', 'decisions'],
      additionalProperties: false
    }
  };
}

export function buildTieDecisionProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  const decisions = Array.isArray(input.decisions) ? input.decisions : [];
  if (!decisions.length) return { ok: false, error: 'no_decisions' };
  if (decisions.length > MAX_DECISIONS) return { ok: false, error: 'too_many_decisions' };

  const writes = [];
  const seen = new Set();
  for (const [index, item] of decisions.entries()) {
    const proposalId = clean(item?.proposal_id, 80);
    const action = clean(item?.action, 20);
    if (!proposalId) return { ok: false, error: 'invalid_proposal_id', detail: `decisions[${index}]` };
    if (action !== 'accept' && action !== 'decline') {
      return { ok: false, error: 'invalid_action', detail: `decisions[${index}]` };
    }
    if (seen.has(proposalId)) return { ok: false, error: 'duplicate_proposal_id', detail: proposalId };
    seen.add(proposalId);
    const body = { action };
    const role = clean(item?.role, 80);
    if (action === 'accept' && role) body.role = role;
    writes.push({
      path: `professional:tie:${proposalId}`,
      mode: 'overwrite',
      content: JSON.stringify(body),
      diff: `${action === 'accept' ? 'Accept' : 'Decline'} tie ${proposalId}${role ? ` as ${role}` : ''}`
    });
  }

  return {
    ok: true,
    proposal: makeProposal(summary, writes)
  };
}

export function createTieDecisionWriteExecutor({
  professionalStore,
  env,
  fetchImpl,
  now,
  resolveEntity
} = {}) {
  if (!professionalStore) throw new Error('createTieDecisionWriteExecutor requires a professional store.');

  async function apply(write, target) {
    const body = parseWriteBody(write);
    if (!body) return writeError('invalid_professional_write', write.path);
    const action = body.action;
    if (action !== 'accept' && action !== 'decline') return writeError('invalid_action', write.path);
    const proposalId = target.id;
    const deps = {
      professionalStore,
      env,
      fetchImpl,
      ...(now ? { now } : {}),
      ...(resolveEntity ? { resolveEntity } : {}),
      ...(action === 'accept' && body.role ? { role: body.role } : {})
    };
    try {
      if (action === 'accept') {
        const result = await acceptLinkProposal(proposalId, deps);
        return {
          ok: true,
          result: {
            path: write.path,
            mode: 'overwrite',
            proposal_id: proposalId,
            status: result.proposal?.status || 'accepted',
            link_id: result.link?.id ?? null
          }
        };
      }
      const updated = await declineLinkProposal(proposalId, deps);
      return {
        ok: true,
        result: {
          path: write.path,
          mode: 'overwrite',
          proposal_id: proposalId,
          status: updated?.status || 'declined'
        }
      };
    } catch (error) {
      // Idempotent: already resolved proposals are treated as success.
      if (error?.code === 'proposal_not_pending') {
        return {
          ok: true,
          result: {
            path: write.path,
            mode: 'overwrite',
            proposal_id: proposalId,
            status: 'already_resolved',
            skipped: true
          }
        };
      }
      return writeError(typeof error?.code === 'string' ? error.code : 'tie_decision_failed', error?.message);
    }
  }

  return { apply };
}
