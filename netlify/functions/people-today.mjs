import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { assembleTodayStrip } from './_shared/today-availability.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetTasksStore, listJSON as listTasksJSON } from './_shared/tasks-blobs.mjs';
import { parseEntityRef } from './_shared/entity-ref.mjs';

export const config = { path: '/api/people/today' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, Boolean(error?.retryable) || status === 503);
}

export function createPeopleTodayHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env } = context;
      const professionalStore =
        deps.professionalStore ??
        (await (deps.getProfessionalStore ?? defaultGetProfessionalStore)(env).catch(() => null));

      try {
        if (request.method !== 'GET') {
          return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
        }
        const url = new URL(request.url);
        const personRef = url.searchParams.get('person_ref');
        const displayName = url.searchParams.get('display_name') || '';

        let meetings = deps.meetings ?? [];
        let events = deps.events ?? [];
        if (!deps.meetings && professionalStore) {
          try {
            const meetingRepo = createMeetingRepository({ store: professionalStore });
            meetings = typeof meetingRepo.listMeetings === 'function' ? await meetingRepo.listMeetings() : [];
          } catch {
            meetings = [];
          }
        }
        if (!deps.events && professionalStore) {
          try {
            const eventRepo = createEventRepository({ store: professionalStore });
            events = typeof eventRepo.listEvents === 'function' ? await eventRepo.listEvents() : [];
          } catch {
            events = [];
          }
        }

        const tasksStore =
          deps.tasksStore ?? (await (deps.getTasksStore ?? defaultGetTasksStore)(env).catch(() => null));
        const workBlocks = tasksStore
          ? await listJSON(tasksStore, 'work_blocks/').catch(() => [])
          : [];
        const lessons = deps.lessons ?? [];

        const meetPerson =
          personRef && parseEntityRef(personRef)
            ? { ref: personRef, display_name: displayName || personRef }
            : null;

        const pastMeetingsWithPerson = meetPerson
          ? meetings.filter((m) =>
              (m.attendees ?? []).some(
                (a) =>
                  a.ref === personRef ||
                  (displayName &&
                    String(a.display_name || a.name || '')
                      .toLowerCase()
                      .includes(displayName.toLowerCase()))
              )
            )
          : [];

        const openMeetItem = url.searchParams.get('has_meet_item') === '1';

        const strip = assembleTodayStrip({
          now: deps.now?.() ?? new Date(),
          meetings,
          events,
          lessons,
          workBlocks,
          meetPerson,
          pastMeetingsWithPerson,
          openMeetItem: openMeetItem ? { text: 'meet' } : null
        });

        return withCors(okResponse(200, strip), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
    },
    {
      ...deps,
      requireStore: false
    }
  );
}

export default createPeopleTodayHandler();
