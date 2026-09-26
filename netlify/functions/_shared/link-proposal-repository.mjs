import {
  generateLinkProposalId,
  isValidLinkProposalId,
  LINK_PROPOSAL_SCHEMA_VERSION,
  parseLinkProposalRecord,
  projectLinkProposal,
  validateLinkProposalCreateInput
} from './link-proposal-schema.mjs';
import {
  getJSON,
  linkProposalByPersonKey,
  linkProposalByHashKey,
  linkProposalKey,
  listLinkProposalKeysForPerson,
  setJSON
} from './professional-blobs.mjs';

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404, code: 'link_proposal_not_found' });
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

  async function getById(id) {
    if (!isValidLinkProposalId(id)) throw validationError('invalid_link_proposal_id', 'Invalid proposal id.');
    const record = parseLinkProposalRecord(await getJSON(store, linkProposalKey(id)));
    if (!record) throw notFound('Link proposal not found.');
    return projectLinkProposal(record);
  }

  /**
   * Create a proposal unless a declined (or pending) record already exists
   * for the same equivalence hash.
   */
  async function createProposal(input) {
    const validated = validateLinkProposalCreateInput(input);
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
    // Keep hash pointer so declined never re-proposes; accepted also blocks duplicates.
    await setJSON(store, linkProposalByHashKey(record.equivalence_hash), { id });
    return projectLinkProposal(updated);
  }

  return {
    listForPerson,
    getById,
    createProposal,
    setStatus
  };
}
