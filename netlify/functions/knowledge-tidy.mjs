import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { knowledgeDataToken } from './_shared/knowledge-data.mjs';
import {
  createKnowledgeIntakeJob,
  createKnowledgeIntakeRuntime,
  resolveKnowledgeIntakeJob,
  runKnowledgeIntakeUntilReview
} from './_shared/knowledge-intake.mjs';
import { loadKnowledgePrompt } from './_shared/knowledge-prompts.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import {
  aiJobKey,
  defaultGetContentStore,
  getJSON,
  newId,
  setJSON
} from './_shared/teaching-blobs.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { writeJobInbox } from './ai-jobs.mjs';

export const config = { path: '/api/knowledge/tidy', timeout: 26 };

function knowledgeError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  const code = typeof error?.code === 'string' ? error.code : 'tidy_failed';
  const message = status === 400
    ? error.message
    : status === 404
      ? 'Page was not found'
      : status === 503
        ? error.message
        : error?.message || 'Tidy failed';
  return errorResponse(status, code, message, status >= 500);
}

async function loadJobStore(deps, env) {
  const load = deps.getContentStore ?? defaultGetContentStore;
  try {
    return await load(env);
  } catch {
    return null;
  }
}

export function createKnowledgeTidyHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST' && request.method !== 'PATCH' && request.method !== 'GET') {
      return withCors(methodNotAllowed('GET, POST, PATCH, OPTIONS'), request, env);
    }
    if (!knowledgeDataToken(env)) {
      return withCors(errorResponse(503, 'knowledge_repo_unbound', 'Knowledge data repository is not bound.', true), request, env);
    }
    const apiKey = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
    if (!apiKey) {
      return withCors(errorResponse(503, 'knowledge_anthropic_unbound', 'Tidy is unavailable', true), request, env);
    }
    const runtime = createKnowledgeIntakeRuntime({
      ...deps,
      env,
      apiKey,
      prompt: deps.prompt ?? loadKnowledgePrompt('tidy.md', deps.cwd)
    });

    if (request.method === 'GET') {
      const jobId = new URL(request.url).searchParams.get('job') ?? '';
      const store = await loadJobStore(deps, env);
      if (!store) {
        return withCors(errorResponse(503, 'blobs_unbound', 'Teaching content store is not bound.', true), request, env);
      }
      const job = jobId ? await getJSON(store, aiJobKey(jobId)) : null;
      if (!job) {
        return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
      }
      return withCors(okResponse(200, job), request, env);
    }

    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);

    if (request.method === 'PATCH') {
      const jobId = typeof parsed.value?.job_id === 'string' ? parsed.value.job_id.trim() : '';
      const resolution = typeof parsed.value?.resolution === 'string' ? parsed.value.resolution : '';
      const store = await loadJobStore(deps, env);
      if (!store) {
        return withCors(errorResponse(503, 'blobs_unbound', 'Teaching content store is not bound.', true), request, env);
      }
      const job = jobId ? await getJSON(store, aiJobKey(jobId)) : null;
      if (!job) {
        return withCors(errorResponse(404, 'not_found', 'Job not found', false), request, env);
      }
      try {
        const next = await resolveKnowledgeIntakeJob(job, resolution, runtime);
        await setJSON(store, aiJobKey(next.id), next);
        await writeJobInbox(store, next);
        return withCors(okResponse(200, next), request, env);
      } catch (error) {
        return withCors(knowledgeError(error), request, env);
      }
    }

    const id = typeof parsed.value?.id === 'string' ? parsed.value.id.trim() : '';
    if (!id) {
      return withCors(errorResponse(400, 'validation_error', 'id is required', false), request, env);
    }

    if (parsed.value?.apply === true) {
      try {
        const review = await runKnowledgeIntakeUntilReview(
          createKnowledgeIntakeJob({
            id: newId('ai_job'),
            page_id: id,
            now: runtime.nowIso()
          }),
          runtime
        );
        if (review.status === 'error') {
          throw Object.assign(new Error(review.error || 'Tidy failed'), {
            status: 502,
            code: 'tidy_failed'
          });
        }
        const done = await resolveKnowledgeIntakeJob(review, 'accepted', runtime);
        return withCors(okResponse(200, done.applied_page), request, env);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Prompt file missing:')) {
          return withCors(errorResponse(500, 'prompt_missing', error.message, false), request, env);
        }
        return withCors(knowledgeError(error), request, env);
      }
    }

    try {
      const store = await loadJobStore(deps, env);
      if (!store) {
        return withCors(errorResponse(503, 'blobs_unbound', 'Teaching content store is not bound.', true), request, env);
      }
      const created = createKnowledgeIntakeJob({
        id: newId('ai_job'),
        page_id: id,
        now: runtime.nowIso()
      });
      const job = await runKnowledgeIntakeUntilReview(created, runtime);
      await setJSON(store, aiJobKey(job.id), job);
      await writeJobInbox(store, job);
      return withCors(okResponse(202, job), request, env);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Prompt file missing:')) {
        return withCors(errorResponse(500, 'prompt_missing', error.message, false), request, env);
      }
      return withCors(knowledgeError(error), request, env);
    }
  }, deps);
}

export default createKnowledgeTidyHandler();
