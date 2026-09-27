import {
  generateLinkProposalId,
  isValidLinkProposalId,
  LINK_PROPOSAL_SCHEMA_VERSION,
  parseLinkProposalRecord,
  projectLinkProposal,
  proposalEquivalenceHash,
  validateLinkProposalCreateInput,
  validateProposedLinkInput
} from './link-proposal-schema.mjs';
import {
  getJSON,
  linkProposalByPersonKey,
  linkProposalByHashKey,
  linkProposalKey,
  listLinkProposalKeysForPerson,
  listLinkProposalRecordKeys,
  setJSON
} from './professional-blobs.mjs';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404, code: 'link_proposal_not_found' });
}

function parseSources(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      ref: typeof s.ref === 'string' ? s.ref : null,
      excerpt: typeof s.excerpt === 'string' ? s.excerpt.trim() : ''
    }))
    .filter((s) => s.excerpt || s.ref);
}

function tiePairKeyFromProposal(record) {
  const meta = record?.proposed_link?.metadata;
  if (meta && typeof meta.tie_pair_key === 'string' && meta.tie_pair_key.includes('|')) {
    return meta.tie_pair_key;
  }
  const a = record?.proposed_link?.source_ref;
  const b = record?.proposed_link?.target_ref;
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  return null;
}

export function createLinkProposalRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createLinkProposalRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateLinkProposalId;

  async function listForPerson(personRef, { status } = {}) {
    const keys = await listLinkProposalKeysForPerson(store, personRef);
    const records = [];
    for (const key of keys) {
      const id = key.slice(`link-proposals/by-person/${personRef}/`.length);
      if (!isValidLinkProposalId(id)) continue;
      const record = parseLinkProposalRecord(await getJSON(store, linkProposalKey(id)));
      if (!record) continue;
      if (status && record.status !== status) continue;
      records.push(record);
    }
    records.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return records.map(projectLinkProposal);
  }

  async function listPendingByProposer(proposer) {
    const keys = await listLinkProposalRecordKeys(store);
    const records = [];
    for (const key of keys) {
      const id = key.slice('link-proposals/records/'.length);
      if (!isValidLinkProposalId(id)) continue;
      const record = parseLinkProposalRecord(await getJSON(store, linkProposalKey(id)));
      if (!record) continue;
      if (record.status !== 'pending') continue;
      if (proposer && record.proposer !== proposer) continue;
      records.push(record);
    }
    records.sort((a, b) => {
      const countA = Number(a.proposed_link?.metadata?.evidence_count) || 0;
      const countB = Number(b.proposed_link?.metadata?.evidence_count) || 0;
      if (countB !== countA) return countB - countA;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
    return records.map(projectLinkProposal);
  }

  async function findPendingTiesForPair(pairKey) {
    if (!pairKey) return null;
    const pending = await listPendingByProposer('ties');
    for (const projected of pending) {
      const raw = parseLinkProposalRecord(await getJSON(store, linkProposalKey(projected.id)));
      if (!raw) continue;
      if (tiePairKeyFromProposal(raw) === pairKey) return projectLinkProposal(raw);
    }
    return null;
  }

  async function getById(id) {
    if (!isValidLinkProposalId(id)) throw validationError('invalid_link_proposal_id', 'Invalid proposal id.');
    const record = parseLinkProposalRecord(await getJSON(store, linkProposalKey(id)));
    if (!record) throw notFound('Link proposal not found.');
    return projectLinkProposal(record);
  }

  async function updatePendingProposal(id, { reason, sources, proposed_link } = {}) {
    if (!isValidLinkProposalId(id)) throw validationError('invalid_link_proposal_id', 'Invalid proposal id.');
    const record = parseLinkProposalRecord(await getJSON(store, linkProposalKey(id)));
    if (!record) throw notFound('Link proposal not found.');
    if (record.status !== 'pending') {
      throw validationError('proposal_not_pending', `Proposal is already ${record.status}.`);
    }
    const nextReason =
      typeof reason === 'string' && reason.trim() ? reason.trim() : record.reason;
    const nextSources = sources !== undefined ? parseSources(sources) : record.sources;
    let nextLink = record.proposed_link;
    let nextHash = record.equivalence_hash;
    if (proposed_link) {
      nextLink = validateProposedLinkInput(proposed_link);
      nextHash = proposalEquivalenceHash(nextLink);
    }
    const timestamp = now();
    const updated = {
      ...record,
      reason: nextReason,
      sources: nextSources,
      proposed_link: nextLink,
      equivalence_hash: nextHash,
      updated_at: timestamp
    };
    await setJSON(store, linkProposalKey(id), updated);
    await setJSON(store, linkProposalByHashKey(nextHash), { id });
    return projectLinkProposal(updated);
  }

  /**
   * Create a proposal unless a declined (or pending) record already exists
   * for the same equivalence hash. For proposer `ties`, also collapse by pair.
   */
  async function createProposal(input) {
    const validated = validateLinkProposalCreateInput(input);

    if (validated.proposer === 'ties') {
      const pairKey =
        validated.proposed_link.metadata?.tie_pair_key ??
        (validated.proposed_link.source_ref < validated.proposed_link.target_ref
          ? `${validated.proposed_link.source_ref}|${validated.proposed_link.target_ref}`
          : `${validated.proposed_link.target_ref}|${validated.proposed_link.source_ref}`);
      const existingPair = await findPendingTiesForPair(pairKey);
      if (existingPair) {
        const updated = await updatePendingProposal(existingPair.id, {
          reason: validated.reason,
          sources: validated.sources,
          proposed_link: validated.proposed_link
        });
        return { proposal: updated, created: false, skipped: 'pending', updated: true };
      }
    }

    const existingPointer = await getJSON(store, linkProposalByHashKey(validated.equivalence_hash));
    if (existingPointer?.id) {
      const existing = parseLinkProposalRecord(await getJSON(store, linkProposalKey(existingPointer.id)));
      if (existing) {
        if (existing.status === 'declined') {
          return { proposal: projectLinkProposal(existing), created: false, skipped: 'declined' };
        }
        if (existing.status === 'pending' || existing.status === 'accepted') {
          return { proposal: projectLinkProposal(existing), created: false, skipped: existing.status };
        }
      }
    }

    const timestamp = now();
    const id = generateId();
    if (!isValidLinkProposalId(id)) {
      throw validationError('invalid_link_proposal_id', 'Generated proposal id is invalid.');
    }

    const record = {
      schema_version: LINK_PROPOSAL_SCHEMA_VERSION,
      id,
      proposed_link: validated.proposed_link,
      reason: validated.reason,
      sources: validated.sources,
      proposer: validated.proposer,
      status: 'pending',
      equivalence_hash: validated.equivalence_hash,
      person_ref: validated.person_ref,
      created_at: timestamp,
      updated_at: timestamp,
      resolved_at: null,
      resolved_link_id: null
    };

    await setJSON(store, linkProposalKey(id), record);
    await setJSON(store, linkProposalByPersonKey(validated.person_ref, id), { id });
    await setJSON(store, linkProposalByHashKey(validated.equivalence_hash), { id });

    return { proposal: projectLinkProposal(record), created: true };
  }

  async function setStatus(id, status, { resolved_link_id = null } = {}) {
    if (!isValidLinkProposalId(id)) throw validationError('invalid_link_proposal_id', 'Invalid proposal id.');
    if (status !== 'accepted' && status !== 'declined') {
      throw validationError('invalid_status', 'status must be accepted or declined.');
    }
    const record = parseLinkProposalRecord(await getJSON(store, linkProposalKey(id)));
    if (!record) throw notFound('Link proposal not found.');
    if (record.status !== 'pending') {
      throw validationError('proposal_not_pending', `Proposal is already ${record.status}.`);
    }
    const timestamp = now();
    const updated = {
      ...record,
      status,
      updated_at: timestamp,
      resolved_at: timestamp,
      resolved_link_id: status === 'accepted' ? resolved_link_id : null
    };
    await setJSON(store, linkProposalKey(id), updated);
    await setJSON(store, linkProposalByHashKey(record.equivalence_hash), { id });
    return projectLinkProposal(updated);
  }

  return {
    listForPerson,
    listPendingByProposer,
    findPendingTiesForPair,
    getById,
    createProposal,
    updatePendingProposal,
    setStatus
  };
}
