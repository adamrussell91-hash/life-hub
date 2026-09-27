import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { validateTrip } from './_shared/travel-schema.mjs';

export const config = { path: '/api/travel-trip' };

export function createTravelTripHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return errorResponse(400, 'validation_error', 'id is required.', false, PRIVATE_CACHE);
    }

    if (request.method === 'GET') {
      const { trip, version } = await ctx.repo.getTrip(id);
      return okResponse(200, { trip, version }, PRIVATE_CACHE);
    }

    if (request.method === 'DELETE') {
      const body = await readJson(request);
      const version = body?.if_version || url.searchParams.get('if_version');
      if (!version) {
        return errorResponse(400, 'validation_error', 'if_version is required.', false, PRIVATE_CACHE);
      }
      const result = await ctx.repo.deleteTrip(id, version);
      return okResponse(200, result, PRIVATE_CACHE);
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      if (!body?.if_version || !body.patch) {
        return errorResponse(
          400,
          'validation_error',
          'if_version and patch are required.',
          false,
          PRIVATE_CACHE
        );
      }
      const { trip } = await ctx.repo.getTrip(id);
      const { items: _i, checkins: _c, ...safePatch } = body.patch;
      const next = {
        ...trip,
        ...safePatch,
        id: trip.id,
        schema_version: 1,
        items: trip.items,
        checkins: trip.checkins,
        updated_at: new Date(ctx.now()).toISOString()
      };
      validateTrip(next);
      const saved = await ctx.repo.saveTrip(next, body.if_version, `travel: edit trip "${next.title}"`);
      return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
    }

    return errorResponse(405, 'method_not_allowed', 'Use GET, PATCH or DELETE.', false, PRIVATE_CACHE);
  }, deps);
}

export default createTravelTripHandler();
