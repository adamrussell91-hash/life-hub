import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createScheduleProjectionsHandler } from '../../netlify/functions/schedule-projections.mjs';
import {
  listGithubCommunications,
  resetGithubCommunicationsCache
} from '../../netlify/functions/_shared/github-professional-data.mjs';
import { projectNotionCommunicationSchedule } from '../../netlify/functions/_shared/schedule-projection.mjs';

const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);
const ID_C = 'c'.repeat(32);

function row(overrides = {}) {
  return {
    notion_id: ID_A,
    title: 'Chat with Sam K.',
    meeting_type: 'Mentoring Meetings',
    method: 'In-person Meeting',
    date_start: '2026-03-02T23:00:00.000Z',
    date_end: '2026-03-02T23:30:00.000Z',
    attendees: [],
    ...overrides
  };
}

test('timed Notion comm with a later end is a block that opens the Notion page', () => {
  const projection = projectNotionCommunicationSchedule(row());
  assert.equal(projection.kind, 'communication');
  assert.equal(projection.title, 'Chat with Sam K.');
  assert.equal(projection.start, '2026-03-02T23:00:00.000Z');
  assert.equal(projection.end, '2026-03-02T23:30:00.000Z');
  assert.equal(projection.pin, false);
  assert.equal(projection.channel, 'in_person');
  assert.equal(projection.status, 'completed');
  assert.equal(projection.source_ref, `professional:communication:notion_${ID_A}`);
  assert.equal(projection.href, `https://www.notion.so/${ID_A}`);
});

test('date-only Notion comm pins at 09:00 Sydney, on both sides of daylight saving', () => {
  // AEDT (UTC+11) in February, AEST (UTC+10) in June.
  assert.equal(
    projectNotionCommunicationSchedule(row({ date_start: '2026-02-10', date_end: null })).start,
    '2026-02-09T22:00:00.000Z'
  );
  const winter = projectNotionCommunicationSchedule(row({ date_start: '2026-06-10', date_end: null }));
  assert.equal(winter.start, '2026-06-09T23:00:00.000Z');
  assert.equal(winter.pin, true);
  assert.equal(winter.end, winter.start);
});

test('timed Notion comm with no end, or an end not after its start, is a pin', () => {
  assert.equal(projectNotionCommunicationSchedule(row({ date_end: null })).pin, true);
  assert.equal(
    projectNotionCommunicationSchedule(row({ date_end: '2026-03-02T22:00:00.000Z' })).pin,
    true
  );
});

test('Notion comm without a date or a valid id is not placed', () => {
  assert.equal(projectNotionCommunicationSchedule(row({ date_start: null })), null);
  assert.equal(projectNotionCommunicationSchedule(row({ date_start: 'soon' })), null);
  assert.equal(projectNotionCommunicationSchedule(row({ notion_id: 'not-an-id' })), null);
});

test('title falls back to meeting type, then method; unknown method is channel other', () => {
  assert.equal(projectNotionCommunicationSchedule(row({ title: '' })).title, 'Mentoring Meetings');
  assert.equal(
    projectNotionCommunicationSchedule(row({ title: '', meeting_type: null, method: 'Email' })).title,
    'Email'
  );
  assert.equal(projectNotionCommunicationSchedule(row({ method: null })).channel, 'other');
  assert.equal(projectNotionCommunicationSchedule(row({ method: 'Video Call' })).channel, 'video');
});

function githubFetch(rows) {
  const text = JSON.stringify(rows);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/data/professional/communications.json')) {
      return new Response(
        JSON.stringify({ sha: 'sha1', encoding: 'base64', content: Buffer.from(text).toString('base64'), size: Buffer.byteLength(text) }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('listGithubCommunications reads communications.json, drops rows without a notion_id, and caches', async () => {
  resetGithubCommunicationsCache();
  const { fetchImpl, calls } = githubFetch([row(), { title: 'no id' }]);
  const env = { GITHUB_TOKEN: 'token' };
  const rows = await listGithubCommunications({ env, fetchImpl, now: () => 1000 });
  assert.equal(rows.length, 1);
  await listGithubCommunications({ env, fetchImpl, now: () => 2000 });
  assert.equal(calls.length, 1);
  resetGithubCommunicationsCache();
});

test('listGithubCommunications without a token returns [] and makes no request', async () => {
  resetGithubCommunicationsCache();
  const { fetchImpl, calls } = githubFetch([row()]);
  assert.deepEqual(await listGithubCommunications({ env: {}, fetchImpl }), []);
  assert.equal(calls.length, 0);
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

function scheduleRequest() {
  return new Request('https://api.adam-russell.com/api/schedule-projections', {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  });
}

test('/api/schedule-projections includes Notion comms from life-hub-data', async () => {
  const handler = createScheduleProjectionsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    scheduleNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => emptyStore(),
    listGithubCommunications: async () => [
      row(),
      row({ notion_id: ID_B, date_start: '2026-06-10', date_end: null }),
      row({ notion_id: ID_C, date_start: null })
    ]
  });
  const response = await handler(scheduleRequest());
  assert.equal(response.status, 200);
  const { projections } = (await response.json()).data;
  const comms = projections.filter((p) => p.kind === 'communication');
  assert.equal(comms.length, 2);
  assert.deepEqual(
    comms.map((p) => p.href).sort(),
    [`https://www.notion.so/${ID_A}`, `https://www.notion.so/${ID_B}`]
  );
});

test('/api/schedule-projections still answers when the GitHub read fails', async () => {
  const handler = createScheduleProjectionsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    scheduleNow: () => '2026-08-01T01:00:00.000Z',
    getContentStore: async () => emptyStore(),
    listGithubCommunications: async () => {
      throw new Error('github down');
    }
  });
  const response = await handler(scheduleRequest());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.projections, []);
});
