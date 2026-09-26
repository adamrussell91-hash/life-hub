import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { findActiveSelfPerson } from './_shared/career-overview.mjs';
import { loadAllOrganisationsWithRelationships } from './_shared/organisations-collection.mjs';
import { assembleOrganisationsDirectory } from './_shared/organisations-directory.mjs';

export const config = { path: '/api/organisations/directory' };

export function createOrganisationsDirectoryHandler(deps = {}) {
  const loadOrgs = deps.loadAllOrganisationsWithRelationships ?? loadAllOrganisationsWithRelationships;
  const assemble = deps.assembleOrganisationsDirectory ?? assembleOrganisationsDirectory;
  const findSelf = deps.findActiveSelfPerson ?? findActiveSelfPerson;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }
      try {
        const nowValue = now();
        const [orgsWithRelationships, selfPerson] = await Promise.all([
          loadOrgs({
            store,
            resolveEntity: deps.resolveEntity,
            createRepository: deps.createRepository,
            env,
            fetchImpl: deps.fetchImpl
          }),
          findSelf(store, { env, fetchImpl: deps.fetchImpl })
        ]);
        const data = assemble(orgsWithRelationships, {
          now: nowValue,
          selfPerson
        });
        return withCors(okResponse(200, data), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message =
          typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(
          errorResponse(status, code, message, Boolean(error?.retryable) || status === 503),
          request,
          env
        );
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

export default createOrganisationsDirectoryHandler();
