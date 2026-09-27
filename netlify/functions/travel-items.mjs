import {
  createTravelOperatorHandler,
  okResponse,
  errorResponse,
  readJson,
  PRIVATE_CACHE
} from './_shared/travel-http.mjs';
import { makeId, normalizeItem, validateTrip } from './_shared/travel-schema.mjs';
import { createRatesClient, fillMoney } from './_shared/travel-rates.mjs';

export const config = { path: '/api/travel-items' };

export function createTravelItemsHandler(deps = {}) {
  const rates = deps.rates ?? createRatesClient({ fetchImpl: deps.fetchImpl ?? fetch });

  return createTravelOperatorHandler(async (request, ctx) => {
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip');
    if (!tripId) {
      return errorResponse(400, 'validation_error', 'trip is required.', false, PRIVATE_CACHE);
    }

    const body = await readJson(request);
    if (!body?.if_version) {
      return errorResponse(400, 'validation_error', 'if_version is required.', false, PRIVATE_CACHE);
    }

    const { trip } = await ctx.repo.getTrip(tripId);
    const nowIso = new Date(ctx.now()).toISOString();

    if (request.method === 'POST') {
      if (!body.item) {
        return errorResponse(400, 'validation_error', 'item is required.', false, PRIVATE_CACHE);
      }
      const item = normalizeItem(body.item, { id: makeId('itm'), now: nowIso });
      if (item.cost) item.cost = await fillMoney(item.cost, rates);
      if (item.hop?.cost) item.hop.cost = await fillMoney(item.hop.cost, rates);
      trip.items = [...trip.items, item];
      trip.updated_at = nowIso;
      validateTrip(trip);
      const saved = await ctx.repo.saveTrip(
        trip,
        body.if_version,
        `travel: add "${item.title}" to ${item.date.slice(8)} ${monthShort(item.date)}`
      );
      return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
    }

    if (request.method === 'PATCH') {
      const itemId = url.searchParams.get('id');
      if (!itemId || !body.item) {
        return errorResponse(400, 'validation_error', 'id and item are required.', false, PRIVATE_CACHE);
      }
      const idx = trip.items.findIndex((i) => i.id === itemId);
      if (idx < 0) {
        return errorResponse(404, 'not_found', 'Item not found.', false, PRIVATE_CACHE);
      }
      const prev = trip.items[idx];
      const item = normalizeItem(
        { ...prev, ...body.item, id: itemId, created_at: prev.created_at },
        { id: itemId, now: nowIso }
      );
      if (item.cost && (item.cost.aud == null || body.item.cost)) {
        item.cost = await fillMoney(
          body.item.cost ? { amount: body.item.cost.amount, currency: body.item.cost.currency } : item.cost,
          rates
        );
      }
      trip.items = trip.items.map((i, n) => (n === idx ? item : i));
      trip.updated_at = nowIso;
      validateTrip(trip);
      const saved = await ctx.repo.saveTrip(trip, body.if_version, `travel: edit "${item.title}"`);
      return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
    }

    if (request.method === 'DELETE') {
      const itemId = url.searchParams.get('id');
      if (!itemId) {
        return errorResponse(400, 'validation_error', 'id is required.', false, PRIVATE_CACHE);
      }
      const prev = trip.items.find((i) => i.id === itemId);
      trip.items = trip.items.filter((i) => i.id !== itemId);
      trip.updated_at = nowIso;
      validateTrip(trip);
      const saved = await ctx.repo.saveTrip(
        trip,
        body.if_version,
        `travel: remove "${prev?.title || itemId}"`
      );
      return okResponse(200, { trip: saved.trip, version: saved.version }, PRIVATE_CACHE);
    }

    return errorResponse(405, 'method_not_allowed', 'Use POST, PATCH or DELETE.', false, PRIVATE_CACHE);
  }, deps);
}

function monthShort(iso) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[Number(iso.slice(5, 7)) - 1] || '';
}

export default createTravelItemsHandler();
