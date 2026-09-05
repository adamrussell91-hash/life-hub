import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import {
  DEFAULT_TASK_PROPERTY_CONFIG,
  TASK_PROPERTIES_KEY
} from '../../netlify/functions/_shared/task-properties.mjs';
import { createTaskPropertiesHandler } from '../../netlify/functions/task-properties.mjs';

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
    },
    _map: map
  };
}

function request({
  cookie = true,
  origin = 'https://tasks-hub.adam-russell.com',
  url = 'https://api.adam-russell.com/api/task-properties',
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
  return createTaskPropertiesHandler({
    env,
    now: () => Date.parse('2026-08-16T12:00:00Z'),
    getContentStore: async () => store
  });
}

async function withHandlerServer(handler, run) {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const url = `https://api.adam-russell.com${req.url}`;
    const headers = Object.fromEntries(
      Object.entries(req.headers).filter(([, value]) => value != null)
    );
    const response = await handler(
      new Request(url, {
        method: req.method,
        headers,
        body: body.length ? body : undefined
      })
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('task-properties require the Life session and answer CORS preflight', async () => {
  const handler = handlerFor(memoryStore());
  const denied = await handler(request({ cookie: false }));
  assert.equal(denied.status, 401);

  const preflight = await handler(request({ method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://tasks-hub.adam-russell.com');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /PUT/);
});

test('GET seeds defaults into the Tasks store when missing', async () => {
  const store = memoryStore();
  const handler = handlerFor(store);

  const response = await handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.schema_version, 1);
  assert.equal(body.data.domains[0].id, 'teaching');
  assert.deepEqual(store._map.get(TASK_PROPERTIES_KEY), DEFAULT_TASK_PROPERTY_CONFIG);
});

test('GET returns stored config and PUT persists a valid update', async () => {
  const stored = structuredClone(DEFAULT_TASK_PROPERTY_CONFIG);
  stored.domains = [
    { id: 'teaching', label: 'teaching', color: '#376fb7' },
    { id: 'life', label: 'life', color: '#2f7a4f' },
    { id: 'health', label: 'health', color: '#f68620' }
  ];
  const store = memoryStore({ [TASK_PROPERTIES_KEY]: stored });
  const handler = handlerFor(store);

  const listed = await handler(request());
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).data.domains.map(d => d.id), [
    'teaching',
    'life',
    'health'
  ]);

  const next = structuredClone(stored);
  next.tags = [{ id: 'marking', label: 'marking' }];
  const saved = await handler(request({ method: 'PUT', body: next }));
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.ok, true);
  assert.deepEqual(savedBody.data.tags, [{ id: 'marking', label: 'marking' }]);
  assert.deepEqual(store._map.get(TASK_PROPERTIES_KEY).tags, [
    { id: 'marking', label: 'marking' }
  ]);
});

test('PUT rejects invalid configs', async () => {
  const handler = handlerFor(memoryStore());
  const bad = await handler(
    request({
      method: 'PUT',
      body: {
        schema_version: 1,
        domains: [],
        priorities: DEFAULT_TASK_PROPERTY_CONFIG.priorities,
        statuses: DEFAULT_TASK_PROPERTY_CONFIG.statuses,
        kinds: DEFAULT_TASK_PROPERTY_CONFIG.kinds,
        buckets: DEFAULT_TASK_PROPERTY_CONFIG.buckets,
        sources: DEFAULT_TASK_PROPERTY_CONFIG.sources,
        tags: []
      }
    })
  );
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'validation_error');

  const method = await handler(request({ method: 'POST', body: {} }));
  assert.equal(method.status, 405);
});

test('signed-in Properties page can load and save over fetch', async () => {
  const store = memoryStore();
  const handler = createTaskPropertiesHandler({
    env,
    now: () => Date.parse('2026-08-16T12:00:00Z'),
    getContentStore: async () => store
  });

  await withHandlerServer(handler, async base => {
    const headers = {
      cookie: `life_hub_session=${session}`,
      origin: 'https://tasks-hub.adam-russell.com',
      accept: 'application/json'
    };

    const loaded = await fetch(`${base}/api/task-properties`, { headers });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.headers.get('access-control-allow-origin'), 'https://tasks-hub.adam-russell.com');
    const config = (await loaded.json()).data;
    assert.equal(config.domains.length >= 1, true);

    config.tags = [{ id: 'exam', label: 'exam' }];
    const put = await fetch(`${base}/api/task-properties`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(config)
    });
    assert.equal(put.status, 200);
    const saved = (await put.json()).data;
    assert.deepEqual(saved.tags, [{ id: 'exam', label: 'exam' }]);
  });
});
