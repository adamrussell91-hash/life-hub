import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createWorkSessionsHandler } from '../../netlify/functions/work-sessions.mjs';
import { createPlanningProfileHandler } from '../../netlify/functions/planning-profile.mjs';
import { createPlanningDirectionHandler } from '../../netlify/functions/planning-direction.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  {
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  },
  SECRET
).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    async get(key, options = {}) {
      const value = map.get(key);
      if (value == null) return null;
      return options.type === 'json' ? value : value;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async set(key, value) {
      map.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    }
  };
}

function request({
  url,
  method = 'GET',
  body,
  origin = 'https://tasks-hub.adam-russell.com',
  cookie = true
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

const depsFor = (store) => ({
  env,
  now: () => Date.parse('2026-08-01T01:00:00Z'),
  getContentStore: async () => store
});

test('Planning profile production GET returns defaults and PATCH persists', async () => {
  const store = memoryStore();
  const handler = createPlanningProfileHandler(depsFor(store));

  const empty = await handler(
    request({ url: 'https://api.adam-russell.com/api/planning-profile' })
  );
  assert.equal(empty.status, 200);
  const emptyBody = await empty.json();
  assert.equal(emptyBody.ok, true);
  assert.equal(emptyBody.data.id, 'default');
  assert.equal(emptyBody.data.active_project_limit, null);

  const patched = await handler(
    request({
      url: 'https://api.adam-russell.com/api/planning-profile',
      method: 'PATCH',
      body: {
        active_project_limit: 3,
        runway_buffer_minutes: 45,
        work_windows: { mon: [{ start: '09:00', end: '12:00', label: 'Deep' }] },
        protected_windows: { mon: [{ start: '12:00', end: '13:00', label: 'Lunch' }] },
        deep_work_preference: { target_blocks_per_week: 4, min_block_minutes: 90 }
      }
    })
  );
  assert.equal(patched.status, 200);
  const patchedBody = await patched.json();
  assert.equal(patchedBody.data.active_project_limit, 3);
  assert.equal(patchedBody.data.runway_buffer_minutes, 45);
  assert.equal(patchedBody.data.work_windows.mon[0].start, '09:00');
  assert.equal(patchedBody.data.protected_windows.mon[0].label, 'Lunch');
  assert.equal(patchedBody.data.deep_work_preference.target_blocks_per_week, 4);

  const again = await handler(
    request({ url: 'https://api.adam-russell.com/api/planning-profile' })
  );
  assert.deepEqual((await again.json()).data.active_project_limit, 3);
});

test('Planning direction production GET/PATCH round-trips purpose and vision', async () => {
  const store = memoryStore();
  const handler = createPlanningDirectionHandler(depsFor(store));

  const patched = await handler(
    request({
      url: 'https://api.adam-russell.com/api/planning-direction',
      method: 'PATCH',
      body: {
        purpose: 'Teach well and stay well',
        principles: ['Depth over noise'],
        vision: 'A calm, executable week'
      }
    })
  );
  assert.equal(patched.status, 200);
  const body = await patched.json();
  assert.equal(body.data.purpose, 'Teach well and stay well');
  assert.deepEqual(body.data.principles, ['Depth over noise']);
  assert.equal(body.data.vision, 'A calm, executable week');

  const got = await handler(
    request({ url: 'https://api.adam-russell.com/api/planning-direction' })
  );
  assert.equal((await got.json()).data.vision, 'A calm, executable week');
});

test('Work session production create, update, and list', async () => {
  const store = memoryStore();
  const handler = createWorkSessionsHandler(depsFor(store));

  const created = await handler(
    request({
      url: 'https://api.adam-russell.com/api/work-sessions',
      method: 'POST',
      body: {
        task_id: 'task_1',
        project_id: 'proj_1',
        started_at: '2026-08-01T09:00:00.000Z',
        depth: 'deep',
        work_mode: 'defining',
        work_mode_confidence: 'explicit',
        source: 'focus_block'
      }
    })
  );
  assert.equal(created.status, 201);
  const session = (await created.json()).data;
  assert.equal(session.task_id, 'task_1');
  assert.equal(session.result, 'open');
  assert.ok(session.id);

  const finished = await handler(
    request({
      url: `https://api.adam-russell.com/api/work-sessions?id=${encodeURIComponent(session.id)}`,
      method: 'PATCH',
      body: {
        finished_at: '2026-08-01T10:30:00.000Z',
        actual_duration_minutes: 90,
        result: 'done'
      }
    })
  );
  assert.equal(finished.status, 200);
  const updated = (await finished.json()).data;
  assert.equal(updated.result, 'done');
  assert.equal(updated.actual_duration_minutes, 90);

  const listed = await handler(
    request({ url: 'https://api.adam-russell.com/api/work-sessions' })
  );
  assert.equal(listed.status, 200);
  const listBody = await listed.json();
  assert.equal(listBody.data.work_sessions.length, 1);
  assert.equal(listBody.data.work_sessions[0].id, session.id);
});
