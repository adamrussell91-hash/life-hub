import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { isValidOperationId } from './_shared/universal-link-schema.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createIdentityRepository } from './_shared/identity-repository.mjs';

export const config = { path: '/api/entities/admin' };

// The minimal production repair path for identity operations (Job 3 of the
// PR #313 correction comment). `identity-repository.mjs`'s
// `repairIdentityOperation`/`reconcileSelfIdentity` existed before this
// route as repository-level capabilities only, exercised by unit tests —
// there was no production handler a caller could actually use to repair a
// failed create (a client receiving `503 identity_write_incomplete` had an
// `operation_id` and no API that would accept it). This route is that
// path, and nothing else: it follows the exact same pattern
// `universal-links-admin.mjs` already established for Universal Link
// operations, on the same operator/origin/administration-context gate —
// this is not a general identity API, only a narrow repair surface.
//
// Request contract:
//   POST /api/entities/admin
//   Body: { "action": "repair_operation", "operation_id": "op_<32 hex>" }
//     -> 200 { ok: true, data: { operation_id, entity_id, status: "committed", repaired, ref? } }
//     -> 400 invalid_operation_id      (malformed operation_id, never reaches storage)
//     -> 404 operation_not_found       (well-formed but unknown, or a corrupted journal record)
//     -> 409 identity_operation_superseded / self_identity_exists
//                                      (a later, independent change has moved the entity or the
//                                       active-self slot on since this operation was prepared;
//                                       never silently replayed over it)
//     -> 503 identity_write_incomplete (a transient storage failure during replay; retryable)
//   Body: { "action": "reconcile_self_identity" }
//     -> 200 { ok: true, data: { status: "consistent" | "reconciled" | "conflict", person_id?, person_ids?, ... } }
//   Every other action, or a body containing any of `actor`/`workflow`/
//   `allowed_visibility`/`allowed_entity_kinds`, is rejected with 400
//   before any repository call.
//
// Every response carries `cache-control: no-store` (via `_shared/http.mjs`'s
// `jsonResponse`). Authentication (a valid operator session cookie),
// allowed-origin enforcement, and the server-derived `workflow:
// 'administration'` access context all come from the same
// `createOperatorHandler` gate `universal-links-admin.mjs`/`entities.mjs`
// use — a caller can never supply their own workflow or actor, and an
// unauthenticated or wrong-origin request never reaches the repository at
// all. This route adds no UI and is never called from an ordinary Life
// workflow — only from this explicit administration action.
const ACTIONS = new Set(['repair_operation', 'reconcile_self_identity']);
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

// Same non-disclosing error mapping `entities.mjs`/`universal-links-admin.mjs`
// use — never returns a journal payload or a resolved entity's identifying
// fields, only the safe identifiers a thrown error already carries.
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

export function createEntitiesAdminHandler(deps = {}) {
  const identityNow = deps.identityNow ?? (() => new Date().toISOString());
  const createRepository = deps.createIdentityRepository ?? createIdentityRepository;

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;

    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const repo = createRepository({ store, now: identityNow });

    try {
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      assertNoAccessFields(parsed.value);

      const action = parsed.value.action;
      if (!ACTIONS.has(action)) {
        return withCors(
          errorResponse(400, 'invalid_action', 'action must be one of repair_operation, reconcile_self_identity.', false),
          request,
          env
        );
      }

      if (action === 'repair_operation') {
        const operationId = parsed.value.operation_id;
        // Validate operation IDs before storage access — a malformed id
        // never reaches a Blob key.
        if (!isValidOperationId(operationId)) {
          return withCors(
            errorResponse(400, 'invalid_operation_id', 'operation_id must be a valid operation id.', false),
            request,
            env
          );
        }
        const result = await repo.repairIdentityOperation(operationId);
        return withCors(okResponse(200, result), request, env);
      }

      const result = await repo.reconcileSelfIdentity();
      return withCors(okResponse(200, result), request, env);
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

export default createEntitiesAdminHandler();
