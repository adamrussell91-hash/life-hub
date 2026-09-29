/**
 * Transport for NSW Trip Planner (Open Data, rapidJSON) as a leave-by provider.
 * Day Sense step 9 (docs/proposals/calendar-day-sense.md §3.4).
 *
 * The API key lives only in the Functions environment (TFNSW_API_KEY) and is sent as a
 * header. It never reaches the client, the repo or a log line (URLs logged here carry
 * no key). No scraping, no guessing: when the planner has no live data the plan says
 * "timetable"; when it fails, the caller shows why.
 *
 * Provider interface (so another source can replace it):
 *   resolve(text) → { id, name, type } | null
 *   trip({ from, to, date, time, mode: 'arr' | 'dep' }) → journeys (see parseTrip)
 */

export const TFNSW_BASE = 'https://api.transport.nsw.gov.au/v1/tp';
const TIMEOUT_MS = 8000;

export class TransportError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const SYDNEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
});

/** ISO instant → { date: 'YYYY-MM-DD', time: 'HH:MM' } in Sydney. */
export function sydneyWall(iso) {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(SYDNEY.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`, ms };
}

/** TfNSW product classes → a short mode name. */
const MODE = { 1: 'train', 2: 'metro', 4: 'light_rail', 5: 'bus', 7: 'coach', 9: 'ferry', 11: 'school_bus', 99: 'walk', 100: 'walk', 107: 'cycle' };

export function modeOf(leg) {
  const cls = Number(leg?.transportation?.product?.class);
  if (MODE[cls]) return MODE[cls];
  const name = String(leg?.transportation?.product?.name ?? '').toLowerCase();
  if (name.includes('foot') || name.includes('walk')) return 'walk';
  return name || 'transit';
}

function stopName(point) {
  return String(point?.disassembledName || point?.name || '').replace(/\s+/g, ' ').trim();
}

/**
 * rapidJSON /trip → journeys, each { leave, board, arrive, legs, realtime, walkMinutes }.
 * `leave` is when you set off (first leg), `board` the first vehicle, `arrive` the last leg.
 */
export function parseTrip(json) {
  const out = [];
  for (const journey of json?.journeys ?? []) {
    const legs = [];
    for (const leg of journey?.legs ?? []) {
      const depart = sydneyWall(leg?.origin?.departureTimeEstimated || leg?.origin?.departureTimePlanned);
      const arrive = sydneyWall(leg?.destination?.arrivalTimeEstimated || leg?.destination?.arrivalTimePlanned);
      if (!depart || !arrive) continue;
      const mode = modeOf(leg);
      legs.push({
        mode,
        line: mode === 'walk' ? '' : String(leg?.transportation?.disassembledName || leg?.transportation?.number || leg?.transportation?.name || '').trim(),
        from: stopName(leg.origin),
        to: stopName(leg.destination),
        depart: depart.time,
        arrive: arrive.time,
        departMs: depart.ms,
        arriveMs: arrive.ms,
        realtime: leg?.isRealtimeControlled === true || Boolean(leg?.origin?.departureTimeEstimated),
        minutes: Math.max(0, Math.round((arrive.ms - depart.ms) / 60000))
      });
    }
    if (!legs.length) continue;
    const first = legs[0];
    const last = legs[legs.length - 1];
    const board = legs.find((leg) => leg.mode !== 'walk' && leg.mode !== 'cycle') ?? null;
    out.push({
      date: sydneyWall(new Date(first.departMs).toISOString()).date,
      leave: first.depart,
      leaveMs: first.departMs,
      board: board ? board.depart : null,
      arrive: last.arrive,
      arriveMs: last.arriveMs,
      realtime: legs.some((leg) => leg.mode !== 'walk' && leg.realtime),
      walkMinutes: legs.filter((leg) => leg.mode === 'walk').reduce((sum, leg) => sum + leg.minutes, 0),
      legs: legs.map(({ departMs, arriveMs, ...leg }) => leg)
    });
  }
  return out;
}

/**
 * The journey to use.
 * arr: the latest departure that still arrives by the target (least waiting around).
 * dep: the earliest arrival leaving at or after the target.
 */
export function pickJourney(journeys, { mode, targetMs }) {
  if (!journeys?.length) return null;
  if (mode === 'arr') {
    const onTime = journeys.filter((j) => j.arriveMs <= targetMs).sort((a, b) => b.leaveMs - a.leaveMs || a.arriveMs - b.arriveMs);
    return onTime[0] ?? [...journeys].sort((a, b) => a.arriveMs - b.arriveMs)[0];
  }
  const after = journeys.filter((j) => j.leaveMs >= targetMs - 60000);
  return (after.length ? after : journeys).sort((a, b) => a.arriveMs - b.arriveMs)[0];
}

/** rapidJSON /stop_finder → the best location, or null. */
export function parseStopFinder(json) {
  const locations = Array.isArray(json?.locations) ? json.locations : [];
  const best = locations.find((row) => row?.isBest) ?? [...locations].sort((a, b) => (b?.matchQuality ?? 0) - (a?.matchQuality ?? 0))[0];
  if (!best?.id) return null;
  return { id: String(best.id), name: String(best.disassembledName || best.name || best.id), type: String(best.type || 'any') };
}

export function createTfnswProvider({ env = process.env, fetchImpl = fetch } = {}) {
  const key = typeof env?.TFNSW_API_KEY === 'string' ? env.TFNSW_API_KEY.trim() : '';
  async function call(path, params) {
    if (!key) throw new TransportError('transport_unconfigured', 'Transport times are not set up yet.', 503);
    const query = new URLSearchParams({ outputFormat: 'rapidJSON', coordOutputFormat: 'EPSG:4326', ...params });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(`${TFNSW_BASE}/${path}?${query}`, {
        headers: { authorization: `apikey ${key}`, accept: 'application/json' },
        signal: controller.signal
      });
    } catch {
      throw new TransportError('transport_unreachable', 'Transport for NSW did not answer in time.');
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
      throw new TransportError('transport_key_rejected', 'Transport for NSW rejected the API key.', 502);
    }
    if (!response.ok) throw new TransportError('transport_failed', `Transport for NSW answered ${response.status}.`);
    return response.json();
  }
  return {
    async resolve(text) {
      const json = await call('stop_finder', { type_sf: 'any', name_sf: String(text), TfNSWSF: 'true' });
      return parseStopFinder(json);
    },
    async trip({ from, to, date, time, mode }) {
      const json = await call('trip', {
        depArrMacro: mode === 'dep' ? 'dep' : 'arr',
        itdDate: date.replace(/-/g, ''),
        itdTime: time.replace(':', ''),
        type_origin: 'any',
        name_origin: from.id,
        type_destination: 'any',
        name_destination: to.id,
        calcNumberOfTrips: '5',
        TfNSWTR: 'true'
      });
      return parseTrip(json);
    }
  };
}
