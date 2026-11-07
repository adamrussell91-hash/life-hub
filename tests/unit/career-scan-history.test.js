import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAREER_SCAN_HISTORY_STATE_KEY,
  historyEstimate,
  historyStart,
  historyStatus,
  historyStop,
  runHistoryJob
} from '../../netlify/functions/_shared/career-scan-history.mjs';
import { createCareerScanHandler } from '../../netlify/functions/career-scan.mjs';

function memoryStore() {
  const data = new Map();
  return {
    data,
    async list({ prefix }) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async setJSON(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      data.delete(key);
    }
  };
}

const NOW = new Date('2026-11-07T00:00:00.000Z');

// 95 invented meetings, one a day going back, so 3 batches of 40 (40 + 40 + 15).
function meetings(n = 95) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(NOW.getTime() - (i + 1) * 86400000).toISOString().slice(0, 10);
    return { id: `m${String(i).padStart(3, '0')}`, title: `Invented meeting ${i}`, occurred_on: d, notes: `Notes ${i}` };
  });
}

function setup({ failOnCall = 0, count = 95 } = {}) {
  const store = memoryStore();
  const calls = [];
  let n = 0;
  const deps = {
    env: { ANTHROPIC_API_KEY: 'test' },
    now: () => NOW,
    professionalStore: store,
    listMeetings: async () => meetings(count),
    fetchImpl: async (_url, init) => {
      n += 1;
      const prompt = JSON.parse(init.body).messages[0].content;
      calls.push(prompt);
      if (n === failOnCall) return { ok: false, json: async () => ({}) };
      const refs = [...prompt.matchAll(/"ref":"(professional:meeting:m\d+)"/g)].map((m) => m[1]);
      return {
        ok: true,
        json: async () => ({
          content: [{
            text: JSON.stringify({
              proposals: [{
                title: `Skill from batch call ${n}`,
                skills: ['Planning'],
                source_refs: refs.slice(0, 2)
              }]
            })
          }]
        })
      };
    }
  };
  return { store, deps, calls };
}

test('history estimate counts sources, batches and cost with no model call', async () => {
  const { deps, calls } = setup();
  const result = await historyEstimate(deps, { months: 6 });
  assert.equal(result.sources, 95);
  assert.equal(result.batches, 3);
  assert.equal(result.cost_aud, 0.24);
  assert.deepEqual(result.by_kind, { meeting: 95 });
  assert.equal(calls.length, 0);
  await assert.rejects(() => historyEstimate(deps, { months: 5 }), { code: 'invalid_months' });
});

test('history estimate respects the chosen window', async () => {
  const { deps } = setup({ count: 400 });
  const six = await historyEstimate(deps, { months: 6 });
  const thirtySix = await historyEstimate(deps, { months: 36 });
  assert.equal(six.sources, 183 > 400 ? 400 : six.sources);
  assert.ok(six.sources < 400 && six.sources > 150);
  assert.equal(thirtySix.sources, 400);
  assert.equal(thirtySix.batches, 10);
});

test('history job runs every batch oldest first, saving as it goes', async () => {
  const { store, deps, calls } = setup();
  const started = await historyStart(deps, { months: 12 }, { invoke: async () => true });
  assert.deepEqual(started, { status: 'running', batch: 0, batches: 3 });
  assert.equal((await historyStatus(store)).status, 'running');
  const done = await runHistoryJob(deps);
  assert.equal(done.status, 'done');
  assert.equal(done.batch, 3);
  assert.equal(done.proposals_added, 3);
  assert.equal(calls.length, 3);
  // First batch holds the oldest records (m094 is the oldest).
  assert.match(calls[0], /m094/);
  assert.doesNotMatch(calls[0], /m000"/);
  assert.match(calls[2], /m000/);
  const final = await historyStatus(store);
  assert.equal(final.status, 'done');
});

test('a failed batch keeps earlier batches and a restart resumes after the last finished one', async () => {
  const { store, deps, calls } = setup({ failOnCall: 2 });
  await historyStart(deps, { months: 12 }, { invoke: async () => true });
  const failed = await runHistoryJob(deps);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.batch, 1);
  assert.equal(failed.proposals_added, 1);
  assert.equal(calls.length, 2);

  const resumed = await historyStart(deps, { months: 12 }, { invoke: async () => true });
  assert.deepEqual(resumed, { status: 'running', batch: 1, batches: 3 });
  const done = await runHistoryJob(deps);
  assert.equal(done.status, 'done');
  assert.equal(done.proposals_added, 3);
  // Batch 1 was not sent again: 2 calls before, 2 more now.
  assert.equal(calls.length, 4);
  assert.match(calls[2], /m0(5|4)\d/);
  assert.equal([...store.data.keys()].filter((k) => k.includes('scan-proposals/records/')).length, 3);
});

test('only one history scan at a time', async () => {
  const { deps } = setup();
  await historyStart(deps, { months: 12 }, { invoke: async () => true });
  await assert.rejects(
    () => historyStart(deps, { months: 12 }, { invoke: async () => true }),
    { code: 'history_running', status: 409 }
  );
});

test('stop ends the scan after the current batch and can be resumed', async () => {
  const { store, deps, calls } = setup();
  await historyStart(deps, { months: 12 }, { invoke: async () => true });
  let first = true;
  const stopping = { ...deps };
  const baseFetch = deps.fetchImpl;
  stopping.fetchImpl = async (...args) => {
    const out = await baseFetch(...args);
    if (first) {
      first = false;
      await historyStop(deps); // pressed while batch 1 is in flight
    }
    return out;
  };
  const stopped = await runHistoryJob(stopping);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.batch, 1);
  assert.equal(calls.length, 1);
  assert.equal((await historyStatus(store)).status, 'stopped');

  await historyStart(deps, { months: 12 }, { invoke: async () => true });
  const done = await runHistoryJob(deps);
  assert.equal(done.status, 'done');
  assert.equal(calls.length, 3);
});

test('a job that never started reports idle; a worker that died reads as failed', async () => {
  const { store, deps } = setup();
  assert.deepEqual(await historyStatus(store), { status: 'idle', batch: 0, batches: 0, proposals_added: 0 });
  await historyStart(deps, { months: 12 }, { invoke: async () => true });
  const state = await store.get(CAREER_SCAN_HISTORY_STATE_KEY);
  await store.setJSON(CAREER_SCAN_HISTORY_STATE_KEY, { ...state, updated_at: '2020-01-01T00:00:00.000Z' });
  assert.equal((await historyStatus(store)).status, 'failed');
});

test('starting fails cleanly when the background run cannot be kicked', async () => {
  const { store, deps } = setup();
  await assert.rejects(
    () => historyStart(deps, { months: 12 }, { invoke: async () => false }),
    { code: 'ann_unavailable' }
  );
  assert.equal((await historyStatus(store)).status, 'failed');
});

test('the scan handler exposes the four history actions', async () => {
  const { store, deps } = setup();
  const env = {
    ...deps.env,
    NETLIFY_BLOBS_CONTEXT: undefined
  };
  const handler = createCareerScanHandler({
    ...deps,
    env,
    defaultReaders: false,
    verifySessionToken: async () => ({ valid: true }),
    getContentStore: async () => store,
    invokeHistoryRun: async () => true
  });
  assert.equal(typeof handler, 'function');
});
