import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { isValidOperationId } from './_shared/universal-link-schema.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';

export const config = { path: '/api/universal-links/admin' };

const ACTIONS = new Set(['repair_operation', 'rebuild_indexes', 'dry_run_rebuild']);
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

// Same non-disclosing error mapping as `universal-links.mjs` — see that
// file's `toErrorResponse` for the safety rationale. Never returns a
// journal payload or resolved endpoint data; only the safe identifiers a
// thrown error already carries.
function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  const data = (error?.operation_id || error?.link_id)
    ? { operation_id: error.operation_id ?? null, link_id: error.link_id ?? null }
    : undefined;
  return errorResponse(status, code, message, retryable, {}, data);
}

// The administration API is POST only, and every action it supports
// requires the administration workflow (implementation programme:
// "Require an administration workflow context for every action").
export function createUniversalLinksAdminHandler(deps = {}) {
  const resolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const createRepository = deps.createRepository ?? createUniversalLinkRepository;
  const now = deps.repositoryNow;
  const generateOperationId = deps.generateOperationId;

  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;

    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    }

    const repo = createRepository({
      store,
      resolveEntity,
      ...(now ? { now } : {}),
      ...(generateOperationId ? { generateOperationId } : {})
    });

    try {
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      assertNoAccessFields(parsed.value);

      const action = parsed.value.action;
      if (!ACTIONS.has(action)) {
        return withCors(
          errorResponse(400, 'invalid_action', 'action must be one of repair_operation, rebuild_indexes, dry_run_rebuild.', false),
          request,
          env
        );
      }

      const accessContext = createAccessContext({ workflow: 'administration' });

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
        const result = await repo.repairOperation(operationId, accessContext);
        return withCors(okResponse(200, result), request, env);
      }

      const dryRun = action === 'dry_run_rebuild';
      const result = await repo.rebuildIndexes(accessContext, { dryRun });
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

export default createUniversalLinksAdminHandler();
