import { randomUUID } from 'node:crypto';
import { alchemyError } from './alchemy-budget.mjs';

/**
 * Jobs and allowance for Ann's agent runs. A run is one job Blob the
 * background runner fills in (status, progress, result) and the page polls.
 * The allowance counts runs per Sydney day and keeps one run per lesson.
 */
const BUDGET_KEY = 'alchemy/v2/agent-budget';
const jobKey = id => 'alchemy/v2/agent-jobs/' + id;
const latestKey = lessonId => 'alchemy/v2/agent-latest/' + lessonId;
const DAY = 86400000;
export const RUN_LEASE_MS = 12 * 60000;
export const isSafeId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(id);

const sydneyDay = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);

async function change(store, key, fn) {
  for (let i = 0; i < 8; i++) {
    const row = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const { next, value } = fn(structuredClone(row?.data ?? null));
    const result = await store.setJSON(key, next, row ? { onlyIfMatch: row.etag } : { onlyIfNew: true });
    if (result?.modified) return value;
  }
  throw alchemyError(409, 'alchemy_busy', 'Ann is busy. Try again in a moment.');
}

/**
 * Starts a run, or returns the one already working on this lesson.
 * Returns {job, existing}.
 */
export async function startAgentJob(store, { lessonId, blockId = null, request = '' }, { env = {}, now = Date.now } = {}) {
  const time = now();
  const scope = blockId ? 'block' : 'lesson';
  const dailyLimit = scope === 'lesson' ? Number(env.ALCHEMY_AGENT_DAILY_RUNS) || 12 : Number(env.ALCHEMY_AGENT_DAILY_BLOCK_RUNS) || 40;
  const job = { id: randomUUID(), lessonId, blockId, request, scope, status: 'working', progress: [], created_at: new Date(time).toISOString() };
  const outcome = await change(store, BUDGET_KEY, state => {
    const next = { runs: (state?.runs ?? []).filter(r => r.at > time - 2 * DAY), active: Object.fromEntries(Object.entries(state?.active ?? {}).filter(([, a]) => a.until > time)) };
    const activeKey = lessonId + ':' + scope;
    if (next.active[activeKey]) return { next: state ?? next, value: { existing: next.active[activeKey].jobId } };
    const today = next.runs.filter(r => r.scope === scope && sydneyDay(r.at) === sydneyDay(time)).length;
    if (today >= dailyLimit) throw alchemyError(429, 'alchemy_budget', scope === 'lesson' ? `Ann has done ${dailyLimit} lesson reviews today. Try again tomorrow.` : 'Ann has answered a lot of block questions today. Try again tomorrow.', 3600000);
    next.runs.push({ at: time, scope, lessonId });
    next.active[activeKey] = { jobId: job.id, until: time + RUN_LEASE_MS };
    return { next, value: { existing: null } };
  });
  if (outcome.existing) {
    const existing = await readAgentJob(store, outcome.existing);
    if (existing) return { job: existing, existing: true };
  }
  await store.setJSON(jobKey(job.id), job);
  if (scope === 'lesson') await store.setJSON(latestKey(lessonId), { jobId: job.id });
  return { job, existing: false };
}

export async function readAgentJob(store, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return store.get(jobKey(id), { type: 'json', consistency: 'strong' });
}

export async function latestAgentJob(store, lessonId) {
  const pointer = await store.get(latestKey(lessonId), { type: 'json', consistency: 'strong' });
  return pointer?.jobId ? readAgentJob(store, pointer.jobId) : null;
}

/** Merge a change into a job (progress, result, accepted marks). */
export function updateAgentJob(store, id, fn) {
  return change(store, jobKey(id), job => { const next = fn(job); return { next, value: next }; });
}

/** Ends the lesson's lease so the next press starts a new run. */
export async function releaseAgentRun(store, job) {
  await change(store, BUDGET_KEY, state => {
    const next = state ?? { runs: [], active: {} };
    const key = job.lessonId + ':' + job.scope;
    if (next.active?.[key]?.jobId === job.id) delete next.active[key];
    return { next, value: null };
  });
}

/** Starts the background runner with the caller's session; true when it started. */
export async function invokeAgentRun(request, jobId, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/alchemy-agent/run', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ id: jobId }),
    signal: AbortSignal.timeout(5000)
  });
  return response.status === 202 || response.ok;
}
