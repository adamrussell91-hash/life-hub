import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import {
  audioBytesKey,
  audioMetaKey,
  defaultGetTravelStore,
  photoBytesKey,
  photoMetaKey
} from './_shared/travel-blobs.mjs';
import { validateTrip } from './_shared/travel-schema.mjs';
import {
  cleanPostcardInput,
  latestCheckinForItem,
  postcardMediaOfItem
} from './_shared/travel-postcard.mjs';

export const config = { path: '/api/travel-postcard' };

async function belongsToTrip(store, metaKey, tripId) {
  try {
    const raw = await store.get(metaKey, { type: 'text' });
    return Boolean(raw) && JSON.parse(raw).trip_id === tripId;
  } catch {
    return false;
  }
}

/**
 * Owner only.
 * PUT ?trip=…&item=… with { if_version, postcard }: write a postcard onto the stop's latest check-in.
 * DELETE ?trip=…&item=… with { if_version }: take the stop's postcard back and delete its files.
 */
export function createTravelPostcardHandler(deps = {}) {
  const getStore = deps.getTravelStore ?? defaultGetTravelStore;
  const bad = (message) => errorResponse(400, 'validation_error', message, false, PRIVATE_CACHE);

  return createTravelOperatorHandler(async (request, ctx) => {
    if (request.method !== 'PUT' && request.method !== 'DELETE') {
      return errorResponse(405, 'method_not_allowed', 'Use PUT or DELETE.', false, PRIVATE_CACHE);
    }
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    const itemId = url.searchParams.get('item');
    if (!tripId || !itemId) return bad('trip and item are required.');
    const body = (await readJson(request)) || {};

    const { trip, version } = await ctx.repo.getTrip(tripId);
    if (!(trip.items || []).some((i) => i.id === itemId)) {
      return bad('item does not match a stop on this trip.');
    }
    const ifVersion = typeof body.if_version === 'string' && body.if_version ? body.if_version : version;
    const store = await getStore(ctx.env);
    const media = postcardMediaOfItem(trip.checkins, itemId);
    const hasCard = media.photoIds.length > 0 || media.audioIds.length > 0;

    if (request.method === 'DELETE') {
      if (!hasCard) {
        return errorResponse(404, 'not_found', 'No postcard on this stop.', false, PRIVATE_CACHE);
      }
      for (const c of trip.checkins) {
        if (c?.item_id !== itemId) continue;
        delete c.postcard;
        delete c.photo_id;
      }
      trip.updated_at = new Date(ctx.now()).toISOString();
      validateTrip(trip);
      const saved = await ctx.repo.saveTrip(trip, ifVersion, `travel: postcard removed from ${itemId}`);
      // The trip no longer names these files. A failed delete only leaves an orphan behind.
      const keys = [
        ...media.photoIds.flatMap((id) => [photoBytesKey(id), photoMetaKey(id)]),
        ...media.audioIds.flatMap((id) => [audioBytesKey(id), audioMetaKey(id)])
      ];
      for (const key of keys) {
        try {
          await store.delete(key);
        } catch (error) {
          console.error('travel postcard: file delete failed', error?.message);
        }
      }
      return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
    }

    const postcard = cleanPostcardInput(body.postcard);
    if (hasCard) {
      return errorResponse(
        409,
        'postcard_exists',
        'This stop already has a postcard. Remove it first.',
        false,
        PRIVATE_CACHE
      );
    }
    const carrier = latestCheckinForItem(trip.checkins, itemId);
    if (!carrier) return bad('Tick this stop safe first.');
    if (!(await belongsToTrip(store, photoMetaKey(postcard.photo_id), tripId))) {
      return bad('That photo is not on this trip.');
    }
    if (postcard.audio_id && !(await belongsToTrip(store, audioMetaKey(postcard.audio_id), tripId))) {
      return bad('That recording is not on this trip.');
    }

    const postedAt = new Date(ctx.now()).toISOString();
    carrier.postcard = { ...postcard, posted_at: postedAt };
    // Browsers still running the old code read the photo from here.
    carrier.photo_id = postcard.photo_id;
    trip.updated_at = postedAt;
    validateTrip(trip);
    const saved = await ctx.repo.saveTrip(trip, ifVersion, `travel: postcard from ${itemId}`);
    return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
  }, deps);
}

export default createTravelPostcardHandler();
