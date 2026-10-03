import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEventsHandler } from '../../netlify/functions/events.mjs';
import { createScheduleProjectionsHandler } from '../../netlify/functions/schedule-projections.mjs';
import {
  listGithubPdEvents,
  resetGithubPdEventsCache
} from '../../netlify/functions/_shared/github-professional-data.mjs';
import {
  mergeNotionPdEvents,
  notionPdEventId,
  pdPlacementKey,
  projectNotionPdEvent
} from '../../netlify/functions/_shared/notion-pd-events.mjs';

const NOTION_ID = 'a733a4b7a9bf489095c8ac7dc14b8427';

function row(overrides = {}) {
  return {
    notion_id: NOTION_ID,
    title: '2026 NSW HALT Conference',
    start: '2026-03-22T21:00:00.000Z',
    end: '2026-03-23T05:00:00.000Z',
    all_day: false,
    occurrence_state: 'completed',
    attendance_state: 'attended',
    hours: null,
    time_zone: 'Australia/Sydney',
    notes: [
      {
        page_id: 'page_notion_32cf794f8476800cba33d5608c5e75c8',
        title: 'NESA HALT Accreditation Update: March 2026'
      }
    ],
    ...overrides
  };
}

test('a Notion PD row becomes a PD event with a knowledge-note link and no hours', () => {
  const event = projectNotionPdEvent(row());
  assert.equal(event.id, notionPdEventId(NOTION_ID));
  assert.equal(event.event_type, 'professional_development');
  assert.equal(event.occurrence_state, 'completed');
  assert.equal(event.hours, null);
  assert.equal(event.talks[0].title, 'NESA HALT Accreditation Update: March 2026');
  assert.equal(
    event.knowledge_notes[0].href,
    '/knowledge/#page/page_notion_32cf794f8476800cba33d5608c5e75c8'
  );
  assert.equal(pdPlacementKey(event.title, event.start), '2026-03-23|2026 nsw halt conference');
});

test('an event already stored for the same Sydney day is not imported twice', () => {
  const imported = projectNotionPdEvent(row());
  const merged = mergeNotionPdEvents(
    [{ id: 'event_live', title: imported.title, start: imported.start }],
    [row()]
  );
  assert.deepEqual(merged.map((event) => event.id), ['event_live']);
});

test('listGithubPdEvents reads pd-events.json and caches', async () => {
  resetGithubPdEventsCache();
  const body = JSON.stringify({ events: [row(), { title: 'no id' }] });
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).endsWith('/data/professional/pd-events.json')) {
      return new Response(
        JSON.stringify({
          sha: 'sha1',
          encoding: 'base64',
          content: Buffer.from(body).toString('base64'),
          size: Buffer.byteLength(body)
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  };
  const env = { GITHUB_TOKEN: 'token' };
  const rows = await listGithubPdEvents({ env, fetchImpl, now: () => 1000 });
  assert.equal(rows.length, 1);
  await listGithubPdEvents({ env, fetchImpl, now: () => 2000 });
  assert.equal(calls, 1);
  resetGithubPdEventsCache();
});

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  { now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) },
  SECRET
).token;

function emptyStore() {
  return {
    async get() {
      return null;
    },
    async setJSON() {},
    async list() {
      return { blobs: [] };
    }
  };
}

function authed(url) {
  return new Request(url, {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  });
}

test('GET /api/events places the imported PD event on the list and by id', async () => {
  const handler = createEventsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => emptyStore(),
    getUniversalLinkStore: async () => emptyStore(),
    getTasksStore: async () => emptyStore(),
    listGithubPdEvents: async () => [row()]
  });
  const list = await handler(authed('https://api.adam-russell.com/api/events'));
  assert.equal(list.status, 200);
  const events = (await list.json()).data.events;
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'professional_development');
  assert.equal(events[0].hours, null);
  const one = await handler(
    authed(`https://api.adam-russell.com/api/events?id=${encodeURIComponent(events[0].id)}`)
  );
  assert.equal(one.status, 200);
  assert.equal((await one.json()).data.event.notion_id, NOTION_ID);
});

test('GET /api/schedule-projections includes the imported PD event', async () => {
  const handler = createScheduleProjectionsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    scheduleNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => emptyStore(),
    listGithubCommunications: async () => [],
    listGithubPdEvents: async () => [row()]
  });
  const response = await handler(authed('https://api.adam-russell.com/api/schedule-projections'));
  assert.equal(response.status, 200);
  const projections = (await response.json()).data.projections;
  assert.equal(projections.length, 1);
  assert.equal(projections[0].kind, 'event');
  assert.equal(projections[0].event_type, 'professional_development');
  assert.equal(projections[0].title, '2026 NSW HALT Conference');
});
