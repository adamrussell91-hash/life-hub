import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { defaultGetCheckInStore, deleteCheckIn, getCheckIn, listCheckIns, saveCheckIn } from './_shared/check-in-store.mjs';
import { QuizError } from './_shared/question-drop.mjs';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';

export const config = { path: '/api/check-ins' };

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * Teacher only. Sealed Check-in records:
 *   GET  ?id=…                          one record
 *   GET  ?meeting_id=…                  summaries for a meeting
 *   GET  ?person_ref=…&person_name=…    summaries for a person
 *   POST { action: 'save', check_in }   create or replace
 *   POST { action: 'delete', id }
 */
export function createCheckInsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const io = { env };
    const ok = (body) => withCors(okResponse(200, body, NO_STORE), request, env);
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (id) return ok({ check_in: await getCheckIn(store, id, io) });
        const meetingId = url.searchParams.get('meeting_id');
        const personRef = url.searchParams.get('person_ref');
        if (!meetingId && !personRef) throw new QuizError(400, 'bad_request', 'Ask for a meeting or a person.');
        const filter = meetingId ? { meeting_id: meetingId } : { person_ref: personRef, person_name: url.searchParams.get('person_name') ?? '' };
        return ok({ check_ins: await listCheckIns(store, filter, io) });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        if (body?.action === 'save') return ok({ check_in: await saveCheckIn(store, body.check_in, io) });
        if (body?.action === 'delete') {
          await deleteCheckIn(store, body.id, io);
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
    unboundMessage: deps.unboundMessage ?? 'Check-in store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetCheckInStore
  });
}

export default createCheckInsHandler();
