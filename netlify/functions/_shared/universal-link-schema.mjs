import { createHash } from 'node:crypto';
import { formatEntityRef, parseEntityRef } from './entity-ref.mjs';

export const UNIVERSAL_LINK_SCHEMA_VERSION = 1;
export const LINK_STATUSES = new Set(['current', 'ended', 'suppressed', 'deleted']);
export const LINK_VISIBILITIES = new Set(['operator', 'teaching_protected']);

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function normalizeForHash(value) {
  return value === undefined ? null : value;
}

// Deterministic equivalence hash. Only the fields that define "the same
// relationship" participate — never valid_to, status, display labels, or
// audit timestamps (implementation programme, "Universal Link record").
// Object keys are sorted and every null-ish value normalized to `null`
// before hashing so an equivalent create always resolves to the same id.
export function computeLinkEquivalenceHash({
  sourceRef,
  targetRef,
  relationshipType,
  contextKey = null,
  contextRef = null,
  role = null,
  validFrom = null,
  occurredAt = null
}) {
  const payload = {
    context_key: normalizeForHash(contextKey),
    context_ref: normalizeForHash(contextRef),
    occurred_at: normalizeForHash(occurredAt),
    relationship_type: normalizeForHash(relationshipType),
    role: normalizeForHash(role),
    source_ref: normalizeForHash(sourceRef),
    target_ref: normalizeForHash(targetRef),
    valid_from: normalizeForHash(validFrom)
  };
  const normalized = {};
  for (const key of Object.keys(payload).sort()) normalized[key] = payload[key];
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function linkIdFromEquivalenceHash(hash) {
  return `ul_${hash}`;
}

// Builds a fresh, `status: 'current'` Universal Link record. Callers pass
// the relationship declaration resolved by `relationship-registry.mjs` so
// `temporal_mode` always matches the registry rather than being asserted
// by the caller.
export function buildUniversalLinkRecord({
  sourceRef,
  targetRef,
  relationshipType,
  declaration,
  role = null,
  contextKey = null,
  contextRef = null,
  validFrom = null,
  validTo = null,
  occurredAt = null,
  visibility = 'operator',
  metadata = {},
  now = () => new Date().toISOString()
}) {
  const sourceRefString = typeof sourceRef === 'string' ? sourceRef : formatEntityRef(sourceRef);
  const targetRefString = typeof targetRef === 'string' ? targetRef : formatEntityRef(targetRef);
  if (!sourceRefString) throw validationError('invalid_source_ref', 'source_ref could not be formatted');
  if (!targetRefString) throw validationError('invalid_target_ref', 'target_ref could not be formatted');
  if (!LINK_VISIBILITIES.has(visibility)) throw validationError('invalid_visibility', `Unknown visibility ${visibility}`);

  const hash = computeLinkEquivalenceHash({
    sourceRef: sourceRefString,
    targetRef: targetRefString,
    relationshipType,
    contextKey,
    contextRef,
    role,
    validFrom,
    occurredAt
  });
  const timestamp = now();

  return {
    schema_version: UNIVERSAL_LINK_SCHEMA_VERSION,
    id: linkIdFromEquivalenceHash(hash),
    source_ref: sourceRefString,
    target_ref: targetRefString,
    relationship_type: relationshipType,
    role,
    context_key: contextKey,
    context_ref: contextRef,
    temporal_mode: declaration?.temporal_mode ?? null,
    valid_from: validFrom,
    valid_to: validTo,
    occurred_at: occurredAt,
    status: 'current',
    visibility,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    created_at: timestamp,
    updated_at: timestamp
  };
}

// Structural shape check only — does not re-validate against the
// relationship registry (that happens at write time, Slice 2).
export function isValidLinkRecordShape(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.schema_version !== UNIVERSAL_LINK_SCHEMA_VERSION) return false;
  if (typeof record.id !== 'string' || !record.id.startsWith('ul_')) return false;
  if (!parseEntityRef(record.source_ref)) return false;
  if (!parseEntityRef(record.target_ref)) return false;
  if (typeof record.relationship_type !== 'string' || !record.relationship_type) return false;
  if (!LINK_STATUSES.has(record.status)) return false;
  if (!LINK_VISIBILITIES.has(record.visibility)) return false;
  if (!record.metadata || typeof record.metadata !== 'object' || Array.isArray(record.metadata)) return false;
  return true;
}
