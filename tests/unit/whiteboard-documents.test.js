import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
import { createWhiteboardsHandler } from '../../netlify/functions/whiteboards.mjs';

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
    async set(key, value) {
      map.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix }) {
      return {
        blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
      };
    },
    snapshot() {
      return Object.fromEntries(map);
    }
  };
}

function request(url, { method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

const deps = (store) => ({
  env,
  now: () => Date.parse('2026-08-01T01:00:00Z'),
  getContentStore: async () => store
});

test('whiteboard API stores and reloads a snapshot behind the operator session', async () => {
  const store = memoryStore();
  const handler = createWhiteboardsHandler(deps(store));
  const snapshot = {
    type: 'blocksuite-snapshot',
    blocks: [{ id: 'shape_1', type: 'shape' }]
  };

  const saved = await handler(request(
    'https://api.adam-russell.com/api/whiteboards/doc_1',
    { method: 'PUT', body: { snapshot } }
  ));
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).data.snapshot, snapshot);

  const loaded = await handler(request(
    'https://api.adam-russell.com/api/whiteboards/doc_1'
  ));
  assert.equal(loaded.status, 200);
  assert.deepEqual((await loaded.json()).data.snapshot, snapshot);
});

test('lesson publish freezes a live whiteboard snapshot for student rendering', async () => {
  const stamp = '2026-08-01T00:00:00.000Z';
  const teachingStore = memoryStore({
    'lessons/lesson_1': {
      id: 'lesson_1',
      type: 'lesson',
      title: 'Whiteboard lesson',
      unit_id: 'unit_1',
      blocks: [{
        id: 'wb_1',
        type: 'block',
        block_type: 'whiteboard',
        variant: 'large',
        visibility: 'student_teacher',
        content: {
          document_id: 'doc_1',
          seed_document_id: 'doc_source',
          height_px: 640
        },
        layout: {},
        print: {},
        settings: {},
        created_at: stamp,
        updated_at: stamp,
        schema_version: 1
      }],
      created_at: stamp,
      updated_at: stamp,
      schema_version: 1
    }
  });
  const whiteboardSnapshot = {
    type: 'blocksuite-snapshot',
    blocks: [{ id: 'shape_1', type: 'shape' }]
  };
  const whiteboardStore = memoryStore({
    'documents/doc_1': {
      id: 'doc_1',
      snapshot: whiteboardSnapshot,
      schema_version: 1,
      updated_at: stamp
    }
  });

  const handler = createLessonPublishHandler({
    ...deps(teachingStore),
    getWhiteboardStore: async () => whiteboardStore
  });
  const response = await handler(request(
    'https://api.adam-russell.com/api/lessons/lesson_1/publish',
    { method: 'POST', body: {} }
  ));
  assert.equal(response.status, 200);

  const published = teachingStore.snapshot()['published/lessons/lesson_1'];
  assert.deepEqual(
    published.blocks[0].content.published_snapshot,
    whiteboardSnapshot
  );
  assert.equal('seed_document_id' in published.blocks[0].content, false);
  assert.equal(
    teachingStore.snapshot()['lessons/lesson_1'].blocks[0].content.seed_document_id,
    'doc_source'
  );
});
