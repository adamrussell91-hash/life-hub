import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import {
  ANNOTATION_VOICE_TRANSCRIBE_KIND,
  createAnnotationVoiceTranscribeHandler
} from '../../netlify/functions/annotation-voice-transcribe.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};

function memoryStore() {
  const map = new Map();
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
      map.set(key, value);
    }
  };
}

test('POST /api/annotation/voice/transcribe stores media and enqueues job', async () => {
  const store = memoryStore();
  const handler = createAnnotationVoiceTranscribeHandler({
    env,
    getContentStore: async () => store
  });
  const token = createSessionToken({
    now: Date.parse('2026-10-13T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  }, SECRET).token;

  const form = new FormData();
  form.append('file', new File([Uint8Array.from([1, 2, 3, 4])], 'clip.webm', { type: 'audio/webm' }));
  form.append('title', 'Dulce reading');
  form.append('track_id', 'track_1');

  const response = await handler(
    new Request('https://api.adam-russell.com/api/annotation/voice/transcribe', {
      method: 'POST',
      headers: {
        cookie: `life_hub_session=${token}`,
        origin: 'https://life-hub.adam-russell.com'
      },
      body: form
    })
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.status, 'working');
  assert.equal(body.data.phase, 'queued');
  assert.match(body.data.poll, /^\/api\/ai\/jobs\//);
  assert.equal(body.data.media.mime_type, 'audio/webm');

  const job = await store.get(`ai_jobs/${body.data.id}`, { type: 'json' });
  assert.equal(job.kind, ANNOTATION_VOICE_TRANSCRIBE_KIND);
  assert.equal(job.media_id, body.data.media.id);
  assert.equal(job.track_id, 'track_1');
});
