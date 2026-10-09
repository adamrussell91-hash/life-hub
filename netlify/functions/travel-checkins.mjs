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

    let cityId = String(body.city_id);
    let itemId = typeof body.item_id === 'string' && body.item_id.trim() ? body.item_id.trim() : undefined;
    if (itemId) {
      const item = (trip.items || []).find((i) => i.id === itemId);
      if (!item) {
        return errorResponse(400, 'validation_error', 'item_id does not match a stop on this trip.', false, PRIVATE_CACHE);
      }
      cityId = item.city_id;
    }
    if (!(trip.cities || []).some((c) => c.id === cityId)) {
      return errorResponse(400, 'validation_error', 'city_id is not on this trip.', false, PRIVATE_CACHE);
    }

    let photoId = typeof body.photo_id === 'string' && body.photo_id.trim() ? body.photo_id.trim() : undefined;
    if (photoId && !/^tph_[a-z0-9]+$/i.test(photoId)) {
      return errorResponse(400, 'validation_error', 'photo_id is invalid.', false, PRIVATE_CACHE);
    }

    const checkin = {
      id: makeId('chk'),
      at: new Date(ctx.now()).toISOString(),
      city_id: cityId,
      label: String(body.label).trim() || 'Safe',
      ...(itemId ? { item_id: itemId } : {}),
      ...(photoId ? { photo_id: photoId } : {})
    };
    trip.checkins = [...(trip.checkins || []), checkin];
    trip.updated_at = checkin.at;
    validateTrip(trip);
    const saved = await ctx.repo.saveTrip(
      trip,
      ifVersion,
      itemId ? `travel: marked safe at ${itemId}` : `travel: check-in ${cityId}`
    );
    return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelCheckinsHandler();
