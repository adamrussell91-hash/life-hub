import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { loadAllPeopleWithRelationships } from './_shared/people-collection.mjs';
import {
  computeSignals,
  computeReconnectSuggestions,
  computeRecentRelationshipChanges,
  computeNewConnections,
  computeDormantForReview
} from './_shared/people-home-signals.mjs';

// People Home data layer (Phase 2, Feature 2.2). GET-only. Builds on the
// Universal Link content store the same way entity-overview.mjs's handler
// does; Meetings/Events (for the upcoming_interactions signal) live in the
// separate `professional-hub-content` store, fetched independently via
// `getProfessionalStore` — `loadAllPeopleWithRelationships` never touches
// it, and the Meeting/Event repositories never touch Universal Links here
// (only `listMeetings`/`listEvents` are called — no attendee-filtering, no
// writes).
export const config = { path: '/api/people/home-signals' };

export function createPeopleHomeSignalsHandler(deps = {}) {
  const loadPeople = deps.loadAllPeopleWithRelationships ?? loadAllPeopleWithRelationships;
  const resolveEntity = deps.resolveEntity;
  const createRepository = deps.createRepository;
  const getProfessionalStore = deps.getProfessionalStore ?? defaultGetProfessionalStore;
  const createMeetings = deps.createMeetingRepository ?? createMeetingRepository;
  const createEvents = deps.createEventRepository ?? createEventRepository;
  const now = deps.now ?? (() => new Date());

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      if (request.method !== 'GET') {
        return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
      }

      try {
        const nowValue = now();
        const professionalStore = await getProfessionalStore();
        const meetingRepo = createMeetings({ store: professionalStore });
        const eventRepo = createEvents({ store: professionalStore });

        const [peopleWithRelationships, meetings, events] = await Promise.all([
          loadPeople({ store, now: nowValue, resolveEntity, createRepository }),
          meetingRepo.listMeetings(),
          eventRepo.listEvents()
        ]);

        const signals = computeSignals(peopleWithRelationships, { meetings, events }, nowValue);
        const reconnect_suggestions = computeReconnectSuggestions(peopleWithRelationships, nowValue);
        const recent_changes = computeRecentRelationshipChanges(peopleWithRelationships, nowValue);
        const new_connections = computeNewConnections(peopleWithRelationships, nowValue);
        const dormant_for_review = computeDormantForReview(peopleWithRelationships, nowValue);

        return withCors(
          okResponse(200, {
            signals,
            reconnect_suggestions,
            recent_changes,
            new_connections,
            dormant_for_review
          }),
          request,
          env
        );
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
        return withCors(errorResponse(status, code, message, status === 503), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'universal_link_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Universal Link content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetUniversalLinkStore
    }
  );
}

export default createPeopleHomeSignalsHandler();
