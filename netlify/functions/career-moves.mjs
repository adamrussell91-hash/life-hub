import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  defaultGetProfessionalStore,
  listCareerMoveIndexKeys,
  getJSON,
  careerMoveKey
} from './_shared/professional-blobs.mjs';
import { isValidCareerMoveId } from './_shared/career-schema.mjs';

export const config = { path: '/api/career-moves' };

function parseMoveRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!isValidCareerMoveId(raw.id)) return null;
  return raw;
}

/** What-if moves — full estimate/apply in Phase 9. */
export function createCareerMovesHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      try {
        if (request.method === 'GET') {
          const keys = await listCareerMoveIndexKeys(store);
          const moves = [];
          for (const key of keys) {
            const id = key.slice('career/moves/index/'.length);
            if (!isValidCareerMoveId(id)) continue;
            const record = parseMoveRecord(await getJSON(store, careerMoveKey(id)));
            if (record) moves.push(record);
          }
          return withCors(okResponse(200, { moves }), request, env);
        }
        if (request.method === 'POST') {
          return withCors(
            okResponse(200, { note: 'Career moves create/estimate land in Phase 9.' }),
            request,
            env
          );
        }
        return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        return withCors(
          errorResponse(status, error?.code || 'internal_error', error?.message || 'Request failed.'),
          request,
          env
        );
      }
    },
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createCareerMovesHandler();
