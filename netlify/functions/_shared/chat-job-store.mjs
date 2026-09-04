import { createHash } from 'node:crypto';

export const CHAT_JOBS_STORE = 'life-hub-chat-jobs';
export const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isChatJobId(value) {
  return typeof value === 'string' && JOB_ID_RE.test(value);
}

export function chatJobOwnerKey(cookie) {
  return createHash('sha256').update(typeof cookie === 'string' ? cookie : '').digest('hex').slice(0, 32);
}

function jobRecord(record, { events = [], status = 'pending' } = {}) {
  return {
    owner: record.owner,
    body: record.body,
    url: record.url,
    cookie: record.cookie ?? '',
    origin: record.origin ?? '',
    events,
    status
  };
}

export function createMemoryChatJobStore() {
  const jobs = new Map();
  return {
    async create(jobId, record) {
      jobs.set(jobId, jobRecord(record));
    },
    /**
     * Blind snapshot write from the runner's in-memory event list.
     * Never read-modify-write events — Netlify Blobs eventual reads were
     * clobbering earlier text deltas (missing prefixes / mid-word cuts).
     */
    async put(jobId, record) {
      jobs.set(jobId, {
        owner: record.owner,
        body: record.body,
        url: record.url,
        cookie: record.cookie ?? '',
        origin: record.origin ?? '',
        events: Array.isArray(record.events) ? record.events : [],
        status: record.status ?? 'running'
      });
    },
    async append(jobId, events) {
      const job = jobs.get(jobId);
      if (!job) return;
      job.events.push(...events);
      if (job.status === 'pending') job.status = 'running';
    },
    async finish(jobId, { events } = {}) {
      const job = jobs.get(jobId);
      if (!job) return;
      if (Array.isArray(events)) job.events = events;
      job.status = 'done';
    },
    async get(jobId) {
      return jobs.get(jobId) ?? null;
    }
  };
}

export async function defaultGetChatJobStore() {
  const { getStore } = await import('@netlify/blobs');
  // Strong consistency so the browser poller sees the runner's latest snapshot.
  return createBlobChatJobStore(getStore(CHAT_JOBS_STORE, { consistency: 'strong' }));
}

export function createBlobChatJobStore(store) {
  return {
    async create(jobId, record) {
      await store.set(jobId, JSON.stringify(jobRecord(record)));
    },
    async put(jobId, record) {
      await store.set(jobId, JSON.stringify({
        owner: record.owner,
        body: record.body,
        url: record.url,
        cookie: record.cookie ?? '',
        origin: record.origin ?? '',
        events: Array.isArray(record.events) ? record.events : [],
        status: record.status ?? 'running'
      }));
    },
    async append(jobId, events) {
      // Legacy RMW path — prefer put() from chat-job-run. Kept for tests.
      const current = await readJob(store, jobId);
      if (!current) return;
      current.events = [...(current.events ?? []), ...events];
      if (current.status === 'pending') current.status = 'running';
      await store.set(jobId, JSON.stringify(current));
    },
    async finish(jobId, { events } = {}) {
      const current = await readJob(store, jobId);
      if (!current) return;
      // Caller must pass the full in-memory events when finishing so a stale
      // get cannot truncate the transcript as status flips to done.
      if (Array.isArray(events)) current.events = events;
      current.status = 'done';
      await store.set(jobId, JSON.stringify(current));
    },
    async get(jobId) {
      return readJob(store, jobId);
    }
  };
}

async function readJob(store, jobId) {
  const value = await store.get(jobId, { type: 'json' });
  return value && typeof value === 'object' ? value : null;
}
