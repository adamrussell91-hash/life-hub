import { createHash, randomBytes } from 'node:crypto';
import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { validateTrip } from './_shared/travel-schema.mjs';

export const config = { path: '/api/travel-share' };

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createTravelShareHandler(deps = {}) {
  return createTravelOperatorHandler(async (request, ctx) => {
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    if (!tripId) {
      return errorResponse(400, 'validation_error', 'trip is required.', false, PRIVATE_CACHE);
    }

    if (request.method === 'POST') {
      const { trip, version } = await ctx.repo.getTrip(tripId);
      const { map, version: shareVersion } = await ctx.repo.getShareTokens();
      // revoke prior tokens for this trip
      for (const [hash, row] of Object.entries(map)) {
        if (row.trip_id === tripId) delete map[hash];
      }
      const token = randomBytes(32).toString('base64url');
      const created_at = new Date(ctx.now()).toISOString();
      map[tokenHash(token)] = { trip_id: tripId, created_at };
      await ctx.repo.saveShareTokens(map, shareVersion);
      trip.share = { enabled: true, created_at };
      trip.updated_at = created_at;
      validateTrip(trip);
      await ctx.repo.saveTrip(trip, version, 'travel: enable public link');
      const publicUrl = `https://life-hub.adam-russell.com/travel/t/${token}`;
      return okResponse(200, { url: publicUrl }, PRIVATE_CACHE);
    }

    if (request.method === 'DELETE') {
      const { trip, version } = await ctx.repo.getTrip(tripId);
      const { map, version: shareVersion } = await ctx.repo.getShareTokens();
      for (const [hash, row] of Object.entries(map)) {
        if (row.trip_id === tripId) delete map[hash];
      }
      await ctx.repo.saveShareTokens(map, shareVersion);
      trip.share = { enabled: false, created_at: null };
      trip.updated_at = new Date(ctx.now()).toISOString();
      validateTrip(trip);
      await ctx.repo.saveTrip(trip, version, 'travel: disable public link');
      return okResponse(200, { enabled: false }, PRIVATE_CACHE);
    }

    return errorResponse(405, 'method_not_allowed', 'Use POST or DELETE.', false, PRIVATE_CACHE);
  }, deps);
}

export default createTravelShareHandler();
