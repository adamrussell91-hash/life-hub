import { createHash } from 'node:crypto';
import {
  errorResponse,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mjs';
import { createTravelRepository } from './_shared/travel-repository.mjs';
import { redactTrip } from './_shared/travel-redact.mjs';

export const config = { path: '/api/travel-public' };

const NO_STORE = { 'cache-control': 'no-store' };

export function createTravelPublicHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const createRepo = deps.createTravelRepository ?? createTravelRepository;

  return async function travelPublicHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.', false, NO_STORE);
    }
    const token = new URL(request.url).searchParams.get('token');
    if (!token) {
      return errorResponse(404, 'not_found', 'This link has been turned off.', false, NO_STORE);
    }
    let repo;
    try {
      repo = createRepo({ env, fetchImpl: deps.fetchImpl ?? fetch, github: deps.github });
    } catch {
      return errorResponse(503, 'misconfigured', 'Travel storage is unavailable.', true, NO_STORE);
    }
    const { map } = await repo.getShareTokens();
    const hash = createHash('sha256').update(token).digest('hex');
    const row = map[hash];
    if (!row?.trip_id) {
      return errorResponse(404, 'not_found', 'This link has been turned off.', false, NO_STORE);
    }
    try {
      const { trip } = await repo.getTrip(row.trip_id);
      return okResponse(200, { trip: redactTrip(trip) }, NO_STORE);
    } catch {
      return errorResponse(404, 'not_found', 'This link has been turned off.', false, NO_STORE);
    }
  }
}

export default createTravelPublicHandler();
