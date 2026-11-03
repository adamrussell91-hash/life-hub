// Reading minutes takes Clare longer than a page request may wait, so it runs as a
// job: the page starts it, the background function reads, the page asks until done.

import { randomUUID } from 'node:crypto';
import { getJSON, setJSON } from './professional-blobs.mjs';
import { minutesSource, readMinutes } from './clare-comms.mjs';

const JOB_PREFIX = 'clare-minutes-jobs/';
const JOB_ID_RE = /^[0-9a-f-]{36}$/;
const STRONG = { consistency: 'strong' };
// A worker that died leaves its job running; past this the page is told so.
export const MINUTES_JOB_STALE_MS = 10 * 60_000;

function jobKey(jobId) {
  return `${JOB_PREFIX}${jobId}`;
}

export function minutesReadUrl(request) {
  return new URL('/api/clare/minutes-read', request.url);
}

export async function defaultInvokeMinutesRead(request, jobId, fetchImpl = fetch) {
  const response = await fetchImpl(minutesReadUrl(request), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ job_id: jobId })
  });
  return response.status === 202 || response.ok;
}

export async function startMinutesRead(store, { context, minutes }, { invoke, now = Date.now }) {
  minutesSource(minutes);
  const jobId = randomUUID();
  await setJSON(store, jobKey(jobId), { status: 'queued', context, minutes, started_at: now() });
  let kicked = false;
  try {
    kicked = await invoke(jobId);
  } catch {
    kicked = false;
  }
  if (!kicked) {
    await store.delete(jobKey(jobId));
    throw Object.assign(new Error('Clare could not start reading. Try again.'), { status: 503, code: 'clare_failed', retryable: true });
  }
  return { job_id: jobId };
}

/** Runs once for a job. The minutes themselves are dropped as soon as it finishes. */
export async function runMinutesRead(store, jobId, { complete, now = Date.now }) {
  if (!JOB_ID_RE.test(jobId ?? '')) return;
  const job = await getJSON(store, jobKey(jobId), STRONG);
  if (job?.status !== 'queued') return;
  await setJSON(store, jobKey(jobId), { status: 'running', started_at: now(), context: job.context, minutes: job.minutes });
  try {
    const review = await readMinutes(job.context ?? {}, job.minutes, { complete });
    await setJSON(store, jobKey(jobId), { status: 'done', review });
  } catch (error) {
    await setJSON(store, jobKey(jobId), { status: 'failed', message: error?.message || 'Clare could not finish.' });
  }
}

/** What the page sees. A finished job is handed over once, then deleted. */
export async function minutesReadStatus(store, jobId, { now = Date.now } = {}) {
  if (!JOB_ID_RE.test(jobId ?? '')) {
    throw Object.assign(new Error('Unknown minutes job.'), { status: 400, code: 'invalid_job' });
  }
  const job = await getJSON(store, jobKey(jobId), STRONG);
  if (!job) return { status: 'failed', message: 'Clare lost track of these minutes. Try again.' };
  if (job.status === 'done') {
    await store.delete(jobKey(jobId));
    return { status: 'done', review: job.review };
  }
  if (job.status === 'failed') {
    await store.delete(jobKey(jobId));
    return { status: 'failed', message: job.message };
  }
  if (now() - job.started_at > MINUTES_JOB_STALE_MS) {
    await store.delete(jobKey(jobId));
    return { status: 'failed', message: 'Clare stopped partway through. Try again.' };
  }
  return { status: 'reading' };
}
