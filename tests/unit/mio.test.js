/**
 * Step 11: Mio opportunities on journeys already being made.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { areaOf, openWithin, opportunities, parseCandidates, parseHours, wantedAreas } from '../../packages/design-kit/js/calendar/mio-model.js';
import { createMioHandler, mioOutingGhost } from '../../netlify/functions/mio.mjs';
import { acceptPlan } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { eventsFromCalendarFeeds } from '../../packages/design-kit/js/calendar/ical-calendar.js';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const TODAY = '2026-09-29'; // Tuesday
const WEEK = ['2026-09-28', TODAY, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

const HOURS = parseHours([
  'Sunday: 8:30 AM to 10 PM', 'Monday: Closed', 'Tuesday: 8:30 AM to 10 PM', 'Wednesday: 11 AM to 3 PM, 5 to 10 PM',
  'Thursday: 8:30 AM to 10 PM', 'Friday: 6 PM to 2 AM', 'Saturday: Open 24 hours'
]);
const PLACES = parseCandidates(JSON.stringify({
  synced_at: '2026-09-29T08:00:00+10:00',
  places: [
    { id: 'cow', name: 'Cow & The Moon', category: 'cafe', address: '181 Enmore Rd, Enmore NSW 2042', rating: 4.6, creator: '@fullfill23', why: 'Mandorla affogato', hours: HOURS },
    { id: 'vineria', name: 'Vineria Luisa', category: 'bar', area: 'enmore', rating: 4.9 },
    { id: 'hotel', name: 'Some Hotel', category: 'accommodation', area: 'enmore' },
    { id: 'far', name: 'Paul’s Famous Hamburgers', category: 'restaurant', area: 'sylvania', rating: 4.5 },
    { id: 'bad' }
  ]
})).places;

test('areas: suburb from an address or a bare suburb; video links and street-only addresses are not places', () => {
  assert.equal(areaOf('181 Enmore Rd, Enmore NSW 2042, Australia'), 'enmore');
  assert.equal(areaOf('Petersham NSW 2049'), 'petersham');
  assert.equal(areaOf('Oxford St, Bondi Junction'), 'bondi junction');
  assert.equal(areaOf('Newtown'), 'newtown');
  assert.equal(areaOf('https://zoom.us/j/1'), null);
  assert.equal(areaOf('334 Parramatta Rd'), null);
  assert.deepEqual(wantedAreas([
    { date: TODAY, time: '16:00', location: 'Enmore Theatre, 118-132 Enmore Rd, Enmore NSW 2042' },
    { date: '2026-10-01', time: '10:00', location: 'Enmore' },
    { date: TODAY, all_day: true, location: 'Newtown' },
    { date: '2026-11-30', time: '10:00', location: 'Manly' }
  ], { from: TODAY, to: '2026-10-12' }), [{ area: 'enmore', dates: ['2026-10-01', TODAY].sort() }]);
});

test('hours: Mio lines parse, split shifts and past-midnight closes; closed days are closed', () => {
  assert.deepEqual(HOURS[1], []);
  assert.deepEqual(HOURS[3], [[11, 15], [17, 22]]);
  assert.deepEqual(HOURS[5], [[18, 26]]);
  assert.deepEqual(HOURS[6], [[0, 24]]);
  assert.equal(openWithin({ hours: HOURS }, '2026-09-28', 17, 19).closed, true, 'Monday closed');
  assert.deepEqual(openWithin({ hours: HOURS }, '2026-09-30', 15, 18), { start: 17, end: 18, closes: 22 });
  assert.equal(openWithin({}, TODAY, 17, 19), null, 'unknown is unknown');
  assert.equal(PLACES.length, 4, 'a row without a name is dropped');
});

const FEED = [
  { id: 'social:gig', uid: 'g', feed: 'social', title: 'Gig at the Enmore', date: TODAY, time: '19:30', end_time: '22:00', all_day: false, location: 'Enmore Theatre, Enmore NSW 2042' },
  { id: 'work:call', uid: 'c', feed: 'work', title: 'Union call', date: '2026-10-01', time: '16:00', end_time: '17:00', all_day: false, location: 'https://zoom.us/j/1' },
  { id: 'health:physio', uid: 'p', feed: 'health', title: 'Physio', date: '2026-09-28', time: '17:00', end_time: '17:45', all_day: false, location: 'Enmore NSW 2042' }
];
const model = (nowHour = 14) => buildTidelineModel({ events: eventsFromCalendarFeeds(FEED), week: WEEK, today: TODAY, nowHour });
const dayOf = (m, date) => m.days.find((d) => d.date === date);

test('offers: a real gap before the gig, same suburb, open then; known hours first; declines and video calls never offer', () => {
  const offers = opportunities(dayOf(model(), TODAY), PLACES, { today: TODAY, nowHour: 14 });
  assert.equal(offers.length, 1);
  const [offer] = offers;
  assert.equal(offer.place.id, 'cow', 'known hours win over a higher rating with unknown hours');
  assert.equal(offer.when, 'before', 'the gig runs to 10 pm: after is past the 9 pm cut-off');
  assert.deepEqual([offer.visit.start, offer.visit.end].map((h) => Math.round(h * 60)), [1100, 1160], '6:20–7:20 pm: ten minutes to walk to the gig');
  assert.equal(offer.hours, 'open');
  const skipped = opportunities(dayOf(model(), TODAY), PLACES, { today: TODAY, nowHour: 14, declined: new Set(['cow|2026-09-29']) });
  assert.equal(skipped[0].place.id, 'vineria');
  assert.equal(skipped[0].hours, 'unknown');
  assert.equal(opportunities(dayOf(model(), '2026-10-01'), PLACES, { today: TODAY, nowHour: 14 }).length, 0, 'a video call is not a journey');
  const monday = opportunities(dayOf(model(), '2026-09-28'), PLACES.filter((p) => p.id === 'cow'), { today: '2026-09-28', nowHour: 9 });
  assert.equal(monday.length, 0, 'Cow & The Moon is closed on Mondays: no offer');
  assert.ok(!offers.some((o) => o.place.category === 'accommodation'));
});

test('Plan it: a Hammond outing that accepts into a tentative Life plan', () => {
  const ghost = mioOutingGhost({ date: TODAY, start: '18:30', end: '19:30', after: 'Gig at the Enmore' }, PLACES[0], { nowIso: '2026-09-29T14:00:00+10:00' });
  assert.equal(ghost.kind, 'outing');
  assert.equal(ghost.agent, 'hammond');
  assert.equal(ghost.via, 'mio');
  const plan = acceptPlan(ghost, { today: TODAY });
  const record = plan.steps.find((step) => step.target === 'life_record').record;
  assert.deepEqual([record.type, record.status, record.title, record.time, record.end_time], ['calendar_block', 'tentative', 'Cow & The Moon', '18:30', '19:30']);
  assert.throws(() => mioOutingGhost({ date: TODAY, start: '19:30', end: '18:30' }, PLACES[0], { nowIso: '' }), /start < end/);
});

test('endpoint: reads the synced cache, remembers "not this time", queues a plan only for a synced place', async () => {
  const SECRET = 's'.repeat(32);
  const NOW = Date.parse('2026-09-29T14:00:00+10:00');
  const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 5) }, SECRET).token;
  const data = new Map();
  const store = { async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; }, async setJSON(key, value) { data.set(key, structuredClone(value)); } };
  const files = { 'mio-candidates.json': JSON.stringify({ synced_at: 'x', places: [{ id: 'cow', name: 'Cow & The Moon', category: 'cafe', area: 'enmore' }] }), 'pending-calendar-ghosts.json': '[]' };
  let committed = null;
  const github = {
    async resolveTree() { return { commitSha: 'c', treeSha: 't', tree: Object.keys(files).map((path) => ({ type: 'blob', path, sha: path })) }; },
    async readBlob(sha) { return { content: Buffer.from(files[sha]).toString('base64'), encoding: 'base64' }; },
    async commitFiles(args) { committed = args; return { commitSha: 'c2' }; }
  };
  const handler = createMioHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET },
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => store,
    decodeBlob: (blob) => Buffer.from(blob.content, 'base64').toString('utf8')
  });
  const call = (method, body) => handler(new Request('https://api.example/api/mio', {
    method,
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  const got = await call('GET');
  const payload = await got.json();
  assert.equal(got.status, 200, JSON.stringify(payload));
  assert.equal(payload.data.places[0].name, 'Cow & The Moon');
  assert.equal((await call('POST', { decline: { save_id: 'cow', date: TODAY } })).status, 200);
  assert.deepEqual((await (await call('GET')).json()).data.declined, ['cow|2026-09-29']);
  assert.equal((await call('POST', { plan: { save_id: 'nope', date: TODAY, start: '18:30', end: '19:30' } })).status, 404);
  const planned = await call('POST', { plan: { save_id: 'cow', date: TODAY, start: '18:30', end: '19:30', after: 'Gig' } });
  assert.equal(planned.status, 200);
  const queued = JSON.parse(committed.files[0].content);
  const list = Array.isArray(queued) ? queued : queued.ghosts;
  assert.equal(list[0].via, 'mio');
});

test('Day dial: "On the way" offer with a dotted gap on the ring; Not this time remembers; Plan it queues then accepts', async () => {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  const calls = [];
  renderDayDial(doc, host, {
    hub: 'life', events: eventsFromCalendarFeeds(FEED), ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14,
    now: new Date('2026-09-29T04:00:00Z'),
    apiFetch: async (path, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push([path, body]);
      if (path === '/api/mio' && !body) return new window.Response(JSON.stringify({ ok: true, data: { places: PLACES, declined: [] } }));
      if (path === '/api/mio' && body?.plan) return new window.Response(JSON.stringify({ ok: true, data: { ghost: { id: 'mio-1' } } }));
      if (path === '/api/calendar-ghosts') return new window.Response(JSON.stringify({ ok: true, receipt: 'Hammond → Life: “Cow & The Moon”, Tue 29/09 6:30 pm–7:30 pm.' }));
      return new window.Response(JSON.stringify({ ok: true, data: {} }));
    },
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 60));
  const panel = host.querySelector('[data-part="mio"]');
  assert.ok(panel, 'offer shown');
  assert.match(panel.textContent, /Before Gig at the Enmore · 2:00 pm – 7:20 pm free in Enmore/);
  assert.match(panel.textContent, /Cow & The Moon/);
  assert.match(panel.textContent, /open till 10:00 pm · saved from @fullfill23/);
  assert.ok(host.querySelector('[data-part="mio-gap"]'), 'the gap it would fill is drawn');
  panel.querySelector('[data-mio="plan"]').click();
  await new Promise((r) => setTimeout(r, 40));
  const plan = calls.find(([path, body]) => path === '/api/mio' && body?.plan);
  assert.deepEqual(plan[1].plan, { save_id: 'cow', date: TODAY, start: '18:20', end: '19:20', after: 'Gig at the Enmore' });
  assert.deepEqual(calls.find(([path]) => path === '/api/calendar-ghosts')[1], { id: 'mio-1', decision: 'accept' });
  unmountDayDial();
  window.close();
});
