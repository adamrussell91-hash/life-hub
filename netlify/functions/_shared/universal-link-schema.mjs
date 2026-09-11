import { parseEntityRef } from './entity-ref.mjs';
import { validateRelationshipInput } from './relationship-registry.mjs';

export const UNIVERSAL_LINK_SCHEMA_VERSION = 1;
export const LINK_STATUSES = new Set(['current', 'ended', 'suppressed', 'deleted']);
export const LINK_VISIBILITIES = new Set(['operator', 'teaching_protected']);

// This slice validates existing records only. It does not generate ids or
// timestamps — deterministic id generation is a Slice 2 write-path
// concern (implementation programme, "Slice 1 exact file contract").

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

// Structural parse only — a type guard, not a business-rule check. Returns
// a shallow-copied, normalized record or null when the shape is not a
// plausible Universal Link at all (used to drop malformed/corrupted
// records during reads without throwing).
export function parseUniversalLink(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== UNIVERSAL_LINK_SCHEMA_VERSION) return null;
  if (typeof raw.id !== 'string' || !raw.id.startsWith('ul_')) return null;
  if (!parseEntityRef(raw.source_ref) || !parseEntityRef(raw.target_ref)) return null;
  if (typeof raw.relationship_type !== 'string' || !raw.relationship_type) return null;
  if (!isNullableString(raw.role)) return null;
  if (!isNullableString(raw.context_key)) return null;
  if (!isNullableString(raw.context_ref)) return null;
  if (typeof raw.temporal_mode !== 'string' || !raw.temporal_mode) return null;
  if (!isNullableString(raw.valid_from)) return null;
  if (!isNullableString(raw.valid_to)) return null;
  if (!isNullableString(raw.occurred_at)) return null;
  if (!LINK_STATUSES.has(raw.status)) return null;
  if (!LINK_VISIBILITIES.has(raw.visibility)) return null;
  if (!raw.metadata || typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) return null;
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  return { ...raw };
}

// Full validation: structural shape, then the relationship registry's
// source/target/temporal/role/metadata/visibility rules (reusing
// `validateRelationshipInput` so a stored record is checked against
// exactly the same rules a write would be — implementation programme,
// "Validate each loaded link against the complete schema and current
// registry declaration"). Throws on any violation; never silently repairs.
export function validateUniversalLinkRecord(raw) {
  const parsed = parseUniversalLink(raw);
  if (!parsed) {
    throw Object.assign(new Error('Malformed Universal Link record.'), {
      status: 400,
      code: 'invalid_link_record'
    });
  }
  const declaration = validateRelationshipInput({
    sourceRef: parseEntityRef(parsed.source_ref),
    targetRef: parseEntityRef(parsed.target_ref),
    relationshipType: parsed.relationship_type,
    role: parsed.role,
    validFrom: parsed.valid_from,
    validTo: parsed.valid_to,
    occurredAt: parsed.occurred_at,
    metadata: parsed.metadata,
    visibility: parsed.visibility
  });
  if (parsed.temporal_mode !== declaration.temporal_mode) {
    throw Object.assign(new Error(`temporal_mode ${parsed.temporal_mode} does not match the ${declaration.key} declaration.`), {
      status: 400,
      code: 'temporal_mode_mismatch'
    });
  }
  return parsed;
}

// Returns the normalized, sorted-key object that Slice 2's write path will
// hash to derive a link's deterministic id. Pure data shaping only — no
// hashing, no id, no timestamp. Mirrors the registry's `duplicate_fields`.
export function equivalenceInput({
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
    context_key: contextKey,
    context_ref: contextRef,
    occurred_at: occurredAt,
    relationship_type: relationshipType,
    role,
    source_ref: sourceRef,
    target_ref: targetRef,
    valid_from: validFrom
  };
  const normalized = {};
  for (const key of Object.keys(payload).sort()) {
    normalized[key] = payload[key] === undefined ? null : payload[key];
  }
  return normalized;
}
