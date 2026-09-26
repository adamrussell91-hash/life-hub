import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { loadAllPeopleWithRelationships } from './_shared/people-collection.mjs';
import { assemblePeopleDirectory } from './_shared/people-directory.mjs';

export const config = { path: '/api/people/directory' };

export function createPeopleDirectoryHandler(deps = {}) {
  const loadPeople = deps.loadAllPeopleWithRelationships ?? loadAllPeopleWithRelationships;
  const assemble = deps.assemblePeopleDirectory ?? assemblePeopleDirectory;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }
      try {
        const nowValue = now();
        const peopleWithRelationships = await loadPeople({
          store,
          now: nowValue,
          resolveEntity: deps.resolveEntity,
          createRepository: deps.createRepository,
          env,
          fetchImpl: deps.fetchImpl
        });
        const data = assemble(peopleWithRelationships, { now: nowValue });
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

export default createPeopleDirectoryHandler();
