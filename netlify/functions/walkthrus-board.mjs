import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProfessionalStore, getJSON, setJSON } from './_shared/professional-blobs.mjs';
import { normalizeArrows, normalizePicked } from '../../packages/walkthrus/arrows.mjs';
import { clustersFromPicked, normalizeClusters } from '../../packages/walkthrus/clusters.mjs';
import { normalizeFusions } from '../../packages/walkthrus/fusions.mjs';

export const config = { path: '/api/walkthrus-board' };

const KEY = 'walkthrus_board/v1';

const pickedOf = (stored) => (Array.isArray(stored?.picked) ? normalizePicked(stored.picked) : null);
const clustersOf = (stored) => (Array.isArray(stored?.clusters) ? normalizeClusters(stored.clusters) : clustersFromPicked(pickedOf(stored) ?? []));

/**
 * Teacher only: Adam's WalkThrus board (GET), or replace part of it (PUT any of { arrows, picked,
 * clusters, fusions }). `arrows` are the ones he has drawn; `picked` is the old flat list of
 * techniques on his board, null until he first picks; `clusters` are his named groups of tiles
 * (until he saves some, one "My board" cluster made from `picked`); `fusions` are the techniques
 * he has built from two or three others. A save that leaves a field out keeps what is stored for it.
 */
export function createWalkthrusBoardHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      const stored = await getJSON(store, KEY);
      const board = { arrows: normalizeArrows(stored?.arrows), picked: pickedOf(stored), clusters: clustersOf(stored), fusions: normalizeFusions(stored?.fusions), updated_at: stored?.updated_at ?? null };
      return withCors(okResponse(200, { board }, { 'cache-control': 'no-store' }), request, env);
    }
    if (request.method === 'PUT' || request.method === 'POST') {
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const stored = await getJSON(store, KEY);
      const sent = parsed.value;
      const board = {
        arrows: normalizeArrows('arrows' in sent ? sent.arrows : stored?.arrows),
        picked: 'picked' in sent ? normalizePicked(sent.picked) : pickedOf(stored),
        // Only stored once sent, so a board that never had clusters keeps following `picked`.
        ...('clusters' in sent ? { clusters: normalizeClusters(sent.clusters) } : Array.isArray(stored?.clusters) ? { clusters: normalizeClusters(stored.clusters) } : {}),
        fusions: normalizeFusions('fusions' in sent ? sent.fusions : stored?.fusions),
        updated_at: new Date().toISOString()
      };
      await setJSON(store, KEY, board);
      return withCors(okResponse(200, { board: { ...board, clusters: clustersOf(board) } }), request, env);
    }
    return withCors(methodNotAllowed('GET, PUT, POST, OPTIONS'), request, env);
  }, { ...deps, getContentStore: deps.getContentStore ?? defaultGetProfessionalStore, unboundCode: 'professional_blobs_unbound', unboundMessage: 'Professional content store is not bound.' });
}

export default createWalkthrusBoardHandler();
