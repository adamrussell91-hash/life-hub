import { createHash, randomBytes } from 'node:crypto';
import { parseEntityRef } from './entity-ref.mjs';
import { validateRelationshipInput } from './relationship-registry.mjs';

export const UNIVERSAL_LINK_SCHEMA_VERSION = 1;
export const LINK_STATUSES = new Set(['current', 'ended', 'suppressed', 'deleted']);
export const LINK_VISIBILITIES = new Set(['operator', 'teaching_protected']);

// A stored link's status a caller may see in an ordinary read, without an
// explicit administrative method. `suppressed` and `deleted` are real,
// valid statuses (see LINK_STATUSES) — they are simply not disclosed
// through ordinary reads. `ended` stays visible: it is queryable history,
// not a hidden state.
export const ORDINARY_READ_STATUSES = new Set(['current', 'ended']);

// The canonical deterministic id form Slice 2 will generate:
// `ul_` followed by exactly 64 lowercase hex characters (a SHA-256 digest).
// Enforced everywhere an id reaches a Blob key — stored records, membership
// records, and getLink input — so a malformed or path-like id can never be
// concatenated into a storage key.
export const LINK_ID_PATTERN = /^ul_[0-9a-f]{64}$/;

export function isValidLinkId(id) {
  return typeof id === 'string' && LINK_ID_PATTERN.test(id);
}

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
  if (!isValidLinkId(raw.id)) return null;
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

// --- Slice 2: deterministic id generation and write validation ---
//
// Everything below this line is new for Slice 2. Slice 1 validated existing
// records only; Slice 2 adds the id/operation-id generation and the
// journal/reason-code shapes the canonical write service
// (`universal-link-repository.mjs`) needs. No handler or domain service may
// derive these independently — only this module computes a link id from an
// equivalence payload, and only `universal-link-repository.mjs` may call it.

// Deterministic link id: `ul_` followed by the SHA-256 hex digest of the
// normalized equivalence object `equivalenceInput` produces above.
// `equivalenceInput` already sorts keys and normalizes `undefined` to
// `null`, so `JSON.stringify` of its output is stable regardless of the
// order fields were supplied in — two equivalent create requests, however
// their caller ordered the object literal, hash to the same id. Only the
// registry's `duplicate_fields` (source_ref, target_ref, relationship_type,
// context_key, context_ref, role, valid_from, occurred_at) ever reach this
// function; `valid_to`, `status`, timestamps, and display labels must never
// be passed in.
export function generateLinkId(equivalence) {
  const serialized = JSON.stringify(equivalence);
  const digest = createHash('sha256').update(serialized).digest('hex');
  return `ul_${digest}`;
}

// Operation ids are server-generated only, never client-supplied, and must
// be path-safe before they are ever concatenated into
// `universal-links/operations/<operation_id>` (enforced at that boundary in
// `universal-link-blobs.mjs`, mirroring how `LINK_ID_PATTERN` guards link
// keys). Fixed length lower-case hex keeps them simple to validate and
// impossible to use for path traversal.
export const OPERATION_ID_PATTERN = /^op_[0-9a-f]{32}$/;

export function isValidOperationId(id) {
  return typeof id === 'string' && OPERATION_ID_PATTERN.test(id);
}

export function generateOperationId() {
  return `op_${randomBytes(16).toString('hex')}`;
}

export const OPERATION_SCHEMA_VERSION = 1;

// Lower-case only (implementation programme, "Use lower case status
// values"). `prepared`: the journal has been written but no create/repair
// step is known to have completed. `repair_needed`: at least one step
// failed after the journal was prepared; `completed_steps` records what
// already succeeded so a repair need not repeat it. `committed`: every
// step for this operation is done.
export const OPERATION_STATUSES = new Set(['prepared', 'repair_needed', 'committed']);

export const OPERATION_TYPES = new Set(['create_link', 'end_link', 'suppress_link', 'delete_link']);

// The idempotent steps a create/repair operation replays. Each name is a
// storage write the repository can safely skip once it observes the target
// key already exists.
export const OPERATION_STEPS = new Set(['link', 'source_membership', 'target_membership', 'type_membership']);

// Structural validation only, mirroring `parseUniversalLink`'s shape: a
// type guard used before ever trusting a loaded journal record, not a
// business-rule check. Returns null (never throws) for anything that is
// not a plausible operation record, so a corrupted journal cannot crash a
// repair attempt — the caller treats null the same as "operation not
// found." `link_payload` is validated separately by the caller via
// `validateUniversalLinkRecord` against the *current* schema and registry,
// since the registry may have changed since the operation was written.
export function validateOperationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema_version !== OPERATION_SCHEMA_VERSION) return null;
  if (!isValidOperationId(raw.operation_id)) return null;
  if (!OPERATION_TYPES.has(raw.operation_type)) return null;
  if (!isValidLinkId(raw.link_id)) return null;
  if (!OPERATION_STATUSES.has(raw.status)) return null;
  if (!Array.isArray(raw.completed_steps) || !raw.completed_steps.every(step => OPERATION_STEPS.has(step))) {
    return null;
  }
  if (typeof raw.created_at !== 'string' || typeof raw.updated_at !== 'string') return null;
  if (raw.last_error_code !== null && typeof raw.last_error_code !== 'string') return null;
  if (!raw.link_payload || typeof raw.link_payload !== 'object' || Array.isArray(raw.link_payload)) return null;
  return { ...raw, completed_steps: [...raw.completed_steps] };
}

// Bounded, machine-safe reason codes for `suppressLink`/`deleteLink`
// (implementation programme: "Store a bounded machine safe reason code. Do
// not store free text containing personal information."). Lower snake_case
// only — the same shape as a relationship key — never free text.
export const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function isValidReasonCode(value) {
  return typeof value === 'string' && REASON_CODE_PATTERN.test(value);
}
