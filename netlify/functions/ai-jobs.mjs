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

export const config = { path: '/api/ai/jobs' };

const AGENTS = new Set(['clementine', 'ann', 'hammond', 'clare']);

function inboxFrom(jobs) {
  return { jobs };
}

export function unresolvedJobForLesson(inbox, lessonId) {
  return (inbox.jobs ?? []).find(job => job.lesson_id === lessonId && job.status === 'working');
}

export async function writeJobInbox(store, job) {
  const inbox = (await getJSON(store, aiJobsInboxKey())) ?? { jobs: [] };
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
    const inbox = (await getJSON(store, aiJobsInboxKey())) ?? { jobs: [] };
    const existing = unresolvedJobForLesson(inbox, lesson_id);
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
    return withCors(okResponse(202, { id, status: 'working' }), request, env);
  }, deps);
}

export default createAiJobsHandler();
