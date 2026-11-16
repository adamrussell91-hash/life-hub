import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  defaultGetClassroomObservationStore,
  deleteObservation,
  getObservation,
  listObservations,
  saveObservation
} from './_shared/classroom-observation-store.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';

export const config = { path: '/api/classroom-observations' };

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * Teacher only. Classroom observation (NESA Proficient) records:
 *   GET  ?id=…                              one record
 *   GET  ?person_ref=…&open=1               summaries, newest first
 *   POST { action: 'save', observation }    create or replace
 *   POST { action: 'delete', id }
 */
export function createClassroomObservationsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const ok = (body) => withCors(okResponse(200, body, NO_STORE), request, env);
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (id) return ok({ observation: await getObservation(store, id) });
        const open = url.searchParams.get('open');
        return ok({
          observations: await listObservations(store, {
            person_ref: url.searchParams.get('person_ref') || undefined,
            open: open === '1' || open === 'true'
          })
        });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        if (body?.action === 'save') return ok({ observation: await saveObservation(store, body.observation) });
        if (body?.action === 'delete') {
          await deleteObservation(store, body.id);
          return ok({ deleted: true });
        }
        throw new QuizError(400, 'bad_request', 'Unknown action.');
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch (e) {
      if (e instanceof QuizError || e instanceof SyntaxError) {
        return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      }
      throw e;
    }
  }, {
    ...deps,
    unboundMessage: deps.unboundMessage ?? 'Classroom observation store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetClassroomObservationStore
  });
}

export default createClassroomObservationsHandler();
