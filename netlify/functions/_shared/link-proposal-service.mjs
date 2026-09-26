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

  const tasks = (deps.tasks ?? (await listTasksJSON(tasksStore, TASK_PREFIX).catch(() => []))).map(
    (t) => ({
      id: t.id,
      ref: t.ref ?? (t.id ? `tasks:task:${t.id}` : null),
      title: t.title ?? t.name ?? '',
      body: t.notes ?? t.body ?? t.description ?? '',
      status: t.status ?? 'open'
    })
  );

  const projects = (
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
  const universalStore =
    deps.universalStore ?? (await (deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore)(env));

  const proposalRepo =
    deps.proposalRepo ??
    createLinkProposalRepository({
      store: professionalStore,
      now: deps.now
    });

  const proposal = await proposalRepo.getById(proposalId);
  if (proposal.status !== 'pending') {
    throw Object.assign(new Error(`Proposal is already ${proposal.status}.`), {
      status: 400,
      code: 'proposal_not_pending'
    });
  }

  const linkRepo =
    deps.linkRepo ??
    createUniversalLinkRepository({
      store: universalStore,
      now: deps.now,
      resolveEntity: deps.resolveEntity,
      env,
      fetchImpl: deps.fetchImpl
    });

  const accessContext =
    deps.accessContext ?? createAccessContext({ workflow: 'professional', allowedEntityKinds: [] });

  const { link } = await linkRepo.createLink(proposal.proposed_link, accessContext);
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
  return proposalRepo.setStatus(proposalId, 'declined');
}
