// Clare / Hammond: propose Travel itinerary items and check-ins. Confirm-only.
// Writes use virtual travel:trip:<id> paths; Confirm runs createTravelWriteExecutor
// against createTravelRepository (optimistic if_version), never raw Blob dumps.

import { createTravelRepository } from './travel-repository.mjs';
import { makeId, normalizeItem, validateTrip } from './travel-schema.mjs';
import { clean, makeProposal } from './agent-propose-helpers.mjs';

const TRIP_ID_RE = /^[a-z0-9_]{4,64}$/i;
const KINDS = new Set(['do', 'food', 'transit', 'med', 'stay', 'flight', 'train', 'checkin_slot']);

export function proposeTravelItemSchema() {
  return {
    name: 'propose_travel_item',
    description:
      'Propose adding an itinerary item to a Travel trip (do/food/transit/stay/flight/train/…). Nothing is saved until Adam taps Confirm. Requires trip_id and the current if_version from the trip (load the trip first when unsure).',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        trip_id: { type: 'string' },
        if_version: { type: 'string', description: 'Trip blob SHA for optimistic concurrency.' },
        item: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: [...KINDS] },
            title: { type: 'string' },
            date: { type: 'string' },
            city_id: { type: 'string' },
            time: { type: 'string' },
            status: { type: 'string' },
            note: { type: 'string' },
            place: { type: 'object' },
            cost: { type: 'object' },
            link: { type: 'string' },
            nights: { type: 'number' },
            check_out_date: { type: 'string' },
            carrier: { type: 'string' },
            number: { type: 'string' },
            from_code: { type: 'string' },
            to_code: { type: 'string' },
            depart_time: { type: 'string' },
            arrive_time: { type: 'string' },
            arrive_date: { type: 'string' }
          },
          required: ['kind', 'title', 'date', 'city_id'],
          additionalProperties: true
        }
      },
      required: ['summary', 'trip_id', 'item'],
      additionalProperties: false
    }
  };
}

export function proposeTravelCheckinSchema() {
  return {
    name: 'propose_travel_checkin',
    description:
      'Propose a Travel city check-in on a trip. Nothing is saved until Adam taps Confirm. Requires trip_id, city_id, label, and if_version when known.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        trip_id: { type: 'string' },
        if_version: { type: 'string' },
        city_id: { type: 'string' },
        label: { type: 'string' }
      },
      required: ['summary', 'trip_id', 'city_id', 'label'],
      additionalProperties: false
    }
  };
}

function tripPath(tripId) {
  return `travel:trip:${tripId}`;
}

/** Resolve if_version from input or by loading the trip when a repo is supplied. */
export async function resolveTravelVersion(tripId, ifVersion, { loadTrip } = {}) {
  const given = clean(ifVersion, 80);
  if (given) return { ok: true, if_version: given };
  if (typeof loadTrip !== 'function') return { ok: false, error: 'if_version_required' };
  try {
    const loaded = await loadTrip(tripId);
    const version = clean(loaded?.version, 80);
    if (!version) return { ok: false, error: 'trip_not_found', detail: tripId };
    return { ok: true, if_version: version, trip: loaded.trip };
  } catch {
    return { ok: false, error: 'trip_not_found', detail: tripId };
  }
}

export async function buildTravelItemProposal(input, { loadTrip } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const tripId = clean(input.trip_id, 64);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!TRIP_ID_RE.test(tripId)) return { ok: false, error: 'invalid_trip_id' };
  if (!input.item || typeof input.item !== 'object') return { ok: false, error: 'item_required' };

  let normalized;
  try {
    normalized = normalizeItem(input.item, { id: makeId('itm'), now: '1970-01-01T00:00:00.000Z' });
  } catch (error) {
    return { ok: false, error: 'invalid_item', detail: error?.message || 'item failed validation' };
  }

  const version = await resolveTravelVersion(tripId, input.if_version, { loadTrip });
  if (!version.ok) return version;

  const body = {
    op: 'add_item',
    trip_id: tripId,
    if_version: version.if_version,
    item: input.item
  };
  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path: tripPath(tripId),
      mode: 'overwrite',
      content: JSON.stringify(body),
      diff: `Travel item: ${normalized.title} (${normalized.kind}) on ${normalized.date}`
    }], {
      reads: [tripPath(tripId)],
      surfaces: ['confirm_card', 'travel', 'governance_log']
    })
  };
}

export async function buildTravelCheckinProposal(input, { loadTrip } = {}) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  const tripId = clean(input.trip_id, 64);
  const cityId = clean(input.city_id, 64);
  const label = clean(input.label, 160);
  if (!summary) return { ok: false, error: 'summary_required' };
  if (!TRIP_ID_RE.test(tripId)) return { ok: false, error: 'invalid_trip_id' };
  if (!cityId) return { ok: false, error: 'city_id_required' };
  if (!label) return { ok: false, error: 'label_required' };

  const version = await resolveTravelVersion(tripId, input.if_version, { loadTrip });
  if (!version.ok) return version;

  const body = {
    op: 'checkin',
    trip_id: tripId,
    if_version: version.if_version,
    city_id: cityId,
    label
  };
  return {
    ok: true,
    proposal: makeProposal(summary, [{
      path: tripPath(tripId),
      mode: 'overwrite',
      content: JSON.stringify(body),
      diff: `Travel check-in: ${label} (${cityId})`
    }], {
      reads: [tripPath(tripId)],
      surfaces: ['confirm_card', 'travel', 'governance_log']
    })
  };
}

/** Confirm executor — applies add_item / checkin against the travel repo. */
export function createTravelWriteExecutor({
  env,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  createRepo = createTravelRepository
} = {}) {
  const repo = createRepo({ env, fetchImpl });

  return {
    async apply(write) {
      let body;
      try {
        body = JSON.parse(write.content);
      } catch {
        return { ok: false, error: 'invalid_travel_write', detail: write.path };
      }
      if (!body || typeof body !== 'object') {
        return { ok: false, error: 'invalid_travel_write', detail: write.path };
      }
      const tripId = clean(body.trip_id, 64);
      const ifVersion = clean(body.if_version, 80);
      if (!TRIP_ID_RE.test(tripId) || !ifVersion) {
        return { ok: false, error: 'invalid_travel_write', detail: 'trip_id and if_version required' };
      }

      const { trip } = await repo.getTrip(tripId);
      const nowIso = typeof now === 'function' ? now() : String(now);

      if (body.op === 'add_item') {
        const item = normalizeItem(body.item, { id: makeId('itm'), now: nowIso });
        trip.items = [...(trip.items || []), item];
        trip.updated_at = nowIso;
        validateTrip(trip);
        const saved = await repo.saveTrip(
          trip,
          ifVersion,
          `travel: add "${item.title}" to ${item.date}`
        );
        return {
          ok: true,
          result: { path: write.path, mode: write.mode, id: item.id, version: saved.version }
        };
      }

      if (body.op === 'checkin') {
        const cityId = clean(body.city_id, 64);
        const label = clean(body.label, 160);
        if (!cityId || !label) {
          return { ok: false, error: 'invalid_travel_write', detail: 'city_id and label required' };
        }
        const checkin = {
          id: makeId('chk'),
          at: nowIso,
          city_id: cityId,
          label
        };
        trip.checkins = [...(trip.checkins || []), checkin];
        trip.updated_at = nowIso;
        validateTrip(trip);
        const saved = await repo.saveTrip(trip, ifVersion, `travel: check-in ${cityId}`);
        return {
          ok: true,
          result: { path: write.path, mode: write.mode, id: checkin.id, version: saved.version }
        };
      }

      return { ok: false, error: 'unknown_travel_op', detail: body.op };
    }
  };
}
