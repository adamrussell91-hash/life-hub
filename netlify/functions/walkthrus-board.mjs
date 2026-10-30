import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProfessionalStore, getJSON, setJSON } from './_shared/professional-blobs.mjs';
import { normalizeArrows, normalizePicked } from '../../packages/walkthrus/arrows.mjs';

export const config = { path: '/api/walkthrus-board' };

const KEY = 'walkthrus_board/v1';

/**
 * Teacher only: Adam's WalkThrus board (GET), or replace part of it (PUT { arrows } and/or { picked }).
 * `arrows` are the ones he has drawn; `picked` is the techniques he has put on his own board, null
 * until he first picks. A save that leaves a field out keeps what is stored for it.
 */
export function createWalkthrusBoardHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      const stored = await getJSON(store, KEY);
      return withCors(okResponse(200, { board: { arrows: normalizeArrows(stored?.arrows), picked: Array.isArray(stored?.picked) ? normalizePicked(stored.picked) : null, updated_at: stored?.updated_at ?? null } }, { 'cache-control': 'no-store' }), request, env);
    }
    if (request.method === 'PUT' || request.method === 'POST') {
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const stored = await getJSON(store, KEY);
      const sent = parsed.value;
      const board = {
        arrows: normalizeArrows('arrows' in sent ? sent.arrows : stored?.arrows),
        picked: 'picked' in sent ? normalizePicked(sent.picked) : Array.isArray(stored?.picked) ? normalizePicked(stored.picked) : null,
        updated_at: new Date().toISOString()
      };
      await setJSON(store, KEY, board);
      return withCors(okResponse(200, { board }), request, env);
    }
    return withCors(methodNotAllowed('GET, PUT, POST, OPTIONS'), request, env);
  }, { ...deps, getContentStore: deps.getContentStore ?? defaultGetProfessionalStore, unboundCode: 'professional_blobs_unbound', unboundMessage: 'Professional content store is not bound.' });
}

export default createWalkthrusBoardHandler();
