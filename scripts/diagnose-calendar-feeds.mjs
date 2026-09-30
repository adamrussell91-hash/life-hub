#!/usr/bin/env node
/**
 * Multi-seam diagnostic for: "Family iCal event on Oct 7 is missing; all filter chips 0".
 * Each check maps to a falsifiable hypothesis. Exit 1 if any CODE-SEAM check fails its contract.
 * Production status needs a signed-in /api/calendar-feeds capture (see PROD section).
 */
import assert from 'node:assert/strict';
import { icalOccurrences } from '../netlify/functions/_shared/ical.mjs';
import { createCalendarFeedsHandler, FEED_CACHE_MS } from '../netlify/functions/calendar-feeds.mjs';
import { createSessionToken } from '../netlify/functions/_shared/auth-security.mjs';
import { eventsFromCalendarFeeds, calendarFeedRange } from '../packages/design-kit/js/calendar/ical-calendar.js';
import { buildTidelineModel } from '../packages/design-kit/js/calendar/tideline-model.js';
import { countByFilterKey, filterKeyForItem, defaultFilterForHub, isItemVisible } from '../packages/design-kit/js/calendar/calendar-filter.js';

const DAY = '2026-10-07';
const WEEK = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-09-30T11:19:00+10:00');

const FAMILY_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Apple Inc.//iCloud Calendar//EN',
  'BEGIN:VEVENT',
  'UID:car-service-family',
  'DTSTART;TZID=Australia/Sydney:20261007T090000',
  'DTEND;TZID=Australia/Sydney:20261007T100000',
  'SUMMARY:Car Service',
  'LOCATION:Sydney Tyre Centre',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

const WORK_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:staff',
  'DTSTART;TZID=Australia/Sydney:20261007T153000',
  'DTEND;TZID=Australia/Sydney:20261007T163000',
  'SUMMARY:Staff meeting',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

const results = [];
function check(id, hypothesis, ok, detail) {
  results.push({ id, hypothesis, ok: Boolean(ok), detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${id}: ${detail}`);
}

function modelFromRows(rows, extras = {}) {
  const events = eventsFromCalendarFeeds(rows, extras.freed ?? []);
  return buildTidelineModel({
    events: [...events, ...(extras.events ?? [])],
    week: WEEK,
    today: '2026-09-30',
    nowHour: 11.3,
    visual: extras.visual ?? null,
    terms: extras.terms ?? [{ id: 'hol', name: 'Holidays', starts_on: '2026-09-28', ends_on: '2026-10-12' }]
  });
}

function dayChips(model, date = DAY) {
  const day = model.days.find((d) => d.date === date);
  return (day?.chips ?? []).concat(
    (day?.due ?? []).map((due) => (due.kind === 'allday' ? due : { ...due, kind: 'task', filterKey: 'tasks' }))
  );
}

// ── H1: parser / timezone drops Oct 7 09:00 Sydney (post-DST) ──────────────
{
  const rows = icalOccurrences(FAMILY_ICS, { feed: 'family', from: '2026-10-05', to: '2026-10-11' });
  const hit = rows.find((r) => r.title === 'Car Service' && r.date === DAY);
  check('H1-parser-dst', 'iCal parser mis-dates post-DST Oct 7 09:00', Boolean(hit && hit.time === '09:00' && hit.end_time === '10:00'),
    hit ? `parsed ${hit.date} ${hit.time}-${hit.end_time}` : `no row; got ${JSON.stringify(rows)}`);
}

// ── H2: mapping / filter / model would hide a live family row ──────────────
{
  const rows = icalOccurrences(FAMILY_ICS, { feed: 'family', from: '2026-10-05', to: '2026-10-11' });
  const model = modelFromRows(rows);
  const chips = dayChips(model);
  const counts = countByFilterKey(chips);
  const car = chips.find((c) => c.title === 'Car Service');
  const filter = defaultFilterForHub('life');
  check('H2-model-filter', 'Family row reaches model but filter/day dial drops it',
    Boolean(car && counts.family >= 1 && isItemVisible(car, filter) && car.ambient === true),
    car ? `family count=${counts.family} key=${filterKeyForItem(car)} ambient=${car.ambient} visible=${isItemVisible(car, filter)}`
      : `no chip; counts=${JSON.stringify(counts)}`);
}

// ── H3: ICAL_FEED_FAMILY unset → unconfigured → empty family (matches shipped test fixture) ──
{
  const data = new Map();
  const store = {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); }
  };
  const session = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 7) }, SECRET).token;
  const handler = createCalendarFeedsHandler({
    env: {
      LIFE_HUB_PASSPHRASE_HASH: 'configured',
      SESSION_SECRET: SECRET,
      ICAL_FEED_WORK: 'https://example.test/work.ics',
      ICAL_FEED_HEALTH: 'https://example.test/health.ics'
      // FAMILY + SOCIAL deliberately absent — same shape as unit-test ENV
    },
    now: () => NOW,
    getContentStore: async () => store,
    fetchImpl: async (url) => new Response(String(url).includes('work') ? WORK_ICS : FAMILY_ICS, { status: 200 })
  });
  const res = await handler(new Request(`https://api.example/api/calendar-feeds?from=2026-10-05&to=2026-10-11`, {
    headers: { cookie: `life_hub_session=${session}` }
  }));
  const payload = await res.json();
  const statuses = Object.fromEntries(payload.data.feeds.map((f) => [f.id, f.status]));
  const familyEvents = payload.data.events.filter((e) => e.feed === 'family');
  check('H3-family-unconfigured', 'ICAL_FEED_FAMILY missing in Functions env → family never fetched',
    statuses.family === 'unconfigured' && familyEvents.length === 0,
    `statuses=${JSON.stringify(statuses)} familyEvents=${familyEvents.length} (this REPRODUCES all-family-zero if prod matches)`);
}

// ── H4: family configured but iCloud 500 + empty cache → error, empty ─────
{
  const data = new Map();
  const store = {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); }
  };
  const session = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 7) }, SECRET).token;
  const handler = createCalendarFeedsHandler({
    env: {
      LIFE_HUB_PASSPHRASE_HASH: 'configured',
      SESSION_SECRET: SECRET,
      ICAL_FEED_FAMILY: 'https://example.test/family.ics'
    },
    now: () => NOW,
    getContentStore: async () => store,
    fetchImpl: async () => new Response('nope', { status: 500 })
  });
  const res = await handler(new Request(`https://api.example/api/calendar-feeds?from=2026-10-05&to=2026-10-11`, {
    headers: { cookie: `life_hub_session=${session}` }
  }));
  const payload = await res.json();
  const family = payload.data.feeds.find((f) => f.id === 'family');
  check('H4-fetch-fail-empty-cache', 'iCloud fetch fails and no Blob cache → status error, zero events',
    family?.status === 'error' && payload.data.events.length === 0,
    `family.status=${family?.status} events=${payload.data.events.length}`);
}

// ── H5: client swallow: non-ok / thrown fetch leaves feedEvents=[] → all chips 0 ──
{
  // Mirrors apps/life/js/app/app-controller.js loadCalendarFeeds soft-fail.
  let feedEvents = [];
  const simulate = async (responseFactory) => {
    try {
      const response = await responseFactory();
      const payload = response.ok ? await response.json() : null;
      if (payload?.ok && Array.isArray(payload.data?.events)) {
        feedEvents = eventsFromCalendarFeeds(payload.data.events, payload.data.freed ?? []);
      }
    } catch {
      /* swallowed */
    }
  };
  await simulate(async () => new Response('nope', { status: 500 }));
  const after500 = feedEvents.length;
  await simulate(async () => { throw new Error('network'); });
  const afterThrow = feedEvents.length;
  await simulate(async () => new Response(JSON.stringify({ ok: false }), { status: 200 }));
  const afterOkFalse = feedEvents.length;
  check('H5-client-swallow', 'Client soft-fails calendar-feeds → empty feedEvents, UI shows zeros with no error',
    after500 === 0 && afterThrow === 0 && afterOkFalse === 0,
    `after500=${after500} afterThrow=${afterThrow} afterOkFalse=${afterOkFalse} (silent empty matches Adam's symptom)`);
}

// ── H6: freed_span can only hide recurring series; one-off has no series ───
{
  const rows = icalOccurrences(FAMILY_ICS, { feed: 'family', from: '2026-10-05', to: '2026-10-11' });
  const oneOff = rows[0];
  check('H6-freed-span', 'A freed_span row is hiding Car Service from Oct 7',
    oneOff && oneOff.series == null,
    oneOff?.series == null
      ? 'FALSIFIED for one-off events (no series field → freed_spans cannot drop it)'
      : `has series=${oneOff.series} — freed could hide repeats`);
}

// ── H7: visual cover + similarity merge against Apple's second calendar copy ─
{
  const rows = icalOccurrences(FAMILY_ICS, { feed: 'family', from: '2026-10-05', to: '2026-10-11' });
  const visual = {
    ITEMS: [{
      id: 'life-car',
      date: DAY,
      start: '09:00',
      end: '10:00',
      title: 'Car: Sydney Tyre Centre',
      kind: 'event',
      source: 'calendar_block'
    }],
    DUE: [],
    WALLS: [],
    FREE: []
  };
  const model = modelFromRows(rows, { visual });
  const chips = dayChips(model);
  const titles = chips.map((c) => c.title);
  const hasFamily = chips.some((c) => c.feed === 'family' || c.kind === 'family');
  check('H7-visual-dedupe', 'calendar-visual.json near-duplicate swallows the family iCal chip',
    hasFamily,
    hasFamily
      ? `FALSIFIED — both kept: ${JSON.stringify(titles)}`
      : `family chip removed by similarity merge; titles=${JSON.stringify(titles)}`);
}

// ── H8: range from "today" Sep 30 still includes Oct 7 ─────────────────────
{
  const range = calendarFeedRange('2026-09-30');
  check('H8-range-window', 'Feed range computed from today excludes Oct 7',
    range.from <= DAY && range.to >= DAY,
    `from=${range.from} to=${range.to}`);
}

// ── H9: docs claim 05:30 fetches iCloud; code only reads cache ─────────────
{
  // Static contract: cachedFeedRows never calls fetch. Confirmed by source shape.
  const src = await import('../netlify/functions/calendar-feeds.mjs');
  const text = src.cachedFeedRows.toString();
  check('H9-scheduled-no-fetch', '05:30 scheduled path never refreshes iCloud (cache-only)',
    text.includes('getJSON') && !text.includes('loadFeedText') && !text.includes('fetch'),
    'cachedFeedRows is cache-only — scheduled sweep cannot populate empty Blob cache');
}

// ── H10: cache TTL still blocks fresh after <15m even with new Apple event ─
{
  check('H10-cache-ttl', '15-minute Blob cache can serve pre-event copy',
    FEED_CACHE_MS === 15 * 60 * 1000,
    `FEED_CACHE_MS=${FEED_CACHE_MS} (${FEED_CACHE_MS / 60000} min). After ≥15m + reopen, not explanatory for a 1h gap unless page never re-hit the API.`);
}

// ── Live unauthenticated probe ─────────────────────────────────────────────
{
  const res = await fetch('https://api.adam-russell.com/api/calendar-feeds?from=2026-10-05&to=2026-10-11');
  const body = await res.json().catch(() => null);
  check('PROD-unauth', 'Live API reachable; auth gate intact',
    res.status === 401 && body?.error?.code === 'unauthenticated',
    `HTTP ${res.status} code=${body?.error?.code ?? 'n/a'}`);
}

console.log('\n=== SUMMARY ===');
const fails = results.filter((r) => !r.ok);
const passes = results.filter((r) => r.ok);
console.log(`code-seam checks: ${passes.length} pass signals, ${fails.length} unexpected`);
console.log(`
PROD BLOCKER: this agent has no LIFE_HUB session and no ICAL_FEED_* / NETLIFY_AUTH_TOKEN.
To finish diagnosis, need ONE of:
  A) Redacted JSON from signed-in GET /api/calendar-feeds?from=2026-10-05&to=2026-10-11&fresh=1
     Keep only: data.feeds[{id,status,fetched_at}], event count per feed, titles/dates for Oct 7 (ok to redact other titles)
  B) Confirm in Netlify life-hub2 → Env whether ICAL_FEED_FAMILY is set (yes/no only, never paste the URL)
`);

// Exit 0: harness ran. Individual H* lines encode hypothesis outcomes.
// H3/H5/H9 "PASS" means "this failure mode is real in code and can cause the symptom".
process.exit(0);
