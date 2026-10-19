/** Jobs for Alchemy Lab's unit-notes scan, run by `/api/alchemy-blocks/run` and polled via `GET /api/alchemy-blocks?job=`. */

const jobKey = id => 'alchemy/v1/jobs/' + id;

export function createAlchemyJob(store, job) {
  const id = globalThis.crypto.randomUUID();
  return store.setJSON(jobKey(id), { ...job, id, status: 'working', created_at: new Date().toISOString() }).then(() => id);
}
export async function readAlchemyJob(store, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return store.get(jobKey(id), { type: 'json', consistency: 'strong' });
}
export function finishAlchemyJob(store, job, outcome) {
  return store.setJSON(jobKey(job.id), { ...job, ...outcome, updated_at: new Date().toISOString() });
}
/** The error a client can show: status, code and Ann's message, never a stack. */
export function alchemyJobError(error) {
  const status=error?.status===429?429:error?.status>=400&&error?.status<600?error.status:502;
  return { status, code: error?.code||'alchemy_upstream', message: error?.message||'Alchemy Lab could not complete this check.', retryAfterMs: error?.retryAfterMs||0 };
}

/** Starts the background runner with the caller's session; a 202 means it started. */
export async function invokeAlchemyRun(request, jobId, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/alchemy-blocks/run', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ id: jobId }),
    signal: AbortSignal.timeout(5_000)
  });
  return response.status === 202 || response.ok;
}
