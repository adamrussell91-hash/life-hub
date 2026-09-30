/**
 * iCloud calendar feeds: parser, endpoint (cache, stale, secrecy) and calendar mapping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { icalOccurrences, parseDuration, wallToUtc, sydneyWall } from '../../netlify/functions/_shared/ical.mjs';
import { createCalendarFeedsHandler, feedUrl } from '../../netlify/functions/calendar-feeds.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { eventsFromCalendarFeeds, summarizeIcalFeedStatuses } from '../../packages/design-kit/js/calendar/ical-calendar.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { filterKeyForItem, paintSourceFilter } from '../../packages/design-kit/js/calendar/calendar-filter.js';
import { paintSourceErrors } from '../../packages/design-kit/js/calendar/load-hub-sources.js';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:one-off',
  'DTSTART;TZID=Australia/Sydney:20260930T161500',
  'DTEND;TZID=Australia/Sydney:20260930T171500',
  'SUMMARY:Physio with Dr Keily',
  'LOCATION:Bondi Junction\\, NSW',
  'DESCRIPTION:Bring the referral.\\nLevel 3.',
  'BEGIN:VALARM',
  'TRIGGER:-PT30M',
  'SUMMARY:ignored alarm',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:utc-one',
  'DTSTART:20261001T230000Z',
  'DURATION:PT1H30M',
  'SUMMARY:Early call',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:weekly',
  'DTSTART;TZID=Australia/Sydney:20260928T090000',
  'DTEND;TZID=Australia/Sydney:20260928T100000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6',
  'EXDATE;TZID=Australia/Sydney:20260930T090000',
  'SUMMARY:Standup',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:weekly',
  'RECURRENCE-ID;TZID=Australia/Sydney:20261005T090000',
  'DTSTART;TZID=Australia/Sydney:20261006T140000',
  'DTEND;TZID=Australia/Sydney:20261006T150000',
  'SUMMARY:Standup (moved)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday',
  'DTSTART;VALUE=DATE:20261003',
  'DTEND;VALUE=DATE:20261005',
  'SUMMARY:Mum visiting',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:monthly',
  'DTSTART;TZID=Australia/Sydney:20260915T180000',
  'RRULE:FREQ=MONTHLY;BYDAY=-1TU;UNTIL=20261231T000000Z',
  'SUMMARY:Book club',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:cancelled',
  'DTSTART;TZID=Australia/Sydney:20261002T120000',
  'STATUS:CANCELLED',
  'SUMMARY:Gone',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

test('Sydney wall clock survives the DST change (4 Oct 2026)', () => {
  const before = wallToUtc({ y: 2026, mo: 10, d: 3, h: 9, mi: 0 }, 'Australia/Sydney');
  const after = wallToUtc({ y: 2026, mo: 10, d: 5, h: 9, mi: 0 }, 'Australia/Sydney');
  assert.equal(sydneyWall(before).time, '09:00');
  assert.equal(sydneyWall(after).time, '09:00');
  assert.equal(after - before, 2 * 86_400_000 - 3_600_000, 'the clock went forward an hour');
  assert.equal(parseDuration('PT1H30M'), 5_400_000);
  assert.equal(parseDuration('P1W'), 7 * 86_400_000);
});

test('occurrences: timed, UTC, repeats with EXDATE and a moved one, all-day span, ordinal monthly, cancelled', () => {
  const rows = icalOccurrences(ICS, { feed: 'work', from: '2026-09-28', to: '2026-12-31' });
  const titles = rows.map((row) => `${row.date} ${row.time ?? 'all-day'} ${row.title}`);
  assert.ok(titles.includes('2026-09-30 16:15 Physio with Dr Keily'));
  const physio = rows.find((row) => row.title === 'Physio with Dr Keily');
  assert.equal(physio.end_time, '17:15');
  assert.equal(physio.location, 'Bondi Junction, NSW');
  assert.equal(physio.notes, 'Bring the referral.\nLevel 3.');
  assert.ok(titles.includes('2026-10-02 09:00 Early call'), '23:00Z is 9 am next day in Sydney (AEST)');

  const standups = rows.filter((row) => row.title.startsWith('Standup')).map((row) => `${row.date} ${row.time}`);
  assert.deepEqual(standups, [
    '2026-09-28 09:00', // Mon
    // Wed 30/09 excluded by EXDATE
    '2026-10-06 14:00', // Mon 05/10 moved to Tue 14:00
    '2026-10-07 09:00',
    '2026-10-12 09:00',
    '2026-10-14 09:00'
  ]);
  assert.equal(rows.find((row) => row.date === '2026-10-07' && row.title === 'Standup').time, '09:00', 'after DST, still 9 am');

  const mum = rows.filter((row) => row.title === 'Mum visiting');
  assert.deepEqual(mum.map((row) => [row.date, row.all_day, row.span]), [['2026-10-03', true, '1/2'], ['2026-10-04', true, '2/2']]);

  const club = rows.filter((row) => row.title === 'Book club').map((row) => row.date);
  assert.deepEqual(club, ['2026-09-29', '2026-10-27', '2026-11-24', '2026-12-29'], 'last Tuesday of each month');
  assert.equal(rows.some((row) => row.title === 'Gone'), false);
  assert.equal(rows.some((row) => row.title === 'ignored alarm'), false);
});

test('webcal:// becomes https://; anything else is refused', () => {
  assert.equal(feedUrl('webcal://p1-caldav.icloud.com/published/2/abc'), 'https://p1-caldav.icloud.com/published/2/abc');
  assert.equal(feedUrl('http://example.com/x'), null);
  assert.equal(feedUrl(''), null);
});

const NOW = Date.parse('2026-09-29T10:00:00+10:00');
const SECRET = 's'.repeat(32);
const ENV = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  ICAL_FEED_WORK: 'webcal://p1-caldav.icloud.com/published/2/SECRET-WORK-TOKEN',
  ICAL_FEED_HEALTH: 'webcal://p1-caldav.icloud.com/published/2/SECRET-HEALTH-TOKEN'
};
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 7) }, SECRET).token;

function harness({ fail = false } = {}) {
  const data = new Map();
  const store = {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); }
  };
  const calls = [];
  let clock = NOW;
  const handler = createCalendarFeedsHandler({
    env: ENV,
    now: () => clock,
    getContentStore: async () => store,
    fetchImpl: async (url) => {
      calls.push(url);
      if (fail) return new Response('nope', { status: 500 });
      return new Response(ICS, { status: 200 });
    }
  });
  const get = (query = 'from=2026-09-28&to=2026-10-31') => handler(new Request(`https://api.example/api/calendar-feeds?${query}`, {
    headers: { cookie: `life_hub_session=${SESSION}` }
  }));
  return { handler, get, calls, data, advance: (ms) => { clock += ms; } };
}

test('endpoint: reads configured feeds, caches 15 minutes, never returns the URLs', async () => {
  const h = harness();
  const response = await h.get();
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /SECRET-|icloud/i, 'feed URLs never leave the server');
  const payload = JSON.parse(text);
  assert.deepEqual(payload.data.feeds.map((feed) => [feed.id, feed.status]), [
    ['work', 'live'], ['social', 'unconfigured'], ['family', 'unconfigured'], ['health', 'live']
  ]);
  assert.ok(payload.data.events.some((row) => row.feed === 'health' && row.title === 'Physio with Dr Keily'));
  assert.equal(h.calls.length, 2);
  await h.get();
  assert.equal(h.calls.length, 2, 'second read within 15 minutes comes from the cache');
  h.advance(16 * 60 * 1000);
  await h.get();
  assert.equal(h.calls.length, 4, 'refetched after the cache expired');
});

test('endpoint: a failing feed serves the last good copy as stale', async () => {
  const good = harness();
  await good.get();
  const bad = harness({ fail: true });
  for (const [key, value] of good.data) bad.data.set(key, value);
  bad.advance(20 * 60 * 1000);
  const payload = await (await bad.get()).json();
  assert.equal(payload.data.feeds.find((feed) => feed.id === 'work').status, 'stale');
  assert.ok(payload.data.events.length > 0);
});

test('endpoint: signed out is 401; a bad range is 400', async () => {
  const h = harness();
  const out = await h.handler(new Request('https://api.example/api/calendar-feeds?from=2026-09-28&to=2026-10-31'));
  assert.equal(out.status, 401);
  assert.equal((await h.get('from=2026-10-31&to=2026-09-28')).status, 400);
});

test('mapping: health → medical (Health), work → Events, social/family → quiet and no load', () => {
  const rows = [
    ...icalOccurrences(ICS, { feed: 'health', from: '2026-09-30', to: '2026-09-30' }),
    { id: 'family:x:1', feed: 'family', title: 'Dinner at Mum’s', date: '2026-09-30', time: '18:00', end_time: '20:00', all_day: false },
    { id: 'social:y:2026-09-30', feed: 'social', title: 'Trivia night', date: '2026-09-30', all_day: true },
    { id: 'work:z:1', feed: 'work', title: 'Staff meeting', date: '2026-09-30', time: '15:30', end_time: '16:30', all_day: false }
  ];
  const events = eventsFromCalendarFeeds(rows);
  assert.equal(events.find((event) => event.record.feed === 'health').record.type, 'medical');
  const model = buildTidelineModel({ events, week: ['2026-09-30'], today: '2026-09-30', nowHour: 9 });
  const day = model.days[0];
  const byTitle = Object.fromEntries(day.chips.map((chip) => [chip.title, chip]));
  assert.equal(filterKeyForItem(byTitle['Physio with Dr Keily']), 'health');
  assert.equal(filterKeyForItem(byTitle['Staff meeting']), 'events');
  assert.equal(filterKeyForItem(byTitle['Dinner at Mum’s']), 'family');
  assert.equal(byTitle['Dinner at Mum’s'].ambient, true);
  const trivia = day.due.find((row) => row.title === 'Trivia night');
  assert.equal(trivia.kind, 'allday');
  assert.equal(trivia.filterKey, 'social');

  const without = buildTidelineModel({
    events: events.filter((event) => !event.record.ambient),
    week: ['2026-09-30'], today: '2026-09-30', nowHour: 9
  });
  assert.equal(day.cap?.pct, without.days[0].cap?.pct, 'social/family never change capacity');
});

test('summarizeIcalFeedStatuses: all unconfigured is fail-visible, not a healthy empty week', () => {
  const allMissing = summarizeIcalFeedStatuses([
    { id: 'work', status: 'unconfigured' },
    { id: 'social', status: 'unconfigured' },
    { id: 'family', status: 'unconfigured' },
    { id: 'health', status: 'unconfigured' }
  ]);
  assert.equal(allMissing.severity, 'degraded');
  assert.match(allMissing.line, /not linked/i);
  assert.match(allMissing.line, /family/i);

  const emptyPayload = summarizeIcalFeedStatuses([]);
  assert.equal(emptyPayload.severity, 'degraded');
  assert.match(emptyPayload.line, /not linked/i);

  const fetchFailed = summarizeIcalFeedStatuses([
    { id: 'work', status: 'error' },
    { id: 'social', status: 'live' },
    { id: 'family', status: 'live' },
    { id: 'health', status: 'live' }
  ]);
  assert.equal(fetchFailed.severity, 'error');
  assert.match(fetchFailed.line, /unreachable/i);

  const partial = summarizeIcalFeedStatuses([
    { id: 'work', status: 'live' },
    { id: 'social', status: 'unconfigured' },
    { id: 'family', status: 'unconfigured' },
    { id: 'health', status: 'live' }
  ]);
  assert.equal(partial.severity, 'degraded');
  assert.match(partial.line, /family/);
  assert.doesNotMatch(partial.line, /work/);

  const healthy = summarizeIcalFeedStatuses([
    { id: 'work', status: 'live' },
    { id: 'social', status: 'live' },
    { id: 'family', status: 'live' },
    { id: 'health', status: 'live' }
  ]);
  assert.equal(healthy.severity, 'ok');
  assert.equal(healthy.line, null);
});

function mockDomNode(tag = 'div') {
  return {
    tagName: String(tag).toUpperCase(),
    className: '',
    type: '',
    textContent: '',
    hidden: false,
    dataset: {},
    attrs: {},
    listeners: {},
    childNodes: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    append(...nodes) {
      this.childNodes.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.childNodes = nodes;
    },
    remove() {},
    querySelector() {
      return null;
    }
  };
}

test('paintSourceFilter: ical feed note is fail-visible under the filter chips', () => {
  const kids = [];
  const host = {
    children: kids,
    append(...nodes) {
      kids.push(...nodes);
    },
    replaceChildren(...nodes) {
      kids.length = 0;
      kids.push(...nodes);
    }
  };
  const doc = {
    createElement(tag) {
      const node = mockDomNode(tag);
      node.remove = () => {
        const i = kids.indexOf(node);
        if (i >= 0) kids.splice(i, 1);
      };
      return node;
    }
  };
  const note = 'iCloud calendars not linked in Netlify (work, social, family, health)';
  paintSourceFilter(doc, host, {
    hub: 'life',
    state: Object.fromEntries(
      ['classes', 'comms', 'meetings', 'events', 'pd', 'promises', 'tasks', 'health', 'fitness', 'corey', 'social', 'family'].map(
        (id) => [id, true]
      )
    ),
    counts: {},
    hidden: 0,
    feedNote: note,
    onChange() {}
  });
  const line = kids.find((n) => n.dataset?.part === 'ical-feed-note');
  assert.ok(line, 'feed note must paint');
  assert.equal(line.textContent, note);
  assert.equal(line.attrs.role, 'status');
});

test('paintSourceErrors: degraded iCloud config shows without a useless Retry', () => {
  let strip = null;
  const host = {
    childNodes: [],
    querySelector(sel) {
      return String(sel).includes('source-errors') ? strip : null;
    },
    prepend(node) {
      strip = node;
      this.childNodes.unshift(node);
    }
  };
  const doc = {
    createElement(tag) {
      const node = mockDomNode(tag);
      node.remove = () => {
        strip = null;
        host.childNodes = [];
      };
      return node;
    },
    createTextNode(text) {
      return { textContent: text };
    }
  };
  paintSourceErrors(doc, host, {
    feeds: {
      status: 'degraded',
      error: 'iCloud not linked: family',
      label: 'iCloud calendars'
    }
  });
  assert.equal(strip.dataset.part, 'source-errors');
  const line = strip.childNodes[0];
  assert.equal(line.dataset.source, 'feeds');
  assert.equal(line.dataset.severity, 'degraded');
  assert.match(line.childNodes[0].textContent, /family/);
  assert.equal(line.childNodes.some((n) => n.textContent === 'Retry'), false);
});
