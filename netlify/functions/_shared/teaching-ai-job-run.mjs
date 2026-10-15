import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { runLessonAiJob } from './teaching-ai-runtime.mjs';
import { aiJobKey, draftLessonKey, getJSON, setJSON } from './teaching-blobs.mjs';
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
 * Adapts a runner request to the Messages API. Streams (long block builds can
 * exceed the non-streaming limits) and returns the final message. Tool inputs
 * are validated by the runner, so eager input streaming is safe here.
 */
export function createAnthropicComplete({ apiKey, client } = {}) {
  const anthropic = client ?? new Anthropic({ apiKey });
  return async function complete(request) {
    const params = {
      model: request.model,
      max_tokens: request.max_tokens,
      system: request.system,
      messages: request.messages,
      tools: request.tools.map(tool => ({ ...tool, eager_input_streaming: true })),
      thinking: { type: 'adaptive' },
      output_config: { effort: request.effort },
      // Caches the conversation tail too; the two system breakpoints cover the prefix.
      cache_control: { type: 'ephemeral' }
    };
    const stream = request.tier === 'standard'
      ? anthropic.beta.messages.stream({
          ...params,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default'
        })
      : anthropic.messages.stream(params);
    try {
      return await stream.finalMessage();
    } catch (error) {
      throw new Error(friendlyApiError(error));
    }
  };
}

export function friendlyApiError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on Netlify.';
  if (error instanceof Anthropic.RateLimitError) return 'Claude is rate limited right now. Try again in a minute.';
  if (error instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Try again.';
  if (error instanceof Anthropic.APIError) return `Claude API error ${error.status ?? ''}`.trim() + '. Try again.';
  return error instanceof Error ? error.message : 'The model request failed.';
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

async function finish(store, jobId, patch, nowIso) {
  // The teacher may have dismissed the job while the model was working.
  const current = await getJSON(store, aiJobKey(jobId));
  if (!current || current.status !== 'working') return current;
  const next = { ...current, ...patch, phase: undefined, updated_at: nowIso() };
  await setJSON(store, aiJobKey(jobId), next);
  await writeJobInbox(store, next);
  return next;
}

export async function runStoredLessonJob({
  store,
  jobId,
  env = process.env,
  complete,
  readFileSyncImpl,
  nowIso = () => new Date().toISOString()
}) {
  const job = await getJSON(store, aiJobKey(jobId));
  if (!job || job.status !== 'working' || job.kind || !job.lesson_id) return job;

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!complete && !apiKey) {
    return finish(store, jobId, {
      status: 'error',
      error: 'Teaching AI is not configured: ANTHROPIC_API_KEY is missing on the server.'
    }, nowIso);
  }

  const lesson = await getJSON(store, draftLessonKey(job.lesson_id));
  if (!lesson) {
    return finish(store, jobId, { status: 'error', error: 'Lesson not found.' }, nowIso);
  }

  const writing = { ...job, phase: 'writing', updated_at: nowIso() };
  await setJSON(store, aiJobKey(jobId), writing);
  await writeJobInbox(store, writing);

  let result;
  try {
    result = await runLessonAiJob({
      job,
      lesson,
      agentName: TEACHING_AGENT_NAMES[job.agent] ?? TEACHING_AGENT_NAMES.ann,
      protocol: loadTeachingProtocol(job.agent, readFileSyncImpl ? { readFileSyncImpl } : {}),
      complete: complete ?? createAnthropicComplete({ apiKey }),
      models: teachingModels(env)
    });
  } catch (error) {
    result = {
      status: 'error',
      error: error instanceof Error ? error.message : 'The AI job failed.',
      usage: [],
      cost_usd: 0
    };
  }

  const patch = result.status === 'done'
    ? {
        status: 'done',
        response: result.response ?? '',
        ...(result.proposal ? { proposal: result.proposal } : {}),
        model: result.model,
        usage: result.usage,
        cost_usd: result.cost_usd
      }
    : { status: 'error', error: result.error, usage: result.usage, cost_usd: result.cost_usd };

  await appendUsageLog(store, {
    job_id: jobId,
    lesson_id: job.lesson_id,
    agent: job.agent,
    action: job.action ?? null,
    protocol_id: job.protocol_id ?? null,
    status: patch.status,
    cost_usd: result.cost_usd,
    attempts: result.usage,
    at: nowIso()
  });

  return finish(store, jobId, patch, nowIso);
}
