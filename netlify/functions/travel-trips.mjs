import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { makeId, validateTrip, tripSummary } from './_shared/travel-schema.mjs';

export const config = { path: '/api/travel-trips' };

export function createTravelTripsHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method === 'GET') {
      const trips = await ctx.repo.listTrips();
      return okResponse(200, { trips }, PRIVATE_CACHE);
    }
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use GET or POST.', false, PRIVATE_CACHE);
    }
    const body = await readJson(request);
    if (!body) {
      return errorResponse(400, 'invalid_request', 'Provide a JSON body.', false, PRIVATE_CACHE);
    }

    const nowIso = new Date(ctx.now()).toISOString();
    let trip;
    if (body.import) {
      const imported = body.import;
      trip = {
        ...imported,
        id: imported.id && String(imported.id).startsWith('trp_') ? imported.id : makeId('trp'),
        schema_version: 1,
        checkins: imported.checkins || [],
        days: imported.days || [],
        items: (imported.items || []).map((item) => ({
          ...item,
          id: item.id || makeId('itm'),
          created_at: item.created_at || nowIso,
          updated_at: nowIso
        })),
        share: { enabled: false, created_at: null },
        created_at: nowIso,
        updated_at: nowIso
      };
      validateTrip(trip);
    } else {
      if (!body.title || !body.start_date || !body.end_date) {
        return errorResponse(
          400,
          'validation_error',
          'title, start_date and end_date are required.',
          false,
          PRIVATE_CACHE
        );
      }
      trip = {
        id: makeId('trp'),
        schema_version: 1,
        title: String(body.title).trim(),
        start_date: body.start_date,
        end_date: body.end_date,
        home_tz: body.home_tz || 'Australia/Sydney',
        followers_label: body.followers_label || 'Followers',
        cities: [],
        items: [],
        days: [],
        checkins: [],
        share: { enabled: false, created_at: null },
        created_at: nowIso,
        updated_at: nowIso
      };
      validateTrip(trip);
    }

    const saved = await ctx.repo.createTrip(trip);
    return okResponse(201, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelTripsHandler();
