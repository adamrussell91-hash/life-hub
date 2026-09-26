import { createHash, randomUUID } from 'node:crypto';
import { parseEntityRef } from './entity-ref.mjs';
import { equivalenceInput, generateLinkId } from './universal-link-schema.mjs';
import { validateRelationshipInput } from './relationship-registry.mjs';

/**
 * People redesign Phase 2 — link proposals Adam confirms before they become
 * Universal Links. One Blob per proposal.
 */

export const LINK_PROPOSAL_SCHEMA_VERSION = 1;

export const LINK_PROPOSAL_PROPOSERS = new Set(['rules', 'clare', 'ann']);
export const LINK_PROPOSAL_STATUSES = new Set(['pending', 'accepted', 'declined']);

const PROPOSAL_ID_PATTERN = /^linkprop_[0-9a-f-]{36}$/;

export function generateLinkProposalId() {
  return `linkprop_${randomUUID()}`;
}

export function isValidLinkProposalId(id) {
  return typeof id === 'string' && PROPOSAL_ID_PATTERN.test(id);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !value) return false;
  return Number.isFinite(Date.parse(value));
}

/**
 * Deterministic hash of the proposed link equivalence — declined proposals
 * with the same hash are never re-proposed.
 */
export function proposalEquivalenceHash(proposedLink) {
  const eq = equivalenceInput({
    sourceRef: proposedLink.source_ref,
    targetRef: proposedLink.target_ref,
    relationshipType: proposedLink.relationship_type,
    contextKey: proposedLink.context_key ?? null,
    contextRef: proposedLink.context_ref ?? null,
    role: proposedLink.role ?? null,
    validFrom: proposedLink.valid_from ?? null,
    occurredAt: proposedLink.occurred_at ?? null
  });
  return createHash('sha256').update(JSON.stringify(eq)).digest('hex');
}

/** Link id that would be created if this proposal is accepted. */
export function proposedLinkId(proposedLink) {
  return generateLinkId(
    equivalenceInput({
      sourceRef: proposedLink.source_ref,
      targetRef: proposedLink.target_ref,
      relationshipType: proposedLink.relationship_type,
      contextKey: proposedLink.context_key ?? null,
      contextRef: proposedLink.context_ref ?? null,
      role: proposedLink.role ?? null,
      validFrom: proposedLink.valid_from ?? null,
      occurredAt: proposedLink.occurred_at ?? null
    })
  );
}

export function validateProposedLinkInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationError('invalid_proposed_link', 'proposed_link must be an object.');
  }
  const sourceRef = parseEntityRef(raw.source_ref);
  const targetRef = parseEntityRef(raw.target_ref);
  if (!sourceRef || !targetRef) {
    throw validationError('invalid_proposed_link', 'proposed_link needs valid source_ref and target_ref.');
  }
  const role = raw.role === undefined ? null : raw.role;
  validateRelationshipInput({
    sourceRef,
    targetRef,
    relationshipType: raw.relationship_type,
    role,
    validFrom: raw.valid_from ?? null,
    validTo: null,
    occurredAt: raw.occurred_at ?? null,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    visibility: 'operator'
  });
  return {
    source_ref: String(raw.source_ref).trim(),
    target_ref: String(raw.target_ref).trim(),
    relationship_type: raw.relationship_type,
    role,
    context_key: raw.context_key ?? null,
    context_ref: raw.context_ref ?? null,
    valid_from: raw.valid_from ?? null,
    occurred_at: raw.occurred_at ?? null,
    metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata) ? raw.metadata : {}
  };
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

const STORED_KEYS = new Set([
  'schema_version',
  'id',
  'proposed_link',
  'reason',
  'sources',
  'proposer',
  'status',
  'equivalence_hash',
  'person_ref',
  'created_at',
  'updated_at',
  'resolved_at',
  'resolved_link_id'
]);

export function parseLinkProposalRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) {
    if (!STORED_KEYS.has(key)) return null;
  }
  if (raw.schema_version !== LINK_PROPOSAL_SCHEMA_VERSION) return null;
  if (!isValidLinkProposalId(raw.id)) return null;
  if (typeof raw.reason !== 'string' || !raw.reason.trim()) return null;
  if (!LINK_PROPOSAL_PROPOSERS.has(raw.proposer)) return null;
  if (!LINK_PROPOSAL_STATUSES.has(raw.status)) return null;
  if (typeof raw.equivalence_hash !== 'string' || raw.equivalence_hash.length < 16) return null;
  if (typeof raw.person_ref !== 'string' || !parseEntityRef(raw.person_ref)) return null;
  if (!isIsoTimestamp(raw.created_at) || !isIsoTimestamp(raw.updated_at)) return null;
  if (raw.resolved_at !== null && raw.resolved_at !== undefined && !isIsoTimestamp(raw.resolved_at)) return null;
  if (
    raw.resolved_link_id !== null &&
    raw.resolved_link_id !== undefined &&
    typeof raw.resolved_link_id !== 'string'
  ) {
    return null;
  }
  try {
    validateProposedLinkInput(raw.proposed_link);
  } catch {
    return null;
  }
  return { ...raw, sources: parseSources(raw.sources) };
}

export function validateLinkProposalCreateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'Link proposal creation requires a body object.');
  }
  const proposed_link = validateProposedLinkInput(input.proposed_link);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) throw validationError('invalid_reason', 'reason must be a non-empty string.');
  if (reason.length > 500) throw validationError('reason_too_long', 'reason must be at most 500 characters.');
  if (!LINK_PROPOSAL_PROPOSERS.has(input.proposer)) {
    throw validationError('invalid_proposer', 'proposer must be rules, clare, or ann.');
  }
  const person_ref = typeof input.person_ref === 'string' ? input.person_ref.trim() : '';
  if (!parseEntityRef(person_ref)) {
    throw validationError('invalid_person_ref', 'person_ref must be a shared:person reference.');
  }
  return {
    proposed_link,
    reason,
    sources: parseSources(input.sources),
    proposer: input.proposer,
    person_ref,
    equivalence_hash: proposalEquivalenceHash(proposed_link)
  };
}

export function projectLinkProposal(record) {
  if (!record) return null;
  const link = record.proposed_link;
  const role = link.role;
  const type = link.relationship_type;
  let chip_label = record.reason;
  if (type === 'professional_relationship' && role === 'mentee') {
    chip_label = `Mentee? · ${record.reason}`;
  } else if (type === 'professional_relationship' && role === 'mentor') {
    chip_label = `Mentor? · ${record.reason}`;
  } else if (type === 'professional_relationship' && role === 'colleague') {
    chip_label = `Colleague? · ${record.reason}`;
  } else if (type === 'contact') {
    chip_label = `Task contact? · ${record.reason}`;
  } else if (type === 'collaborator') {
    chip_label = `Collaborator? · ${record.reason}`;
  } else if (type === 'attendee') {
    chip_label = `Attendee? · ${record.reason}`;
  }
  return {
    id: record.id,
    proposed_link: record.proposed_link,
    reason: record.reason,
    chip_label,
    sources: record.sources,
    proposer: record.proposer,
    status: record.status,
    equivalence_hash: record.equivalence_hash,
    person_ref: record.person_ref,
    created_at: record.created_at,
    updated_at: record.updated_at,
    resolved_at: record.resolved_at ?? null,
    resolved_link_id: record.resolved_link_id ?? null
  };
}
