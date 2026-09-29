/**
 * /api/transport — leave-by times (Day Sense step 9).
 *
 *   GET  ?to=<place>&date=YYYY-MM-DD&time=HH:MM&mode=arr|dep&from=home|school|<place>
 *        → { plan } : when to leave, the first vehicle, arrival, legs, live or timetable
 *   GET  ?places=1  → { places: { home, school } }
 *   POST { places: { home?, school? } }  (free text: an address, station or stop)
 *
 * The TfNSW key stays server-side. Stops are resolved once and cached for 30 days;
 * trips for 5 minutes (live times move). Places are Adam's own two, kept beside the
 * planning profile. Missing place or key → the reason, never a guess.
 */
import { createHash } from 'node:crypto';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';
import { createTfnswProvider, pickJourney, TransportError } from './_shared/tfnsw.mjs';
import { wallLocalToUtcIso } from './_shared/wall-time.mjs';

export const config = { path: '/api/transport' };

export const PLACES_KEY = 'meta/transport_places';
const STOP_TTL_MS = 30 * 86_400_000;
const TRIP_TTL_MS = 5 * 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const clean = (value, max = 160) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function readPlaces(store) {
  const row = await getJSON(store, PLACES_KEY).catch(() => null);
  return { home: clean(row?.home), school: clean(row?.school) };
}

/** Validate a GET into a trip request, or { error }. */
export function readTripQuery(url) {
  const params = url.searchParams;
  const to = clean(params.get('to'));
  const from = clean(params.get('from')) || 'home';
  const date = params.get('date') ?? '';
  const time = params.get('time') ?? '';
  const mode = params.get('mode') === 'dep' ? 'dep' : 'arr';
  if (!to || !DATE.test(date) || !TIME.test(time)) return { error: 'to, date (YYYY-MM-DD) and time (HH:MM) are required.' };
  return { to, from, date, time, mode };
}

async function cached(store, key, ttl, nowMs, load) {
  const hit = await getJSON(store, key).catch(() => null);
  if (hit && Number.isFinite(hit.at) && nowMs - hit.at < ttl) return hit.value;
  const value = await load();
  await setJSON(store, key, { at: nowMs, value }).catch(() => {});
  return value;
}

/**
 * The plan for one trip. Pure apart from `provider` and `store`.
 * @returns {Promise<object>}
 */
export async function planTrip({ provider, store, request, places, nowMs = Date.now() }) {
  const originText = request.from === 'home' || request.from === 'school' ? places[request.from] : request.from;
  if (!originText) {
    throw new TransportError('transport_place_missing', `Add your ${request.from === 'school' ? 'school' : 'home'} stop or address first.`, 409);
  }
  const resolve = (text) => cached(store, `meta/tfnsw_stop/${hash(text.toLowerCase())}`, STOP_TTL_MS, nowMs, () => provider.resolve(text));
  const [from, to] = await Promise.all([resolve(originText), resolve(request.to)]);
  if (!from) throw new TransportError('transport_origin_unknown', `Transport for NSW could not find “${originText}”.`, 422);
  if (!to) throw new TransportError('transport_destination_unknown', `Transport for NSW could not find “${request.to}”.`, 422);
  const tripKey = `meta/tfnsw_trip/${hash(`${from.id}|${to.id}|${request.date}|${request.time}|${request.mode}`)}`;
  const journeys = await cached(store, tripKey, TRIP_TTL_MS, nowMs, () => provider.trip({ from, to, date: request.date, time: request.time, mode: request.mode }));
  const targetMs = Date.parse(wallLocalToUtcIso(`${request.date}T${request.time}`, 'Australia/Sydney'));
  const journey = pickJourney(journeys, { mode: request.mode, targetMs });
  if (!journey) throw new TransportError('transport_no_trip', 'No trip found for that time.', 404);
  const { leaveMs, arriveMs, ...rest } = journey;
  return {
    ...rest,
    from: { name: from.name, place: request.from },
    to: { name: to.name },
    target: { mode: request.mode, date: request.date, time: request.time },
    // Arrive-by: minutes to spare. Leave-after ("Need 10 minutes"): minutes late (negative = early).
    lateMinutes: request.mode === 'arr' ? Math.round((arriveMs - targetMs) / 60000) : null,
    status: journey.realtime ? 'realtime' : 'timetable',
    source: 'tfnsw',
    fetched_at: new Date(nowMs).toISOString()
  };
}

export function createTransportHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    const now = deps.now ?? Date.now;
    if (request.method === 'POST') {
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const next = parsed.value?.places;
      if (!next || typeof next !== 'object') return withCors(errorResponse(400, 'invalid_request', 'places { home, school } required', false), request, env);
      const current = await readPlaces(store);
      const places = {
        home: next.home !== undefined ? clean(next.home) : current.home,
        school: next.school !== undefined ? clean(next.school) : current.school
      };
      await setJSON(store, PLACES_KEY, { ...places, updated_at: new Date(now()).toISOString() });
      return withCors(okResponse(200, { places }), request, env);
    }
    if (request.method !== 'GET') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    const url = new URL(request.url);
    const places = await readPlaces(store);
    if (url.searchParams.get('places') === '1') return withCors(okResponse(200, { places }), request, env);
    const trip = readTripQuery(url);
    if (trip.error) return withCors(errorResponse(400, 'invalid_request', trip.error, false), request, env);
    try {
      const provider = (deps.createProvider ?? createTfnswProvider)({ env, fetchImpl: deps.fetchImpl ?? fetch });
      const plan = await planTrip({ provider, store, request: trip, places, nowMs: now() });
      return withCors(okResponse(200, { plan }), request, env);
    } catch (error) {
      if (error instanceof TransportError) {
        return withCors(errorResponse(error.status, error.code, error.message, error.status >= 500), request, env);
      }
      return withCors(errorResponse(502, 'transport_failed', 'Transport times are unavailable right now.', true), request, env);
    }
  }, { ...deps, getContentStore: deps.getContentStore ?? defaultGetTasksStore });
}

export default createTransportHandler();
