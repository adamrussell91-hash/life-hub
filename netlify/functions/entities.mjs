import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { assertRegisteredEntityRef, formatEntityRef } from './_shared/entity-ref.mjs';
import { redactIdentityRecord } from './_shared/identity-schema.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createIdentityRepository } from './_shared/identity-repository.mjs';

export const config = { path: '/api/entities' };

// This API owns Person and Organisation directly — unlike
// `entity-resolvers.mjs`'s generic `resolveEntity` (used by *other* domains
// to safely reference an entity), a lookup here already names an exact ref
// the caller manages, so archived/deleted/deidentified records are visible
// here regardless of the resolver's "hidden from ordinary suggestions"
// default (implementation programme, resolver rule 4: archived entities
// resolve "for deliberate overview and archive workflows" — this handler
// is exactly that).
//
// This handler validates the request shape and dispatches to
// `identity-repository.mjs`, the canonical identity write service —
// it does not coordinate the entity/index/event/self-pointer writes
// itself (correction B4).
const SUPPORTED_KINDS = new Set(['person', 'organisation']);

// Lifecycle actions map to the target `lifecycle_status`; `update` is the
// one non-lifecycle action, changing ordinary fields only.
const LIFECYCLE_ACTIONS = {
  activate: 'active',
  deactivate: 'inactive',
  archive: 'archived',
  retain: 'retained',
  deidentify: 'deidentified',
  delete: 'deleted'
};

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];

function assertNoAccessFields(value) {
  for (const key of FORBIDDEN_ACCESS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw Object.assign(new Error(`Field "${key}" is not accepted in this request.`), {
        status: 400,
        code: 'access_field_not_accepted'
      });
    }
  }
}

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  const data = (error?.operation_id || error?.entity_id)
    ? { operation_id: error.operation_id ?? null, entity_id: error.entity_id ?? null }
    : undefined;
  return errorResponse(status, code, message, retryable, {}, data);
}

// The safe projection this API returns — the redacted record plus its
// canonical ref. `redactIdentityRecord` already hides display_name/
// sort_name/legal_name/aliases for a deleted or deidentified record.
function projectEntity(kind, record) {
  return { ref: formatEntityRef({ namespace: 'shared', kind, id: record.id }), ...redactIdentityRecord(record) };
}

function readRef(url) {
  const raw = url.searchParams.get('ref');
  if (!raw) {
    throw Object.assign(new Error('ref query param required.'), { status: 400, code: 'missing_ref' });
  }
  const ref = assertRegisteredEntityRef(raw);
  if (!SUPPORTED_KINDS.has(ref.kind)) {
    throw Object.assign(new Error(`This API does not manage kind "${ref.kind}".`), {
      status: 400,
      code: 'unsupported_entity_kind'
    });
  }
  return ref;
}

export function createEntitiesHandler(deps = {}) {
  // A separate injectable clock from operator-gate's own `deps.now` (which
  // times out session verification) — this one stamps created_at/updated_at
  // and lifecycle event timestamps, and needs to be independently
  // deterministic for tests.
  const identityNow = deps.identityNow ?? (() => new Date().toISOString());
  const createRepository = deps.createIdentityRepository ?? createIdentityRepository;

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const url = new URL(request.url);
    const repo = createRepository({ store, now: identityNow });

    try {
      if (request.method === 'GET') {
        const ref = readRef(url);
        const record = await repo.loadEntity(ref);
        return withCors(okResponse(200, projectEntity(ref.kind, record)), request, env);
      }

      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);
        const kind = parsed.value.kind;
        if (!SUPPORTED_KINDS.has(kind)) {
          return withCors(errorResponse(400, 'unsupported_entity_kind', 'kind must be "person" or "organisation".', false), request, env);
        }

        const { record } = await repo.createIdentity({ kind, input: parsed.value });
        return withCors(okResponse(201, projectEntity(kind, record)), request, env);
      }

      if (request.method === 'PATCH') {
        const ref = readRef(url);
        const action = url.searchParams.get('action') ?? 'update';
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        assertNoAccessFields(parsed.value);

        if (action === 'update') {
          const updated = await repo.updateFields({ ref, patch: parsed.value });
          return withCors(okResponse(200, projectEntity(ref.kind, updated)), request, env);
        }

        const toStatus = LIFECYCLE_ACTIONS[action];
        if (!toStatus) {
          return withCors(errorResponse(400, 'invalid_action', 'Unsupported action.', false), request, env);
        }

        const updated = await repo.transitionLifecycle({
          ref,
          toStatus,
          retentionReason: parsed.value.retention_reason,
          retentionReviewAt: parsed.value.retention_review_at
        });
        return withCors(okResponse(200, projectEntity(ref.kind, updated)), request, env);
      }

      // No hard delete in this slice — DELETE is not exposed.
      return withCors(methodNotAllowed('GET, POST, PATCH, OPTIONS'), request, env);
    } catch (error) {
      return withCors(toErrorResponse(error), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
  });
}

export default createEntitiesHandler();
