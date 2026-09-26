import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { looksLikeAskQuestion, runPeopleAsk } from './_shared/people-ask.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';

export const config = { path: '/api/people/ask' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, Boolean(error?.retryable) || status === 503);
}

export function createPeopleAskHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { store, env } = context;
      try {
        if (request.method !== 'POST') {
          return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
        }
        const body = await readJsonObject(request);
        const question = String(body?.question ?? body?.q ?? '').trim();
        if (!question) {
          return withCors(
            errorResponse(400, 'missing_question', 'question is required.', false),
            request,
            env
          );
        }
        if (!looksLikeAskQuestion(question) && body?.force !== true) {
          return withCors(
            okResponse(200, {
              mode: 'search',
              answer: null,
              people: [],
              filter: { q: question },
              source: 'name_search'
            }),
            request,
            env
          );
        }
        const result = await runPeopleAsk(question, {
          ...deps,
          env,
          universalStore: store
        });
        return withCors(okResponse(200, result), request, env);
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

export default createPeopleAskHandler();
