import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLessonAiJob } from './teaching-ai-runtime.mjs';
import { aiJobKey, draftLessonKey, getJSON, setJSON } from './teaching-blobs.mjs';
import { TOOLS as ALCHEMY_TOOLS } from './alchemy-agent.mjs';
import { refreshNoteIndex, searchNotes, noteFilters, readNoteText, readAttachmentText } from './alchemy-notes-index.mjs';
import { writeJobInbox } from '../ai-jobs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export const TEACHING_AGENT_NAMES = {
  ann: "Ann O'Tation",
  clementine: 'Professor Clementine Haig',
  hammond: 'General Hammond',
  clare: 'Clare DèMind'
};

export const AI_USAGE_LOG_KEY = 'meta/ai_usage_log';
const USAGE_LOG_LIMIT = 500;
/** Inside the panel's 10-minute wait and the stale-job sweep, so a slow job ends as an error, not a timeout. */
export const LESSON_JOB_DEADLINE_MS = 9 * 60 * 1000;

/** Adam's Knowledge Hub notes, read the way Alchemy Lab's Ann reads them. */
export const NOTE_TOOLS = ALCHEMY_TOOLS.filter(tool => ['search_notes', 'list_filters', 'read_note'].includes(tool.name));

export function loadTeachingProtocol(slug, { readFileSyncImpl = readFileSync } = {}) {
  if (!Object.hasOwn(TEACHING_AGENT_NAMES, slug)) return '';
  try {
    return String(readFileSyncImpl(join(ROOT, `apps/teaching/config/${slug}-protocol.md`), 'utf8')).trim();
  } catch {
    return '';
  }
}

/** Lane models can be overridden per deploy without a code change. */
export function teachingModels(env = {}) {
  return {
    ...(env.TEACHING_AI_FAST_MODEL ? { fast: env.TEACHING_AI_FAST_MODEL } : {}),
    ...(env.TEACHING_AI_MODEL ? { standard: env.TEACHING_AI_MODEL } : {})
  };
}

/**
 * Adapts a runner request to one Messages API call. Thinking stays at its
 * adaptive default; effort sets the depth. The standard lane opts into the
 * server-side refusal fallback (Haiku has none).
 */
export function createAnthropicComplete({ apiKey, fetchImpl = fetch, signal } = {}) {
  return async function complete(request) {
    const standard = request.tier === 'standard';
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...(standard ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {})
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.max_tokens,
        system: request.system,
        tools: request.tools,
        messages: request.messages,
        output_config: { effort: request.effort },
        // Caches the conversation tail too; the two system breakpoints cover the prefix.
        cache_control: { type: 'ephemeral' },
        ...(standard ? { fallbacks: 'default' } : {})
      })
    }).catch(error => {
      if (signal?.aborted) throw new Error('The agent ran out of time. Try a smaller request.');
      throw new Error('Could not reach Claude. Try again.', { cause: error });
    });
    if (!response.ok) throw new Error(await friendlyApiError(response));
    return response.json();
  };
}

export async function friendlyApiError(response) {
  let detail = '';
  try {
    const body = await response.json();
    detail = typeof body?.error?.message === 'string' ? body.error.message : '';
  } catch {
    /* no body */
  }
  if (response.status === 401) return 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on Netlify.';
  if (response.status === 429) return 'Claude is rate limited right now. Try again in a minute.';
  if (response.status === 400) return `Claude rejected the request${detail ? `: ${detail}` : '.'}`;
  return `Claude API error ${response.status}. Try again.`;
}

/** Runs the notes tools for the runner, refreshing the notes index on first use only. */
export function createNoteToolRunner({ store, env, fetchImpl = fetch, signal, deps = {} }) {
  let docs = null;
  const index = async () => {
    docs ??= await (deps.noteIndex ?? refreshNoteIndex)({ store, env, fetchImpl, signal });
    return docs;
  };
  return async function runTool(name, input = {}) {
    switch (name) {
      case 'search_notes': {
        const hits = searchNotes(await index(), input);
        return hits.length ? hits : 'No notes matched. Try other words or fewer filters.';
      }
      case 'list_filters':
        return noteFilters(await index());
      case 'read_note': {
        const note = input.attachment
          ? await readAttachmentText(String(input.id ?? ''), String(input.attachment), { store, env, fetchImpl, offset: input.offset })
          : await readNoteText(String(input.id ?? ''), { env, fetchImpl, offset: input.offset });
        if (!note) return { error: 'That note is not in the Knowledge Hub (deleted or wrong id).' };
        if (note.error) return note;
        const { full, ...visible } = note;
        return visible;
      }
      default:
        return { error: 'Unknown tool.' };
    }
  };
}

async function appendUsageLog(store, entry) {
  try {
    const log = (await getJSON(store, AI_USAGE_LOG_KEY)) ?? { entries: [] };
    const entries = [...(Array.isArray(log.entries) ? log.entries : []), entry].slice(-USAGE_LOG_LIMIT);
    await setJSON(store, AI_USAGE_LOG_KEY, { entries });
  } catch {
    /* cost logging must never fail a job */
  }
}

/** Writes onto the job unless the teacher dismissed it while the model was working. */
async function patchWorkingJob(store, jobId, patch, nowIso) {
  const current = await getJSON(store, aiJobKey(jobId));
  if (!current || current.status !== 'working') return current;
  const next = { ...current, ...patch, updated_at: nowIso() };
  await setJSON(store, aiJobKey(jobId), next);
  await writeJobInbox(store, next);
  return next;
}

export async function runStoredLessonJob({
  store,
  jobId,
  env = process.env,
  complete,
  fetchImpl = fetch,
  readFileSyncImpl,
  noteIndex,
  deadlineMs = LESSON_JOB_DEADLINE_MS,
  nowIso = () => new Date().toISOString()
}) {
  const job = await getJSON(store, aiJobKey(jobId));
  if (!job || job.status !== 'working' || job.kind || !job.lesson_id) return job;
  const finish = patch => patchWorkingJob(store, jobId, { ...patch, phase: undefined }, nowIso);

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!complete && !apiKey) {
    return finish({ status: 'error', error: 'Teaching AI is not configured: ANTHROPIC_API_KEY is missing on the server.' });
  }

  const lesson = await getJSON(store, draftLessonKey(job.lesson_id));
  if (!lesson) return finish({ status: 'error', error: 'Lesson not found.' });

  await patchWorkingJob(store, jobId, { phase: 'writing' }, nowIso);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  // Phase writes go one at a time, and only when the phase changes.
  let phase = 'writing';
  let phaseWrite = Promise.resolve();
  const onPhase = next => {
    if (next === phase) return;
    phase = next;
    phaseWrite = phaseWrite.then(() => patchWorkingJob(store, jobId, { phase: next }, nowIso)).catch(() => {});
  };

  let result;
  try {
    result = await runLessonAiJob({
      job,
      lesson,
      agentName: TEACHING_AGENT_NAMES[job.agent] ?? TEACHING_AGENT_NAMES.ann,
      protocol: loadTeachingProtocol(job.agent, readFileSyncImpl ? { readFileSyncImpl } : {}),
      complete: complete ?? createAnthropicComplete({ apiKey, fetchImpl, signal: controller.signal }),
      tools: NOTE_TOOLS,
      runTool: createNoteToolRunner({ store, env, fetchImpl, signal: controller.signal, deps: { noteIndex } }),
      webSearch: true,
      models: teachingModels(env),
      onPhase,
      signal: controller.signal
    });
  } catch (error) {
    result = {
      status: 'error',
      error: error instanceof Error ? error.message : 'The AI job failed.',
      turns: 0,
      usage: [],
      cost_usd: 0,
      checks: []
    };
  } finally {
    clearTimeout(timer);
  }
  await phaseWrite;

  const patch = result.status === 'done'
    ? {
        status: 'done',
        response: result.response ?? '',
        ...(result.proposal ? { proposal: result.proposal } : {}),
        model: result.model,
        usage: result.usage,
        cost_usd: result.cost_usd,
        checks: result.checks ?? []
      }
    : { status: 'error', error: result.error, usage: result.usage, cost_usd: result.cost_usd, checks: result.checks ?? [] };

  await appendUsageLog(store, {
    job_id: jobId,
    lesson_id: job.lesson_id,
    agent: job.agent,
    action: job.action ?? null,
    protocol_id: job.protocol_id ?? null,
    status: patch.status,
    turns: result.turns,
    failed_checks: (result.checks ?? []).length,
    cost_usd: result.cost_usd,
    usage: result.usage,
    at: nowIso()
  });

  return finish(patch);
}
