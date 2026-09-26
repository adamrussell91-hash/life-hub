import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { createCareerRepository } from './_shared/career-repository.mjs';
import { isValidAchievementId } from './_shared/career-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';

export const config = { path: '/api/career-achievements' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, status === 503);
}

export function createCareerAchievementsHandler(deps = {}) {
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
            if (!isValidAchievementId(id)) {
              return withCors(errorResponse(400, 'invalid_achievement_id', 'Invalid id.'), request, env);
            }
            return withCors(okResponse(200, { achievement: await repo.getAchievement(id) }), request, env);
          }
          return withCors(okResponse(200, { achievements: await repo.listAchievements() }), request, env);
        }
        if (request.method === 'POST') {
          const body = await readJsonObject(request);
          const achievement = await repo.createAchievement(body);
          return withCors(okResponse(201, { achievement }), request, env);
        }
        if (request.method === 'PATCH') {
          const id = url.searchParams.get('id');
          if (!id || !isValidAchievementId(id)) {
            return withCors(errorResponse(400, 'invalid_achievement_id', 'id required.'), request, env);
          }
          const body = await readJsonObject(request);
          const achievement = await repo.updateAchievement(id, body);
          return withCors(okResponse(200, { achievement }), request, env);
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

export default createCareerAchievementsHandler();
