import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { createCareerRepository } from './_shared/career-repository.mjs';
import { isValidFutureId } from './_shared/career-schema.mjs';
import { draftFutureFromAnn } from './_shared/career-future-draft.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/career-futures' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, status === 503);
}

export function createCareerFuturesHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      const repo =
        deps.createCareerRepository?.({ store, now: deps.now }) ??
        createCareerRepository({ store, now: deps.now });

      try {
        if (request.method === 'GET') {
          const id = url.searchParams.get('id');
          if (id) {
            if (!isValidFutureId(id)) {
              return withCors(errorResponse(400, 'invalid_future_id', 'Invalid id.'), request, env);
            }
            return withCors(okResponse(200, { future: await repo.getFuture(id) }), request, env);
          }
          return withCors(okResponse(200, { futures: await repo.listFutures() }), request, env);
        }
        if (request.method === 'POST') {
          const body = await readJsonObject(request);
          if (url.searchParams.get('action') === 'draft' || body?.action === 'draft') {
            const apiKey =
              typeof env?.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
            const draft = await (deps.draftFutureFromAnn ?? draftFutureFromAnn)({
              title: typeof body?.title === 'string' ? body.title : '',
              description:
                typeof body?.description === 'string'
                  ? body.description
                  : typeof body?.ad === 'string'
                    ? body.ad
                    : '',
              apiKey,
              fetchImpl: deps.fetchImpl
            });
            return withCors(okResponse(200, { draft }), request, env);
          }
          const future = await repo.createFuture(body);
          return withCors(okResponse(201, { future }), request, env);
        }
        if (request.method === 'PATCH') {
          const id = url.searchParams.get('id');
          if (!id || !isValidFutureId(id)) {
            return withCors(errorResponse(400, 'invalid_future_id', 'id required.'), request, env);
          }
          const body = await readJsonObject(request);
          const future = await repo.updateFuture(id, body);
          return withCors(okResponse(200, { future }), request, env);
        }
        return withCors(methodNotAllowed('GET, POST, PATCH, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
    },
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createCareerFuturesHandler();
