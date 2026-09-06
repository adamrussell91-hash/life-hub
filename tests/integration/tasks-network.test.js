import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createCapacityHandler } from '../../netlify/functions/capacity.mjs';
import { createStressFlagsHandler } from '../../netlify/functions/stress-flags.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

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
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    }
  };
}

function request(url, { cookie = true, method = 'GET', body, origin = 'https://tasks-hub.adam-russell.com' } = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

function seedStore() {
  return memoryStore({
    'projects/ex1': {
      id: 'ex1',
      type: 'excursion',
      title: 'Ethics',
      current_end_date: '2026-08-12'
    },
    'projects/ex2': {
      id: 'ex2',
      type: 'excursion',
      title: 'Da Vinci',
      current_end_date: '2026-08-20'
    },
    'tasks/t1': { id: 't1', title: 'Late A', status: 'todo', due_date: '2026-08-10' },
    'tasks/t2': { id: 't2', title: 'Late B', status: 'todo', due_date: '2026-08-11' },
    'tasks/t3': { id: 't3', title: 'Late C', status: 'todo', due_date: '2026-08-12' },
    'tasks/t4': {
      id: 't4',
      title: 'Finish lesson pack',
      status: 'todo',
      due_date: '2026-08-16',
      estimated_duration: 90
    }
  });
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

function stressDeps(store) {
  return {
    env,
    now: () => Date.parse('2026-08-16T12:00:00Z'),
    getContentStore: async () => store
  };
}

test('stress-flags and capacity require the Life session', async () => {
  const store = seedStore();
  const stress = createStressFlagsHandler(stressDeps(store));
  const capacity = createCapacityHandler(stressDeps(store));
  assert.equal((await stress(request('https://api.adam-russell.com/api/stress-flags', { cookie: false }))).status, 401);
  assert.equal((await capacity(request('https://api.adam-russell.com/api/capacity', { cookie: false }))).status, 401);
});

test('scan raises flags once, then skips duplicates and fills agent inboxes', async () => {
  const store = seedStore();
  const handler = createStressFlagsHandler(stressDeps(store));

  const first = await read(await handler(request(
    'https://api.adam-russell.com/api/stress-flags',
    { method: 'POST', body: { action: 'scan' } }
  )));
  assert.equal(first.status, 200);
  assert.ok(first.body.data.raised.length >= 2);

  const list = await read(await handler(request('https://api.adam-russell.com/api/stress-flags')));
  assert.equal(list.status, 200);
  assert.ok(list.body.data.flags.length >= 2);

  const hammond = await read(await handler(request(
    'https://api.adam-russell.com/api/stress-flags?inbox=General%20Hammond'
  )));
  assert.equal(hammond.body.data.flags.length, first.body.data.raised.length);

  const second = await read(await handler(request(
    'https://api.adam-russell.com/api/stress-flags',
    { method: 'POST', body: { action: 'scan' } }
  )));
  assert.equal(second.body.data.raised.length, 0);
  assert.ok(second.body.data.skipped >= first.body.data.raised.length);
});

test('manual raise and intuitive scan skip without a judge', async () => {
  const store = memoryStore();
  const handler = createStressFlagsHandler(stressDeps(store));

  const raised = await read(await handler(request(
    'https://api.adam-russell.com/api/stress-flags',
    { method: 'POST', body: { action: 'raise', pattern_description: 'Marking week is stacking' } }
  )));
  assert.equal(raised.status, 201);
  assert.equal(raised.body.data.pattern_kind, 'manual');
  assert.deepEqual(raised.body.data.routed_to.includes('General Hammond'), true);

  const intuition = await read(await handler(request(
    'https://api.adam-russell.com/api/stress-flags',
    { method: 'POST', body: { action: 'intuitive_scan' } }
  )));
  assert.equal(intuition.status, 200);
  assert.equal(intuition.body.data.skipped_ai, true);
  assert.equal(intuition.body.data.reason, 'no_api_key');

  const list = await read(await handler(request('https://api.adam-russell.com/api/stress-flags')));
  assert.equal(list.body.data.judgment.reason, 'no_api_key');
});

test('capacity snapshot, share, rotate, and public token', async () => {
  const store = seedStore();
  const handler = createCapacityHandler(stressDeps(store));

  const first = await read(await handler(request('https://api.adam-russell.com/api/capacity')));
  assert.equal(first.status, 200);
  assert.equal(first.body.data.snapshot.days.length, 14);
  assert.equal(first.body.data.share, null);

  const ensured = await read(await handler(request(
    'https://api.adam-russell.com/api/capacity',
    { method: 'POST', body: { action: 'ensure_share' } }
  )));
  assert.equal(ensured.status, 200);
  const token = ensured.body.data.share.token;
  assert.ok(token.length > 8);

  const again = await read(await handler(request(
    'https://api.adam-russell.com/api/capacity',
    { method: 'POST', body: { action: 'ensure_share' } }
  )));
  assert.equal(again.body.data.share.token, token);

  const pub = await read(await handler(request(
    `https://api.adam-russell.com/api/capacity?token=${token}`,
    { cookie: false }
  )));
  assert.equal(pub.status, 200);
  assert.ok(pub.body.data.headlines.length > 0);
  assert.equal(JSON.stringify(pub.body.data).includes('Finish lesson pack'), false);
  assert.equal(pub.body.data.days[0].open_task_count, undefined);

  const unknown = await read(await handler(request(
    'https://api.adam-russell.com/api/capacity?token=nope',
    { cookie: false }
  )));
  assert.equal(unknown.status, 404);

  const rotated = await read(await handler(request(
    'https://api.adam-russell.com/api/capacity',
    { method: 'POST', body: { action: 'rotate_share' } }
  )));
  assert.notEqual(rotated.body.data.share.token, token);
});
