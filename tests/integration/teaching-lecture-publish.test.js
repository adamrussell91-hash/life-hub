import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';

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
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async setJSON(key, value) { map.set(key, value); },
    async set(key, value) { map.set(key, typeof value === 'string' ? JSON.parse(value) : value); },
    async delete(key) { map.delete(key); },
    snapshot() { return Object.fromEntries(map); }
  };
}

async function setupWithLesson({ pedagogical_mode, blocks }) {
  const store = memoryStore({
    'lessons/lesson1': {
      id: 'lesson1', type: 'lesson', title: 'Tone', slug: 'tone', status: 'active',
      unit_id: 'unit_1', sequence: 1, pedagogical_mode, blocks,
      created_at: '2026-08-11T00:00:00.000Z', updated_at: '2026-08-11T00:00:00.000Z', schema_version: 1
    }
  });
  const handler = createLessonPublishHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => store
  });
  const publish = () => handler(new Request('https://api.adam-russell.com/api/lessons/lesson1/publish', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://teaching-hub.adam-russell.com',
      'content-type': 'application/json'
    },
    body: JSON.stringify({})
  }));
  return { store, publish, published: () => store.snapshot()['published/lessons/lesson1'] };
}

test('a lecture publishes with its type so students get the player', async () => {
  const { published, publish } = await setupWithLesson({ pedagogical_mode: 'lecture', blocks: [
    { id: 'h1', type: 'block', block_type: 'heading', variant: 'section', visibility: 'student_teacher', content: { text: 'Tone', narration: { url: '/api/media/m1/file', duration_s: 30 } } }
  ] });
  const res = await publish();
  assert.equal(res.status, 200);
  const snapshot = published();
  assert.equal(snapshot.pedagogical_mode, 'lecture');
  assert.equal(snapshot.blocks[0].content.narration.duration_s, 30);
});

test('an ordinary lesson publishes with no type', async () => {
  const { published, publish } = await setupWithLesson({ pedagogical_mode: 'lesson', blocks: [] });
  const res = await publish();
  assert.equal(res.status, 200);
  assert.equal(published().pedagogical_mode, undefined);
});
