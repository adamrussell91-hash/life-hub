import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createApplicationRepository } from './_shared/application-repository.mjs';
import { APPLICATION_PIPELINE_STATUSES, isValidApplicationId } from './_shared/application-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import {
  resolveApplication,
  resolveEntity as defaultResolveEntity
} from './_shared/entity-resolvers.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';
import { createProfessionalTaskLinkOperationRepository } from './_shared/professional-task-link-operation.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/applications' };

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];
const TASK_LINK_TYPES = new Set(['application_action']);

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
  const data =
    error?.application_id || error?.operation_id || error?.task_id
      ? {
          application_id: error.application_id ?? null,
          operation_id: error.operation_id ?? null,
          task_id: error.task_id ?? null,
          completed_link_ids: error.completed_link_ids ?? [],
          failed_intent_ids: error.failed_intent_ids ?? []
        }
      : undefined;
  return errorResponse(status, code, message, retryable, {}, data);
}

function readId(url) {
  const id = url.searchParams.get('id');
  if (!id) {
    throw Object.assign(new Error('id query param required.'), {
      status: 400,
      code: 'missing_id'
    });
  }
  if (!isValidApplicationId(id)) {
    throw Object.assign(new Error('Invalid Application id.'), {
      status: 400,
      code: 'invalid_application_id'
    });
  }
  return id;
}

export function createApplicationsHandler(deps = {}) {
  const applicationNow = deps.applicationNow ?? (() => new Date().toISOString());
  const createRepository = deps.createApplicationRepository ?? createApplicationRepository;
  const baseResolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;
  const getTasksStore = deps.getTasksStore ?? defaultGetTasksStore;
  const createTaskLinkRepository =
    deps.createProfessionalTaskLinkOperationRepository ?? createProfessionalTaskLinkOperationRepository;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);

      const resolveEntity = async (refInput, accessContext, options = {}) => {
        const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
        if (ref?.namespace === 'professional' && ref.kind === 'application') {
          return resolveApplication(ref.id, accessContext, {
            ...options,
            getStore: async () => store
          });
        }
        return baseResolveEntity(refInput, accessContext, options);
      };

      const repo = createRepository({
        store,
        now: applicationNow,
        resolveEntity,
        getUniversalLinkStore,
        generateId: deps.generateId,
        createUniversalLinkRepository: deps.createUniversalLinkRepository,
        failAtStep: deps.failAtStep
      });

      const taskLinks = createTaskLinkRepository({
        store,
        now: applicationNow,
        resolveEntity,
        getUniversalLinkStore,
        getTasksStore,
        createUniversalLinkRepository: deps.createUniversalLinkRepository,
        env
      });

      try {
        if (request.method === 'GET') {
          if (url.searchParams.has('id')) {
            const id = readId(url);
            const application = await repo.getApplication(id);
            const applicationRef = `professional:application:${id}`;
            const application_action_operation = await taskLinks.loadForTarget(
              applicationRef,
              'application_action'
            );
            return withCors(
              okResponse(200, {
                application: {
                  ...application,
                  ...(application_action_operation ? { application_action_operation } : {})
                }
              }),
              request,
              env
            );
          }
          const applications = await repo.listApplications();
          return withCors(okResponse(200, { applications }), request, env);
        }

        if (request.method === 'POST') {
          const action = url.searchParams.get('action');
          if (action === 'retry-links') {
            const id = readId(url);
            const result = await repo.retryLinks(id);
            return withCors(okResponse(200, result), request, env);
          }
          if (action === 'link-task') {
            const id = readId(url);
            const parsed = await readJsonObject(request);
            if (parsed.error) return withCors(parsed.error, request, env);
            assertNoAccessFields(parsed.value ?? {});
            const relationshipType = parsed.value?.relationship_type;
            if (!TASK_LINK_TYPES.has(relationshipType)) {
              return withCors(
                errorResponse(
                  400,
                  'invalid_relationship_type',
                  'relationship_type must be application_action.',
                  false
                ),
                request,
                env
              );
            }
            await repo.getApplication(id);
            const result = await taskLinks.linkTask({
              targetRef: `professional:application:${id}`,
              relationshipType,
              title: parsed.value?.title,
              taskId: parsed.value?.task_id
            });
            const application = await repo.getApplication(id);
            return withCors(okResponse(200, { application, operation: result.operation }), request, env);
          }
          if (action === 'retry-task-link') {
            const id = readId(url);
            const parsed = await readJsonObject(request);
            if (parsed.error) return withCors(parsed.error, request, env);
            assertNoAccessFields(parsed.value ?? {});
            const operationId = parsed.value?.operation_id;
            if (typeof operationId !== 'string' || !operationId) {
              return withCors(
                errorResponse(400, 'missing_operation_id', 'operation_id is required.', false),
                request,
                env
              );
            }
            const result = await taskLinks.retry(operationId);
            const application = await repo.getApplication(id);
            return withCors(okResponse(200, { application, operation: result.operation }), request, env);
          }
          if (action === 'transition') {
            const id = readId(url);
            const parsed = await readJsonObject(request);
            if (parsed.error) return withCors(parsed.error, request, env);
            assertNoAccessFields(parsed.value ?? {});
            const next = parsed.value?.pipeline_status;
            if (!APPLICATION_PIPELINE_STATUSES.has(next)) {
              return withCors(
                errorResponse(400, 'invalid_pipeline_status', 'pipeline_status is not permitted.', false),
                request,
                env
              );
            }
            const application = await repo.transitionPipeline(id, next);
            return withCors(okResponse(200, { application }), request, env);
          }
          if (action) {
            return withCors(
              errorResponse(400, 'invalid_action', 'Unsupported action.', false),
              request,
              env
            );
          }
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value);
          const result = await repo.createApplication(parsed.value);
          return withCors(okResponse(201, result), request, env);
        }

        if (request.method === 'PATCH') {
          const id = readId(url);
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value);
          const application = await repo.updateApplication(id, parsed.value);
          return withCors(okResponse(200, { application }), request, env);
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

export default createApplicationsHandler();
