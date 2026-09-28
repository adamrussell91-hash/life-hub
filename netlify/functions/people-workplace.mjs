import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createOrgStructureRepository } from './_shared/org-structure.mjs';
import { createPersonWorkplaceService } from './_shared/person-workplace.mjs';

export const config = { path: '/api/people/workplace' };

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];

/**
 * Set a person's organisation and job title in one call — the profile form
 * and the inline "Job title" editor use this, and the organisation's chart
 * follows (profile → chart). Body:
 *   { person_ref, organisation_ref | null, job_title | null,
 *     replace_organisation_ref?, relationship_type? }
 */
export function createPeopleWorkplaceHandler(deps = {}) {
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
      try {
        const service = (deps.createPersonWorkplaceService ?? createPersonWorkplaceService)({
          store,
          env,
          fetchImpl: deps.fetchImpl,
          resolveEntity: deps.resolveEntity,
          now: deps.now
        });
        const orgStructure = (deps.createOrgStructureRepository ?? createOrgStructureRepository)({
          store,
          resolveEntity: deps.resolveEntity,
          getContentStore: async () => store
        });
        const result = await service.setPersonWorkplace(parsed.value, { orgStructure });
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

export default createPeopleWorkplaceHandler();
