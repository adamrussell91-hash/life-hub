import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createOrgStructureRepository } from './_shared/org-structure.mjs';
import { createPersonRolesService } from './_shared/person-roles.mjs';

export const config = { path: '/api/people/roles' };

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];
const ACTIONS = new Set(['add', 'edit', 'end', 'remove']);

/**
 * A person's roles and education (People page roles editor). Body:
 *   { action: 'add', person_ref, organisation_ref, relationship_type, role?, valid_from?, valid_to? }
 *   { action: 'edit', person_ref, link_id, role?, valid_from?, valid_to? }
 *   { action: 'end', person_ref, link_id, valid_to? }
 *   { action: 'remove', person_ref, link_id }
 */
export function createPeopleRolesHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'POST') {
        return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      }
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      for (const key of FORBIDDEN_ACCESS_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(parsed.value, key)) {
          return withCors(
            errorResponse(400, 'access_field_not_accepted', `Field "${key}" is not accepted in this request.`, false),
            request,
            env
          );
        }
      }
      const action = parsed.value.action;
      if (!ACTIONS.has(action)) {
        return withCors(errorResponse(400, 'invalid_action', 'action must be add, edit, end or remove.', false), request, env);
      }
      try {
        const orgStructure = (deps.createOrgStructureRepository ?? createOrgStructureRepository)({
          store,
          resolveEntity: deps.resolveEntity,
          getContentStore: async () => store
        });
        const service = (deps.createPersonRolesService ?? createPersonRolesService)({
          store,
          env,
          fetchImpl: deps.fetchImpl,
          resolveEntity: deps.resolveEntity,
          now: deps.now,
          orgStructure
        });
        const result = await service[action](parsed.value);
        return withCors(okResponse(200, result), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(errorResponse(status, code, message, status === 503), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
    }
  );
}

export default createPeopleRolesHandler();
