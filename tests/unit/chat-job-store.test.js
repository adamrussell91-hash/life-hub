import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chatJobOwnerKey,
  createBlobChatJobStore,
  createMemoryChatJobStore,
  isChatJobId
} from '../../netlify/functions/_shared/chat-job-store.mjs';

test('isChatJobId accepts UUID v4 and rejects junk', () => {
  assert.equal(isChatJobId('11111111-1111-4111-8111-111111111111'), true);
  assert.equal(isChatJobId('not-a-job'), false);
  assert.equal(isChatJobId('../etc/passwd'), false);
});

test('memory store appends events and finishes a job', async () => {
  const store = createMemoryChatJobStore();
  await store.create('11111111-1111-4111-8111-111111111111', {
    owner: chatJobOwnerKey('cookie'),
    body: '{"message":"hi"}',
    url: 'https://life.example/api/chat'
  });
  await store.append('11111111-1111-4111-8111-111111111111', [{ type: 'agent', slug: 'penelope' }]);
  await store.finish('11111111-1111-4111-8111-111111111111');
  const job = await store.get('11111111-1111-4111-8111-111111111111');
  assert.equal(job.status, 'done');
  assert.deepEqual(job.events, [{ type: 'agent', slug: 'penelope' }]);
  assert.equal(job.owner, chatJobOwnerKey('cookie'));
});

test('blob adapter round-trips JSON jobs', async () => {
  const blobs = new Map();
  const store = createBlobChatJobStore({
    async set(key, value) { blobs.set(key, value); },
    async get(key, { type } = {}) {
      const raw = blobs.get(key);
      if (raw == null) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    }
  });
  await store.create('11111111-1111-4111-8111-111111111111', {
    owner: 'abc',
    body: '{"message":"hi"}',
    url: 'https://life.example/api/chat'
  });
  await store.append('11111111-1111-4111-8111-111111111111', [{ type: 'text', delta: 'ok' }]);
  const job = await store.get('11111111-1111-4111-8111-111111111111');
  assert.equal(job.status, 'running');
  assert.deepEqual(job.events, [{ type: 'text', delta: 'ok' }]);
});

test('blob put writes the full in-memory snapshot even when get returns a stale shorter job', async () => {
  const jobId = '11111111-1111-4111-8111-111111111111';
  const blobs = new Map();
  let getCount = 0;
  const store = createBlobChatJobStore({
    async set(key, value) { blobs.set(key, value); },
    async get(key, { type } = {}) {
      getCount += 1;
      // After the first write, pretend Blobs still returns the empty create snapshot.
      if (getCount > 1) {
        return {
          owner: 'abc',
          body: '{"message":"hi"}',
          url: 'https://life.example/api/chat',
          cookie: '',
          origin: '',
          events: [],
          status: 'pending'
        };
      }
      const raw = blobs.get(key);
      if (raw == null) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    }
  });
  await store.create(jobId, {
    owner: 'abc',
    body: '{"message":"hi"}',
    url: 'https://life.example/api/chat'
  });
  const events = [
    { type: 'agent', slug: 'vera' },
    { type: 'text', delta: 'Mostly from that skim milk — nice!)' },
    { type: 'done' }
  ];
  await store.put(jobId, {
    owner: 'abc',
    body: '{"message":"hi"}',
    url: 'https://life.example/api/chat',
    events,
    status: 'done'
  });
  // put must not have consulted the stale get for events — read the raw blob.
  const written = JSON.parse(blobs.get(jobId));
  assert.equal(written.status, 'done');
  assert.deepEqual(written.events, events);
});
