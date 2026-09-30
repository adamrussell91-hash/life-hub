import { formatEntityRef } from './entity-ref.mjs';
import { findActiveSelfPerson } from './career-overview.mjs';
import { inferLinkProposals } from './link-inference-rules.mjs';
import { createLinkProposalRepository } from './link-proposal-repository.mjs';
import { loadAllPeopleWithRelationships } from './people-collection.mjs';
import { createAccessContext } from './entity-access.mjs';
import { createUniversalLinkRepository } from './universal-link-repository.mjs';
import { defaultGetProfessionalStore } from './professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './universal-link-blobs.mjs';
import {
  defaultGetTasksStore,
  listJSON as listTasksJSON,
  PROJECT_PREFIX,
  TASK_PREFIX
} from './tasks-blobs.mjs';
import { getRelationshipDeclaration } from './relationship-registry.mjs';
import { recordDeclinedPair } from './tie-inference/state.mjs';
import { pairKey } from './tie-inference/candidates.mjs';
import { withoutDeleted } from './record-liveness.mjs';

function selfRefOf(self) {
  if (!self) return null;
  if (typeof self.ref === 'string' && self.ref) return self.ref;
  if (self.id) return formatEntityRef({ namespace: 'shared', kind: 'person', id: self.id });
  return null;
}

/**
 * Run deterministic link inference and persist pending proposals.
 */
export async function runLinkInferencePass(deps = {}) {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const nowValue = now();
  const nowIso = nowValue instanceof Date ? nowValue.toISOString() : String(nowValue);

  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));
  const universalStore =
    deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env));
  const tasksStore = deps.tasksStore ?? (await (deps.getTasksStore ?? defaultGetTasksStore)(env));

  const proposalRepo =
    deps.proposalRepo ??
    createLinkProposalRepository({
      store: professionalStore,
      now: () => nowIso
    });

  const peopleWithRelationships =
    deps.peopleWithRelationships ??
    (await loadAllPeopleWithRelationships({
      store: universalStore,
      now: nowValue,
      env,
      resolveEntity: deps.resolveEntity,
      createRepository: deps.createRepository,
      fetchImpl: deps.fetchImpl
    }));

  const self =
    deps.selfPerson ??
    (await findActiveSelfPerson(universalStore, { env, fetchImpl: deps.fetchImpl }));
  const selfRef = selfRefOf(self);
  if (!selfRef) {
    return { created: 0, skipped: 0, proposals: [], error: 'no_self_person' };
  }

  const tasks = withoutDeleted(deps.tasks ?? (await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => []))).map(
    (t) => ({
      id: t.id,
      ref: t.ref ?? (t.id ? `tasks:task:${t.id}` : null),
      title: t.title ?? t.name ?? '',
      body: t.notes ?? t.body ?? t.description ?? '',
      status: t.status ?? 'open'
    })
  );

  const projects = withoutDeleted(
    deps.projects ?? (await listTasksJSON(tasksStore, PROJECT_PREFIX).catch(() => []))
  ).map((p) => ({
    id: p.id,
    ref: p.ref ?? (p.id ? `tasks:project:${p.id}` : null),
    title: p.title ?? p.name ?? '',
    body: p.notes ?? p.body ?? p.description ?? ''
  }));

  const events = deps.events ?? [];

  const existingLinkKeys = new Set();
  for (const { relationships } of peopleWithRelationships) {
    for (const entry of relationships ?? []) {
      const link = entry.link;
      if (!link) continue;
      existingLinkKeys.add(
        `${link.relationship_type}|${link.source_ref}|${link.target_ref}|${link.role ?? ''}`
      );
    }
  }

  const inferred = inferLinkProposals({
    selfPerson: { ref: selfRef, display_name: self.display_name },
    peopleWithRelationships,
    tasks,
    projects,
    events,
    existingLinkKeys
  });

  let created = 0;
  let skipped = 0;
  const proposals = [];
  for (const item of inferred) {
    const result = await proposalRepo.createProposal(item);
    if (result.created) created += 1;
    else skipped += 1;
    proposals.push(result.proposal);
  }

  return { created, skipped, proposals };
}

export async function acceptLinkProposal(proposalId, deps = {}) {
  const env = deps.env ?? process.env;
  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));

  const proposalRepo =
    deps.proposalRepo ??
    createLinkProposalRepository({
      store: professionalStore,
      now: deps.now
    });

  let proposal = await proposalRepo.getById(proposalId);
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error(`Proposal is already ${proposal.status}.`), {
      status: 400,
      code: 'proposal_not_pending'
    });
  }

  // Optional role override (Ties to confirm review)
  const roleOverride = deps.role ?? null;
  if (roleOverride !== null && roleOverride !== undefined) {
    const decl = getRelationshipDeclaration(proposal.proposed_link.relationship_type);
    const allowed = decl?.allowed_roles ?? null;
    if (Array.isArray(allowed) && !allowed.includes(roleOverride)) {
      throw Object.assign(new Error(`Role ${roleOverride} is not allowed for this relationship.`), {
        status: 400,
        code: 'invalid_role'
      });
    }
    proposal = await proposalRepo.updatePendingProposal(proposalId, {
      proposed_link: { ...proposal.proposed_link, role: roleOverride }
    });
  }

  const linkRepo =
    deps.linkRepo ??
    createUniversalLinkRepository({
      store:
        deps.universalStore ??
        (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env)),
      now: deps.now,
      resolveEntity: deps.resolveEntity,
      env,
      fetchImpl: deps.fetchImpl
    });

  const accessContext =
    deps.accessContext ?? createAccessContext({ workflow: 'professional', allowedEntityKinds: [] });

  // Strip inference-only metadata before writing the Universal Link
  const proposed = { ...proposal.proposed_link };
  if (proposed.metadata && typeof proposed.metadata === 'object') {
    const { tie_pair_key: _tk, evidence_count: _ec, pair_names: _pn, ...rest } = proposed.metadata;
    proposed.metadata = rest;
  }

  const { link } = await linkRepo.createLink(proposed, accessContext);
  const updated = await proposalRepo.setStatus(proposalId, 'accepted', {
    resolved_link_id: link?.id ?? null
  });
  return { proposal: updated, link };
}

export async function declineLinkProposal(proposalId, deps = {}) {
  const env = deps.env ?? process.env;
  const professionalStore =
    deps.professionalStore ?? (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env));
  const proposalRepo =
    deps.proposalRepo ??
    createLinkProposalRepository({
      store: professionalStore,
      now: deps.now
    });
  const proposal = await proposalRepo.getById(proposalId);
  const updated = await proposalRepo.setStatus(proposalId, 'declined');

  if (proposal.proposer === 'ties') {
    const meta = proposal.proposed_link?.metadata ?? {};
    const key =
      typeof meta.tie_pair_key === 'string'
        ? meta.tie_pair_key
        : pairKey(proposal.proposed_link.source_ref, proposal.proposed_link.target_ref);
    const evidenceCount = Number(meta.evidence_count) || 0;
    const nowIso =
      typeof deps.now === 'function'
        ? deps.now()
        : new Date().toISOString();
    await recordDeclinedPair(professionalStore, key, evidenceCount, nowIso);
  }

  return updated;
}
