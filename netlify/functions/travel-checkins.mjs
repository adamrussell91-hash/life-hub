import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { makeId, validateTrip } from './_shared/travel-schema.mjs';

export const config = { path: '/api/travel-checkins' };

export function createTravelCheckinsHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use POST.', false, PRIVATE_CACHE);
    }
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    const body = await readJson(request);
    if (!tripId || !body?.city_id || !body?.label) {
      return errorResponse(
        400,
        'validation_error',
        'trip, city_id and label are required.',
        false,
        PRIVATE_CACHE
      );
    }
    const { trip, version } = await ctx.repo.getTrip(tripId);
    const ifVersion = body.if_version || version;
    const checkin = {
      id: makeId('chk'),
      at: new Date(ctx.now()).toISOString(),
      city_id: body.city_id,
      label: String(body.label)
    };
    trip.checkins = [...(trip.checkins || []), checkin];
    trip.updated_at = checkin.at;
    validateTrip(trip);
    const saved = await ctx.repo.saveTrip(
      trip,
      ifVersion,
      `travel: check-in ${body.city_id}`
    );
    return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelCheckinsHandler();
