// Ann's career reads run longer than a page request may wait (the client gives up
// at 20s), so they run as jobs: the page starts one, the background function does
// the work, and the page asks until it is done. No clock on the page's side.

import { randomUUID } from 'node:crypto';
import { getJSON, setJSON } from './professional-blobs.mjs';

const JOB_PREFIX = 'career-ann-jobs/';
const JOB_ID_RE = /^[0-9a-f-]{36}$/;
const STRONG = { consistency: 'strong' };
// Past the background function's own 15 minute cap, the worker can only have died.
export const CAREER_ANN_JOB_STALE_MS = 16 * 60_000;

function jobKey(jobId) {
  return `${JOB_PREFIX}${jobId}`;
}

function checkJobId(jobId) {
  if (!JOB_ID_RE.test(jobId ?? '')) {
    throw Object.assign(new Error('Unknown Ann job.'), { status: 400, code: 'invalid_job' });
  }
}

export async function defaultInvokeCareerAnnRun(request, jobId, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/career-ann-run', request.url), {
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

export async function startCareerAnnJob(store, job, { invoke, now = Date.now }) {
  const jobId = randomUUID();
  await setJSON(store, jobKey(jobId), { status: 'queued', ...job, started_at: now() });
  let kicked = false;
  try {
    kicked = await invoke(jobId);
  } catch {
    kicked = false;
  }
  if (!kicked) {
    await store.delete(jobKey(jobId));
    throw Object.assign(new Error('Ann could not start. Try again.'), { status: 503, code: 'ann_unavailable', retryable: true });
  }
  return { job_id: jobId };
}

/** Runs once for a job. What Ann was given is dropped as soon as she finishes. */
export async function runCareerAnnJob(store, jobId, { run, now = Date.now }) {
  if (!JOB_ID_RE.test(jobId ?? '')) return;
  const job = await getJSON(store, jobKey(jobId), STRONG);
  if (job?.status !== 'queued') return;
  await setJSON(store, jobKey(jobId), { ...job, status: 'running', started_at: now() });
  try {
    const result = await run(job);
    await setJSON(store, jobKey(jobId), { status: 'done', result, started_at: job.started_at });
  } catch (error) {
    await setJSON(store, jobKey(jobId), {
      status: 'failed',
      message: error?.message || 'Ann could not finish. Try again.',
      started_at: job.started_at
    });
  }
}

/** What the page sees. A finished answer stays until the page says it has it. */
export async function careerAnnJobStatus(store, jobId, { now = Date.now } = {}) {
  checkJobId(jobId);
  const job = await getJSON(store, jobKey(jobId), STRONG);
  if (!job) return { status: 'failed', message: 'Ann lost track of this. Try again.' };
  if (job.status === 'done') return { status: 'done', result: job.result };
  if (job.status === 'failed') {
    await store.delete(jobKey(jobId));
    return { status: 'failed', message: job.message };
  }
  if (now() - job.started_at > CAREER_ANN_JOB_STALE_MS) {
    await store.delete(jobKey(jobId));
    return { status: 'failed', message: 'Ann stopped partway through. Try again.' };
  }
  return { status: 'reading' };
}

export async function clearCareerAnnJob(store, jobId) {
  checkJobId(jobId);
  await store.delete(jobKey(jobId));
  return { cleared: true };
}
