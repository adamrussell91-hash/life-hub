import { writeJobInbox } from '../ai-jobs.mjs';
import {
  getKnowledgeContent,
  knowledgeDataToken,
  listKnowledgePages,
  putKnowledgeContent
} from './knowledge-data.mjs';
import { loadKnowledgePrompt } from './knowledge-prompts.mjs';
import { tidyPageDirect } from './knowledge-tidy.mjs';
import {
  aiJobKey,
  aiJobsInboxKey,
  defaultGetContentStore,
  getJSON,
  setJSON
} from './teaching-blobs.mjs';

export const STALE_WORKING_JOB_MS = 10 * 60 * 1000;
export const MIDNIGHT_TIDY_LIMIT = 20;
export const TIDY_STATE_FILE = '_tidy/state.json';

export function isScheduledTickRequest(request) {
  const event = (
    request.headers.get('x-nf-event') ||
    request.headers.get('x-netlify-event') ||
    ''
  ).toLowerCase();
  return event === 'schedule';
}

export function jobIsStale(job, nowMs, maxAgeMs = STALE_WORKING_JOB_MS) {
  if (job?.status !== 'working') return false;
  const created = Date.parse(job.created_at || job.updated_at || '');
  return Number.isFinite(created) && nowMs - created >= maxAgeMs;
}

function parseTidyState(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { tidied: {} };
    const tidied = parsed.tidied && typeof parsed.tidied === 'object' && !Array.isArray(parsed.tidied)
      ? parsed.tidied
      : {};
    return {
      ...(typeof parsed.lastRunAt === 'string' ? { lastRunAt: parsed.lastRunAt } : {}),
      tidied
    };
  } catch {
    return { tidied: {} };
  }
}

export function selectMidnightTidyIds(pages, state, limit = MIDNIGHT_TIDY_LIMIT) {
  const tidied = state?.tidied && typeof state.tidied === 'object' ? state.tidied : {};
  return (pages ?? [])
    .map(page => page?.id)
    .filter(id => typeof id === 'string' && id && !tidied[id])
    .slice(0, Math.max(0, limit));
}

export async function expireStaleWorkingJobs({ store, nowIso, nowMs }) {
  const inbox = (await getJSON(store, aiJobsInboxKey())) ?? { jobs: [] };
  const expired = [];
  for (const row of inbox.jobs ?? []) {
    const job = row?.id ? (await getJSON(store, aiJobKey(row.id))) ?? row : row;
    if (!jobIsStale(job, nowMs)) continue;
    const next = {
      ...job,
      status: 'error',
      error: 'Timed out waiting for a runner',
      updated_at: nowIso()
    };
    await setJSON(store, aiJobKey(job.id), next);
    await writeJobInbox(store, next);
    expired.push(job.id);
  }
  return expired;
}

export async function runMidnightTidy({
  env,
  fetchImpl,
  nowIso,
  limit = MIDNIGHT_TIDY_LIMIT,
  listPages = listKnowledgePages,
  tidyPage,
  prompt,
  apiKey,
  readTidyState,
  writeTidyState
} = {}) {
  const key = apiKey || env?.ANTHROPIC_API_KEY;
  if (!knowledgeDataToken(env) || !key) {
    return { skipped: 'unbound', ids: [], errors: [] };
  }
  const pages = await listPages({ env, fetchImpl });
  const stateFile = readTidyState
    ? await readTidyState()
    : await getKnowledgeContent(TIDY_STATE_FILE, { env, fetchImpl }).catch(() => null);
  const state = parseTidyState(stateFile?.text);
  const ids = selectMidnightTidyIds(pages, state, limit);
  const tidied = [];
  const errors = [];
  const runTidy = tidyPage ?? (input => tidyPageDirect({
    ...input,
    prompt: input.prompt ?? prompt ?? loadKnowledgePrompt('tidy.md')
  }));
  for (const id of ids) {
    try {
      await runTidy({
        id,
        env,
        apiKey: key,
        prompt,
        fetchImpl,
        nowIso
      });
      state.tidied[id] = nowIso();
      tidied.push(id);
    } catch (error) {
      errors.push({ id, message: error?.message || 'Tidy failed' });
    }
  }
  state.lastRunAt = nowIso();
  try {
    if (writeTidyState) {
      await writeTidyState(state, stateFile);
    } else {
      await putKnowledgeContent(TIDY_STATE_FILE, JSON.stringify(state), {
        env,
        fetchImpl,
        sha: stateFile?.sha,
        message: 'Midnight tidy state'
      });
    }
  } catch {
    // State write is bookkeeping; a failed stamp must not hide a completed tidy.
  }
  return { ids: tidied, errors };
}

export async function runScheduledJobsTick(deps = {}) {
  const env = deps.env ?? {};
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const nowMs = deps.nowMs ?? Date.parse(nowIso());
  const result = { expired: [], tidy: { ids: [], errors: [] } };
  try {
    const store = deps.store ?? await (deps.getContentStore ?? defaultGetContentStore)(env);
    if (store) {
      result.expired = await expireStaleWorkingJobs({ store, nowIso, nowMs });
    }
  } catch {
    // Teaching store unbound — midnight tidy can still run.
  }
  result.tidy = await runMidnightTidy({
    env,
    fetchImpl: deps.fetchImpl,
    nowIso,
    limit: deps.tidyLimit,
    listPages: deps.listPages,
    tidyPage: deps.tidyPage,
    prompt: deps.prompt,
    apiKey: deps.apiKey,
    readTidyState: deps.readTidyState,
    writeTidyState: deps.writeTidyState
  });
  return result;
}
