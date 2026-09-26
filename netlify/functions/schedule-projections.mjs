import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { createCommunicationRepository } from './_shared/communication-repository.mjs';
import { createLedgerItemRepository } from './_shared/ledger-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { mergeScheduleProjections, projectCommunicationSchedule } from './_shared/schedule-projection.mjs';
import {
  resolveMeeting,
  resolveEvent,
  resolveCommunication,
  resolveEntity as defaultResolveEntity
} from './_shared/entity-resolvers.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/schedule-projections' };

function sydneyDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function createScheduleProjectionsHandler(deps = {}) {
  const scheduleNow = deps.scheduleNow ?? (() => new Date().toISOString());
  const createMeetings = deps.createMeetingRepository ?? createMeetingRepository;
  const createEvents = deps.createEventRepository ?? createEventRepository;
  const createCommunications = deps.createCommunicationRepository ?? createCommunicationRepository;
  const createLedger = deps.createLedgerItemRepository ?? createLedgerItemRepository;
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
        if (ref?.namespace === 'professional' && ref.kind === 'communication') {
          return resolveCommunication(ref.id, accessContext, {
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
        const commRepo = createCommunications({
          store,
          now: scheduleNow,
          resolveEntity
        });
        const ledgerRepo = createLedger({ store, now: scheduleNow });
        const today = new Date(scheduleNow());
        const from = sydneyDateKey(new Date(today.getTime() - 30 * 86_400_000));
        const to = sydneyDateKey(new Date(today.getTime() + 120 * 86_400_000));
        const [meetingProjections, eventProjections, communications, promises] = await Promise.all([
          meetingRepo.listScheduleProjections(),
          eventRepo.listScheduleProjections(),
          commRepo.listCommunications(),
          ledgerRepo.listDueBetween(from, to)
        ]);
        const commProjections = communications.map(projectCommunicationSchedule);
        const projections = mergeScheduleProjections([meetingProjections, eventProjections, commProjections]);
        return withCors(okResponse(200, { projections, promises }), request, env);
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
