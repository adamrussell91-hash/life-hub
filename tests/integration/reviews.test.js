import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createReviewsHandler } from '../../netlify/functions/reviews.mjs';

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

function request({
  cookie = true,
  origin = 'https://tasks-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/reviews',
  method = 'GET',
  body
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

function handlerFor(store) {
  return createReviewsHandler({
    env,
    now: () => Date.parse('2026-08-16T12:00:00Z'),
    getContentStore: async () => store
  });
}

test('reviews require the Life session and answer CORS preflight', async () => {
  const handler = handlerFor(memoryStore());
  const denied = await handler(request({ cookie: false }));
  assert.equal(denied.status, 401);

  const preflight = await handler(request({ method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://tasks-hub.adam-russell.com');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
});

test('reviews list, variance, and close write a ReviewLog on the Tasks store', async () => {
  const store = memoryStore({
    'projects/p1': {
      id: 'p1',
      title: 'Wrap demo',
      status: 'active',
      baseline_end_date: '2026-07-15',
      current_end_date: '2026-07-20',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z'
    },
    'tasks/t1': {
      id: 't1',
      parent_project_id: 'p1',
      status: 'done',
      due_date: '2026-08-01'
    }
  });
  const handler = handlerFor(store);

  const empty = await handler(request());
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).data.reviews, []);

  const varianceRes = await handler(request({
    url: 'https://api.adam-russell.com/api/reviews?project_id=p1'
  }));
  assert.equal(varianceRes.status, 200);
  const variance = (await varianceRes.json()).data.variance;
  assert.equal(variance.slip_days, 17);
  assert.equal(variance.ready_to_close, true);

  const missing = await handler(request({
    url: 'https://api.adam-russell.com/api/reviews?project_id=nope'
  }));
  assert.equal(missing.status, 404);

  const closed = await handler(request({
    method: 'POST',
    body: { action: 'close', project_id: 'p1', reason: 'Marks landed; wrap the arc.' }
  }));
  assert.equal(closed.status, 200);
  const result = (await closed.json()).data;
  assert.equal(result.project.status, 'archived_dead');
  assert.equal(result.project.review_summary, 'Marks landed; wrap the arc.');
  assert.equal(result.review.outcome, 'closed');
  assert.equal(result.review.slip_days, 17);
  assert.equal(result.review.baseline_end_date, '2026-07-15');
  assert.equal(result.variance.slip_days, 17);

  const listed = await handler(request());
  assert.equal(listed.status, 200);
  const reviews = (await listed.json()).data.reviews;
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].reason, 'Marks landed; wrap the arc.');

  const again = await handler(request({
    method: 'POST',
    body: { action: 'close', project_id: 'p1', reason: 'Already done' }
  }));
  assert.equal(again.status, 400);
});

test('reviews reject a blank retrospective and unknown actions', async () => {
  const store = memoryStore({
    'projects/p1': { id: 'p1', title: 'Open', status: 'active' }
  });
  const handler = handlerFor(store);

  const blank = await handler(request({
    method: 'POST',
    body: { action: 'close', project_id: 'p1', reason: '   ' }
  }));
  assert.equal(blank.status, 400);

  const unknown = await handler(request({
    method: 'POST',
    body: { action: 'flag_stalled' }
  }));
  assert.equal(unknown.status, 400);
});
