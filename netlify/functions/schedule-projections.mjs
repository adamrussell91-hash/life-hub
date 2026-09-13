import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { mergeScheduleProjections } from './_shared/schedule-projection.mjs';
import {
  resolveMeeting,
  resolveEvent,
  resolveEntity as defaultResolveEntity
} from './_shared/entity-resolvers.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/schedule-projections' };

export function createScheduleProjectionsHandler(deps = {}) {
  const scheduleNow = deps.scheduleNow ?? (() => new Date().toISOString());
  const createMeetings = deps.createMeetingRepository ?? createMeetingRepository;
  const createEvents = deps.createEventRepository ?? createEventRepository;
  const baseResolveEntity = deps.resolveEntity ?? defaultResolveEntity;

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;

      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      const resolveEntity = async (refInput, accessContext, options = {}) => {
        const ref = typeof refInput === 'string' ? parseEntityRef(refInput) : refInput;
        if (ref?.namespace === 'professional' && ref.kind === 'meeting') {
          return resolveMeeting(ref.id, accessContext, {
            ...options,
            getStore: async () => store
          });
        }
        if (ref?.namespace === 'professional' && ref.kind === 'event') {
          return resolveEvent(ref.id, accessContext, {
            ...options,
            getStore: async () => store
          });
        }
        return baseResolveEntity(refInput, accessContext, options);
      };

      try {
        const meetingRepo = createMeetings({
          store,
          now: scheduleNow,
          resolveEntity
        });
        const eventRepo = createEvents({
          store,
          now: scheduleNow,
          resolveEntity
        });
        const [meetingProjections, eventProjections] = await Promise.all([
          meetingRepo.listScheduleProjections(),
          eventRepo.listScheduleProjections()
        ]);
        const projections = mergeScheduleProjections([meetingProjections, eventProjections]);
        return withCors(okResponse(200, { projections }), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message =
          typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(errorResponse(status, code, message, status === 503), request, env);
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

export default createScheduleProjectionsHandler();
