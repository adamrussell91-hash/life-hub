/**
 * Step 9: leave-by from Transport for NSW (rapidJSON), the /api/transport endpoint,
 * and the Day dial wedge + "Getting there" panel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createTfnswProvider, parseStopFinder, parseTrip, pickJourney } from '../../netlify/functions/_shared/tfnsw.mjs';
import { createTransportHandler, planTrip, readTripQuery } from '../../netlify/functions/transport.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { leaveByCandidate, legsLine, minutesLate, transportPath, wedgeFor, wedgeWidth } from '../../packages/design-kit/js/calendar/transport-model.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { eventsFromCalendarFeeds } from '../../packages/design-kit/js/calendar/ical-calendar.js';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const TODAY = '2026-09-29'; // AEST (+10) until 4 Oct
const WEEK = ['2026-09-28', TODAY, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const KEY = 'test-key-not-real';

const leg = (from, to, dep, arr, product, extra = {}) => ({
  origin: { name: from, departureTimePlanned: dep, ...(extra.realtime ? { departureTimeEstimated: dep } : {}) },
  destination: { name: to, arrivalTimePlanned: arr },
  transportation: { product: { class: product, name: product === 100 ? 'footpath' : 'Sydney Trains' }, disassembledName: extra.line ?? '' },
  isRealtimeControlled: Boolean(extra.realtime)
});
const TRIP = {
  journeys: [
    { legs: [leg('School', 'Kings Cross Station', '2026-09-29T05:40:00Z', '2026-09-29T05:46:00Z', 100), leg('Kings Cross Station', 'Bondi Junction Station', '2026-09-29T05:51:00Z', '2026-09-29T06:03:00Z', 1, { line: 'T4', realtime: true }), leg('Bondi Junction Station', 'Oxford St', '2026-09-29T06:03:00Z', '2026-09-29T06:18:00Z', 100)] },
    { legs: [leg('School', 'Kings Cross Station', '2026-09-29T05:25:00Z', '2026-09-29T05:31:00Z', 100), leg('Kings Cross Station', 'Bondi Junction Station', '2026-09-29T05:36:00Z', '2026-09-29T05:48:00Z', 1, { line: 'T4', realtime: true })] },
    { legs: [leg('School', 'Kings Cross Station', '2026-09-29T06:00:00Z', '2026-09-29T06:06:00Z', 100), leg('Kings Cross Station', 'Bondi Junction Station', '2026-09-29T06:21:00Z', '2026-09-29T06:38:00Z', 1, { line: 'T4' })] }
  ]
};

test('rapidJSON: legs in Sydney time, first vehicle, live flag; arrive-by picks the latest that is on time', () => {
  const journeys = parseTrip(TRIP);
  assert.equal(journeys.length, 3);
  const [a] = journeys;
  assert.deepEqual([a.leave, a.board, a.arrive, a.walkMinutes, a.realtime], ['15:40', '15:51', '16:18', 21, true]);
  assert.deepEqual(a.legs.map((l) => l.mode), ['walk', 'train', 'walk']);
  assert.equal(a.legs[1].line, 'T4');
  const target = Date.parse('2026-09-29T06:30:00Z'); // 4:30 pm
  assert.equal(pickJourney(journeys, { mode: 'arr', targetMs: target }).leave, '15:40', 'not the 3:25 (waits longer), not the 4:00 (late)');
  assert.equal(pickJourney(journeys, { mode: 'dep', targetMs: Date.parse('2026-09-29T05:50:00Z') }).leave, '16:00');
  assert.equal(journeys[2].realtime, false, 'timetable only');
  assert.deepEqual(parseStopFinder({ locations: [{ id: 'a', name: 'A', matchQuality: 5 }, { id: '200060', name: 'Central Station', isBest: true, type: 'stop' }] }), { id: '200060', name: 'Central Station', type: 'stop' });
  assert.equal(parseStopFinder({ locations: [] }), null);
});

test('provider: key only in the Authorization header; no key means "not set up", never a guess', async () => {
  const calls = [];
  const provider = createTfnswProvider({
    env: { TFNSW_API_KEY: KEY },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ locations: [{ id: '1', name: 'X', isBest: true }] }), { status: 200 });
    }
  });
  await provider.resolve('Central');
  assert.equal(calls[0].init.headers.authorization, `apikey ${KEY}`);
  assert.ok(!calls[0].url.includes(KEY), 'the key is never in a URL');
  assert.match(calls[0].url, /^https:\/\/api\.transport\.nsw\.gov\.au\/v1\/tp\/stop_finder\?outputFormat=rapidJSON&coordOutputFormat=EPSG%3A4326/);
  await provider.trip({ from: { id: 'a' }, to: { id: 'b' }, date: TODAY, time: '16:30', mode: 'arr' }).catch(() => {});
  const trip = new URL(calls[1].url);
  assert.deepEqual([trip.searchParams.get('depArrMacro'), trip.searchParams.get('itdDate'), trip.searchParams.get('itdTime'), trip.searchParams.get('name_origin')], ['arr', '20260929', '1630', 'a']);
  await assert.rejects(createTfnswProvider({ env: {} }).resolve('x'), { code: 'transport_unconfigured' });
  const rejected = createTfnswProvider({ env: { TFNSW_API_KEY: KEY }, fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(rejected.resolve('x'), { code: 'transport_key_rejected' });
});

function memoryStore() {
  const data = new Map();
  return { data, async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async setJSON(key, value) { data.set(key, structuredClone(value)); } };
}

test('planTrip: arrive-by with minutes to spare; stops and trips cached; a missing place says so', async () => {
  const store = memoryStore();
  let tripCalls = 0;
  const provider = {
    async resolve(text) { return { id: text.toLowerCase().replace(/\W+/g, '-'), name: text, type: 'any' }; },
    async trip() { tripCalls += 1; return parseTrip(TRIP); }
  };
  const request = readTripQuery(new URL('https://x/api/transport?to=Oxford%20St%20Bondi%20Junction&from=school&date=2026-09-29&time=16:30&mode=arr'));
  const places = { home: '', school: 'Sydney Boys High' };
  const nowMs = Date.parse('2026-09-29T04:00:00Z');
  const plan = await planTrip({ provider, store, request, places, nowMs });
  assert.deepEqual([plan.leave, plan.arrive, plan.lateMinutes, plan.status, plan.from.place], ['15:40', '16:18', -12, 'realtime', 'school']);
  await planTrip({ provider, store, request, places, nowMs: nowMs + 60_000 });
  assert.equal(tripCalls, 1, 'second look within 5 minutes is served from cache');
  await planTrip({ provider, store, request, places, nowMs: nowMs + 6 * 60_000 });
  assert.equal(tripCalls, 2, 'live times refresh after 5 minutes');
  await assert.rejects(planTrip({ provider, store, request: { ...request, from: 'home' }, places, nowMs }), { code: 'transport_place_missing' });
  assert.equal(readTripQuery(new URL('https://x/api/transport?to=x&date=bad&time=16:30')).error.length > 0, true);
});

test('endpoint: places saved and read back; trip needs a session', async () => {
  const SECRET = 's'.repeat(32);
  const NOW = Date.parse('2026-09-29T12:00:00+10:00');
  const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 7) }, SECRET).token;
  const store = memoryStore();
  const handler = createTransportHandler({
    getContentStore: async () => store,
    now: () => NOW,
    env: { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, TFNSW_API_KEY: KEY },
    createProvider: () => ({ async resolve(text) { return { id: text, name: text }; }, async trip() { return parseTrip(TRIP); } })
  });
  const headers = { cookie: `life_hub_session=${SESSION}`, origin: 'https://life-hub.adam-russell.com', 'content-type': 'application/json' };
  const post = await handler(new Request('https://life-hub.adam-russell.com/api/transport', { method: 'POST', headers, body: JSON.stringify({ places: { school: '  Sydney Boys High  ' } }) }));
  const saved = await post.json();
  assert.equal(post.status, 200, JSON.stringify(saved));
  assert.deepEqual(saved.data.places, { home: '', school: 'Sydney Boys High' });
  const get = await handler(new Request('https://life-hub.adam-russell.com/api/transport?to=Bondi&from=school&date=2026-09-29&time=16:30', { headers }));
  const body = await get.json();
  assert.equal(get.status, 200, JSON.stringify(body));
  assert.equal(body.data.plan.leave, '15:40');
  const missing = await handler(new Request('https://life-hub.adam-russell.com/api/transport?to=Bondi&from=home&date=2026-09-29&time=16:30', { headers }));
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).error.code, 'transport_place_missing');
  const anon = await handler(new Request('https://life-hub.adam-russell.com/api/transport?places=1'));
  assert.equal(anon.status, 401);
});

// ---------- the dial ----------

const FEED = [
  { id: 'health:dentist', uid: 'd', feed: 'health', title: 'Dentist', date: TODAY, time: '16:30', end_time: '17:15', all_day: false, location: 'Oxford St, Bondi Junction' },
  { id: 'work:zoom', uid: 'z', feed: 'work', title: 'Union call', date: TODAY, time: '15:45', end_time: '16:15', all_day: false, location: 'https://zoom.us/j/123' },
  { id: 'social:dinner', uid: 's', feed: 'social', title: 'Dinner with Sam', date: TODAY, time: '19:00', end_time: '21:00', all_day: false, location: 'Newtown' }
];
const model = (nowHour) => buildTidelineModel({ events: eventsFromCalendarFeeds(FEED), week: WEEK, today: TODAY, nowHour });

test('candidate: the next real place (never a video link), from school before 5:30 pm on a school day', () => {
  const day = model(14).days.find((d) => d.date === TODAY);
  const next = leaveByCandidate(day, { today: TODAY, nowHour: 14 });
  assert.deepEqual([next.title, next.origin, next.location], ['Dentist', 'school', 'Oxford St, Bondi Junction']);
  const later = leaveByCandidate(day, { today: TODAY, nowHour: 17 });
  assert.deepEqual([later.title, later.origin], ['Dinner with Sam', 'home']);
  assert.equal(transportPath(next), '/api/transport?to=Oxford+St%2C+Bondi+Junction&from=school&date=2026-09-29&time=16%3A30&mode=arr');
  assert.match(transportPath(next, { leaveAt: 15 + 50 / 60 }), /time=15%3A50&mode=dep/);
  const plan = parseTrip(TRIP)[0];
  assert.deepEqual(wedgeFor(plan), { ready: 15 + 30 / 60, leave: 15 + 40 / 60, board: 15 + 51 / 60, arrive: 16.3 });
  assert.equal(wedgeWidth(13, 15.5), 9, 'two hours out: full width');
  assert.equal(wedgeWidth(15.5, 15.5), 3, 'at the door: thin');
  assert.equal(legsLine(plan), 'Walk 6 min · T4 3:51 pm · Walk 15 min · arrive 4:18 pm');
  assert.equal(minutesLate(plan, 16.5), -12);
});

async function mountDial(calls, respond, nowHour = 14) {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  renderDayDial(doc, host, {
    hub: 'life', events: eventsFromCalendarFeeds(FEED), ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour,
    now: new Date('2026-09-29T04:00:00Z'),
    apiFetch: async (path, init) => {
      calls.push([path, init?.body ? JSON.parse(init.body) : null]);
      const [status, body] = respond(path, init);
      return new window.Response(JSON.stringify(body), { status });
    },
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 60));
  return { window, host };
}

test('Day dial: leave-by wedge and panel from the plan; "Need 10 minutes" re-plans from later and shows the new arrival', async () => {
  const calls = [];
  const plans = parseTrip(TRIP);
  const { window, host } = await mountDial(calls, (path) => {
    if (!path.startsWith('/api/transport')) return [200, { ok: true, data: {} }];
    const dep = path.includes('mode=dep');
    return [200, { ok: true, data: { plan: { ...(dep ? plans[2] : plans[0]), status: dep ? 'timetable' : 'realtime' } } }];
  });
  const wedge = host.querySelector('[data-part="leave-wedge"]');
  assert.ok(wedge, 'wedge drawn');
  assert.equal(wedge.querySelectorAll('path').length, 3);
  assert.match(wedge.getAttribute('aria-label'), /Leave by 3:40 pm for Dentist/);
  const panel = host.querySelector('[data-part="getting-there"]');
  assert.match(panel.textContent, /Leave 3:40 pm/);
  assert.match(panel.textContent, /Dentist at 4:30 pm · from school/);
  assert.match(panel.textContent, /Live times · 12 min to spare/);
  panel.querySelector('[data-transport="more"]').click();
  await new Promise((r) => setTimeout(r, 60));
  const transportCalls = calls.filter(([path]) => path.startsWith('/api/transport'));
  assert.equal(transportCalls.length, 2);
  assert.match(transportCalls[1][0], /time=15%3A50&mode=dep/, 'leave 10 minutes later');
  const again = host.querySelector('[data-part="getting-there"]');
  assert.match(again.textContent, /Leave 4:00 pm/);
  assert.match(again.textContent, /Timetable estimate \(no live data for this trip\) · 8 min late · with 10 more minutes/);
  assert.ok(again.querySelector('[data-transport="reset"]'));
  unmountDayDial();
  window.close();
});

test('Day dial: no school place yet → a one-time form; the reason shows when TfNSW fails', async () => {
  const calls = [];
  let saved = false;
  const { window, host } = await mountDial(calls, (path, init) => {
    if (path === '/api/transport' && init?.method === 'POST') {
      saved = true;
      return [200, { ok: true, data: { places: JSON.parse(init.body).places } }];
    }
    if (path.startsWith('/api/transport')) {
      return saved
        ? [502, { ok: false, error: { code: 'transport_unreachable', message: 'Transport for NSW did not answer in time.' } }]
        : [409, { ok: false, error: { code: 'transport_place_missing', message: 'Add your school stop or address first.' } }];
    }
    return [200, { ok: true, data: {} }];
  }, 13);
  const form = host.querySelector('[data-part="transport-places"]');
  assert.ok(form, 'asks for places');
  assert.equal(host.querySelector('[data-part="leave-wedge"]'), null, 'no plan, no wedge');
  form.querySelector('[name="school"]').value = 'Sydney Boys High';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  // The response and subsequent render are asynchronous; a fixed delay can
  // observe the loading state when the full suite competes for the event loop.
  const deadline = Date.now() + 5000;
  while (!/did not answer in time/.test(host.querySelector('[data-part="getting-there"]')?.textContent ?? '') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const post = calls.find(([path, body]) => path === '/api/transport' && body);
  assert.deepEqual(post[1], { places: { home: '', school: 'Sydney Boys High' } });
  assert.match(host.querySelector('[data-part="getting-there"]').textContent, /did not answer in time/);
  unmountDayDial();
  window.close();
});
