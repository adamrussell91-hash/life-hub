import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { isValidEventId } from './_shared/event-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import {
  resolveEvent,
  resolveEntity as defaultResolveEntity
} from './_shared/entity-resolvers.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/events' };

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];
const STATE_ACTIONS = new Set(['complete', 'cancel']);

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
    error?.event_id || error?.operation_id
      ? {
          event_id: error.event_id ?? null,
          operation_id: error.operation_id ?? null,
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
  if (!isValidEventId(id)) {
    throw Object.assign(new Error('Invalid Event id.'), {
      status: 400,
      code: 'invalid_event_id'
    });
  }
  return id;
}

function stateForAction(action) {
  if (action === 'complete') return 'completed';
  if (action === 'cancel') return 'cancelled';
  return null;
}

export function createEventsHandler(deps = {}) {
  const eventNow = deps.eventNow ?? (() => new Date().toISOString());
  const createRepository = deps.createEventRepository ?? createEventRepository;
  const baseResolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);

      const resolveEntity = async (refInput, accessContext, options = {}) => {
        const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
        if (ref?.namespace === 'professional' && ref.kind === 'event') {
          return resolveEvent(ref.id, accessContext, {
            ...options,
            getStore: async () => store
          });
        }
        return baseResolveEntity(refInput, accessContext, options);
      };

      const repo = createRepository({
        store,
        now: eventNow,
        resolveEntity,
        getUniversalLinkStore,
        generateId: deps.generateId,
        createUniversalLinkRepository: deps.createUniversalLinkRepository
      });

      try {
        if (request.method === 'GET') {
          if (url.searchParams.has('id')) {
            const id = readId(url);
            const event = await repo.getEvent(id);
            return withCors(okResponse(200, { event }), request, env);
          }
          const events = await repo.listEvents();
          return withCors(okResponse(200, { events }), request, env);
        }

        if (request.method === 'POST') {
          const action = url.searchParams.get('action');
          if (action === 'retry-links') {
            const id = readId(url);
            const result = await repo.retryLinks(id);
            return withCors(okResponse(200, result), request, env);
          }
          if (action === 'reschedule') {
            const id = readId(url);
            const parsed = await readJsonObject(request);
            if (parsed.error) return withCors(parsed.error, request, env);
            assertNoAccessFields(parsed.value ?? {});
            const event = await repo.rescheduleEvent(id, parsed.value ?? {});
            return withCors(okResponse(200, { event }), request, env);
          }
          if (STATE_ACTIONS.has(action)) {
            const id = readId(url);
            const event = await repo.transitionState(id, stateForAction(action));
            return withCors(okResponse(200, { event }), request, env);
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
          const result = await repo.createEvent(parsed.value);
          return withCors(okResponse(201, result), request, env);
        }

        if (request.method === 'PATCH') {
          const id = readId(url);
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value);
          const event = await repo.updateEvent(id, parsed.value);
          return withCors(okResponse(200, { event }), request, env);
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

export default createEventsHandler();
