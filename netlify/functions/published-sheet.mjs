import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { isSheetToken, sheetSnapshotKey } from './_shared/meeting-sheet.mjs';

export const config = { path: '/api/published/sheets/:token' };

/** The public side of a share sheet: anyone with the link can read it. It stops when the sender stops it. */
export function createPublishedSheetHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
    const token = new URL(request.url).pathname.split('/').pop();
    const sheet = isSheetToken(token) ? await store.get(sheetSnapshotKey(token), { type: 'json' }) : null;
    if (!sheet) return withCors(errorResponse(404, 'not_found', 'This sheet is no longer shared.', false), request, env);
    return withCors(okResponse(200, sheet, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }), request, env);
  }, deps);
}

export default createPublishedSheetHandler();
