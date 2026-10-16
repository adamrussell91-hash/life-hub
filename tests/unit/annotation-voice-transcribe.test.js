import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import {
  ANNOTATION_VOICE_TRANSCRIBE_KIND,
  createAnnotationVoiceTranscribeHandler
} from '../../netlify/functions/annotation-voice-transcribe.mjs';
import { createAnnotationVoiceTranscribeRunHandler } from '../../netlify/functions/annotation-voice-transcribe-run.mjs';

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
  const kicked = [];
  const handler = createAnnotationVoiceTranscribeHandler({
    env,
    getContentStore: async () => store,
    invokeRun: async (_request, jobId) => {
      kicked.push(jobId);
      return true;
    }
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
  // Transcription starts now, not at the daily tick.
  assert.deepEqual(kicked, [body.data.id]);
  assert.equal(body.data.run_started, true);
});

test('upload still succeeds when the background run cannot be kicked', async () => {
  const store = memoryStore();
  const handler = createAnnotationVoiceTranscribeHandler({
    env,
    getContentStore: async () => store,
    invokeRun: async () => {
      throw new Error('network down');
    }
  });
  const token = createSessionToken({
    now: Date.parse('2026-10-13T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  }, SECRET).token;
  const form = new FormData();
  form.append('file', new File([Uint8Array.from([1, 2])], 'clip.mp4', { type: 'audio/mp4' }));
  const response = await handler(
    new Request('https://api.adam-russell.com/api/annotation/voice/transcribe', {
      method: 'POST',
      headers: { cookie: `life_hub_session=${token}`, origin: 'https://life-hub.adam-russell.com' },
      body: form
    })
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.data.run_started, false);
});

function runRequest(id) {
  const token = createSessionToken({
    now: Date.parse('2026-10-13T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  }, SECRET).token;
  return new Request('https://api.adam-russell.com/api/annotation/voice/transcribe/run', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${token}`,
      origin: 'https://life-hub.adam-russell.com',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ id })
  });
}

function queuedVoiceStore() {
  const store = memoryStore();
  store.setJSON('ai_jobs/ai_job_v', {
    id: 'ai_job_v',
    kind: ANNOTATION_VOICE_TRANSCRIBE_KIND,
    status: 'working',
    phase: 'queued',
    media_id: 'media_v',
    attempts: 0
  });
  store.set('media_files/media_v', Buffer.from('audio'));
  store.getWithMetadata = async (key) => {
    const value = await store.get(key);
    return value == null ? null : { data: value, metadata: {} };
  };
  return store;
}

test('transcribe run processes the one job immediately', async () => {
  const store = queuedVoiceStore();
  const handler = createAnnotationVoiceTranscribeRunHandler({
    env: { ...env, RESEARCH_KERNEL_SHARED_SECRET: 'kernel' },
    getContentStore: async () => store,
    knowledgeFetch: async () =>
      new Response(JSON.stringify({ text: 'cold spectres', words: [{ word: 'cold', start: 0, end: 0.3 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
  });
  const response = await handler(runRequest('ai_job_v'));
  assert.equal(response.status, 200);
  const job = await store.get('ai_jobs/ai_job_v', { type: 'json' });
  assert.equal(job.status, 'done');
  assert.equal(job.result.whisper.text, 'cold spectres');
});

test('transcribe run retries once, then marks the job failed', async () => {
  const store = queuedVoiceStore();
  let calls = 0;
  const handler = createAnnotationVoiceTranscribeRunHandler({
    env: { ...env, RESEARCH_KERNEL_SHARED_SECRET: 'kernel' },
    getContentStore: async () => store,
    knowledgeFetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'model busy' }), { status: 502 });
    }
  });
  await handler(runRequest('ai_job_v'));
  assert.equal(calls, 2);
  const job = await store.get('ai_jobs/ai_job_v', { type: 'json' });
  assert.equal(job.status, 'error');
  assert.equal(job.error, 'model busy');
});

test('transcribe run fails the job clearly when the kernel is not connected', async () => {
  const store = queuedVoiceStore();
  const handler = createAnnotationVoiceTranscribeRunHandler({
    env,
    getContentStore: async () => store
  });
  await handler(runRequest('ai_job_v'));
  const job = await store.get('ai_jobs/ai_job_v', { type: 'json' });
  assert.equal(job.status, 'error');
  assert.match(job.error, /not connected/);
});
