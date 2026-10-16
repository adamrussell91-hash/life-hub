import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import {
  ANNOTATION_VOICE_TRANSCRIBE_KIND,
  createAnnotationVoiceTranscribeHandler
} from '../../netlify/functions/annotation-voice-transcribe.mjs';
import { createAnnotationVoicePartHandler, voicePartKey } from '../../netlify/functions/annotation-voice-part.mjs';
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


function partsStore() {
  const store = memoryStore();
  const raw = new Map();
  store.set = async (key, value) => raw.set(key, value);
  store.get = async (key) => raw.get(key) ?? null;
  store.setJSON = async (key, value) => raw.set(key, value);
  store.getWithMetadata = async (key) => (raw.has(key) ? { data: raw.get(key), metadata: {} } : null);
  store.delete = async (key) => raw.delete(key);
  store.raw = raw;
  return store;
}

function authed(url, init) {
  const token = createSessionToken({
    now: Date.parse('2026-10-13T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 4)
  }, SECRET).token;
  return new Request(url, {
    ...init,
    headers: { cookie: `life_hub_session=${token}`, origin: 'https://life-hub.adam-russell.com', ...(init.headers ?? {}) }
  });
}

test('a long recording uploads in parts and is joined into one media file', async () => {
  const store = partsStore();
  const deps = { env, getContentStore: async () => store, invokeRun: async () => true };
  const partHandler = createAnnotationVoicePartHandler(deps);
  const pieces = [[1, 2, 3], [4, 5], [6]];
  for (const [index, bytes] of pieces.entries()) {
    const form = new FormData();
    form.append('upload_id', 'upload_abc123');
    form.append('index', String(index));
    form.append('file', new Blob([Uint8Array.from(bytes)]));
    const res = await partHandler(authed('https://api.adam-russell.com/api/annotation/voice/part', { method: 'POST', body: form }));
    assert.equal(res.status, 200);
  }
  const handler = createAnnotationVoiceTranscribeHandler(deps);
  const res = await handler(
    authed('https://api.adam-russell.com/api/annotation/voice/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ upload_id: 'upload_abc123', parts: 3, mime: 'audio/mp4;codecs=mp4a', title: 'Think aloud', duration_s: 1549 })
    })
  );
  assert.equal(res.status, 202);
  const body = await res.json();
  const joined = new Uint8Array(store.raw.get(`media_files/${body.data.media.id}`));
  assert.deepEqual([...joined], [1, 2, 3, 4, 5, 6]);
  assert.equal(body.data.media.mime_type, 'audio/mp4');
  // Parts are cleaned up once joined.
  assert.equal(store.raw.has(voicePartKey('upload_abc123', 0)), false);
});

test('joining reports a missing part instead of saving a broken file', async () => {
  const store = partsStore();
  store.raw.set(voicePartKey('upload_abc123', 0), Uint8Array.from([1]).buffer);
  const handler = createAnnotationVoiceTranscribeHandler({ env, getContentStore: async () => store, invokeRun: async () => true });
  const res = await handler(
    authed('https://api.adam-russell.com/api/annotation/voice/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ upload_id: 'upload_abc123', parts: 2, mime: 'audio/webm' })
    })
  );
  assert.equal(res.status, 409);
  assert.equal(store.raw.has(voicePartKey('upload_abc123', 0)), true);
});
