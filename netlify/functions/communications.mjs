import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createCommunicationRepository } from './_shared/communication-repository.mjs';
import { isValidCommunicationId } from './_shared/communication-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetTasksStore } from './_shared/tasks-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import {
  resolveCommunication,
  resolveEntity as defaultResolveEntity
} from './_shared/entity-resolvers.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/communications' };

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
  const data =
    error?.communication_id || error?.operation_id || error?.task_id
      ? {
          communication_id: error.communication_id ?? null,
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
  if (!isValidCommunicationId(id)) {
    throw Object.assign(new Error('Invalid Communication id.'), {
      status: 400,
      code: 'invalid_communication_id'
    });
  }
  return id;
}

export function createCommunicationsHandler(deps = {}) {
  const communicationNow = deps.communicationNow ?? (() => new Date().toISOString());
  const createRepository = deps.createCommunicationRepository ?? createCommunicationRepository;
  const baseResolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);

      // Communication resolution must read the same professional store the
      // handler just wrote — never a second unbound default in tests.
      const resolveEntity = async (refInput, accessContext, options = {}) => {
        const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
        if (ref?.namespace === 'professional' && ref.kind === 'communication') {
          return resolveCommunication(ref.id, accessContext, {
            ...options,
            getStore: async () => store
          });
        }
        return baseResolveEntity(refInput, accessContext, options);
      };

      const repo = createRepository({
        store,
        now: communicationNow,
        resolveEntity,
        getUniversalLinkStore,
        generateId: deps.generateId,
        createUniversalLinkRepository: deps.createUniversalLinkRepository,
        getTasksStore: deps.getTasksStore ?? defaultGetTasksStore,
        beforeTaskEnsure: deps.beforeTaskEnsure,
        afterTaskEnsure: deps.afterTaskEnsure,
        env
      });

      try {
        if (request.method === 'GET') {
          if (url.searchParams.has('id')) {
            const id = readId(url);
            const communication = await repo.getCommunication(id);
            return withCors(okResponse(200, { communication }), request, env);
          }
          const communications = await repo.listCommunications();
          return withCors(okResponse(200, { communications }), request, env);
        }

        if (request.method === 'POST') {
          const action = url.searchParams.get('action');
          if (action === 'retry-links') {
            const id = readId(url);
            const result = await repo.retryLinks(id);
            return withCors(okResponse(200, result), request, env);
          }
          if (action === 'create-follow-up') {
            const id = readId(url);
            const parsed = await readJsonObject(request);
            if (parsed.error) return withCors(parsed.error, request, env);
            assertNoAccessFields(parsed.value ?? {});
            const result = await repo.createFollowUp(id, parsed.value ?? {});
            return withCors(okResponse(201, result), request, env);
          }
          if (action === 'retry-follow-up') {
            const id = readId(url);
            const result = await repo.retryFollowUp(id);
            return withCors(okResponse(200, result), request, env);
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
          const result = await repo.createCommunication(parsed.value);
          return withCors(okResponse(201, result), request, env);
        }

        if (request.method === 'PATCH') {
          const id = readId(url);
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value);
          const communication = await repo.updateCommunication(id, parsed.value);
          return withCors(okResponse(200, { communication }), request, env);
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

export default createCommunicationsHandler();
