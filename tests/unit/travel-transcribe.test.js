import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  createTravelTranscribeHandler,
  tidyTranscript,
  TRANSCRIBE_PER_MINUTE
} from '../../netlify/functions/travel-transcribe.mjs';
import { resetRateLimits } from '../../netlify/functions/_shared/travel-rate-limit.mjs';

const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: 's'.repeat(32),
  RESEARCH_KERNEL_SHARED_SECRET: 'kernel-secret'
};

beforeEach(() => resetRateLimits());

function store() {
  const blobs = new Map([
    ['audio/tau_a1.json', JSON.stringify({ id: 'tau_a1', trip_id: 'trp_live1', mime_type: 'audio/mp4' })],
    ['audio/tau_a1.bin', new Uint8Array([1, 2, 3, 4]).buffer],
    ['audio/tau_o1.json', JSON.stringify({ id: 'tau_o1', trip_id: 'trp_other1', mime_type: 'audio/mp4' })],
    ['audio/tau_o1.bin', new Uint8Array([9]).buffer]
  ]);
  return {
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async getWithMetadata(key) {
      return blobs.has(key) ? { data: blobs.get(key), metadata: {} } : null;
    }
  };
}

function handler({ fetchImpl, env: useEnv = env, timeoutMs } = {}) {
  return createTravelTranscribeHandler({
    env: useEnv,
    fetchImpl,
    timeoutMs,
    getTravelStore: async () => store(),
    createTravelRepository: () => ({
      async getTrip(id) {
        if (id === 'trp_live1') return { trip: { id, title: 'Invented trip' }, version: 'v1' };
        throw Object.assign(new Error('Trip not found.'), { status: 404, code: 'not_found' });
      }
    }),
    verifySessionToken: async () => ({ valid: true, payload: {} })
  });
}

const ask = (h, audioId, query = 'trip=trp_live1') =>
  h(
    new Request(`https://api.example/api/travel-transcribe?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'life_hub_session=x' },
      body: JSON.stringify({ audio_id: audioId })
    })
  );

const kernel = (payload, status = 200) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
};

test('tidyTranscript collapses whitespace and cuts to 600 characters', () => {
  assert.equal(tidyTranscript('  Made it \n to   the market. '), 'Made it to the market.');
  assert.equal(tidyTranscript(null), '');
  assert.equal(Array.from(tidyTranscript('é'.repeat(700))).length, 600);
});

test('the clip goes to the transcription service and its words come back tidy', async () => {
  const { calls, fetchImpl } = kernel({ text: '  Made it   to the market. ', segments: [] });
  const response = await ask(handler({ fetchImpl }), 'tau_a1');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { text: 'Made it to the market.' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/transcribe$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-research-kernel-secret'], 'kernel-secret');
  assert.equal(JSON.parse(calls[0].init.body).audio, Buffer.from([1, 2, 3, 4]).toString('base64'));
});

test('a service that never answers is a retryable 502, inside the time limit', async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      // AbortSignal.timeout does not hold the event loop open; this timer does until it fires.
      const keepAlive = setTimeout(() => {}, 5_000);
      signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(signal.reason ?? new Error('aborted'));
      });
    });
  const response = await ask(handler({ fetchImpl, timeoutMs: 20 }), 'tau_a1');
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.code, 'transcription_failed');
  assert.equal(body.error.retryable, true);
});

test('a failing service is a 502; a service that is not connected is a 503', async () => {
  const { fetchImpl } = kernel({ error: 'boom' }, 500);
  assert.equal((await ask(handler({ fetchImpl }), 'tau_a1')).status, 502);

  const unbound = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
  const response = await ask(handler({ fetchImpl, env: unbound }), 'tau_a1');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'transcription_unavailable');
});

test('another trip\'s clip, a bad id, a missing trip and an unknown trip are refused', async () => {
  const { fetchImpl, calls } = kernel({ text: 'x' });
  const h = handler({ fetchImpl });
  assert.equal((await ask(h, 'tau_o1')).status, 404);
  assert.equal((await ask(h, 'nope')).status, 400);
  assert.equal((await ask(h, 'tau_a1', '')).status, 400);
  assert.equal((await ask(h, 'tau_a1', 'trip=trp_missing1')).status, 404);
  assert.equal(calls.length, 0, 'nothing was sent to the service');
});

test('transcription is limited to ten calls a minute', async () => {
  const { fetchImpl } = kernel({ text: 'x' });
  const h = handler({ fetchImpl });
  for (let i = 0; i < TRANSCRIBE_PER_MINUTE; i += 1) {
    assert.equal((await ask(h, 'tau_a1')).status, 200);
  }
  assert.equal((await ask(h, 'tau_a1')).status, 429);
});
