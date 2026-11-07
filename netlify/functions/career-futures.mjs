import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { createCareerRepository } from './_shared/career-repository.mjs';
import { isValidFutureId } from './_shared/career-schema.mjs';
import {
  careerAnnJobStatus,
  clearCareerAnnJob,
  defaultInvokeCareerAnnRun,
  startCareerAnnJob
} from './_shared/career-ann-job.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { createApplicationRepository } from './_shared/application-repository.mjs';
import { isValidApplicationId, isValidCriterionId } from './_shared/application-schema.mjs';
import { DRAFT_TARGETS } from './_shared/career-application-ann.mjs';
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
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          const body = parsed.value;
          const action = url.searchParams.get('action');
          const invoke = (jobId) => (deps.invokeCareerAnnRun ?? defaultInvokeCareerAnnRun)(request, jobId);
          if (action === 'draft_start') {
            const job = {
              kind: 'draft',
              title: typeof body?.title === 'string' ? body.title : '',
              description: typeof body?.description === 'string' ? body.description : ''
            };
            return withCors(okResponse(200, await startCareerAnnJob(store, job, { invoke })), request, env);
          }
          if (action === 'check_start') {
            const id = url.searchParams.get('id');
            if (!id || !isValidFutureId(id)) {
              return withCors(errorResponse(400, 'invalid_future_id', 'id required.'), request, env);
            }
            await repo.getFuture(id); // A missing future fails here, not in the background.
            return withCors(okResponse(200, await startCareerAnnJob(store, { kind: 'check', future_id: id }, { invoke })), request, env);
          }
          if (action === 'app_check_start' || action === 'app_draft_start') {
            const id = url.searchParams.get('id');
            if (!id || !isValidApplicationId(id)) {
              return withCors(errorResponse(400, 'invalid_application_id', 'id required.'), request, env);
            }
            const applications = (deps.createApplicationRepository ?? createApplicationRepository)({ store });
            // A missing application fails here, not in the background.
            const application = await applications.getApplication(id);
            if (action === 'app_check_start') {
              const job = { kind: 'app_check', application_id: id };
              return withCors(okResponse(200, await startCareerAnnJob(store, job, { invoke })), request, env);
            }
            if (!DRAFT_TARGETS.has(body?.target)) {
              return withCors(
                errorResponse(400, 'invalid_target', 'target must be responses, cover_letter or cv.'),
                request,
                env
              );
            }
            const criterionId = body.criterion_id ?? null;
            if (criterionId !== null) {
              const known = (application.selection_criteria ?? []).some((c) => c.id === criterionId);
              if (body.target !== 'responses' || !isValidCriterionId(criterionId) || !known) {
                return withCors(
                  errorResponse(400, 'invalid_criterion_id', 'criterion_id is not a criterion of this application.'),
                  request,
                  env
                );
              }
            }
            const job = { kind: 'app_draft', application_id: id, target: body.target, criterion_id: criterionId };
            return withCors(okResponse(200, await startCareerAnnJob(store, job, { invoke })), request, env);
          }
          if (action === 'job_status') {
            return withCors(okResponse(200, await careerAnnJobStatus(store, body.job_id)), request, env);
          }
          if (action === 'job_clear') {
            return withCors(okResponse(200, await clearCareerAnnJob(store, body.job_id)), request, env);
          }
          const future = await repo.createFuture(body);
          return withCors(okResponse(201, { future }), request, env);
        }
        if (request.method === 'PATCH') {
          const id = url.searchParams.get('id');
          if (!id || !isValidFutureId(id)) {
            return withCors(errorResponse(400, 'invalid_future_id', 'id required.'), request, env);
          }
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          const future = await repo.updateFuture(id, parsed.value);
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
