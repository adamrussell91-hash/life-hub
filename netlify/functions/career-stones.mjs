import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { createCareerRepository } from './_shared/career-repository.mjs';
import { isValidSteppingStoneId } from './_shared/career-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/career-stones' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, status === 503);
}

export function createCareerStonesHandler(deps = {}) {
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
            if (!isValidSteppingStoneId(id)) {
              return withCors(errorResponse(400, 'invalid_stepping_stone_id', 'Invalid id.'), request, env);
            }
            return withCors(okResponse(200, { stone: await repo.getSteppingStone(id) }), request, env);
          }
          return withCors(okResponse(200, { stones: await repo.listSteppingStones() }), request, env);
        }
        if (request.method === 'POST') {
          const body = await readJsonObject(request);
          // task: createTask + stone_action lands in Phase 4
          if (url.searchParams.get('action') === 'task' || body?.action === 'task') {
            return withCors(
              errorResponse(501, 'not_implemented', 'stone_action task create lands in Phase 4.'),
              request,
              env
            );
          }
          const stone = await repo.createSteppingStone(body);
          return withCors(okResponse(201, { stone }), request, env);
        }
        if (request.method === 'PATCH') {
          const id = url.searchParams.get('id');
          if (!id || !isValidSteppingStoneId(id)) {
            return withCors(errorResponse(400, 'invalid_stepping_stone_id', 'id required.'), request, env);
          }
          const body = await readJsonObject(request);
          const stone = await repo.updateSteppingStone(id, body);
          return withCors(okResponse(200, { stone }), request, env);
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

export default createCareerStonesHandler();
