import { errorResponse, jsonResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import {
  aiJobKey,
  aiJobsInboxKey,
  draftLessonKey,
  getJSON,
  newId,
  setJSON
} from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import {
  createKnowledgeIntakeJob,
  createKnowledgeIntakeRuntime,
  runKnowledgeIntakeUntilReview,
  unresolvedJobForPage
} from './_shared/knowledge-intake.mjs';
import { kickLessonJobRun } from './_shared/teaching-ai-job-kick.mjs';
import { estimateLaddersDraft, estimateNextStepsFill, MAX_FILL_TARGETS, NEXT_STEP_JOB_KINDS } from './_shared/teaching-ai-runtime.mjs';
import { readFeedbackCodes } from './_shared/feedback-codes.mjs';
import { readStoredSkills } from './_shared/skills-continuum.mjs';

export const config = { path: '/api/ai/jobs' };

const AGENTS = new Set(['clementine', 'ann', 'hammond', 'clare']);

/** Same 10-minute limit as the panel's poll and the nightly expiry tick. */
export const LESSON_JOB_STALE_MS = 10 * 60 * 1000;

export function jobIsStale(job, nowMs) {
  if (job?.status !== 'working') return false;
  const created = Date.parse(job.created_at || '');
  return Number.isFinite(created) && nowMs - created >= LESSON_JOB_STALE_MS;
}

function inboxFrom(jobs) {
  return { jobs };
}

const NEXT_STEP_KINDS = new Set(NEXT_STEP_JOB_KINDS);

/** A lesson's open chat job. Next-step jobs run beside the chat, so they never hold it up. */
export function unresolvedJobForLesson(inbox, lessonId) {
  return (inbox.jobs ?? []).find(job => job.lesson_id === lessonId && job.status === 'working' && !NEXT_STEP_KINDS.has(job.kind));
}

const BLOCK_ID = /^[A-Za-z0-9_:-]{1,120}$/;
const CODE_ID = /^[a-z0-9_-]{1,64}$/;

/** The boxes a fill job is asked for: `[{ block_id, index, code_ids? }]`, at most a lesson's worth. */
export function cleanNextStepTargets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_FILL_TARGETS).flatMap(t => {
    if (!t || typeof t.block_id !== 'string' || !BLOCK_ID.test(t.block_id) || !Number.isInteger(t.index) || t.index < 0 || t.index > 200) return [];
    const codeIds = Array.isArray(t.code_ids) ? t.code_ids.filter(id => typeof id === 'string' && CODE_ID.test(id)).slice(0, 20) : [];
    return [{ block_id: t.block_id, index: t.index, ...(codeIds.length ? { code_ids: codeIds } : {}) }];
  });
}

/**
 * Next steps in writing boxes: Make next steps (`next_steps_fill`, one lesson's
 * boxes) and Draft ladders (`ladders_draft`, the whole code library).
 * `dry_run: true` answers with the cost estimate and starts nothing.
 */
async function nextStepJob(request, env, store, deps, value) {
  const kind = value.kind;
  const lesson_id = typeof value.lesson_id === 'string' ? value.lesson_id : '';
  const targets = cleanNextStepTargets(value.targets);
  const lesson = kind === 'next_steps_fill' && lesson_id ? await getJSON(store, draftLessonKey(lesson_id)) : null;
  if (kind === 'next_steps_fill') {
    if (!lesson_id || !targets.length) return withCors(errorResponse(400, 'validation_error', 'Name a lesson and the boxes to fill.', false), request, env);
    if (!lesson) return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
  }
  const [codes, continuum] = await Promise.all([readFeedbackCodes(store), readStoredSkills(store).catch(() => null)]);
  const models = {
    ...(env.TEACHING_AI_FAST_MODEL ? { fast: env.TEACHING_AI_FAST_MODEL } : {}),
    ...(env.TEACHING_AI_MODEL ? { standard: env.TEACHING_AI_MODEL } : {})
  };
  const estimate = kind === 'next_steps_fill'
    ? estimateNextStepsFill({ lesson, targets, codes, continuum, models })
    : estimateLaddersDraft({ codes, continuum, models });
  if (value.dry_run === true) return withCors(okResponse(200, { estimate }), request, env);
  if (!estimate.codes) {
    const message = kind === 'next_steps_fill' ? 'None of these boxes has a skill linked to a code with a ladder.' : 'Give a code a skill first.';
    return withCors(errorResponse(400, 'validation_error', message, false), request, env);
  }

  const inbox = (await getJSON(store, aiJobsInboxKey(), STRONG)) ?? { jobs: [] };
  const open = (inbox.jobs ?? []).find(job => job.kind === kind && job.status === 'working' && (kind === 'ladders_draft' || job.lesson_id === lesson_id));
  const record = open ? await getJSON(store, aiJobKey(open.id), STRONG) : null;
  if (record?.status === 'working' && !jobIsStale(record, (deps.now ?? Date.now)())) {
    return withCors(jsonResponse(409, {
      ok: false,
      error: { code: 'conflict', message: 'These next steps are already being written', retryable: false, details: { id: record.id, status: record.status } }
    }), request, env);
  }
  const now = new Date().toISOString();
  const id = newId('ai_job');
  const job = {
    id,
    kind,
    ...(kind === 'next_steps_fill' ? { lesson_id, targets } : {}),
    status: 'working',
    message: kind === 'next_steps_fill' ? 'Make next steps' : 'Draft ladders',
    estimate,
    phase: 'queued',
    created_at: now
  };
  await setJSON(store, aiJobKey(id), job);
  await writeJobInbox(store, job);
  const kicked = await (deps.kickLessonJobRun ?? kickLessonJobRun)(request, id);
  if (!kicked) {
    const failed = { ...job, status: 'error', phase: undefined, error: 'Could not start the AI runner. Try again.' };
    await setJSON(store, aiJobKey(id), failed);
    await writeJobInbox(store, failed);
    return withCors(okResponse(202, { id, status: 'error', estimate }), request, env);
  }
  return withCors(okResponse(202, { id, status: 'working', estimate }), request, env);
}

/** Blob reads are eventually consistent by default; the inbox is read-modify-write, so read it strongly. */
const STRONG = { consistency: 'strong' };

export async function writeJobInbox(store, job) {
  const inbox = (await getJSON(store, aiJobsInboxKey(), STRONG)) ?? { jobs: [] };
  const jobs = (inbox.jobs ?? []).filter(entry => entry.id !== job.id);
  jobs.unshift({
    id: job.id,
    lesson_id: job.lesson_id,
    page_id: job.page_id,
    kind: job.kind,
    agent: job.agent,
    status: job.status,
    phase: job.phase,
    created_at: job.created_at
  });
  await setJSON(store, aiJobsInboxKey(), inboxFrom(jobs.slice(0, 50)));
}

export function createAiJobsHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      const inbox = (await getJSON(store, aiJobsInboxKey())) ?? { jobs: [] };
      return withCors(okResponse(200, inbox), request, env);
    }
    if (request.method !== 'POST') {
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    }
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const kind = typeof parsed.value.kind === 'string' ? parsed.value.kind : '';
    if (NEXT_STEP_KINDS.has(kind)) return nextStepJob(request, env, store, deps, parsed.value);
    if (kind === 'knowledge_intake') {
      const page_id = typeof parsed.value.page_id === 'string' ? parsed.value.page_id.trim() : '';
      const agent = typeof parsed.value.agent === 'string' && parsed.value.agent
        ? parsed.value.agent
        : 'clementine';
      if (!page_id || !AGENTS.has(agent)) {
        return withCors(errorResponse(400, 'validation_error', 'Invalid AI job request', false), request, env);
      }
      const inbox = (await getJSON(store, aiJobsInboxKey())) ?? { jobs: [] };
      const existing = unresolvedJobForPage(inbox, page_id);
      if (existing) {
        return withCors(jsonResponse(409, {
          ok: false,
          error: {
            code: 'conflict',
            message: 'An unresolved job already exists for this page',
            retryable: false,
            details: { id: existing.id, status: existing.status, phase: existing.phase }
          }
        }), request, env);
      }
      const now = new Date().toISOString();
      const created = createKnowledgeIntakeJob({
        id: newId('ai_job'),
        page_id,
        agent,
        now
      });
      const runtime = createKnowledgeIntakeRuntime({ ...deps, env });
      const page = await runtime.getPage(page_id);
      if (!page) {
        return withCors(errorResponse(404, 'not_found', 'Page was not found', false), request, env);
      }
      const job = await runKnowledgeIntakeUntilReview(created, runtime);
      await setJSON(store, aiJobKey(job.id), job);
      await writeJobInbox(store, job);
      return withCors(okResponse(202, job), request, env);
    }
    const lesson_id = typeof parsed.value.lesson_id === 'string' ? parsed.value.lesson_id : '';
    const agent = typeof parsed.value.agent === 'string' ? parsed.value.agent : '';
    const message = typeof parsed.value.message === 'string' ? parsed.value.message : '';
    if (!lesson_id || !AGENTS.has(agent)) {
      return withCors(errorResponse(400, 'validation_error', 'Invalid AI job request', false), request, env);
    }
    const lesson = await getJSON(store, draftLessonKey(lesson_id));
    if (!lesson) {
      return withCors(errorResponse(404, 'not_found', 'Lesson not found', false), request, env);
    }
    const inbox = (await getJSON(store, aiJobsInboxKey(), STRONG)) ?? { jobs: [] };
    let existing = unresolvedJobForLesson(inbox, lesson_id);
    if (existing) {
      // The job record is the truth. An inbox row can still say working for a
      // moment after the runner finished, which used to refuse the teacher's
      // next message with a 409.
      const record = await getJSON(store, aiJobKey(existing.id), STRONG);
      if (record && record.status !== 'working') {
        await writeJobInbox(store, record);
        existing = null;
      }
    }
    if (existing && jobIsStale(existing, (deps.now ?? Date.now)())) {
      // A job no runner finished must not lock the lesson's chat until the nightly tick.
      const stale = (await getJSON(store, aiJobKey(existing.id), STRONG)) ?? existing;
      const expired = { ...stale, status: 'error', phase: undefined, error: 'Timed out waiting for a runner', updated_at: new Date().toISOString() };
      await setJSON(store, aiJobKey(existing.id), expired);
      await writeJobInbox(store, expired);
      existing = null;
    }
    if (existing) {
      return withCors(jsonResponse(409, {
        ok: false,
        error: {
          code: 'conflict',
          message: 'An unresolved job already exists for this lesson',
          retryable: false,
          details: { id: existing.id, status: existing.status }
        }
      }), request, env);
    }
    const now = new Date().toISOString();
    const id = newId('ai_job');
    const job = {
      id,
      lesson_id,
      agent,
      status: 'working',
      snapshot_at: typeof parsed.value.lesson_snapshot_at === 'string' ? parsed.value.lesson_snapshot_at : now,
      message,
      scope: parsed.value.scope,
      selected_block_id: parsed.value.selected_block_id,
      protocol_id: parsed.value.protocol_id,
      action: parsed.value.action,
      history: parsed.value.history,
      phase: 'queued',
      created_at: now
    };
    await setJSON(store, aiJobKey(id), job);
    await writeJobInbox(store, job);
    const kicked = await (deps.kickLessonJobRun ?? kickLessonJobRun)(request, id);
    if (!kicked) {
      const failed = { ...job, status: 'error', phase: undefined, error: 'Could not start the AI runner. Try again.' };
      await setJSON(store, aiJobKey(id), failed);
      await writeJobInbox(store, failed);
      return withCors(okResponse(202, { id, status: 'error' }), request, env);
    }
    return withCors(okResponse(202, { id, status: 'working' }), request, env);
  }, deps);
}

export default createAiJobsHandler();
