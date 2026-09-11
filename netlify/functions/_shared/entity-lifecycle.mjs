import { redactIdentityRecord } from './identity-schema.mjs';

// Entity lifecycle transitions (implementation programme, "Lifecycle
// services"). Independent of Universal Link relationship lifecycle
// (`universal-link-repository.mjs`'s endLink/suppressLink/deleteLink) —
// archiving or deleting a Person never alters a historical Universal
// Link's own dates or status; nothing here touches that store.
//
// Organisation's enum omits `deidentified` (see identity-schema.mjs) —
// deidentification replaces a *person's* identifying labels with a
// tombstone, which is not a meaningful operation for an institutional
// name. This is a resolved decision, not a gap: an Organisation transition
// graph with no deidentified state, distinct from Person's.

export const PERSON_TRANSITIONS = Object.freeze({
  active: new Set(['inactive', 'archived', 'retained', 'deidentified']),
  inactive: new Set(['active', 'archived', 'retained', 'deidentified']),
  archived: new Set(['active', 'retained', 'deidentified']),
  retained: new Set(['archived', 'deidentified', 'deleted']),
  deidentified: new Set(['deleted']),
  deleted: new Set()
});

export const ORGANISATION_TRANSITIONS = Object.freeze({
  active: new Set(['inactive', 'archived', 'retained']),
  inactive: new Set(['active', 'archived', 'retained']),
  archived: new Set(['active', 'retained']),
  retained: new Set(['archived', 'deleted']),
  deleted: new Set()
});

// A self identity "cannot be merged, archived, retained, deidentified or
// deleted through ordinary endpoints" (Person rule 4) — active <-> inactive
// remains permitted.
const SELF_PROTECTED_TARGETS = new Set(['archived', 'retained', 'deidentified', 'deleted']);

function transitionError(code, message) {
  return Object.assign(new Error(message), { status: 409, code });
}

function selfProtectedError() {
  return Object.assign(new Error('The self identity rejects this transition.'), {
    status: 403,
    code: 'self_identity_protected'
  });
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

function getTransitionGraph(kind) {
  return kind === 'person' ? PERSON_TRANSITIONS : ORGANISATION_TRANSITIONS;
}

// Validates a prospective lifecycle transition against the transition
// graph, self-identity protection, and the retained-requires-reason rule.
// Pure — touches no storage, throws on the first violation, otherwise
// returns nothing.
export function assertLifecycleTransitionAllowed({ kind, fromStatus, toStatus, isSelf, retentionReason, retentionReviewAt }) {
  if (isSelf && SELF_PROTECTED_TARGETS.has(toStatus)) {
    throw selfProtectedError();
  }
  const graph = getTransitionGraph(kind);
  const allowed = graph[fromStatus];
  if (!allowed || !allowed.has(toStatus)) {
    throw transitionError(
      'invalid_lifecycle_transition',
      `Cannot transition a ${kind} from ${fromStatus} to ${toStatus}.`
    );
  }
  if (toStatus === 'retained') {
    if (typeof retentionReason !== 'string' || !retentionReason.trim()) {
      throw transitionError('retention_reason_required', 'retained requires a retention_reason.');
    }
    if (!isIsoTimestamp(retentionReviewAt)) {
      throw transitionError('retention_review_at_required', 'retained requires an ISO retention_review_at.');
    }
  }
}

// Returns the updated record for a transition already validated by
// assertLifecycleTransitionAllowed — pure, no storage access. Deleting or
// deidentifying physically redacts the stored record's identifying values
// (implementation programme, lifecycle rule 2: "Deleted removes
// identifying values and preserves only an integrity tombstone where
// required") rather than relying solely on read-time redaction; resolvers
// still redact defensively (identity-schema.mjs's displayLabelFor) as a
// second layer.
export function applyLifecycleTransition({ record, toStatus, retentionReason = null, retentionReviewAt = null, now }) {
  let next = {
    ...record,
    lifecycle_status: toStatus,
    retention_reason: toStatus === 'retained' ? retentionReason : null,
    retention_review_at: toStatus === 'retained' ? retentionReviewAt : null,
    updated_at: now
  };
  if (toStatus === 'deleted' || toStatus === 'deidentified') {
    next = redactIdentityRecord(next);
  }
  return next;
}
