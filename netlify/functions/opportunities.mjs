import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createOpportunityRepository } from './_shared/opportunity-repository.mjs';
import { isValidOpportunityId } from './_shared/opportunity-schema.mjs';
import { createApplicationRepository } from './_shared/application-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { resolveEntity as defaultResolveEntity } from './_shared/entity-resolvers.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/opportunities' };

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
  return errorResponse(status, code, message, retryable);
}

function readOpportunityId(url) {
  const id = url.searchParams.get('id');
  if (!id || !isValidOpportunityId(id)) {
    throw Object.assign(new Error('id query param required.'), {
      status: 400,
      code: 'missing_id'
    });
  }
  return id;
}

export function createOpportunitiesHandler(deps = {}) {
  const opportunityNow = deps.now ?? (() => new Date().toISOString());
  const createRepository = deps.createOpportunityRepository ?? createOpportunityRepository;
  const createAppRepo = deps.createApplicationRepository ?? createApplicationRepository;
  const baseResolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);

      const resolveEntity = baseResolveEntity;

      const repo = createRepository({
        store,
        now: opportunityNow,
        generateId: deps.generateId,
        createApplication: async (input) => {
          const appRepo = createAppRepo({
            store,
            now: opportunityNow,
            resolveEntity,
            getUniversalLinkStore,
            createUniversalLinkRepository: deps.createUniversalLinkRepository
          });
          return appRepo.createApplication(input);
        }
      });

      try {
        if (request.method === 'GET') {
          if (url.searchParams.has('id')) {
            const id = readOpportunityId(url);
            const opportunity = await repo.getOpportunity(id);
            return withCors(okResponse(200, { opportunity }), request, env);
          }
          const organisationRef = url.searchParams.get('organisation_ref');
          if (organisationRef && !parseEntityRef(organisationRef)) {
            return withCors(
              errorResponse(400, 'invalid_organisation_ref', 'organisation_ref is not valid.', false),
              request,
              env
            );
          }
          const status = url.searchParams.get('status');
          const opportunities = await repo.listOpportunities({
            organisationRef: organisationRef || null,
            status: status || null
          });
          return withCors(okResponse(200, { opportunities }), request, env);
        }

        if (request.method === 'POST') {
          const action = url.searchParams.get('action');
          if (action === 'add_to_applications') {
            const id = readOpportunityId(url);
            const result = await repo.addToApplications(id);
            return withCors(okResponse(200, result), request, env);
          }
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value ?? {});
          const result = await repo.createOpportunity(parsed.value);
          return withCors(okResponse(201, result), request, env);
        }

        if (request.method === 'PATCH') {
          const id = readOpportunityId(url);
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value ?? {});
          const action = url.searchParams.get('action');
          if (action === 'dismiss' || parsed.value?.status === 'dismissed') {
            const opportunity = await repo.dismissOpportunity(id);
            return withCors(okResponse(200, { opportunity }), request, env);
          }
          const opportunity = await repo.patchOpportunity(id, parsed.value);
          return withCors(okResponse(200, { opportunity }), request, env);
        }

        return withCors(methodNotAllowed('GET, POST, PATCH, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createOpportunitiesHandler();
