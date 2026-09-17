import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createObservationsHandler } from '../../netlify/functions/observations.mjs';

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

const PERSON_REF = 'shared:person:person_00000000-0000-4000-8000-000000000001';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return {
        blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key }))
      };
    }
  };
}

function request({
  cookie = true,
  origin = 'https://life-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/observations',
  method = 'GET',
  body,
  rawBody
} = {}) {
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body !== undefined || rawBody !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

function makeHandler({ professionalStore, generateId } = {}) {
  return createObservationsHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => professionalStore ?? memoryStore(),
    observationNow: () => '2026-08-01T01:00:00.000Z',
    generateId
  });
}

test('rejects an unauthenticated request with 401', async () => {
  const handler = makeHandler();
  const response = await handler(request({ cookie: false }));
  assert.equal(response.status, 401);
});

test('CORS preflight is handled', async () => {
  const handler = makeHandler();
  const response = await handler(
    request({ method: 'OPTIONS', cookie: false, url: 'https://api.adam-russell.com/api/observations' })
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://life-hub.adam-russell.com');
});

test('unsupported method is rejected with 405', async () => {
  const handler = makeHandler();
  const response = await handler(request({ method: 'DELETE' }));
  assert.equal(response.status, 405);
});

test('malformed JSON body on POST is rejected', async () => {
  const handler = makeHandler();
  const response = await handler(request({ method: 'POST', rawBody: '{not json' }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'invalid_json');
});

test('missing about_ref on GET is rejected', async () => {
  const handler = makeHandler();
  const response = await handler(
    request({ url: 'https://api.adam-russell.com/api/observations' })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'missing_about_ref');
});

test('POST rejects forbidden access-control fields', async () => {
  const handler = makeHandler();
  const response = await handler(
    request({
      method: 'POST',
      body: {
        about_ref: PERSON_REF,
        text: 'hi',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual',
        workflow: 'administration'
      }
    })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'access_field_not_accepted');
});

test('create + list round-trip returns the created observation', async () => {
  const professionalStore = memoryStore();
  const handler = makeHandler({ professionalStore });

  const createResponse = await handler(
    request({
      method: 'POST',
      body: {
        about_ref: PERSON_REF,
        text: "Mentioned she's moving to a new role at UNSW next month.",
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'meeting'
      }
    })
  );
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.match(created.data.observation.id, /^observation_[0-9a-f-]{36}$/);
  assert.equal(created.data.observation.about_ref, PERSON_REF);
  assert.equal(created.data.observation.text, "Mentioned she's moving to a new role at UNSW next month.");
  assert.equal(created.data.observation.source, 'meeting');
  assert.equal(created.data.observation.linked_ref, null);
  assert.equal(created.data.created, true);

  const listResponse = await handler(
    request({
      url: `https://api.adam-russell.com/api/observations?about_ref=${encodeURIComponent(PERSON_REF)}`
    })
  );
  assert.equal(listResponse.status, 200);
  const listed = await listResponse.json();
  assert.equal(listed.data.observations.length, 1);
  assert.equal(listed.data.observations[0].id, created.data.observation.id);
  assert.equal(listed.data.observations[0].text, created.data.observation.text);
});

test('list ordering is newest occurred_at first, ties broken by ascending id', async () => {
  const professionalStore = memoryStore();
  const ids = [
    'observation_00000000-0000-4000-8000-000000000002',
    'observation_00000000-0000-4000-8000-000000000001',
    'observation_00000000-0000-4000-8000-000000000003'
  ];
  let call = 0;
  const handler = makeHandler({
    professionalStore,
    generateId: () => ids[call++]
  });

  // Same occurred_at for the first two (tie), an earlier occurred_at for the third.
  await handler(
    request({
      method: 'POST',
      body: {
        about_ref: PERSON_REF,
        text: 'First (id 2)',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }
    })
  );
  await handler(
    request({
      method: 'POST',
      body: {
        about_ref: PERSON_REF,
        text: 'Second (id 1, same timestamp)',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }
    })
  );
  await handler(
    request({
      method: 'POST',
      body: {
        about_ref: PERSON_REF,
        text: 'Third (older)',
        occurred_at: '2026-08-01T10:00:00.000Z',
        source: 'manual'
      }
    })
  );

  const listResponse = await handler(
    request({
      url: `https://api.adam-russell.com/api/observations?about_ref=${encodeURIComponent(PERSON_REF)}`
    })
  );
  const listed = await listResponse.json();
  assert.deepEqual(
    listed.data.observations.map((o) => o.id),
    [
      'observation_00000000-0000-4000-8000-000000000001',
      'observation_00000000-0000-4000-8000-000000000002',
      'observation_00000000-0000-4000-8000-000000000003'
    ]
  );
});

test('generated observation ids are path-safe', async () => {
  const professionalStore = memoryStore();
  const handler = makeHandler({ professionalStore });
  const response = await handler(
    request({
      method: 'POST',
      body: {
        about_ref: PERSON_REF,
        text: 'hi',
        occurred_at: '2026-09-01T10:00:00.000Z',
        source: 'manual'
      }
    })
  );
  const body = await response.json();
  const id = body.data.observation.id;
  assert.equal(id.includes('/'), false);
  assert.equal(id.includes('..'), false);
  assert.match(id, /^observation_[0-9a-f-]{36}$/);
});
