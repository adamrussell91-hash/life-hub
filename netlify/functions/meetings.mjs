import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { isValidMeetingId } from './_shared/meeting-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import {
  resolveMeeting,
  resolveEntity as defaultResolveEntity
} from './_shared/entity-resolvers.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/meetings' };

const FORBIDDEN_ACCESS_FIELDS = ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds'];
const STATE_ACTIONS = new Set(['complete', 'cancel', 'no-show']);

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
    error?.meeting_id || error?.operation_id
      ? {
          meeting_id: error.meeting_id ?? null,
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
  if (!isValidMeetingId(id)) {
    throw Object.assign(new Error('Invalid Meeting id.'), {
      status: 400,
      code: 'invalid_meeting_id'
    });
  }
  return id;
}

function stateForAction(action) {
  if (action === 'complete') return 'completed';
  if (action === 'cancel') return 'cancelled';
  if (action === 'no-show') return 'no_show';
  return null;
}

export function createMeetingsHandler(deps = {}) {
  const meetingNow = deps.meetingNow ?? (() => new Date().toISOString());
  const createRepository = deps.createMeetingRepository ?? createMeetingRepository;
  const baseResolveEntity = deps.resolveEntity ?? defaultResolveEntity;
  const getUniversalLinkStore = deps.getUniversalLinkStore ?? defaultGetUniversalLinkStore;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);

      const resolveEntity = async (refInput, accessContext, options = {}) => {
        const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
        if (ref?.namespace === 'professional' && ref.kind === 'meeting') {
          return resolveMeeting(ref.id, accessContext, {
            ...options,
            getStore: async () => store
          });
        }
        return baseResolveEntity(refInput, accessContext, options);
      };

      const repo = createRepository({
        store,
        now: meetingNow,
        resolveEntity,
        getUniversalLinkStore,
        generateId: deps.generateId,
        createUniversalLinkRepository: deps.createUniversalLinkRepository
      });

      try {
        if (request.method === 'GET') {
          if (url.searchParams.has('id')) {
            const id = readId(url);
            const meeting = await repo.getMeeting(id);
            return withCors(okResponse(200, { meeting }), request, env);
          }
          const meetings = await repo.listMeetings();
          return withCors(okResponse(200, { meetings }), request, env);
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
            const meeting = await repo.rescheduleMeeting(id, parsed.value ?? {});
            return withCors(okResponse(200, { meeting }), request, env);
          }
          if (STATE_ACTIONS.has(action)) {
            const id = readId(url);
            const meeting = await repo.transitionState(id, stateForAction(action));
            return withCors(okResponse(200, { meeting }), request, env);
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
          const result = await repo.createMeeting(parsed.value);
          return withCors(okResponse(201, result), request, env);
        }

        if (request.method === 'PATCH') {
          const id = readId(url);
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          assertNoAccessFields(parsed.value);
          const meeting = await repo.updateMeeting(id, parsed.value);
          return withCors(okResponse(200, { meeting }), request, env);
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

export default createMeetingsHandler();
