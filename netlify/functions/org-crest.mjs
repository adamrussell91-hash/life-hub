import { knowledgePresignGet } from './_shared/knowledge-r2.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';
import { createIdentityRepository } from './_shared/identity-repository.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';

export const config = { path: '/api/organisations/crest' };

export function createOrgCrestHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }
      const url = new URL(request.url);
      const refRaw = url.searchParams.get('ref') ?? '';
      const parsed = parseEntityRef(refRaw);
      if (!parsed || parsed.namespace !== 'shared' || parsed.kind !== 'organisation') {
        return withCors(
          errorResponse(400, 'validation_error', 'ref must be a shared:organisation ref', false),
          request,
          env
        );
      }
      const repo = (deps.createIdentityRepository ?? createIdentityRepository)({ store });
      let record;
      try {
        record = await repo.loadEntity({ kind: 'organisation', id: parsed.id });
      } catch (error) {
        if (error?.code === 'entity_not_found') {
          return withCors(errorResponse(404, 'not_found', 'Organisation not found', false), request, env);
        }
        throw error;
      }
      if (!record.logo_key) {
        return withCors(okResponse(200, { url: null, logo_key: null }), request, env);
      }
      try {
        const urlSigned = await knowledgePresignGet(env, {
          key: record.logo_key,
          signGet: deps.signGet
        });
        return withCors(
          okResponse(200, { url: urlSigned, logo_key: record.logo_key }),
          request,
          env
        );
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 502;
        return withCors(
          errorResponse(
            status,
            error?.code ?? 'knowledge_r2_unbound',
            status === 503 ? 'Crest storage is not configured' : 'Crest resolve failed',
            status >= 500
          ),
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

export default createOrgCrestHandler();
