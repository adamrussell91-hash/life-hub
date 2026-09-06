import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createAiJobsTickScheduledHandler } from '../../netlify/functions/ai-jobs-tick-scheduled.mjs';
import {
  jobIsStale,
  isScheduledTickRequest,
  runScheduledJobsTick,
  selectMidnightTidyIds,
  STALE_WORKING_JOB_MS
} from '../../netlify/functions/_shared/ai-jobs-tick.mjs';
import { createAiJobsTickHandler } from '../../netlify/functions/ai-jobs-tick.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  GITHUB_TOKEN: 'gh-token',
  ANTHROPIC_API_KEY: 'sk-ant'
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
    }
  };
}

test('working AI jobs go stale after ten minutes', () => {
  assert.equal(jobIsStale({ status: 'working', created_at: '2026-09-06T00:00:00.000Z' }, Date.parse('2026-09-06T00:09:00.000Z')), false);
  assert.equal(
    jobIsStale({ status: 'working', created_at: '2026-09-06T00:00:00.000Z' }, Date.parse('2026-09-06T00:10:00.000Z')),
    true
  );
  assert.equal(STALE_WORKING_JOB_MS, 10 * 60 * 1000);
});

test('selectMidnightTidyIds skips notes already stamped', () => {
  assert.deepEqual(
    selectMidnightTidyIds([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { tidied: { b: '2026-09-05T14:17:00.000Z' } }, 2),
    ['a', 'c']
  );
});

test('scheduled tick expires stale working jobs and tidies unstamped notes', async () => {
  const store = memoryStore({
    'meta/ai_jobs_inbox': {
      jobs: [
        { id: 'ai_job_stale', status: 'working', created_at: '2026-09-06T00:00:00.000Z' },
        { id: 'ai_job_fresh', status: 'working', created_at: '2026-09-06T00:09:00.000Z' }
      ]
    },
    'ai_jobs/ai_job_stale': {
      id: 'ai_job_stale',
      status: 'working',
      created_at: '2026-09-06T00:00:00.000Z'
    },
    'ai_jobs/ai_job_fresh': {
      id: 'ai_job_fresh',
      status: 'working',
      created_at: '2026-09-06T00:09:00.000Z'
    }
  });
  const tidied = [];
  const result = await runScheduledJobsTick({
    env,
    store,
    nowIso: () => '2026-09-06T00:10:00.000Z',
    nowMs: Date.parse('2026-09-06T00:10:00.000Z'),
    listPages: async () => [{ id: 'note-1' }, { id: 'note-2' }],
    tidyPage: async ({ id }) => {
      tidied.push(id);
    },
    readTidyState: async () => ({
      sha: 'state',
      text: JSON.stringify({ tidied: { 'note-2': '2026-09-05T14:17:00.000Z' } })
    }),
    writeTidyState: async () => undefined
  });
  assert.deepEqual(result.expired, ['ai_job_stale']);
  assert.equal((await store.get('ai_jobs/ai_job_stale', { type: 'json' })).status, 'error');
  assert.equal((await store.get('ai_jobs/ai_job_fresh', { type: 'json' })).status, 'working');
  assert.deepEqual(result.tidy.ids, ['note-1']);
  assert.deepEqual(tidied, ['note-1']);
});

test('POST /api/ai/jobs/tick accepts a Netlify schedule header without a session', async () => {
  const handler = createAiJobsTickHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore(),
    listPages: async () => [],
    tidyPage: async () => undefined,
    readTidyState: async () => ({ text: '{"tidied":{}}' }),
    writeTidyState: async () => undefined
  });
  const scheduled = await handler(new Request('https://api.adam-russell.com/api/ai/jobs/tick', {
    method: 'POST',
    headers: { 'x-nf-event': 'schedule' }
  }));
  assert.equal(scheduled.status, 202);
  const anon = await handler(new Request('https://api.adam-russell.com/api/ai/jobs/tick', {
    method: 'POST'
  }));
  assert.equal(anon.status, 401);
  const signedIn = await handler(new Request('https://api.adam-russell.com/api/ai/jobs/tick', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com'
    }
  }));
  assert.equal(signedIn.status, 200);
});

test('isScheduledTickRequest only trusts the Netlify schedule event', () => {
  assert.equal(isScheduledTickRequest(new Request('https://api.adam-russell.com/api/ai/jobs/tick', {
    headers: { 'x-nf-event': 'schedule' }
  })), true);
  assert.equal(isScheduledTickRequest(new Request('https://api.adam-russell.com/api/ai/jobs/tick')), false);
});

test('scheduled tick runs without a session', async () => {
  const handler = createAiJobsTickScheduledHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore(),
    listPages: async () => [],
    tidyPage: async () => undefined,
    readTidyState: async () => ({ text: '{"tidied":{}}' }),
    writeTidyState: async () => undefined
  });
  const response = await handler();
  assert.equal(response.status, 202);
});

test('no Netlify function sets both path and schedule', async () => {
  const dir = new URL('../../netlify/functions/', import.meta.url);
  const names = (await readdir(dir)).filter(name => name.endsWith('.mjs'));
  for (const name of names) {
    const source = await readFile(new URL(name, dir), 'utf8');
    assert.equal(
      /\bpath\s*:/.test(source) && /\bschedule\s*:/.test(source),
      false,
      `${name} sets both path and schedule; Netlify rejects that on deploy`
    );
  }
});
