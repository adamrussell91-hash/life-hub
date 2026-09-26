import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createPdGroupRepository } from './_shared/pd-group-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

export const config = { path: '/api/pd-groups' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, status === 503);
}

export function createPdGroupsHandler(deps = {}) {
  const pdGroupNow = deps.pdGroupNow ?? (() => new Date().toISOString());
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      const repo = createPdGroupRepository({ store, now: pdGroupNow, generateId: deps.generateId });
      try {
        if (request.method === 'GET') {
          const id = url.searchParams.get('id');
          if (id) return withCors(okResponse(200, { group: await repo.getGroup(id) }), request, env);
          return withCors(okResponse(200, { groups: await repo.listGroups() }), request, env);
        }
        if (request.method === 'POST') {
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          return withCors(okResponse(200, { group: await repo.createGroup(parsed.value) }), request, env);
        }
        if (request.method === 'PATCH') {
          const id = url.searchParams.get('id');
          if (!id) return withCors(errorResponse(400, 'missing_id', 'id query param required.', false), request, env);
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          return withCors(okResponse(200, { group: await repo.patchGroup(id, parsed.value) }), request, env);
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

export default createPdGroupsHandler();
