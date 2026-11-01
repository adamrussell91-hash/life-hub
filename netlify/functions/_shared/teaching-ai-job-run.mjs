import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { runLessonAiJob, runNextStepsFill, runLaddersDraft, applyFilledBoxes, NEXT_STEP_JOB_KINDS, ANSWER_MARK_JOB_KIND, runAnswerMarking, markingSummary, usdToAud } from './teaching-ai-runtime.mjs';
import { QuizError, applyAiMarks, gatherAiMarking } from './quiz.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { readStoredSkills } from './skills-continuum.mjs';
import { aiJobKey, draftLessonKey, getJSON, setJSON } from './teaching-blobs.mjs';
import { TOOLS as ALCHEMY_TOOLS } from './alchemy-agent.mjs';
import { refreshNoteIndex, searchNotes, noteFilters, readNoteText, readAttachmentText } from './alchemy-notes-index.mjs';
import { writeJobInbox } from '../ai-jobs.mjs';
import { LESSON_TOOLS, LESSON_TOOL_NAMES, createLessonToolRunner } from './teaching-lesson-tools.mjs';

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

/** What the agent can read: Adam's lessons first, then his notes. */
export const TEACHING_TOOLS = [...LESSON_TOOLS, ...NOTE_TOOLS];

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
 * Adapts a runner request to one streamed Messages API call and returns the
 * final message. Streaming lets one reply hold a full 30-question proposal
 * without a long idle HTTP request. Thinking stays at its adaptive default;
 * effort sets the depth. The standard lane opts into the server-side refusal
 * fallback (Haiku has none). Client tools stream their input eagerly; the
 * runner checks every proposal against the schema, and a cut-off reply
 * (max_tokens) is never run.
 */
export function createAnthropicComplete({ apiKey, client, signal } = {}) {
  const anthropic = client ?? new Anthropic({ apiKey, maxRetries: 2 });
  return async function complete(request) {
    const standard = request.tier === 'standard';
    const params = {
      model: request.model,
      max_tokens: request.max_tokens,
      system: request.system,
      // Structured jobs (next steps) send no tools.
      ...(request.tools.length ? { tools: request.tools.map(tool => (tool.type ? tool : { ...tool, eager_input_streaming: true })) } : {}),
      messages: request.messages,
      output_config: { effort: request.effort },
      // Caches the conversation tail too; the system breakpoints cover the prefix.
      cache_control: { type: 'ephemeral' }
    };
    const stream = standard
      ? anthropic.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
      : anthropic.messages.stream(params, { signal });
    try {
      return await stream.finalMessage();
    } catch (error) {
      if (signal?.aborted) throw new Error('The agent ran out of time. Try a smaller request.');
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

/** Runs the lesson and notes tools for the runner, refreshing the notes index on first use only. */
export function createNoteToolRunner({ store, env, fetchImpl = fetch, signal, lesson, deps = {} }) {
  const runLessonTool = lesson ? createLessonToolRunner({ store, lesson }) : null;
  let docs = null;
  const index = async () => {
    docs ??= await (deps.noteIndex ?? refreshNoteIndex)({ store, env, fetchImpl, signal });
    return docs;
  };
  return async function runTool(name, input = {}) {
    if (runLessonTool && LESSON_TOOL_NAMES.has(name)) return runLessonTool(name, input);
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
  const current = await getJSON(store, aiJobKey(jobId), { consistency: 'strong' });
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
      complete: complete ?? createAnthropicComplete({ apiKey, signal: controller.signal }),
      tools: TEACHING_TOOLS,
      runTool: createNoteToolRunner({ store, env, fetchImpl, signal: controller.signal, lesson, deps: { noteIndex } }),
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

export const NEXT_STEP_KINDS = new Set(NEXT_STEP_JOB_KINDS);
/** Structured next-step jobs are one or two short calls. */
export const NEXT_STEP_JOB_DEADLINE_MS = 4 * 60 * 1000;

/**
 * Runs a queued next-step job (next-step-jobs.ts). `next_steps_fill` writes the
 * banks into the draft lesson, re-read after the model call so the teacher's
 * edits in between are kept; `ladders_draft` writes nothing and leaves its
 * drafts on the job for the codes editor. Both log their cost.
 */
export async function runStoredNextStepJob({
  store,
  jobId,
  env = process.env,
  complete,
  deadlineMs = NEXT_STEP_JOB_DEADLINE_MS,
  nowIso = () => new Date().toISOString()
}) {
  const job = await getJSON(store, aiJobKey(jobId));
  if (!job || job.status !== 'working' || !NEXT_STEP_KINDS.has(job.kind)) return job;
  const finish = patch => patchWorkingJob(store, jobId, { ...patch, phase: undefined }, nowIso);
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!complete && !apiKey) return finish({ status: 'error', error: 'Teaching AI is not configured: ANTHROPIC_API_KEY is missing on the server.' });

  const [codes, continuum] = await Promise.all([readFeedbackCodes(store), readStoredSkills(store).catch(() => null)]);
  const lesson = job.kind === 'next_steps_fill' ? await getJSON(store, draftLessonKey(job.lesson_id)) : null;
  if (job.kind === 'next_steps_fill' && !lesson) return finish({ status: 'error', error: 'Lesson not found.' });

  await patchWorkingJob(store, jobId, { phase: 'writing' }, nowIso);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const common = {
    complete: complete ?? createAnthropicComplete({ apiKey, signal: controller.signal }),
    models: teachingModels(env),
    signal: controller.signal
  };
  let result;
  try {
    result = job.kind === 'next_steps_fill'
      ? await runNextStepsFill({ ...common, lesson, targets: job.targets ?? [], codes, continuum })
      : await runLaddersDraft({ ...common, codes, continuum });
  } catch (error) {
    result = { status: 'error', error: error instanceof Error ? error.message : 'The AI job failed.', usage: [], cost_usd: 0 };
  } finally {
    clearTimeout(timer);
  }

  let patch;
  if (result.status !== 'done') {
    patch = { status: 'error', error: result.error, usage: result.usage, cost_usd: result.cost_usd };
  } else if (job.kind === 'next_steps_fill') {
    // The draft as it is now, so a teacher's edits while the model worked are kept.
    const fresh = await getJSON(store, draftLessonKey(job.lesson_id), { consistency: 'strong' });
    const { lesson: next, applied, skipped } = applyFilledBoxes(fresh ?? lesson, result.boxes);
    if (applied) await setJSON(store, draftLessonKey(job.lesson_id), { ...next, updated_at: nowIso() });
    patch = {
      status: 'done',
      response: applied ? `Next steps made for ${applied} box${applied === 1 ? '' : 'es'}.` : 'Nothing was saved: the boxes changed while the steps were being written.',
      filled: result.boxes.map(b => ({ block_id: b.block_id, index: b.index, codes: Object.keys(b.next_steps) })),
      applied,
      skipped,
      flagged: result.flagged,
      usage: result.usage,
      cost_usd: result.cost_usd
    };
  } else {
    patch = { status: 'done', response: `Ladders drafted for ${result.codes.length} code${result.codes.length === 1 ? '' : 's'}.`, ladders: result.codes, usage: result.usage, cost_usd: result.cost_usd };
  }

  await appendUsageLog(store, {
    job_id: jobId,
    lesson_id: job.lesson_id ?? null,
    agent: null,
    action: job.kind,
    protocol_id: null,
    status: patch.status,
    turns: result.usage?.length ?? 0,
    failed_checks: (result.flagged ?? []).length,
    cost_usd: result.cost_usd,
    usage: result.usage,
    at: nowIso()
  });
  return finish(patch);
}

export { ANSWER_MARK_JOB_KIND };
/** A class's written answers go in calls of 12 on the standard lane; inside the panel's 10-minute wait. */
export const ANSWER_MARK_JOB_DEADLINE_MS = 8 * 60 * 1000;

/**
 * Runs a queued AI marking job (answer-marking-jobs.ts). The waiting answers
 * are gathered again here, so a teacher mark made since the press is
 * skipped. Only answer text and opaque ids reach the model; the marks are
 * written to each attempt's ai-marks record and the cost is logged.
 */
export async function runStoredAnswerMarkingJob({
  store,
  jobId,
  env = process.env,
  complete,
  deadlineMs = ANSWER_MARK_JOB_DEADLINE_MS,
  nowIso = () => new Date().toISOString()
}) {
  const job = await getJSON(store, aiJobKey(jobId));
  if (!job || job.status !== 'working' || job.kind !== ANSWER_MARK_JOB_KIND || !job.lesson_id) return job;
  const finish = patch => patchWorkingJob(store, jobId, { ...patch, phase: undefined }, nowIso);
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!complete && !apiKey) return finish({ status: 'error', error: 'Teaching AI is not configured: ANTHROPIC_API_KEY is missing on the server.' });

  let gathered;
  try {
    gathered = await gatherAiMarking(store, job.lesson_id);
  } catch (error) {
    if (error instanceof QuizError) return finish({ status: 'error', error: 'Publish this quiz first.' });
    throw error;
  }
  if (!gathered.answers.length) return finish({ status: 'done', response: 'Nothing was waiting for the AI.', marked: 0, unsure: 0, waiting: 0, usage: [], cost_usd: 0 });

  await patchWorkingJob(store, jobId, { phase: 'writing' }, nowIso);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  let result;
  try {
    result = await runAnswerMarking({
      complete: complete ?? createAnthropicComplete({ apiKey, signal: controller.signal }),
      questions: gathered.questions,
      answers: gathered.answers,
      models: teachingModels(env),
      signal: controller.signal
    });
  } catch (error) {
    result = { status: 'error', error: error instanceof Error ? error.message : 'The AI job failed.', marks: [], waiting: 0, usage: [], cost_usd: 0 };
  } finally {
    clearTimeout(timer);
  }

  let patch;
  if (result.status !== 'done') {
    patch = { status: 'error', error: result.error, usage: result.usage, cost_usd: result.cost_usd };
  } else {
    const { written } = await applyAiMarks(store, job.lesson_id, gathered.refs, result.marks, { job: jobId, at: nowIso() });
    const marked = result.marks.filter(m => m.marks !== null).length;
    patch = {
      status: 'done',
      response: markingSummary(result.marks, result.waiting),
      marked,
      unsure: result.marks.length - marked,
      waiting: result.waiting,
      written,
      usage: result.usage,
      cost_usd: result.cost_usd,
      cost_aud: usdToAud(result.cost_usd)
    };
  }

  await appendUsageLog(store, {
    job_id: jobId,
    lesson_id: job.lesson_id,
    agent: null,
    action: ANSWER_MARK_JOB_KIND,
    protocol_id: null,
    status: patch.status,
    turns: result.usage?.length ?? 0,
    failed_checks: result.waiting ?? 0,
    cost_usd: result.cost_usd,
    usage: result.usage,
    at: nowIso()
  });
  return finish(patch);
}
