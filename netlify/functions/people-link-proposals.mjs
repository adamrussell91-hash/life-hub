import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createLinkProposalRepository } from './_shared/link-proposal-repository.mjs';
import {
  acceptLinkProposal,
  declineLinkProposal,
  runLinkInferencePass
} from './_shared/link-proposal-service.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';

export const config = { path: '/api/people/link-proposals' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  const retryable = Boolean(error?.retryable) || status === 503;
  return errorResponse(status, code, message, retryable);
}

export function createPeopleLinkProposalsHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { store: universalStore, env } = context;
      const professionalStore =
        deps.professionalStore ??
        (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env).catch(() => null));
      if (!professionalStore) {
        return withCors(
          errorResponse(503, 'professional_blobs_unbound', 'Professional content store is not bound.', true),
          request,
          env
        );
      }

      const url = new URL(request.url);
      const proposalRepo =
        deps.proposalRepo ??
        createLinkProposalRepository({
          store: professionalStore,
          now: deps.now,
          generateId: deps.generateId
        });

      try {
        if (request.method === 'GET') {
          const personRef = url.searchParams.get('person_ref');
          if (!personRef) {
            return withCors(
              errorResponse(400, 'missing_person_ref', 'person_ref query param required.', false),
              request,
              env
            );
          }
          const status = url.searchParams.get('status') || 'pending';
          const proposals = await proposalRepo.listForPerson(personRef, {
            status: status === 'all' ? undefined : status
          });
          return withCors(okResponse(200, { proposals, count: proposals.length }), request, env);
        }

        if (request.method === 'POST') {
          const body = await readJsonObject(request);
          const action = body?.action ?? url.searchParams.get('action');

          if (action === 'infer' || action === 'check') {
            const result = await runLinkInferencePass({
              ...deps,
              env,
              professionalStore,
              universalStore
            });
            return withCors(okResponse(200, result), request, env);
          }

          if (action === 'accept') {
            const id = body?.id;
            if (!id) {
              return withCors(errorResponse(400, 'missing_id', 'id required.', false), request, env);
            }
            const result = await acceptLinkProposal(id, {
              ...deps,
              env,
              professionalStore,
              universalStore
            });
            return withCors(okResponse(200, result), request, env);
          }

          if (action === 'decline') {
            const id = body?.id;
            if (!id) {
              return withCors(errorResponse(400, 'missing_id', 'id required.', false), request, env);
            }
            const proposal = await declineLinkProposal(id, {
              ...deps,
              env,
              professionalStore
            });
            return withCors(okResponse(200, { proposal }), request, env);
          }

          return withCors(
            errorResponse(400, 'invalid_action', 'action must be infer, accept, or decline.', false),
            request,
            env
          );
        }

        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
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

export default createPeopleLinkProposalsHandler();
