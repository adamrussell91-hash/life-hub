import { writeJobInbox } from '../ai-jobs.mjs';
import {
  getKnowledgeContent,
  knowledgeDataToken,
  listKnowledgePages,
  putKnowledgeContent
} from './knowledge-data.mjs';
import { knowledgeKernelFetch, knowledgeKernelSecret } from './knowledge-kernel.mjs';
import { loadKnowledgePrompt } from './knowledge-prompts.mjs';
import { processVoiceTranscriptions, sweepVoiceAudio } from './voice-submissions.mjs';
import { tidyPageDirect } from './knowledge-tidy.mjs';
import {
  aiJobKey,
  aiJobsInboxKey,
  defaultGetContentStore,
  getJSON,
  mediaFileKey,
  setJSON
} from './teaching-blobs.mjs';

export const STALE_WORKING_JOB_MS = 10 * 60 * 1000;
export const MIDNIGHT_TIDY_LIMIT = 20;
export const TIDY_STATE_FILE = '_tidy/state.json';
export const ANNOTATION_VOICE_TRANSCRIBE_KIND = 'annotation_voice_transcribe';
export const MAX_VOICE_TRANSCRIBE_ATTEMPTS = 2;

function arrayBufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

export async function processAnnotationVoiceTranscribeJobs({
  store,
  env,
  fetchImpl = fetch,
  nowIso,
  knowledgeFetch = knowledgeKernelFetch,
  limit = 3,
  /** Process just this job (the on-upload run) instead of scanning the inbox. */
  jobId,
  timeoutMs = 26_000
} = {}) {
  if (!store || !knowledgeKernelSecret(env)) return { processed: [], errors: [] };
  let queued;
  if (jobId) {
    queued = [{ id: jobId, kind: ANNOTATION_VOICE_TRANSCRIBE_KIND, status: 'working' }];
  } else {
    const inbox = (await getJSON(store, aiJobsInboxKey())) ?? { jobs: [] };
    queued = (inbox.jobs ?? [])
      .filter(row => row?.kind === ANNOTATION_VOICE_TRANSCRIBE_KIND && row?.status === 'working')
      .slice(0, Math.max(0, limit));
  }
  const processed = [];
  const errors = [];

  for (const row of queued) {
    const job = row?.id ? (await getJSON(store, aiJobKey(row.id))) ?? row : row;
    if (!job?.id || job.kind !== ANNOTATION_VOICE_TRANSCRIBE_KIND || job.status !== 'working') continue;
    if (job.phase && job.phase !== 'queued' && job.phase !== 'transcribing') continue;
    const attempts = Number(job.attempts) || 0;
    if (attempts >= MAX_VOICE_TRANSCRIBE_ATTEMPTS) {
      const next = {
        ...job,
        status: 'error',
        phase: 'failed',
        error: 'Transcription failed after retries',
        updated_at: nowIso()
      };
      await setJSON(store, aiJobKey(job.id), next);
      await writeJobInbox(store, next);
      errors.push({ id: job.id, message: next.error });
      continue;
    }

    const mediaId = typeof job.media_id === 'string' ? job.media_id : '';
    if (!mediaId) {
      const next = {
        ...job,
        status: 'error',
        phase: 'failed',
        error: 'media_id is required',
        updated_at: nowIso()
      };
      await setJSON(store, aiJobKey(job.id), next);
      await writeJobInbox(store, next);
      errors.push({ id: job.id, message: next.error });
      continue;
    }

    const working = {
      ...job,
      phase: 'transcribing',
      attempts: attempts + 1,
      updated_at: nowIso()
    };
    await setJSON(store, aiJobKey(job.id), working);
    await writeJobInbox(store, working);

    try {
      const file = await store.getWithMetadata?.(mediaFileKey(mediaId), { type: 'arrayBuffer' });
      const bytes = file?.data;
      if (!bytes) throw new Error('Audio file not found');
      const audio = arrayBufferToBase64(bytes);
      const response = await knowledgeFetch('/transcribe', {
        env,
        fetchImpl,
        method: 'POST',
        body: { audio },
        timeoutMs
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : `Transcribe failed (${response.status})`
        );
      }
      const done = {
        ...working,
        status: 'done',
        phase: 'ready',
        result: { whisper: payload },
        updated_at: nowIso()
      };
      await setJSON(store, aiJobKey(job.id), done);
      await writeJobInbox(store, done);
      processed.push(job.id);
    } catch (error) {
      const message = error?.message || 'Transcription failed';
      const failedAttempts = Number(working.attempts) || 1;
      const next =
        failedAttempts >= MAX_VOICE_TRANSCRIBE_ATTEMPTS
          ? {
              ...working,
              status: 'error',
              phase: 'failed',
              error: message,
              updated_at: nowIso()
            }
          : {
              ...working,
              phase: 'queued',
              error: message,
              updated_at: nowIso()
            };
      await setJSON(store, aiJobKey(job.id), next);
      await writeJobInbox(store, next);
      errors.push({ id: job.id, message });
    }
  }

  return { processed, errors };
}

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
  const result = {
    expired: [],
    voice_transcribe: { processed: [], errors: [] },
    voice_submissions: { transcribed: [], audio_deleted: [] },
    tidy: { ids: [], errors: [] }
  };
  try {
    const store = deps.store ?? await (deps.getContentStore ?? defaultGetContentStore)(env);
    if (store) {
      result.expired = await expireStaleWorkingJobs({ store, nowIso, nowMs });
      result.voice_transcribe = await processAnnotationVoiceTranscribeJobs({
        store,
        env,
        fetchImpl: deps.fetchImpl,
        nowIso,
        knowledgeFetch: deps.knowledgeFetch,
        limit: deps.voiceTranscribeLimit
      });
    }
  } catch {
    // Teaching store unbound — midnight tidy can still run.
  }
  // Voice block: transcribe anything the inbox hasn't, then drop audio older than 28 days.
  try {
    const store = deps.store ?? await (deps.getContentStore ?? defaultGetContentStore)(env);
    if (store) {
      const voice = await processVoiceTranscriptions({ store, env, fetchImpl: deps.fetchImpl, knowledgeFetch: deps.knowledgeFetch, limit: 20 });
      const swept = await sweepVoiceAudio({ store, now: nowMs });
      result.voice_submissions = {
        transcribed: voice.results.filter((r) => r.done).map((r) => r.id),
        audio_deleted: swept.deleted
      };
    }
  } catch {
    // Retention retries tomorrow; nothing is lost by waiting a day.
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
